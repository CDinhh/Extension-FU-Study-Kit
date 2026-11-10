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
// After the timetable, the same tab reads the attendance report: one page load per course.
const FAP_ATTENDANCE = `${FAP_ORIGIN}/Report/Attendance`;

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

// Runs inside the attendance report: the courses of the selected term, and the sessions of the
// course on screen counted by their status class (works in both UI languages).
async function readAttendance() {
  const text = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
  const ready = () => document.getElementById("attendance-report-course") && document.querySelector(".fap-result-card__title");
  for (let i = 0; !ready() && i < 24; i++) await new Promise((resolve) => setTimeout(resolve, 250));
  const course = document.getElementById("attendance-report-course");
  const term = document.getElementById("attendance-report-term");
  if (!course || !term) return null;
  const count = (state) => document.querySelectorAll(`.attendance-session-sheet .attendance-status--${state}`).length;
  return {
    termId: term.value,
    term: text(term.selectedOptions[0]),
    courseId: course.value,
    courses: [...course.options].map((option) => ({ id: option.value, label: text(option) })),
    present: count("present"),
    absent: count("absent"),
    pending: count("pending"),
    total: document.querySelectorAll(".attendance-session-sheet tbody tr .attendance-status").length
  };
}

// "Political economics of Marxism – Leninism (MLN122) (Half2_SE1915)" -> name, code, group.
const parseCourse = (label) => {
  const m = /^(.*?)\s*\(([^()]+)\)\s*\(([^()]+)\)\s*$/.exec(label);
  return m ? { name: m[1], code: m[2], group: m[3] } : { name: label, code: label, group: "" };
};

// One course page has loaded: keep its numbers, then open the next course or finish.
async function stepAttendance(tabId, fapSync) {
  const [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId }, func: readAttendance });
  if (!page) return false;
  // Page data, so only keep checked fields.
  const str = (v) => String(v ?? "").slice(0, 160);
  const num = (v) => (Number.isInteger(v) && v >= 0 && v <= 500 ? v : 0);
  const courses = Array.isArray(page.courses) ? page.courses.slice(0, 40).map((c) => ({ id: str(c?.id), label: str(c?.label) })) : [];
  const att = fapSync.att || {
    termId: str(page.termId),
    term: str(page.term),
    queue: courses.map((c) => c.id).filter((id) => id && id !== page.courseId),
    labels: Object.fromEntries(courses.map((c) => [c.id, c.label])),
    courses: []
  };
  const id = str(page.courseId);
  if (id && !att.courses.some((c) => c.id === id)) {
    const { present, absent, pending, total } = page;
    att.courses.push({ id, ...parseCourse(att.labels[id] || id), present: num(present), absent: num(absent), pending: num(pending), total: num(total) });
  }
  const next = att.queue.shift();
  if (next) {
    await chrome.storage.session.set({ fapSync: { ...fapSync, state: "loading", att } });
    const url = `${FAP_ATTENDANCE}?termId=${encodeURIComponent(att.termId)}&courseId=${encodeURIComponent(next)}`;
    chrome.tabs.update(tabId, { url }).catch(() => {});
    return true;
  }
  await chrome.storage.local.set({ fapAttendance: { fetchedAt: Date.now(), term: att.term, courses: att.courses } });
  await chrome.storage.session.remove("fapSync");
  chrome.tabs.remove(tabId).catch(() => {});
  return true;
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
  const tab = await chrome.tabs.create({ url: FAP_TIMETABLE, active: false });
  await chrome.storage.session.set({ fapSync: { tabId: tab.id, state: "loading", full, count: 0 } });
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  const { fapSync } = await chrome.storage.session.get("fapSync");
  if (fapSync?.tabId !== tabId) return;

  const attendance = fapSync.stage === "attendance";
  const target = attendance ? FAP_ATTENDANCE : FAP_TIMETABLE;
  let started = null;
  try {
    if (attendance) {
      started = await stepAttendance(tabId, fapSync);
    } else {
      // Not awaited to the end: the crawl reports through fapWeek / fapDone messages.
      const run = chrome.scripting.executeScript({ target: { tabId }, func: crawlTimetable, args: [!!fapSync.full] });
      run.catch(() => {});
      started = await Promise.race([run.then(([res]) => res?.result ?? null), new Promise((resolve) => setTimeout(() => resolve("running"), 6000))]);
    }
  } catch {
    // On FAP this means the page navigated mid-read (Cloudflare check passing); the next load
    // reports again. Anywhere else it is the sign-in provider, which we cannot and need not read.
    if (tab.url?.startsWith(FAP_ORIGIN)) return;
  }
  if (started) return;

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
    await chrome.storage.session.set({ fapSync: { ...fapSync, state: "loading", count: (fapSync.count || 0) + 1 } });
    return;
  }
  for (const key of Array.isArray(message.drop) ? message.drop : []) delete weeks[key];
  await chrome.storage.local.set({ fapTimetable: { fetchedAt: Date.now(), weeks } });
  if (fapSync.stage === "attendance") return; // a late fapDone; the timetable is already stored
  // Timetable done; the same tab moves on to the attendance report.
  await chrome.storage.session.set({ fapSync: { ...fapSync, stage: "attendance", state: "loading", redirected: false } });
  chrome.tabs.update(fapSync.tabId, { url: FAP_ATTENDANCE }).catch(() => {});
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
