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
// real FAP tab: open it in the background, scrape the rendered table, close it. When FAP wants a
// login or a human check instead, the tab is brought forward and scraped once the user is through.
const FAP_ORIGIN = "https://fap.fpt.edu.vn";
const FAP_TIMETABLE = `${FAP_ORIGIN}/WeeklyTimetable`;

// Runs inside the FAP page. Selectors are class/icon based so they hold in both UI languages.
async function scrapeTimetable() {
  if (!document.getElementById("weekly-timetable-week")) return null;
  const text = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
  const findTable = () => [...document.querySelectorAll("table")].find((t) => t.querySelector("thead th[scope=col]"));
  let table = findTable();
  for (let i = 0; !table && i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    table = findTable();
  }
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
          attendance: text(status),
          attended: status ? (status.classList.contains("text-success") ? "yes" : status.classList.contains("text-danger") ? "no" : "") : ""
        });
      }
    });
  }
  return { days, items };
}

async function startFapSync(focus) {
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
  await chrome.storage.session.set({ fapSync: { tabId: tab.id, state: "loading" } });
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  const { fapSync } = await chrome.storage.session.get("fapSync");
  if (fapSync?.tabId !== tabId) return;

  let data = null;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: scrapeTimetable });
    data = res?.result || null;
  } catch {
    // On FAP this means the page navigated mid-scrape (Cloudflare check passing); the next load
    // reports again. Anywhere else it is the sign-in provider, which we cannot and need not read.
    if (tab.url?.startsWith(FAP_ORIGIN)) return;
  }

  if (data) {
    await chrome.storage.local.set({ fapTimetable: { ...data, fetchedAt: Date.now() } });
    await chrome.storage.session.remove("fapSync");
    chrome.tabs.remove(tabId).catch(() => {});
    return;
  }

  // Signed in but landed elsewhere (login lost the return URL): go to the timetable, once.
  const onFap = tab.url?.startsWith(FAP_ORIGIN) && !tab.url.startsWith(FAP_TIMETABLE) && !/\/auth\//i.test(tab.url);
  if (onFap && fapSync.state === "attention" && !fapSync.redirected) {
    await chrome.storage.session.set({ fapSync: { ...fapSync, redirected: true } });
    chrome.tabs.update(tabId, { url: FAP_TIMETABLE }).catch(() => {});
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

chrome.runtime.onMessage.addListener((message, sender) => {
  // Extension pages only: forum pages can reach this worker through the content-script bridge.
  if (message?.action === "fapSync" && sender.url?.startsWith(chrome.runtime.getURL(""))) startFapSync(!!message.focus);
});
