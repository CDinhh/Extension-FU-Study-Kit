importScripts("lib/store-core.js", "lib/storage.js", "drive.js", "calendar.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "captureTab") {
    // Any script on the forum page can ask for a capture through the bridge, so only ever
    // capture the sender's own tab: it must be the visible tab of its window.
    if (!sender.tab?.active || typeof sender.tab.windowId !== "number") {
      sendResponse({ success: false, error: "Tab đề không ở trên cùng nên không chụp được. Mở lại tab rồi thử lại." });
      return;
    }

    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
      const err = chrome.runtime.lastError;
      if (err || !dataUrl) {
        const errorMsg = err?.message || "Không thể chụp được nội dung tab";
        console.warn("captureVisibleTab error:", errorMsg);
        // Site host permissions are not enough for captureVisibleTab; the user grants
        // the optional <all_urls> from the popup.
        chrome.permissions.contains({ origins: ["<all_urls>"] }, (granted) => {
          sendResponse({ success: false, error: errorMsg, needsPermission: !granted });
        });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });

    return true; // Keep message channel open for asynchronous response
  }
});

// --- FAP weekly timetable ---
// Cloudflare answers 403 to a fetch from the extension origin, so the timetable is read from a
// real FAP tab: open it in the background, walk the weeks with the page's own prev/next buttons,
// close it. When FAP wants a login or a human check instead, the tab is brought forward and
// read once the user is through.
const FAP_ORIGIN = "https://fap.fpt.edu.vn";
const FAP_TIMETABLE = `${FAP_ORIGIN}/WeeklyTimetable`;

// Runs inside the FAP page. Selectors are class/icon based so they hold in both UI languages.
// Weeks are sent one by one (fapWeek) instead of returned: a long crawl would outlive the
// service worker's idle timeout, and each message both wakes it and shows progress.
async function crawlTimetable(full) {
  if (!document.getElementById("weekly-timetable-week")) return null;
  if (window.__fapCrawling) return "busy";
  window.__fapCrawling = true;

  const MAX_WEEKS = 30; // per direction
  const EMPTY_RUN = 3; // this many empty weeks in a row means the term has ended
  const text = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const findTable = () => [...document.querySelectorAll("table")].find((t) => t.querySelector("thead th[scope=col]"));
  // "Tuần (16/11 - 22/11)": the only dd/mm - dd/mm pair on the page names the week on screen.
  const range = () => (/\((\d{1,2})\/(\d{1,2})\s*-\s*\d{1,2}\/\d{1,2}\)/.exec(document.body.textContent) || []).slice(1, 3).join("/");

  // Monday of the week on screen as yyyy-mm-dd; the page gives no year, so take the nearest one.
  const weekKey = () => {
    const [day, month] = range().split("/").map(Number);
    if (!day || !month) return "";
    const now = Date.now();
    const year = new Date().getFullYear();
    const best = [year - 1, year, year + 1]
      .map((y) => new Date(y, month - 1, day))
      .sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
    const p = (n) => String(n).padStart(2, "0");
    return `${best.getFullYear()}-${p(best.getMonth() + 1)}-${p(best.getDate())}`;
  };

  const readWeek = () => {
    const table = findTable();
    if (!table) return { days: [], items: [] };
    const days = [...table.querySelectorAll("thead th")].slice(1).map(text);
    const items = [];
    for (const row of table.querySelectorAll("tbody tr")) {
      const slot = text(row.querySelector("th"));
      [...row.querySelectorAll("td")].forEach((cell, day) => {
        for (const title of cell.querySelectorAll(".weekly-timetable-cell-title")) {
          const block = title.closest(".position-relative") || cell;
          const status = block.querySelector(".weekly-timetable-attendance-status");
          items.push({
            day,
            slot,
            title: text(title),
            time: (text(block).match(/\d{1,2}h\d{2}\s*-\s*\d{1,2}h\d{2}/) || [""])[0],
            room: text(block.querySelector(".ri-map-pin-line")?.parentElement),
            teacher: text(block.querySelector(".ri-user-line")?.parentElement),
            online: !!block.querySelector(".ri-wifi-line"),
            meet: block.querySelector("a[href]")?.href || "",
            kind: text(block.querySelector(".ri-bookmark-line")?.parentElement), // e.g. "Lịch thi"
            attendance: text(status),
            attended: status ? (status.classList.contains("text-success") ? "yes" : status.classList.contains("text-danger") ? "no" : "") : ""
          });
        }
      });
    }
    return { days, items };
  };

  // Click a week button and wait for the page to swap the week in. False when nothing changed.
  const go = async (buttonId, until) => {
    const before = range();
    const button = document.getElementById(buttonId);
    if (!button) return false;
    button.click();
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      if (until ? range() === until : range() !== before) {
        await sleep(150); // let the table finish rendering after the heading changed
        return true;
      }
    }
    return false;
  };

  const send = (message) => chrome.runtime.sendMessage(message).catch(() => {});
  const drop = [];
  const walk = async (buttonId) => {
    const empties = [];
    for (let i = 0; i < MAX_WEEKS && empties.length < EMPTY_RUN; i++) {
      if (!(await go(buttonId))) break;
      const key = weekKey();
      if (!key) break;
      const week = readWeek();
      if (week.items.length) empties.length = 0;
      else empties.push(key);
      await send({ action: "fapWeek", key, ...week });
    }
    drop.push(...empties); // trailing empty weeks are past the end of the term
  };

  for (let i = 0; !findTable() && i < 20; i++) await sleep(250);
  const start = range();
  const startKey = weekKey();
  if (!startKey) return null;
  try {
    await send({ action: "fapWeek", key: startKey, ...readWeek() });
    await walk("weekly-timetable-next");
    if (full && (await go("weekly-timetable-current", start))) await walk("weekly-timetable-prev");
  } finally {
    // Always close the sync, even on a half-finished walk: the weeks read so far are kept.
    await send({ action: "fapDone", drop });
  }
  return "done";
}

