importScripts("lib/store-core.js", "lib/storage.js", "drive.js", "calendar.js");

// A fresh install starts with both forum clean-ups on; an update keeps whatever the user chose.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  const { prefs } = await chrome.storage.local.get("prefs");
  await chrome.storage.local.set({ prefs: { hideDonate: true, hideCommunity: true, ...prefs } });
});

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
// real FAP tab: open it (up front on a click), walk the weeks with the page's own prev/next buttons,
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
    show({ stage: "att", text: `${i + 1}/${courses.length} môn`, progress: i / courses.length });
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
// underneath make sense and are not clicked mid-read. state = {stage: "tt"|"att"|"flm"|"done", text, metas,
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
    // Shadow root: FAP's own CSS cannot reach in. Colours and radii follow the popup.
    host.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .back { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px;
        --accent: #2563eb; --done: #138a55; --text: #161a22; --muted: rgba(22, 26, 34, .56); --hair: rgba(15, 23, 42, .09);
        --card: rgba(255, 255, 255, .9); --cell: rgba(15, 23, 42, .035);
        background: rgba(243, 244, 247, .6); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        font: 500 13px/1.4 FSKVietnam, "Segoe UI", system-ui, sans-serif; color: var(--text); animation: fade .2s ease-out; }
      .card { position: relative; overflow: hidden; width: min(340px, 100%); border-radius: 12px; background: var(--card);
        border: 1px solid var(--hair); box-shadow: 0 18px 48px -20px rgba(15, 23, 42, .35);
        animation: rise .35s cubic-bezier(.32, .72, 0, 1); }
      header { display: flex; align-items: center; gap: 10px; padding: 14px 16px 12px; border-bottom: 1px solid var(--hair); }
      header img { width: 28px; height: 28px; border-radius: 7px; box-shadow: 0 0 0 1px var(--hair); }
      h2 { margin: 0; font-size: 13.5px; font-weight: 600; }
      .sub { margin: 0; color: var(--muted); font-size: 12px; }
      ol { list-style: none; margin: 0; padding: 8px; }
      li { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px; color: var(--muted); transition: background .2s, color .2s; }
      li.on { background: var(--cell); color: var(--text); }
      li.ok { color: var(--text); }
      .ico { flex: none; position: relative; width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid var(--hair); transition: background .2s, border-color .2s; }
      li.on .ico { border-radius: 50%; border-color: rgba(37, 99, 235, .2); border-top-color: var(--accent); animation: spin .7s linear infinite; }
      li.ok .ico { background: var(--done); border-color: var(--done); }
      li.ok .ico::after { content: ""; position: absolute; left: 4.5px; top: 1.5px; width: 3.5px; height: 7px;
        border: solid #fff; border-width: 0 1.75px 1.75px 0; transform: rotate(45deg); }
      .name { flex: 1; }
      .meta { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
      footer { padding: 0 16px 14px; color: var(--muted); font-size: 11.5px; }
      .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; }
      .fill { height: 100%; width: 0; background: var(--accent); transition: width .4s cubic-bezier(.32, .72, 0, 1); }
      .bar.wait .fill { width: 30%; animation: slide 1.2s cubic-bezier(.45, 0, .55, 1) infinite; }
      .done .fill { background: var(--done); }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fade { from { opacity: 0; } }
      @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
      @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
      @media (prefers-color-scheme: dark) {
        .back { --accent: #5b8cff; --done: #34c07f; --text: #e8eaf0; --muted: rgba(232, 234, 240, .56); --hair: rgba(255, 255, 255, .09);
          --card: rgba(22, 24, 30, .92); --cell: rgba(255, 255, 255, .05); background: rgba(11, 12, 15, .7); }
        .card { box-shadow: 0 18px 48px -20px rgba(0, 0, 0, .8); }
        li.on .ico { border-color: rgba(91, 140, 255, .25); border-top-color: var(--accent); }
      }
      @media (prefers-reduced-motion: reduce) { * { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition: none !important; } }
    </style>
    <div class="back"><div class="card" role="status" aria-live="polite">
      <header><img alt="" /><div><h2>FU Study Kit</h2><p class="sub"></p></div></header>
      <ol>
        <li data-s="tt"><span class="ico"></span><span class="name">Thời khóa biểu</span><span class="meta"></span></li>
        <li data-s="att"><span class="ico"></span><span class="name">Điểm danh</span><span class="meta"></span></li>
        <li data-s="flm"><span class="ico"></span><span class="name">Thành phần điểm</span><span class="meta"></span></li>
      </ol>
      <footer>Tab sẽ tự đóng khi xong.</footer>
      <div class="bar"><div class="fill"></div></div>
    </div></div>`;
    if (base) host.shadowRoot.querySelector("img").src = `${base}assets/icons/icon-128.png`;
    else host.shadowRoot.querySelector("img").remove();
    document.documentElement.append(host);
  }
  const root = host.shadowRoot;
  const done = state.stage === "done";
  const rows = [...root.querySelectorAll("li")];
  const now = done ? rows.length : rows.findIndex((row) => row.dataset.s === state.stage);
  root.querySelector(".card").classList.toggle("done", done);
  root.querySelector(".sub").textContent = done ? "Đã cập nhật xong" : "Đang cập nhật lịch học…";
  rows.forEach((row, i) => {
    row.classList.toggle("ok", i < now);
    row.classList.toggle("on", i === now);
  });
  // metas fills rows by stage (after a page change the earlier counts are gone); text is the row being read.
  for (const row of rows) if (state.metas?.[row.dataset.s] != null) row.querySelector(".meta").textContent = state.metas[row.dataset.s];
  if (state.text != null && rows[now]) rows[now].querySelector(".meta").textContent = state.text;
  const progress = done ? 1 : state.progress;
  root.querySelector(".bar").classList.toggle("wait", progress == null);
  root.querySelector(".fill").style.width = progress == null ? "" : `${Math.round(progress * 100)}%`;
}
const showOverlay = (tabId, state) =>
  chrome.scripting.executeScript({ target: { tabId }, func: fapOverlay, args: [state, chrome.runtime.getURL("")] }).catch(() => {});

// Runs inside a FAP / FLM page of the sync tab when the user has to step in: a card at the top
// that says why the tab came up, without covering the page's own sign-in buttons. Only ever shown
// in the tab the extension opened; a FAP or FLM tab the user opened is never touched.
function fapLoginBanner(site, base) {
  const ID = "fsk-login-banner";
  document.getElementById(ID)?.remove();
  // A Cloudflare check is not a sign-in: say so, or the card reads wrong.
  const check = /just a moment|attention required/i.test(document.title) || !!document.querySelector("#challenge-form, [name='cf-turnstile-response']");
  const name = site === "flm" ? "FLM" : "FAP";
  const title = check ? `Xác minh trên ${name} để tiếp tục đồng bộ` : site === "flm" ? "Đăng nhập FLM để lấy thành phần điểm" : "Đăng nhập FAP để đồng bộ lịch học";
  const host = document.createElement("div");
  host.id = ID;
  host.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { all: initial; }
      .bar { position: fixed; top: 14px; left: 50%; z-index: 2147483647; display: flex; align-items: center; gap: 12px;
        width: max-content; max-width: calc(100vw - 32px); padding: 10px 12px 10px 10px; box-sizing: border-box;
        transform: translateX(-50%); border-radius: 12px; border: 1px solid rgba(15, 23, 42, .1); background: rgba(255, 255, 255, .96);
        box-shadow: 0 14px 36px -16px rgba(15, 23, 42, .4); color: #161a22;
        font: 500 13px/1.4 FSKVietnam, "Segoe UI", system-ui, sans-serif; animation: drop .35s cubic-bezier(.32, .72, 0, 1); }
      img { flex: none; width: 28px; height: 28px; border-radius: 7px; box-shadow: 0 0 0 1px rgba(15, 23, 42, .09); }
      b { display: block; font-size: 13px; font-weight: 600; }
      span { color: rgba(22, 26, 34, .56); font-size: 12px; }
      button { flex: none; margin-left: 4px; padding: 6px 12px; border: 1px solid rgba(15, 23, 42, .14); border-radius: 8px;
        background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
      button:hover { background: rgba(15, 23, 42, .05); }
      @keyframes drop { from { opacity: 0; transform: translate(-50%, -10px); } }
      @media (prefers-color-scheme: dark) {
        .bar { background: rgba(22, 24, 30, .96); border-color: rgba(255, 255, 255, .1); color: #e8eaf0; box-shadow: 0 14px 36px -16px rgba(0, 0, 0, .8); }
        img { box-shadow: 0 0 0 1px rgba(255, 255, 255, .1); } span { color: rgba(232, 234, 240, .56); }
        button { border-color: rgba(255, 255, 255, .16); } button:hover { background: rgba(255, 255, 255, .06); }
      }
      @media (prefers-reduced-motion: reduce) { .bar { animation: none; } }
    </style>
    <div class="bar" role="status"><img alt="" /><div><b></b><span>FU Study Kit sẽ tự đọc tiếp ngay khi bạn xong.</span></div></div>`;
  const root = host.shadowRoot;
  root.querySelector("b").textContent = title;
  if (base) root.querySelector("img").src = `${base}assets/icons/icon-128.png`;
  else root.querySelector("img").remove();
  // Grade components are a bonus: FLM can be skipped, the sync then finishes without them.
  if (site === "flm") {
    const skip = document.createElement("button");
    skip.type = "button";
    skip.textContent = "Bỏ qua";
    skip.addEventListener("click", () => chrome.runtime.sendMessage({ action: "flmSkip" }).catch(() => {}));
    root.querySelector(".bar").append(skip);
  }
  document.documentElement.append(host);
}
const showLoginBanner = (tabId, site) =>
  chrome.scripting.executeScript({ target: { tabId }, func: fapLoginBanner, args: [site, chrome.runtime.getURL("")] }).catch(() => {});

