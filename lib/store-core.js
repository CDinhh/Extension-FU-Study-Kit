// Pure study-data logic shared by content.js, the popup and the Node tests.
// No chrome.* here so it can be unit-tested with `node --test`.
(function (root) {
  const APP = "fu-exam-checklist";
  const VERSION = 1;
  const KINDS = ["checklist", "progress", "flags"];
  const TOMBSTONE_MAX_AGE = 90 * 24 * 3600 * 1000;
  const MAX_IMPORT_CHARS = 1000000;
  const MAX_NUM = 10000;

  const SITES = {
    fuoverflow: { name: "FuOverflow", host: "fuoverflow.com" },
    fuexam: { name: "FuExam", host: "fuexam.me" }
  };

  const siteFromHost = (hostname) => {
    const h = String(hostname || "").toLowerCase();
    for (const id of Object.keys(SITES)) {
      const host = SITES[id].host;
      if (h === host || h.endsWith("." + host)) return id;
    }
    return null;
  };

  const emptySite = () => ({ checklist: {}, progress: {}, flags: {} });

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const isThreadId = (k) => /^\d{1,12}$/.test(k);
  const isTime = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  // A future `at` would win every merge and lock the entry; allow a day of clock skew.
  const isPastTime = (v) => isTime(v) && v <= Date.now() + 24 * 3600 * 1000;
  const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_NUM;

  // Key-order independent equality: chrome.storage hands objects back with sorted keys.
  const canon = (v) =>
    isObj(v)
      ? `{${Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canon(v[k]))
          .join(",")}}`
      : JSON.stringify(v);
  const sameData = (a, b) => canon(a) === canon(b);

  const parse = (str) => {
    try {
      const v = JSON.parse(str);
      return isObj(v) ? v : {};
    } catch {
      return {};
    }
  };

  // Legacy localStorage shapes: checklist {id: timestamp}, progress {id: {current,total,updatedAt}},
  // flags {id: [questionIndex...]}.
  const fromLegacy = (raw, now) => {
    const site = emptySite();
    for (const [id, ts] of Object.entries(parse(raw?.checklist))) {
      if (isThreadId(id) && ts) site.checklist[id] = { done: true, at: isTime(ts) ? ts : now };
    }
    for (const [id, p] of Object.entries(parse(raw?.progress))) {
      if (!isThreadId(id) || !isObj(p)) continue;
      site.progress[id] = {
        current: isCount(p.current) ? p.current : null,
        total: isCount(p.total) ? p.total : null,
        at: isTime(p.updatedAt) ? p.updatedAt : now
      };
    }
    for (const [id, list] of Object.entries(parse(raw?.flags))) {
      if (!isThreadId(id) || !Array.isArray(list)) continue;
      const qs = {};
      for (const q of list) if (isCount(q)) qs[String(q)] = { on: true, at: now };
      if (Object.keys(qs).length) site.flags[id] = qs;
    }
    return site;
  };

  // Newer `at` wins; on a tie `b` wins.
  const mergeEntries = (a = {}, b = {}) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (!out[k] || v.at >= out[k].at) out[k] = v;
    }
    return out;
  };

  const mergeSite = (a, b) => {
    const flags = { ...a.flags };
    for (const [tid, qs] of Object.entries(b.flags)) flags[tid] = mergeEntries(flags[tid], qs);
    return {
      checklist: mergeEntries(a.checklist, b.checklist),
      progress: mergeEntries(a.progress, b.progress),
      flags
    };
  };

  const pruneTombstones = (site, now, maxAgeMs = TOMBSTONE_MAX_AGE) => {
    const old = (e) => now - e.at > maxAgeMs;
    const keep = (map, isTomb) => Object.fromEntries(Object.entries(map).filter(([, e]) => !(isTomb(e) && old(e))));
    const flags = {};
    for (const [tid, qs] of Object.entries(site.flags)) {
      const kept = keep(qs, (e) => !e.on);
      if (Object.keys(kept).length) flags[tid] = kept;
    }
    return {
      checklist: keep(site.checklist, (e) => !e.done),
      progress: keep(site.progress, (e) => e.removed),
      flags
    };
  };

  const isDone = (site, tid) => !!site.checklist[tid]?.done;
  const isStudying = (site, tid) => {
    const p = site.progress[tid];
    return !!p && !p.removed && !isDone(site, tid);
  };
  const flagSet = (site, tid) =>
    new Set(
      Object.entries(site.flags[tid] || {})
        .filter(([, e]) => e.on)
        .map(([q]) => Number(q))
    );

  const countSite = (site) => ({
    done: Object.keys(site.checklist).filter((t) => isDone(site, t)).length,
    studying: Object.keys(site.progress).filter((t) => isStudying(site, t)).length,
    flagged: Object.keys(site.flags).reduce((n, t) => n + flagSet(site, t).size, 0)
  });

  const COURSE = /\b[A-Z]{2,4}\d{3}[a-z]?\b/;

  // Every thread the user has touched (done, studying or flagged), grouped by course code, newest
  // first. meta = {tid: {title, subject, subjectUrl}} as content.js saves it; any field may be missing.
  const studiedBySubject = (site, meta = {}) => {
    const groups = {};
    const ids = new Set([...Object.keys(site.checklist), ...Object.keys(site.progress), ...Object.keys(site.flags)]);
    for (const tid of ids) {
      const done = isDone(site, tid);
      const flags = flagSet(site, tid).size;
      if (!done && !isStudying(site, tid) && !flags) continue;
      const m = meta[tid] || {};
      const subject = (m.subject || "").match(COURSE)?.[0] || m.subject || m.title?.match(COURSE)?.[0] || "Khác";
      const p = site.progress[tid];
      const live = p && !p.removed;
      const at = Math.max(site.checklist[tid]?.at || 0, p?.at || 0, ...Object.values(site.flags[tid] || {}).map((e) => e.at));
      const g = (groups[subject] = groups[subject] || { subject, url: "", at: 0, tests: [] });
      if (!g.url && m.subjectUrl) g.url = m.subjectUrl;
      g.at = Math.max(g.at, at);
      g.tests.push({ tid, title: m.title || "", done, current: live ? p.current : null, total: live ? p.total : null, flags, at });
    }
    const list = Object.values(groups).sort((a, b) => b.at - a.at);
    for (const g of list) g.tests.sort((a, b) => b.at - a.at);
    return list;
  };

  // --- Google Drive copy: one JSON with everything a second device needs. ---
  // The file comes back from the network, so every part is rebuilt from checked fields.
  const str = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  const int = (v) => (isCount(v) ? v : 0);

  const cleanThreadMeta = (raw, siteId) => {
    const out = {};
    const host = SITES[siteId]?.host;
    for (const [tid, m] of Object.entries(isObj(raw) ? raw : {})) {
      if (!isThreadId(tid) || !isObj(m)) continue;
      const url = str(m.subjectUrl, 300);
      out[tid] = { title: str(m.title), subject: str(m.subject) };
      if (host && url.startsWith(`https://${host}/`)) out[tid].subjectUrl = url;
    }
    return out;
  };

  const ITEM_STR = ["slot", "title", "time", "room", "teacher", "meet", "kind", "attendance", "attended"];
  const cleanTimetable = (raw) => {
    if (!isObj(raw) || !isObj(raw.weeks) || !isPastTime(raw.fetchedAt)) return null;
    const weeks = {};
    for (const [key, w] of Object.entries(raw.weeks)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !isObj(w) || !Array.isArray(w.days) || !Array.isArray(w.items)) continue;
      weeks[key] = {
        days: w.days.slice(0, 7).map((d) => str(d, 40)),
        items: w.items.filter(isObj).slice(0, 80).map((it) => {
          const item = { day: Number.isInteger(it.day) && it.day >= 0 && it.day < 7 ? it.day : 0, online: it.online === true };
          for (const k of ITEM_STR) item[k] = str(it[k]);
          return item;
        })
      };
    }
    return { fetchedAt: raw.fetchedAt, weeks };
  };

  const cleanAttendance = (raw) => {
    if (!isObj(raw) || !Array.isArray(raw.courses) || !isPastTime(raw.fetchedAt)) return null;
    return {
      fetchedAt: raw.fetchedAt,
      term: str(raw.term, 60),
      courses: raw.courses.filter(isObj).slice(0, 40).map((c) => ({
        id: str(c.id, 80),
        name: str(c.name),
        code: str(c.code, 40),
        group: str(c.group, 60),
        present: int(c.present),
        absent: int(c.absent),
        pending: int(c.pending),
        total: int(c.total)
      }))
    };
  };

  // Never throws: a damaged file counts as empty, so the next upload replaces it with good data.
  const cleanCloud = (raw) => {
    const out = { sites: {}, threads: {}, fapTimetable: null, fapAttendance: null };
    if (!isObj(raw) || raw.app !== APP) return out;
    for (const id of Object.keys(SITES)) {
      try {
        out.sites[id] = cleanSite(raw.sites?.[id] ?? {});
      } catch {
        out.sites[id] = emptySite();
      }
      out.threads[id] = cleanThreadMeta(raw.threads?.[id], id);
    }
    out.fapTimetable = cleanTimetable(raw.fapTimetable);
    out.fapAttendance = cleanAttendance(raw.fapAttendance);
    return out;
  };

  const newer = (a, b) => ((b?.fetchedAt || 0) > (a?.fetchedAt || 0) ? b : a) || null;

  // Study data: newer entry wins (as with import). Titles: fill in what this device lacks.
  // Timetable / attendance: the more recent crawl wins as a whole.
  const mergeCloud = (local, remote) => {
    const out = { sites: {}, threads: {}, fapTimetable: newer(local.fapTimetable, remote.fapTimetable), fapAttendance: newer(local.fapAttendance, remote.fapAttendance) };
    for (const id of Object.keys(SITES)) {
      out.sites[id] = mergeSite(local.sites[id] || emptySite(), remote.sites[id] || emptySite());
      const meta = { ...remote.threads[id] };
      for (const [tid, m] of Object.entries(local.threads[id] || {})) meta[tid] = { ...meta[tid], ...m };
      out.threads[id] = meta;
    }
    return out;
  };

  const buildCloud = (state) => ({ app: APP, version: VERSION, ...state });

  const buildExport = (sites, now) => ({ app: APP, version: VERSION, exportedAt: now, sites });

  // Trust boundary: rebuild every entry from checked fields so nothing unexpected is stored.
  const cleanSite = (raw) => {
    if (!isObj(raw)) throw "dữ liệu của một trang không hợp lệ";
    const site = emptySite();
    for (const kind of KINDS) {
      if (raw[kind] !== undefined && !isObj(raw[kind])) throw `mục "${kind}" không hợp lệ`;
    }
    for (const [id, e] of Object.entries(raw.checklist || {})) {
      if (!isThreadId(id)) throw `mã đề "${id}" không hợp lệ`;
      if (!isObj(e) || typeof e.done !== "boolean" || !isPastTime(e.at)) throw `đề ${id} có dữ liệu sai`;
      site.checklist[id] = { done: e.done, at: e.at };
    }
    for (const [id, e] of Object.entries(raw.progress || {})) {
      if (!isThreadId(id)) throw `mã đề "${id}" không hợp lệ`;
      const okNum = (v) => v === null || isCount(v);
      if (!isObj(e) || !isPastTime(e.at) || !okNum(e.current) || !okNum(e.total)) throw `tiến độ đề ${id} sai`;
      site.progress[id] = { current: e.current, total: e.total, at: e.at };
      if (e.removed === true) site.progress[id].removed = true;
    }
    for (const [id, qs] of Object.entries(raw.flags || {})) {
      if (!isThreadId(id) || !isObj(qs)) throw `cờ của đề "${id}" không hợp lệ`;
      const out = {};
      for (const [q, e] of Object.entries(qs)) {
        if (!/^\d{1,5}$/.test(q) || Number(q) > MAX_NUM) throw `số câu "${q}" không hợp lệ`;
        if (!isObj(e) || typeof e.on !== "boolean" || !isPastTime(e.at)) throw `cờ câu ${q} đề ${id} sai`;
        out[q] = { on: e.on, at: e.at };
      }
      site.flags[id] = out;
    }
    return site;
  };

  const validateImport = (obj) => {
    const fail = (why) => ({ ok: false, error: `File không hợp lệ: ${why}.` });
    if (!isObj(obj)) return fail("không phải file xuất từ extension");
    let size;
    try {
      size = JSON.stringify(obj).length;
    } catch {
      return fail("không đọc được nội dung");
    }
    if (size > MAX_IMPORT_CHARS) return fail("file quá lớn (tối đa 1 MB)");
    if (obj.app !== APP) return fail("không phải file xuất từ extension này");
    if (obj.version !== VERSION) return fail(`phiên bản ${obj.version} không được hỗ trợ`);
    if (!isObj(obj.sites)) return fail("thiếu dữ liệu");
    const sites = {};
    try {
      for (const [id, raw] of Object.entries(obj.sites)) {
        if (!SITES[id]) throw `trang "${id}" không được hỗ trợ`;
        sites[id] = cleanSite(raw);
      }
    } catch (why) {
      return fail(typeof why === "string" ? why : "dữ liệu sai");
    }
    return { ok: true, sites };
  };

  const isTombstone = (kind, e) =>
    kind === "checklist" ? !e.done : kind === "progress" ? !!e.removed : Object.values(e).every((q) => !q.on);

  const diffCounts = (local, incoming) => {
    const out = {};
    for (const [id, inc] of Object.entries(incoming)) {
      const cur = local[id] || emptySite();
      const merged = mergeSite(cur, inc);
      let added = 0;
      let updated = 0;
      for (const kind of KINDS) {
        for (const tid of Object.keys(inc[kind])) {
          const before = cur[kind][tid];
          const after = merged[kind][tid];
          if (sameData(before, after)) continue;
          if (!before && !isTombstone(kind, after)) added++;
          else updated++;
        }
      }
      out[id] = { added, updated };
    }
    return out;
  };

  // Layout of the Chrome Sync mirror used up to 2.0; only read now, to bring old data back to local.
  const SYNC_KEY = /^s:([a-z]+):(checklist|progress|flags):\d+$/;

  const fromSyncItems = (items) => {
    const sites = {};
    for (const [key, value] of Object.entries(items || {})) {
      const m = key.match(SYNC_KEY);
      if (!m || !SITES[m[1]] || !isObj(value)) continue;
      sites[m[1]] = sites[m[1]] || emptySite();
      Object.assign(sites[m[1]][m[2]], value);
    }
    return sites;
  };

  const api = {
    SITES,
    TOMBSTONE_MAX_AGE,
    MAX_IMPORT_CHARS,
    SYNC_KEY,
    sameData,
    siteFromHost,
    emptySite,
    fromLegacy,
    mergeSite,
    pruneTombstones,
    isDone,
    isStudying,
    flagSet,
    countSite,
    studiedBySubject,
    cleanCloud,
    mergeCloud,
    buildCloud,
    buildExport,
    validateImport,
    diffCounts,
    fromSyncItems
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FuoCore = api;
})(globalThis);