// Runs inside the FAP tab once the timetable is read. The attendance report is server-rendered,
// so each course page is fetched and parsed here instead of navigated to: the tab (and its
// overlay) stays put. Sessions are counted by status class, which holds in both UI languages.
async function readAttendance() {
  const text = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
  const show = globalThis.__fskOverlay || (() => {});
  const load = async (query = "") => {
    const res = await fetch(`/Report/Attendance${query}`, { credentials: "same-origin" });
    return res.ok ? new DOMParser().parseFromString(await res.text(), "text/html") : null;
  };
  const count = (doc, state) => doc.querySelectorAll(`.attendance-session-sheet .attendance-status--${state}`).length;

  const first = await load().catch(() => null);
  const course = first?.getElementById("attendance-report-course");
  const term = first?.getElementById("attendance-report-term");
  if (!course || !term) return null; // signed out mid-sync: keep the attendance we had
  const courses = [...course.options].map((option) => ({ id: option.value, label: text(option) })).filter((c) => c.id);
  const out = [];
  for (const [i, c] of courses.entries()) {
    show({ stage: "att", text: `Đang đọc điểm danh môn ${i + 1}/${courses.length}`, progress: i / courses.length });
    const doc = c.id === course.value ? first : await load(`?termId=${encodeURIComponent(term.value)}&courseId=${encodeURIComponent(c.id)}`).catch(() => null);
    if (doc?.getElementById("attendance-report-course")?.value !== c.id) continue;
    out.push({
      ...c,
      present: count(doc, "present"),
      absent: count(doc, "absent"),
      pending: count(doc, "pending"),
      total: doc.querySelectorAll(".attendance-session-sheet tbody tr .attendance-status").length
    });
  }
  return { term: text(term.selectedOptions[0]), courses: out };
}