// "Political economics of Marxism – Leninism (MLN122) (Half2_SE1915)" -> name, code, group.
const parseCourse = (label) => {
  const m = /^(.*?)\s*\(([^()]+)\)\s*\(([^()]+)\)\s*$/.exec(label);
  return m ? { name: m[1], code: m[2], group: m[3] } : { name: label, code: label, group: "" };
};

// Timetable stored: read attendance in the same tab, then grade components on FLM when needed.
async function finishFapSync(fapSync) {
  const { tabId } = fapSync;
  await showOverlay(tabId, { stage: "att", text: "đang mở…", progress: null });
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
  const metas = { tt: `${fapSync.count || 0} tuần`, att: courses ? `${courses.length} môn` : "giữ bản cũ" };
  const codes = await syllabusToFetch();
  if (codes === null) return endFapSync(fapSync, { ...metas, flm: "bỏ qua" });
  if (!codes.length) return endFapSync(fapSync, { ...metas, flm: "đã có" });
  // Grade components live on FLM: one page change, then everything is fetched inside that page.
  await chrome.storage.session.set({ fapSync: { ...fapSync, stage: "flm", codes, metas, state: "loading", redirected: false } });
  chrome.tabs.update(tabId, { url: FLM_SEARCH }).catch(() => {});
}

