// chrome.storage access. storage.local is the source of truth; storage.sync is a
// best-effort mirror (Chrome Sync when the user has it on, plain local storage in Brave).
(function (root) {
  const C = root.FuoCore;
  const area = (name) => root.chrome.storage[name];
  const siteKey = (id) => `site:${id}`;

  // Serialize read-merge-write per site across every tab of the same origin (Web Locks),
  // otherwise two tabs that read the same snapshot overwrite each other's change.
  // shortcut: the popup has the extension origin, so its import is not locked against tabs;
  // move writes into the service worker if that race ever shows up.
  const serial = (id, fn) => root.navigator.locks.request(`fuo-site-${id}`, fn);

  const readLocal = async (id) => (await area("local").get(siteKey(id)))[siteKey(id)] || C.emptySite();

  const readSync = async () => {
    try {
      return (await area("sync").get(null)) || {};
    } catch {
      return {};
    }
  };

  const siteSyncKeys = (items, id) =>
    Object.keys(items).filter((k) => C.SYNC_KEY.test(k) && k.startsWith(`s:${id}:`));

  const mirrorToSync = async (id, site, before) => {
    try {
      const items = C.toSyncItems(id, site);
      const changed = Object.fromEntries(
        Object.entries(items).filter(([k, v]) => !C.sameData(before[k], v))
      );
      const stale = siteSyncKeys(before, id).filter((k) => !(k in items));
      if (Object.keys(changed).length) await area("sync").set(changed);
      if (stale.length) await area("sync").remove(stale);
      const { syncError } = await area("local").get("syncError");
      if (syncError) await area("local").set({ syncError: null });
    } catch (err) {
      await area("local").set({ syncError: err?.message || String(err) });
    }
  };

  const loadSite = (id) =>
    serial(id, async () => {
      const local = await readLocal(id);
      const merged = C.mergeSite(local, C.fromSyncItems(await readSync())[id] || C.emptySite());
      if (!C.sameData(merged, local)) await area("local").set({ [siteKey(id)]: merged });
      return merged;
    });

  const updateSite = (id, mutate) =>
    serial(id, async () => {
      const syncItems = await readSync();
      const current = C.mergeSite(await readLocal(id), C.fromSyncItems(syncItems)[id] || C.emptySite());
      const draft = JSON.parse(JSON.stringify(current));
      const now = Date.now();
      mutate(draft, now);
      const next = C.pruneTombstones(C.mergeSite(current, draft), now);
      await area("local").set({ [siteKey(id)]: next });
      await mirrorToSync(id, next, syncItems);
      return next;
    });

  const loadAllSites = async () => {
    const out = {};
    for (const id of Object.keys(C.SITES)) out[id] = await loadSite(id);
    return out;
  };

  const migrateLegacy = async (id, raw) => {
    const flag = `migrated:${id}`;
    if ((await area("local").get(flag))[flag]) return false;
    await updateSite(id, (draft, now) => Object.assign(draft, C.mergeSite(draft, C.fromLegacy(raw, now))));
    await area("local").set({ [flag]: true });
    return true;
  };

  const previewImport = async (obj) => {
    const v = C.validateImport(obj);
    if (!v.ok) return v;
    return { ok: true, counts: C.diffCounts(await loadAllSites(), v.sites) };
  };

  const applyImport = async (obj) => {
    const v = C.validateImport(obj);
    if (!v.ok) return v;
    for (const [id, incoming] of Object.entries(v.sites)) {
      await updateSite(id, (draft) => Object.assign(draft, C.mergeSite(draft, incoming)));
    }
    return { ok: true };
  };

  const getSyncError = async () => (await area("local").get("syncError")).syncError || null;

  const onSiteChanged = (cb) => {
    root.chrome.storage.onChanged.addListener((changes, areaName) => {
      const ids = new Set();
      for (const key of Object.keys(changes)) {
        if (areaName === "local" && key.startsWith("site:")) ids.add(key.slice(5));
        const m = areaName === "sync" && key.match(C.SYNC_KEY);
        if (m) ids.add(m[1]);
      }
      for (const id of ids) {
        if (!C.SITES[id]) continue;
        if (areaName === "sync") loadSite(id).then(() => cb(id), () => {});
        else cb(id);
      }
    });
  };

  const api = {
    loadSite,
    updateSite,
    loadAllSites,
    migrateLegacy,
    previewImport,
    applyImport,
    getSyncError,
    onSiteChanged
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FuoStorage = api;
})(globalThis);
