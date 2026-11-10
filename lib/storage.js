// chrome.storage access. Study data lives only in storage.local; moving it to another machine is
// done with the export/import file.
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

  // Up to 2.0 the data was mirrored to storage.sync (Chrome Sync). Pull whatever it still holds into
  // local once, then empty it, so nothing is lost and nothing stays behind in the user's Google account.
  let retired = null;
  const retireSync = () =>
    (retired ||= (async () => {
      if ((await area("local").get("syncRetired")).syncRetired) return;
      const sites = C.fromSyncItems(await area("sync").get(null));
      for (const [id, remote] of Object.entries(sites)) {
        await serial(id, async () => {
          const local = await readLocal(id);
          const merged = C.mergeSite(local, remote);
          if (!C.sameData(merged, local)) await area("local").set({ [siteKey(id)]: merged });
        });
      }
      await area("sync").clear();
      await area("local").remove("syncError");
      await area("local").set({ syncRetired: true });
    })().catch((err) => {
      retired = null; // try again on the next load
      console.warn("[fuo] could not retire Chrome Sync data:", err);
    }));

  const loadSite = async (id) => {
    await retireSync();
    return readLocal(id);
  };

  const updateSite = (id, mutate) =>
    serial(id, async () => {
      const current = await readLocal(id);
      const draft = JSON.parse(JSON.stringify(current));
      const now = Date.now();
      mutate(draft, now);
      const next = C.pruneTombstones(C.mergeSite(current, draft), now);
      await area("local").set({ [siteKey(id)]: next });
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

  const onSiteChanged = (cb) => {
    root.chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      for (const key of Object.keys(changes)) {
        const id = key.startsWith("site:") && key.slice(5);
        if (C.SITES[id]) cb(id);
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
    onSiteChanged
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FuoStorage = api;
})(globalThis);
