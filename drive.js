// Google sign-in and the Google Drive copy of the user's data, run in the service worker.
// Sign-in uses launchWebAuthFlow (works in Chrome, Brave and other Chromium browsers, unlike
// getAuthToken) with the token flow, so no client secret ships in the extension.
// The data is one JSON file in the Drive "appDataFolder": private to this extension, invisible
// in the user's Drive, and the extension cannot see any other file.
const DRIVE_CLIENT_ID = "113506831780-l0dpi14ga0ak9le1ihkml9mu625lc0m4.apps.googleusercontent.com";
const DRIVE_SCOPES = "openid email profile https://www.googleapis.com/auth/drive.appdata";
const DRIVE_FILE = "fu-study-kit.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
// Data that travels with the account. Everything else (prefs, theme, covers) stays per device.
const CLOUD_KEYS = (key) => key.startsWith("site:") || key.startsWith("threads:") || key === "fapTimetable" || key === "fapAttendance";

const C = globalThis.FuoCore;
const S = globalThis.FuoStorage;

// --- Token ---

async function authorize(interactive) {
  const { drive } = await chrome.storage.local.get("drive");
  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: DRIVE_CLIENT_ID,
    response_type: "token",
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: DRIVE_SCOPES,
    state,
    // Silent renewal reuses the browser's Google session; a click may pick another account.
    // "consent" shows the permission checkboxes again, so a Drive box left unticked can be ticked.
    prompt: interactive ? "select_account consent" : "none",
    ...(drive?.account?.email ? { login_hint: drive.account.email } : {})
  });
  const back = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive });
  const params = new URLSearchParams(new URL(back).hash.slice(1));
  if (params.get("state") !== state) throw new Error("Phản hồi đăng nhập không hợp lệ.");
  if (params.get("error")) throw new Error(params.get("error"));
  const token = params.get("access_token");
  if (!token) throw new Error("Google không trả về quyền truy cập.");
  const exp = Date.now() + (Number(params.get("expires_in")) || 3600) * 1000 - 60000;
  // Google lets the user untick single permissions; without Drive we can sign in but not sync.
  const hasDrive = (params.get("scope") || "").split(" ").includes("https://www.googleapis.com/auth/drive.appdata");
  await chrome.storage.session.set({ driveToken: { token, exp, drive: hasDrive } });
  return token;
}

const NO_DRIVE = "Chưa cho phép quyền Google Drive";

async function driveToken() {
  const token = await getToken();
  const { driveToken: t } = await chrome.storage.session.get("driveToken");
  if (t?.token === token && t.drive === false) throw new Error(NO_DRIVE);
  return token;
}

async function getToken(interactive = false) {
  const { driveToken } = await chrome.storage.session.get("driveToken");
  if (!interactive && driveToken && driveToken.exp > Date.now()) return driveToken.token;
  return authorize(interactive);
}

// fetch with the bearer token; on 401 the token is renewed silently once.
async function api(url, init = {}, retry = true) {
  const token = await driveToken();
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) {
    await chrome.storage.session.remove("driveToken");
    return api(url, init, false);
  }
  if (!res.ok) {
    const body = await res.text();
    // 403 with a scope reason: the Drive permission was refused or later removed in the Google account.
    if (res.status === 403 && /insufficient|scope/i.test(body)) throw new Error(NO_DRIVE);
    // Otherwise pass Google's own reason on (e.g. the Drive API is not enabled for the project).
    let reason = "";
    try {
      reason = String(JSON.parse(body).error?.message || "").slice(0, 160);
    } catch {
      // Not JSON: the status alone will do.
    }
    throw new Error(`Google Drive báo lỗi ${res.status}${reason ? `: ${reason}` : ""}`);
  }
  return res;
}

// --- Drive file ---

async function findFile() {
  const q = encodeURIComponent(`name='${DRIVE_FILE}'`);
  const res = await api(`${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`);
  return (await res.json()).files?.[0]?.id || null;
}

async function upload(fileId, body) {
  const json = JSON.stringify(body);
  if (fileId) {
    await api(`${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: json });
    return fileId;
  }
  const boundary = `fsk${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name: DRIVE_FILE, parents: ["appDataFolder"] });
  const multipart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
  const res = await api(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart
  });
  return (await res.json()).id;
}

// --- Local state ---