// --- Grade components (FLM syllabus) ---
// FLM sits behind Cloudflare like FAP, so it is read from an FLM tab with the user's session.
// A syllabus barely changes, so each course is fetched once and kept for a month.
const FLM_ORIGIN = "https://flm.fpt.edu.vn";
const FLM_SEARCH = `${FLM_ORIGIN}/gui/role/student/SyllabusManagement`;
const SYLLABUS_TTL = 30 * 24 * 60 * 60 * 1000;

// Course codes whose components are missing or old; null when FLM reading is not allowed.
async function syllabusToFetch() {
  if (!(await chrome.permissions.contains({ origins: [`${FLM_ORIGIN}/*`] }))) return null;
  const { fapAttendance, fapSyllabus = {} } = await chrome.storage.local.get(["fapAttendance", "fapSyllabus"]);
  const codes = [...new Set((fapAttendance?.courses || []).map((c) => c.code).filter(Boolean))];
  return codes.filter((code) => !(Date.now() - (fapSyllabus[code]?.fetchedAt || 0) < SYLLABUS_TTL));
}

// Runs inside an FLM page: for each course, find its syllabus and read the assessment table.
async function readSyllabi(codes) {
  const text = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
  const show = globalThis.__fskOverlay || (() => {});
  const load = async (path) => {
    const res = await fetch(path, { credentials: "same-origin" });
    // Signed out, FLM sends every page to /Login.
    return res.ok && !res.redirected ? new DOMParser().parseFromString(await res.text(), "text/html") : null;
  };
  const out = {};
  for (const [i, code] of codes.entries()) {
    show({ stage: "flm", text: `${i + 1}/${codes.length} môn`, progress: i / codes.length });
    const list = await load(`/gui/role/student/SyllabusManagement?searchOn=Code&keyword=${encodeURIComponent(code)}`).catch(() => null);
    if (!list) break;
    // The search matches by prefix (PRN finds PRN211, PRN212…): keep the exact code, active and
    // approved first, newest (highest id) first.
    const best = [...list.querySelectorAll("tr")]
      .filter((tr) => tr.cells.length > 5 && text(tr.cells[1]).toUpperCase() === code.toUpperCase())
      .map((tr) => ({
        id: Number((/sylID=(\d+)/.exec(tr.querySelector("a[href*='SyllabusDetails']")?.getAttribute("href")) || [])[1]) || 0,
        ok: [...tr.querySelectorAll("input[type=checkbox]")].every((box) => box.checked)
      }))
      .filter((s) => s.id)
      .sort((a, b) => b.ok - a.ok || b.id - a.id)[0];
    if (!best) {
      out[code] = { id: 0, items: [] }; // no syllabus on FLM: remembered so it is not asked every time
      continue;
    }
    const doc = await load(`/gui/role/student/SyllabusDetails?sylID=${best.id}`).catch(() => null);
    if (!doc) continue;
    const items = [...doc.querySelectorAll("#gvAssessment tr")].slice(1).map((tr) => [...tr.cells].map(text));
    out[code] = { id: best.id, items: items.map(([, category, type, part, weight, criteria]) => ({ category, type, part, weight, criteria })) };
  }
  return Object.keys(out).length ? out : null;
}