// Runs inside the FAP page: a cover that says what the sync is doing, so the weeks flipping
// underneath make sense and are not clicked mid-read. state = {stage: "tt"|"att"|"done", text,
// progress 0..1 or null}; null takes it off. base is the extension URL, for the logo and font.
function fapOverlay(state, base) {
  const ID = "fsk-sync-overlay";
  let host = document.getElementById(ID);
  if (!state) return void host?.remove();
  globalThis.__fskOverlay = (next) => fapOverlay(next, base); // readAttendance updates it in place
  if (!host) {
    if (base && !document.fonts.check("12px FSKVietnam")) {
      for (const [weight, file] of [["500", "latin-500"], ["600", "latin-600"], ["500", "vietnamese-500"], ["600", "vietnamese-600"]]) {
        const font = new FontFace("FSKVietnam", `url(${base}assets/fonts/be-vietnam-pro-${file}.woff2)`, { weight });
        document.fonts.add(font);
        font.load().catch(() => {});
      }
    }
    host = document.createElement("div");
    host.id = ID;
    // Shadow root: FAP's own CSS cannot reach in.
    host.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .back { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px;
        --accent: #2563eb; --accent-rgb: 37, 99, 235; --done: #138a55; --done-rgb: 19, 138, 85; --text: #161a22; --muted: rgba(22, 26, 34, .56);
        --glass: rgba(255, 255, 255, .72); --edge: rgba(255, 255, 255, .85); --track: rgba(15, 23, 42, .07);
        background: rgba(243, 244, 247, .6);
        backdrop-filter: blur(14px) saturate(1.4); -webkit-backdrop-filter: blur(14px) saturate(1.4);
        font: 500 14px/1.45 FSKVietnam, "Segoe UI", system-ui, sans-serif; color: var(--text); animation: fade .3s ease-out; }
      .card { width: min(380px, 100%); padding: 28px 28px 22px; border-radius: 26px; text-align: center;
        background: var(--glass); border: 1px solid var(--edge);
        box-shadow: 0 1px 0 rgba(255, 255, 255, .9) inset, 0 30px 70px -24px rgba(15, 23, 42, .35), 0 8px 24px -12px rgba(15, 23, 42, .18);
        animation: rise .5s cubic-bezier(.32, .72, 0, 1); }
      .logo { position: relative; width: 76px; height: 76px; margin: 0 auto 18px; display: grid; place-items: center; }
      .logo img { width: 52px; height: 52px; border-radius: 16px; box-shadow: 0 10px 24px -10px rgba(var(--accent-rgb), .55); }
      .ring { position: absolute; inset: 0; border-radius: 50%;
        background: conic-gradient(from 0deg, transparent 0 55%, rgba(var(--accent-rgb), .9));
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
        mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
        animation: spin 1s linear infinite; transition: opacity .3s; }
      .tick { position: absolute; right: 2px; bottom: 2px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
        background: var(--done); color: #fff; box-shadow: 0 0 0 3px var(--glass); transform: scale(0); transition: transform .4s cubic-bezier(.34, 1.56, .64, 1); }
      .tick svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
      .step { margin: 4px 0 18px; min-height: 20px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
      .steps { display: flex; justify-content: center; gap: 6px; margin-bottom: 14px; }
      .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px 5px 9px; border-radius: 999px; font-size: 12px;
        color: var(--muted); background: var(--track); transition: background .3s, color .3s; }
      .chip i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .45; transition: opacity .3s; }
      .chip.on { color: var(--accent); background: rgba(var(--accent-rgb), .1); }
      .chip.on i { opacity: 1; animation: pulse 1.2s ease-in-out infinite; }
      .chip.ok { color: var(--done); background: rgba(var(--done-rgb), .1); }
      .chip.ok i { opacity: 1; }
      .bar { height: 6px; border-radius: 99px; background: var(--track); overflow: hidden; }
      .fill { height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, rgba(var(--accent-rgb), .6), var(--accent));
        transition: width .45s cubic-bezier(.32, .72, 0, 1); }
      .bar.wait .fill { width: 35%; animation: slide 1.3s cubic-bezier(.45, 0, .55, 1) infinite; }
      small { display: block; margin-top: 14px; color: var(--muted); font-size: 11.5px; }
      .done .ring { animation: none; opacity: 0; }
      .done .tick { transform: scale(1); }
      .done .fill { background: var(--done); }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fade { from { opacity: 0; } }
      @keyframes rise { from { opacity: 0; transform: translateY(14px) scale(.96); } }
      @keyframes pulse { 50% { transform: scale(.6); } }
      @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(290%); } }
      @media (prefers-color-scheme: dark) {
        .back { --text: #e8eaf0; --muted: rgba(232, 234, 240, .58); --accent: #5b8cff; --accent-rgb: 91, 140, 255; --done: #34c07f; --done-rgb: 52, 192, 127;
          --glass: rgba(24, 27, 34, .74); --edge: rgba(255, 255, 255, .08); --track: rgba(255, 255, 255, .08);
          background: rgba(11, 12, 15, .72); }
        .card { box-shadow: 0 1px 0 rgba(255, 255, 255, .06) inset, 0 30px 70px -24px rgba(0, 0, 0, .8); }
      }
      @media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition: none !important; } }
    </style>
    <div class="back"><div class="card" role="status" aria-live="polite">
      <div class="logo"><div class="ring"></div><img alt="" /><div class="tick"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></div></div>
      <h2></h2>
      <div class="step"></div>
      <div class="steps"><span class="chip" data-s="tt"><i></i>Thời khóa biểu</span><span class="chip" data-s="att"><i></i>Điểm danh</span></div>
      <div class="bar"><div class="fill"></div></div>
      <small>Tab sẽ tự đóng khi xong · đóng tab nếu muốn dừng</small>
    </div></div>`;
    if (base) host.shadowRoot.querySelector("img").src = `${base}assets/icons/icon-128.png`;
    document.documentElement.append(host);
  }
  const root = host.shadowRoot;
  const done = state.stage === "done";
  const order = ["tt", "att"];
  const now = done ? order.length : order.indexOf(state.stage);
  root.querySelector(".card").classList.toggle("done", done);
  root.querySelector("h2").textContent = done ? "Đã cập nhật xong" : "Đang cập nhật lịch học";
  root.querySelector(".step").textContent = state.text || "";
  for (const chip of root.querySelectorAll(".chip")) {
    const at = order.indexOf(chip.dataset.s);
    chip.classList.toggle("ok", at < now);
    chip.classList.toggle("on", at === now);
  }
  const progress = done ? 1 : state.progress;
  root.querySelector(".bar").classList.toggle("wait", progress == null);
  root.querySelector(".fill").style.width = progress == null ? "" : `${Math.round(progress * 100)}%`;
}
const showOverlay = (tabId, state) =>
  chrome.scripting.executeScript({ target: { tabId }, func: fapOverlay, args: [state, chrome.runtime.getURL("")] }).catch(() => {});

// "Political economics of Marxism – Leninism (MLN122) (Half2_SE1915)" -> name, code, group.
const parseCourse = (label) => {
  const m = /^(.*?)\s*\(([^()]+)\)\s*\(([^()]+)\)\s*$/.exec(label);
  return m ? { name: m[1], code: m[2], group: m[3] } : { name: label, code: label, group: "" };
};

// Timetable stored: read attendance in the same tab, keep it, show "done" and close the tab.
async function finishFapSync({ tabId, back }) {
  await showOverlay(tabId, { stage: "att", text: "Đang mở báo cáo điểm danh…", progress: null });
  let page = null;
  try {
    [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId }, func: readAttendance });
  } catch {
    // Tab closed or navigated away: the timetable is already stored, attendance stays as it was.
  }
  // Page data, so only keep checked fields.
  const str = (v) => String(v ?? "").slice(0, 160);
  const num = (v) => (Number.isInteger(v) && v >= 0 && v <= 500 ? v : 0);
  const courses = Array.isArray(page?.courses)
    ? page.courses.slice(0, 40).map((c) => ({ id: str(c?.id), ...parseCourse(str(c?.label)), present: num(c?.present), absent: num(c?.absent), pending: num(c?.pending), total: num(c?.total) }))
    : null;
  if (courses) await chrome.storage.local.set({ fapAttendance: { fetchedAt: Date.now(), term: str(page.term), courses } });
  await chrome.storage.session.remove("fapSync");
  await showOverlay(tabId, { stage: "done", text: courses ? `Đã đọc thời khóa biểu và điểm danh ${courses.length} môn` : "Đã đọc thời khóa biểu" });
  setTimeout(async () => {
    // Only hand the screen back if the user is still watching the sync tab.
    const watching = await chrome.tabs.get(tabId).then((t) => t.active, () => false);
    await chrome.tabs.remove(tabId).catch(() => {});
    if (!watching || back == null) return;
    const tab = await chrome.tabs.update(back, { active: true }).catch(() => null);
    // Needs a focused browser window; anywhere else it just fails quietly.
    if (tab) chrome.action.openPopup({ windowId: tab.windowId }).catch(() => {});
  }, 1200); // long enough to see "done"
}

async function startFapSync(focus, full) {
  const { fapSync } = await chrome.storage.session.get("fapSync");
  if (fapSync) {
    try {
      // A sync is already running. An explicit click surfaces its tab so a stuck one is never hidden.
      if (focus) await chrome.tabs.update(fapSync.tabId, { active: true });
      else await chrome.tabs.get(fapSync.tabId);
      return;
    } catch {
      // That tab is gone; start over.
    }
  }
  // A click opens FAP up front (the popup closes as it loses focus) and remembers where to come
  // back to: the tab the user was on, and the popup, reopened once the sync is done.
  const [back] = focus ? await chrome.tabs.query({ active: true, lastFocusedWindow: true }) : [];
  const tab = await chrome.tabs.create({ url: FAP_TIMETABLE, active: !!focus, ...(back ? { index: back.index + 1, windowId: back.windowId } : {}) });
  await chrome.storage.session.set({ fapSync: { tabId: tab.id, state: "loading", full, count: 0, back: back?.id ?? null } });
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  const { fapSync } = await chrome.storage.session.get("fapSync");
  if (fapSync?.tabId !== tabId) return;

  if (fapSync.stage === "attendance") return; // read by fetch inside the page, no load to react to
  const target = FAP_TIMETABLE;
  let started = null;
  try {
    // Cover the page while it is read; taken off again below if it turns out to need the user.
    if (tab.url?.startsWith(target)) await showOverlay(tabId, { stage: "tt", text: "Đang đọc tuần đầu tiên…", progress: null });
    // Not awaited to the end: the crawl reports through fapWeek / fapDone messages.
    const run = chrome.scripting.executeScript({ target: { tabId }, func: crawlTimetable, args: [!!fapSync.full] });
    run.catch(() => {});
    started = await Promise.race([run.then(([res]) => res?.result ?? null), new Promise((resolve) => setTimeout(() => resolve("running"), 6000))]);
  } catch {
    // On FAP this means the page navigated mid-read (Cloudflare check passing); the next load
    // reports again. Anywhere else it is the sign-in provider, which we cannot and need not read.
    if (tab.url?.startsWith(FAP_ORIGIN)) return;
  }
  if (started) return;
  await showOverlay(tabId, null);

  // Signed in but landed elsewhere (login lost the return URL): go back to the page, once.
  const onFap = tab.url?.startsWith(FAP_ORIGIN) && !tab.url.startsWith(target) && !/\/auth\//i.test(tab.url);
  if (onFap && fapSync.state === "attention" && !fapSync.redirected) {
    await chrome.storage.session.set({ fapSync: { ...fapSync, redirected: true } });
    chrome.tabs.update(tabId, { url: target }).catch(() => {});
    return;
  }
  if (fapSync.state !== "attention") {
    await chrome.storage.session.set({ fapSync: { ...fapSync, state: "attention" } });
    chrome.tabs.update(tabId, { active: true }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { fapSync } = await chrome.storage.session.get("fapSync");
  if (fapSync?.tabId === tabId) chrome.storage.session.remove("fapSync");
});

// One crawled week, or the end of a crawl, from the sync tab. Answers only after the write so
// the page sends the next week once this one is stored (no interleaved read-modify-write).
async function onFapCrawl(message, sender) {
  const { fapSync } = await chrome.storage.session.get("fapSync");
  if (!fapSync || sender.tab?.id !== fapSync.tabId || !sender.url?.startsWith(FAP_ORIGIN)) return;
  const { fapTimetable } = await chrome.storage.local.get("fapTimetable");
  const weeks = { ...fapTimetable?.weeks };

  if (message.action === "fapWeek") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(message.key) || !Array.isArray(message.days) || !Array.isArray(message.items)) return;
    weeks[message.key] = { days: message.days, items: message.items };
    await chrome.storage.local.set({ fapTimetable: { fetchedAt: fapTimetable?.fetchedAt || 0, weeks } });
    const count = (fapSync.count || 0) + 1;
    await chrome.storage.session.set({ fapSync: { ...fapSync, state: "loading", count } });
    showOverlay(fapSync.tabId, { stage: "tt", text: `Đã đọc ${count} tuần`, progress: null });
    return;
  }
  for (const key of Array.isArray(message.drop) ? message.drop : []) delete weeks[key];
  await chrome.storage.local.set({ fapTimetable: { fetchedAt: Date.now(), weeks } });
  if (fapSync.stage === "attendance") return; // a late fapDone; the timetable is already stored
  // Timetable done; the same tab reads attendance next (not awaited: the page waits on this answer).
  await chrome.storage.session.set({ fapSync: { ...fapSync, stage: "attendance", state: "loading" } });
  finishFapSync(fapSync);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Extension pages only: forum pages can reach this worker through the content-script bridge.
  const fromExtension = sender.url?.startsWith(chrome.runtime.getURL(""));
  if (message?.action === "fapSync" && fromExtension) startFapSync(!!message.focus, !!message.full);
  // Google Drive: sign-in must run here, the popup closes as soon as the Google window opens.
  if (fromExtension && message?.action === "driveLogin") driveLogin();
  if (fromExtension && message?.action === "driveSync") driveSync();
  if (fromExtension && message?.action === "driveLogout") driveLogout();
  if (fromExtension && message?.action === "calendarEnable") calendarEnable();
  if (fromExtension && message?.action === "calendarSync") calendarSync();
  if (fromExtension && message?.action === "calendarClear") calendarClear();
  if (message?.action === "fapWeek" || message?.action === "fapDone") {
    onFapCrawl(message, sender).finally(() => sendResponse());
    return true;
  }
});
