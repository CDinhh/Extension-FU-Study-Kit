// Google Calendar copy of the FAP timetable, run in the service worker (after drive.js).
// Classes go into a calendar this extension creates ("FU Study Kit – Lịch học"), never the
// user's own: scope calendar.app.created only reaches calendars the app made. Each class has a
// fixed event id (from its date, slot and course), so a sync updates events in place, removes the
// ones whose class moved or was cancelled, and never piles up duplicates.
// Settings live in chrome.storage.local "calendar" = {id, on, remind, at} and travel through Drive,
// so every device fills the same calendar. Progress / errors: local "calendarState".
const CAL_API = "https://www.googleapis.com/calendar/v3";
const CAL_TZ = "Asia/Ho_Chi_Minh";
const CAL_NAME = "FU Study Kit – Lịch học";
const EXAM_COLOR = "6"; // tangerine, so exams stand out like in the popup

const calApi = (path, init = {}) => api(`${CAL_API}${path}`, init, SCOPE_CALENDAR);
const jsonInit = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Calendar ids allow a-v and 0-9 only; a SHA-1 in hex fits.
async function eventId(key) {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(key));
  return `fsk${[...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const eventBody = (id, ev, remind) => ({
  id,
  summary: ev.summary,
  location: ev.location,
  description: ev.description,
  start: { dateTime: ev.start, timeZone: CAL_TZ },
  end: { dateTime: ev.end, timeZone: CAL_TZ },
  ...(ev.exam ? { colorId: EXAM_COLOR } : {}),
  reminders: { useDefault: false, overrides: remind >= 0 ? [{ method: "popup", minutes: remind }] : [] },
  status: "confirmed"
});

// Only rewrite an event when something the user can see changed.
const sameEvent = (cur, body) =>
  (cur.summary || "") === body.summary &&
  (cur.location || "") === body.location &&
  (cur.description || "") === body.description &&
  Date.parse(cur.start?.dateTime) === Date.parse(body.start.dateTime) &&
  Date.parse(cur.end?.dateTime) === Date.parse(body.end.dateTime) &&
  (cur.colorId || "") === (body.colorId || "") &&
  (cur.reminders?.overrides?.[0]?.minutes ?? -1) === (body.reminders.overrides[0]?.minutes ?? -1);

// Monday of last week: older classes are left as they are.
function syncFrom() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// A few requests at a time: fast enough for a term, gentle on the API quota.
async function inPool(tasks, size = 4) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
}

async function setCalendarState(patch) {
  const { calendarState } = await chrome.storage.local.get("calendarState");
  await chrome.storage.local.set({ calendarState: { ...calendarState, ...patch } });
}

async function ensureCalendar(cfg) {
  if (cfg.id) {
    try {
      await calApi(`/calendars/${encodeURIComponent(cfg.id)}`);
      return cfg.id;
    } catch (err) {
      if (err.status !== 404 && err.status !== 410) throw err; // deleted by the user: make a new one
    }
  }
  const made = await (await calApi("/calendars", jsonInit("POST", { summary: CAL_NAME, timeZone: CAL_TZ }))).json();
  await chrome.storage.local.set({ calendar: { ...cfg, id: made.id, at: Date.now() } });
  return made.id;
}

async function listEvents(calId, timeMin, timeMax) {
  const found = new Map();
  let page = "";
  do {
    const q = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      maxResults: "2500",
      fields: "items(id,summary,location,description,start,end,colorId,reminders),nextPageToken",
      ...(page ? { pageToken: page } : {})
    });
    const res = await (await calApi(`/calendars/${encodeURIComponent(calId)}/events?${q}`)).json();
    for (const ev of res.items || []) found.set(ev.id, ev);
    page = res.nextPageToken || "";
  } while (page);
  return found;
}

async function calendarSyncNow() {
  const { calendar: cfg, fapTimetable, drive } = await chrome.storage.local.get(["calendar", "fapTimetable", "drive"]);
  if (!cfg?.on || !drive?.account) return;
  await chrome.storage.session.set({ calendarBusy: true });
  try {
    const calId = await ensureCalendar(cfg);
    const from = syncFrom();
    // Turning classes or exams off removes their events: they are simply no longer wanted.
    const wanted = C.calendarEvents(fapTimetable, from).filter((ev) => (ev.exam ? cfg.exams !== false : cfg.classes !== false));
    const weeks = Object.keys(fapTimetable?.weeks || {}).filter((w) => w >= from).sort();
    // The window covers the synced weeks, so a class dropped from FAP loses its event too.
    const end = new Date(`${weeks[weeks.length - 1] || from}T00:00:00+07:00`);
    end.setDate(end.getDate() + 7);
    const existing = await listEvents(calId, `${from}T00:00:00+07:00`, end.toISOString());
    const base = `/calendars/${encodeURIComponent(calId)}/events`;
    const tasks = [];
    for (const ev of wanted) {
      const id = await eventId(ev.key);
      const body = eventBody(id, ev, ev.exam ? cfg.remindExam ?? C.CALENDAR_DEFAULTS.remindExam : cfg.remind ?? C.CALENDAR_DEFAULTS.remind);
      const cur = existing.get(id);
      existing.delete(id);
      if (cur && sameEvent(cur, body)) continue;
      tasks.push(async () => {
        if (cur) return calApi(`${base}/${id}`, jsonInit("PUT", body));
        try {
          await calApi(base, jsonInit("POST", body));
        } catch (err) {
          // The id was used before (event deleted earlier): bring that event back instead.
          if (err.status !== 409) throw err;
          await calApi(`${base}/${id}`, jsonInit("PUT", body));
        }
      });
    }
    for (const id of existing.keys()) {
      tasks.push(() =>
        calApi(`${base}/${id}`, { method: "DELETE" }).catch((err) => {
          if (err.status !== 404 && err.status !== 410) throw err;
        })
      );
    }
    await inPool(tasks);
    await setCalendarState({ lastSync: Date.now(), count: wanted.length, error: null });
  } catch (err) {
    const message = err?.message || String(err);
    // A silent renewal that needs the user means the Calendar permission was never given.
    await setCalendarState({ error: /interaction|consent/i.test(message) ? NO_CALENDAR : message });
  } finally {
    await chrome.storage.session.remove("calendarBusy");
  }
}

let calRunning = null;
let calQueued = false;
function calendarSync() {
  if (calRunning) {
    calQueued = true;
    return calRunning;
  }
  calRunning = (async () => {
    do {
      calQueued = false;
      await calendarSyncNow();
    } while (calQueued);
  })().finally(() => (calRunning = null));
  return calRunning;
}

// Turning it on asks Google for the Calendar permission (a window the user answers), then fills it.
async function calendarEnable() {
  try {
    await getToken(true, true);
    const { driveToken } = await chrome.storage.session.get("driveToken");
    if (!driveToken?.scopes?.includes(SCOPE_CALENDAR)) throw new Error(NO_CALENDAR);
    const { calendar } = await chrome.storage.local.get("calendar");
    await chrome.storage.local.set({ calendar: { ...C.CALENDAR_DEFAULTS, ...calendar, on: true, at: Date.now() } });
    await setCalendarState({ error: null });
    await calendarSync();
  } catch (err) {
    await setCalendarState({ error: err?.message || String(err) });
  }
}

// "Delete everything added": drop the whole calendar the extension made, and stop syncing.
async function calendarClear() {
  const { calendar } = await chrome.storage.local.get("calendar");
  await chrome.storage.session.set({ calendarBusy: true });
  try {
    if (calendar?.id) {
      await calApi(`/calendars/${encodeURIComponent(calendar.id)}`, { method: "DELETE" }).catch((err) => {
        if (err.status !== 404 && err.status !== 410) throw err;
      });
    }
    await chrome.storage.local.set({ calendar: { ...C.CALENDAR_DEFAULTS, ...calendar, id: null, on: false, at: Date.now() } });
    await chrome.storage.local.set({ calendarState: { lastSync: 0, count: 0, error: null } });
  } catch (err) {
    await setCalendarState({ error: err?.message || String(err) });
  } finally {
    await chrome.storage.session.remove("calendarBusy");
  }
}

// A new timetable (from FAP or from another device) or new settings: bring the calendar in line.
let calPending = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !(changes.fapTimetable || changes.calendar)) return;
  clearTimeout(calPending);
  calPending = setTimeout(calendarSync, 3000);
});