// The sync tab has landed on FLM: read the components, keep them, finish.
async function readFlm(tab, fapSync) {
  if (!tab.url?.startsWith(FLM_SEARCH)) {
    // Signed in but landed elsewhere (FLM's home after the sign-in): back to the search page, once.
    const onFlm = tab.url?.startsWith(FLM_ORIGIN) && !/\/Login/i.test(new URL(tab.url).pathname);
    if (onFlm && !fapSync.redirected) {
      await chrome.storage.session.set({ fapSync: { ...fapSync, redirected: true } });
      chrome.tabs.update(tab.id, { url: FLM_SEARCH }).catch(() => {});
      return;
    }
    // FLM wants a sign-in: bring the tab up and wait; the next load comes back here.
    if (fapSync.state !== "attention") {
      await chrome.storage.session.set({ fapSync: { ...fapSync, state: "attention", redirected: false } });
      chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    }
    if (tab.url?.startsWith(FLM_ORIGIN)) showLoginBanner(tab.id, "flm");
    return;
  }
  await chrome.storage.session.set({ fapSync: { ...fapSync, stage: "flm-reading", state: "loading" } }); // one read per sync
  let found = null;
  await showOverlay(tab.id, { stage: "flm", text: "đang mở…", metas: fapSync.metas, progress: null });
  try {
    [{ result: found }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSyllabi, args: [fapSync.codes] });
  } catch {
    // Page navigated away mid-read: keep what is stored.
  }
  if (found && typeof found === "object") {
    const { fapSyllabus = {} } = await chrome.storage.local.get("fapSyllabus");
    // Page data, so only keep checked fields.
    const str = (v, n = 80) => String(v ?? "").slice(0, n);
    for (const code of fapSync.codes) {
      const s = found[code];
      if (!s) continue;
      fapSyllabus[code] = {
        fetchedAt: Date.now(),
        id: Number.isInteger(s.id) ? s.id : 0,
        items: (Array.isArray(s.items) ? s.items : []).slice(0, 30).map((it) => ({
          category: str(it?.category),
          type: str(it?.type, 40),
          part: str(it?.part, 10),
          weight: str(it?.weight, 12),
          criteria: str(it?.criteria, 20)
        }))
      };
    }
    await chrome.storage.local.set({ fapSyllabus });
  }
  await endFapSync(fapSync, { ...fapSync.metas, flm: found ? `${Object.keys(found).length} môn` : "không đọc được" });
}

// Everything read: show "done", close the sync tab and hand the screen back.
async function endFapSync({ tabId, back }, metas) {
  await chrome.storage.session.remove("fapSync");
  await showOverlay(tabId, { stage: "done", metas });
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

  if (fapSync.stage === "flm") return readFlm(tab, fapSync);
  if (fapSync.stage) return; // attendance and FLM are read by fetch inside the page, no load to react to
  const target = FAP_TIMETABLE;
  let started = null;
  try {
    // Cover the page while it is read; taken off again below if it turns out to need the user.
    if (tab.url?.startsWith(target)) await showOverlay(tabId, { stage: "tt", text: "đang mở…", progress: null });
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
  // On every FAP page while waiting (the sign-in provider is another site and stays untouched).
  if (tab.url?.startsWith(FAP_ORIGIN)) showLoginBanner(tabId, "fap");
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
    showOverlay(fapSync.tabId, { stage: "tt", text: `${count} tuần`, progress: null });
    return;
  }
  for (const key of Array.isArray(message.drop) ? message.drop : []) delete weeks[key];
  await chrome.storage.local.set({ fapTimetable: { fetchedAt: Date.now(), weeks } });
  if (fapSync.stage) return; // a late fapDone; the timetable is already stored
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
  // "Bỏ qua" on the FLM sign-in card: only the sync tab, and only while it waits on FLM.
  if (message?.action === "flmSkip") {
    chrome.storage.session.get("fapSync").then(({ fapSync }) => {
      if (fapSync?.stage === "flm" && sender.tab?.id === fapSync.tabId) endFapSync(fapSync, { ...fapSync.metas, flm: "bỏ qua" });
    });
  }
  if (message?.action === "fapWeek" || message?.action === "fapDone") {
    onFapCrawl(message, sender).finally(() => sendResponse());
    return true;
  }
});
