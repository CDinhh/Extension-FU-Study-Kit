const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.FuoCore = require("../lib/store-core.js");
const C = globalThis.FuoCore;
const STORAGE_PATH = require.resolve("../lib/storage.js");

// In-memory stand-in for chrome.storage.local/sync (promise API).
const makeChrome = () => {
  const listeners = [];
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const area = (name) => ({
    data: {},
    failSet: false,
    async get(keys) {
      if (keys == null) return clone(this.data);
      const out = {};
      for (const k of [].concat(keys)) if (k in this.data) out[k] = clone(this.data[k]);
      return out;
    },
    async set(obj) {
      if (this.failSet) throw new Error("QUOTA_BYTES quota exceeded");
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: this.data[k], newValue: clone(v) };
        this.data[k] = clone(v);
      }
      listeners.forEach((f) => f(changes, name));
    },
    async remove(keys) {
      const changes = {};
      for (const k of [].concat(keys)) {
        changes[k] = { oldValue: this.data[k] };
        delete this.data[k];
      }
      listeners.forEach((f) => f(changes, name));
    },
    async clear() {
      await this.remove(Object.keys(this.data));
    }
  });
  return {
    storage: { local: area("local"), sync: area("sync"), onChanged: { addListener: (f) => listeners.push(f) } }
  };
};

const fresh = () => {
  globalThis.chrome = makeChrome();
  delete require.cache[STORAGE_PATH];
  return require(STORAGE_PATH);
};

const tick = () => new Promise((r) => setTimeout(r, 10));

test("concurrent updateSite calls both survive", async () => {
  const S = fresh();
  const now = Date.now();
  await Promise.all([
    S.updateSite("fuexam", (d) => (d.checklist["1"] = { done: true, at: now })),
    S.updateSite("fuexam", (d) => (d.checklist["2"] = { done: true, at: now }))
  ]);
  const local = chrome.storage.local.data["site:fuexam"];
  assert.deepEqual(Object.keys(local.checklist).sort(), ["1", "2"]);
  assert.deepEqual(chrome.storage.sync.data, {}); // nothing goes to Chrome Sync any more
});

test("two tabs (separate module instances) writing at once both survive", async () => {
  const A = fresh();
  delete require.cache[STORAGE_PATH];
  const B = require(STORAGE_PATH); // second tab: own module state, same chrome.storage
  const now = Date.now();
  await Promise.all([
    A.updateSite("fuexam", (d) => (d.checklist["1"] = { done: true, at: now })),
    B.updateSite("fuexam", (d) => (d.checklist["2"] = { done: true, at: now }))
  ]);
  assert.deepEqual(Object.keys(chrome.storage.local.data["site:fuexam"].checklist).sort(), ["1", "2"]);
});

test("migrateLegacy is idempotent", async () => {
  const S = fresh();
  const raw = { checklist: '{"43":1700000000000}', progress: null, flags: '{"43":[1]}' };
  assert.equal(await S.migrateLegacy("fuoverflow", raw), true);
  const first = JSON.stringify(chrome.storage.local.data["site:fuoverflow"]);
  await tick();
  assert.equal(await S.migrateLegacy("fuoverflow", raw), false);
  assert.equal(JSON.stringify(chrome.storage.local.data["site:fuoverflow"]), first);
  assert.equal((await S.loadSite("fuoverflow")).checklist["43"].done, true);
});

test("applyImport rejects and writes nothing", async () => {
  const S = fresh();
  await S.updateSite("fuexam", (d, now) => (d.checklist["1"] = { done: true, at: now }));
  const before = JSON.stringify(chrome.storage.local.data);
  const r = await S.applyImport({ app: "fu-exam-checklist", version: 1, sites: { fuexam: { checklist: { x: 1 } } } });
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(chrome.storage.local.data), before);
});

test("applyImport merges with newer-wins", async () => {
  const S = fresh();
  await S.updateSite("fuexam", (d) => {
    d.checklist["1"] = { done: true, at: 100 };
    d.checklist["2"] = { done: false, at: Date.now() };
  });
  const file = C.buildExport(
    { fuexam: { checklist: { 1: { done: false, at: Date.now() }, 2: { done: true, at: 50 } }, progress: {}, flags: {} } },
    1
  );
  const preview = await S.previewImport(file);
  assert.deepEqual(preview, { ok: true, counts: { fuexam: { added: 0, updated: 1 } } });
  assert.deepEqual(await S.applyImport(file), { ok: true });
  const site = await S.loadSite("fuexam");
  assert.equal(C.isDone(site, "1"), false);
  assert.equal(C.isDone(site, "2"), false);
  assert.deepEqual((await S.previewImport(file)).counts.fuexam, { added: 0, updated: 0 });
});

test("loadSite moves old Chrome Sync data into local once, then empties sync", async () => {
  const S = fresh();
  await S.updateSite("fuexam", (d) => (d.checklist["1"] = { done: true, at: 10 }));
  Object.assign(chrome.storage.sync.data, {
    "s:fuexam:checklist:0": { 1: { done: false, at: 5 }, 9: { done: true, at: 5 } },
    "s:fuoverflow:progress:0": { 7: { current: 3, total: 9, at: 5 } }
  });
  chrome.storage.local.data.syncError = "old quota error";
  const site = await S.loadSite("fuexam");
  assert.equal(C.isDone(site, "1"), true); // the newer local entry wins
  assert.equal(C.isDone(site, "9"), true);
  assert.equal(C.isStudying(chrome.storage.local.data["site:fuoverflow"], "7"), true);
  assert.deepEqual(chrome.storage.sync.data, {});
  assert.equal("syncError" in chrome.storage.local.data, false);

  // Retired for good: data that shows up in sync later is ignored, even by a new tab.
  chrome.storage.sync.data["s:fuexam:checklist:0"] = { 2: { done: true, at: 5 } };
  delete require.cache[STORAGE_PATH];
  const tab = require(STORAGE_PATH);
  assert.equal(C.isDone(await tab.loadSite("fuexam"), "2"), false);
});

test("onSiteChanged fires for local writes of known sites only", async () => {
  const S = fresh();
  const seen = [];
  S.onSiteChanged((id) => seen.push(id));
  await S.updateSite("fuoverflow", (d, now) => (d.checklist["1"] = { done: true, at: now }));
  await chrome.storage.local.set({ "site:other": {}, prefs: {} });
  await chrome.storage.sync.set({ "s:fuexam:checklist:0": {} });
  await tick();
  assert.deepEqual(seen, ["fuoverflow"]);
});