async function readLocalCloud() {
  const ids = Object.keys(C.SITES);
  const keys = ["fapTimetable", "fapAttendance", ...ids.map((id) => `threads:${id}`)];
  const [sites, local] = await Promise.all([S.loadAllSites(), chrome.storage.local.get(keys)]);
  const threads = Object.fromEntries(ids.map((id) => [id, local[`threads:${id}`] || {}]));
  return { sites, threads, fapTimetable: local.fapTimetable || null, fapAttendance: local.fapAttendance || null };
}

async function writeLocalCloud(merged, before) {
  for (const id of Object.keys(C.SITES)) {
    // Merged again inside the site lock, so a tick made while we were downloading is kept.
    if (!C.sameData(merged.sites[id], before.sites[id])) await S.updateSite(id, (draft) => Object.assign(draft, C.mergeSite(draft, merged.sites[id])));
  }
  const set = {};
  for (const id of Object.keys(C.SITES)) if (!C.sameData(merged.threads[id], before.threads[id])) set[`threads:${id}`] = merged.threads[id];
  for (const key of ["fapTimetable", "fapAttendance"]) if (merged[key] && !C.sameData(merged[key], before[key])) set[key] = merged[key];
  if (Object.keys(set).length) await chrome.storage.local.set(set);
}

// --- Sync ---

let running = null;
let applying = false; // our own writes must not schedule another sync

async function setDrive(patch) {
  const { drive } = await chrome.storage.local.get("drive");
  await chrome.storage.local.set({ drive: { ...drive, ...patch } });
}

async function syncNow() {
  const { drive } = await chrome.storage.local.get("drive");
  if (!drive?.account) return;
  await chrome.storage.session.set({ driveBusy: true });
  try {
    let fileId = drive.fileId || (await findFile());
    let remoteRaw = null;
    if (fileId) {
      try {
        remoteRaw = await (await api(`${DRIVE_API}/files/${fileId}?alt=media`)).json();
      } catch {
        fileId = await findFile(); // the file was deleted or replaced: look it up again
        if (fileId) remoteRaw = await (await api(`${DRIVE_API}/files/${fileId}?alt=media`)).json().catch(() => null);
      }
    }
    const remote = C.cleanCloud(remoteRaw);
    const before = await readLocalCloud();
    applying = true;
    try {
      await writeLocalCloud(C.mergeCloud(before, remote), before);
    } finally {
      applying = false;
    }
    const after = await readLocalCloud();
    if (!fileId || !C.sameData(after, remote)) fileId = await upload(fileId, C.buildCloud(after));
    await setDrive({ fileId, lastSync: Date.now(), error: null });
  } catch (err) {
    const message = err?.message || String(err);
    const signin = message !== NO_DRIVE && /interaction|consent|login|User|401/i.test(message);
    await setDrive({ error: signin ? "Cần đăng nhập lại" : message });
  } finally {
    await chrome.storage.session.remove("driveBusy");
  }
}

let queued = false;
function driveSync() {
  // One run at a time; requests during a run collapse into one more run right after it.
  if (running) {
    queued = true;
    return running;
  }
  running = (async () => {
    do {
      queued = false;
      await syncNow();
    } while (queued);
  })().finally(() => (running = null));
  return running;
}

async function driveLogin() {
  try {
    const token = await getToken(true);
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } });
    const me = await res.json();
    const picture = typeof me.picture === "string" && me.picture.startsWith("https://") ? me.picture : "";
    // A different account means a different Drive file.
    const { drive } = await chrome.storage.local.get("drive");
    const same = drive?.account?.email === me.email;
    await chrome.storage.local.set({ drive: { account: { email: String(me.email || ""), name: String(me.name || ""), picture }, fileId: same ? drive.fileId : null, lastSync: same ? drive.lastSync : 0, error: null } });
    await driveSync();
  } catch (err) {
    await setDrive({ error: err?.message || String(err) });
  }
}

async function driveLogout() {
  const { driveToken } = await chrome.storage.session.get("driveToken");
  if (driveToken) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(driveToken.token)}`, { method: "POST" }).catch(() => {});
  await chrome.storage.session.remove(["driveToken", "driveBusy"]);
  await chrome.storage.local.remove("drive");
}

// A few seconds after the last local change, push it (and pull anything new).
let pending = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || applying || !Object.keys(changes).some(CLOUD_KEYS)) return;
  clearTimeout(pending);
  pending = setTimeout(driveSync, 4000);
});
chrome.runtime.onStartup.addListener(() => driveSync());
