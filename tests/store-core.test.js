const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../lib/store-core.js");

const DAY = 24 * 3600 * 1000;
const site = (over = {}) => ({ ...C.emptySite(), ...over });

test("siteFromHost maps exact hosts and subdomains only", () => {
  assert.equal(C.siteFromHost("fuoverflow.com"), "fuoverflow");
  assert.equal(C.siteFromHost("www.fuoverflow.com"), "fuoverflow");
  assert.equal(C.siteFromHost("fuexam.me"), "fuexam");
  assert.equal(C.siteFromHost("evil-fuexam.me.com"), null);
  assert.equal(C.siteFromHost("example.com"), null);
});

test("fromLegacy converts the old localStorage shapes", () => {
  const s = C.fromLegacy(
    {
      checklist: '{"43":1700000000000}',
      progress: '{"43":{"current":8,"total":60,"updatedAt":1700000001000}}',
      flags: '{"43":[2,5]}'
    },
    1800000000000
  );
  assert.deepEqual(s.checklist["43"], { done: true, at: 1700000000000 });
  assert.deepEqual(s.progress["43"], { current: 8, total: 60, at: 1700000001000 });
  assert.deepEqual(s.flags["43"]["2"], { on: true, at: 1800000000000 });
  assert.deepEqual(s.flags["43"]["5"], { on: true, at: 1800000000000 });
});

test("fromLegacy tolerates bad JSON", () => {
  assert.deepEqual(C.fromLegacy({ checklist: "{oops", progress: null, flags: "[" }, 1), C.emptySite());
});

test("mergeSite: newer tombstone beats older tick", () => {
  const a = site({ checklist: { 1: { done: true, at: 10 } } });
  const b = site({ checklist: { 1: { done: false, at: 20 } } });
  assert.deepEqual(C.mergeSite(a, b).checklist["1"], { done: false, at: 20 });
  assert.deepEqual(C.mergeSite(b, a).checklist["1"], { done: false, at: 20 });
});

test("mergeSite merges flags per question and flag tombstones win when newer", () => {
  const a = site({ flags: { 7: { 1: { on: true, at: 5 } } } });
  const b = site({ flags: { 7: { 2: { on: true, at: 6 } } } });
  assert.deepEqual(C.mergeSite(a, b).flags["7"], { 1: { on: true, at: 5 }, 2: { on: true, at: 6 } });
  const t = site({ flags: { 7: { 1: { on: false, at: 9 } } } });
  assert.deepEqual(C.mergeSite(a, t).flags["7"]["1"], { on: false, at: 9 });
});

test("mergeSite is idempotent and commutative apart from ties", () => {
  const x = site({
    checklist: { 1: { done: true, at: 3 } },
    progress: { 2: { current: 4, total: 9, at: 5 } },
    flags: { 2: { 0: { on: true, at: 1 } } }
  });
  const y = site({ checklist: { 1: { done: false, at: 4 }, 3: { done: true, at: 1 } } });
  assert.deepEqual(C.mergeSite(x, x), x);
  assert.deepEqual(C.mergeSite(x, y), C.mergeSite(y, x));
});

test("pruneTombstones drops old tombstones only", () => {
  const now = 1000 * DAY;
  const s = site({
    checklist: {
      1: { done: false, at: now - 91 * DAY },
      2: { done: false, at: now - DAY },
      3: { done: true, at: now - 500 * DAY }
    },
    progress: {
      4: { removed: true, current: null, total: null, at: now - 91 * DAY },
      5: { current: 1, total: 2, at: now - 500 * DAY }
    },
    flags: { 6: { 0: { on: false, at: now - 91 * DAY } }, 7: { 0: { on: true, at: now - 500 * DAY } } }
  });
  const p = C.pruneTombstones(s, now);
  assert.deepEqual(Object.keys(p.checklist).sort(), ["2", "3"]);
  assert.deepEqual(Object.keys(p.progress), ["5"]);
  assert.deepEqual(Object.keys(p.flags), ["7"]);
});

test("isStudying is false when removed or done; flagSet/countSite", () => {
  const s = site({
    checklist: { 1: { done: true, at: 1 } },
    progress: {
      1: { current: 1, total: 2, at: 1 },
      2: { removed: true, current: null, total: null, at: 1 },
      3: { current: 4, total: 9, at: 1 }
    },
    flags: { 3: { 1: { on: true, at: 1 }, 2: { on: false, at: 1 }, 5: { on: true, at: 1 } } }
  });
  assert.equal(C.isDone(s, "1"), true);
  assert.equal(C.isStudying(s, "1"), false);
  assert.equal(C.isStudying(s, "2"), false);
  assert.equal(C.isStudying(s, "3"), true);
  assert.deepEqual([...C.flagSet(s, "3")].sort(), [1, 5]);
  assert.deepEqual(C.countSite(s), { done: 1, studying: 1, flagged: 2 });
});

test("same thread id on two sites stays separate through export/import", () => {
  const A = site({ checklist: { 43: { done: true, at: 1 } } });
  const B = site({ progress: { 43: { current: 3, total: 60, at: 2 } } });
  const r = C.validateImport(JSON.parse(JSON.stringify(C.buildExport({ fuoverflow: A, fuexam: B }, 5))));
  assert.equal(r.ok, true);
  assert.deepEqual(r.sites.fuoverflow, A);
  assert.deepEqual(r.sites.fuexam, B);
});

test("validateImport rejects bad files", () => {
  const good = () => C.buildExport({ fuexam: site({ checklist: { 1: { done: true, at: 1 } } }) }, 1);
  const bad = [
    null,
    "x",
    { ...good(), app: "other" },
    { ...good(), version: 2 },
    { ...good(), sites: { other: C.emptySite() } },
    { ...good(), sites: { fuexam: site({ checklist: { abc: { done: true, at: 1 } } }) } },
    { ...good(), sites: { fuexam: site({ progress: { 1: { current: -1, total: 2, at: 1 } } }) } },
    { ...good(), sites: { fuexam: site({ progress: { 1: { current: 10001, total: 2, at: 1 } } }) } },
    { ...good(), sites: { fuexam: site({ flags: { 1: { 10001: { on: true, at: 1 } } } }) } },
    { ...good(), sites: { fuexam: site({ checklist: { 1: { done: true, at: "x" } } }) } },
    { ...good(), pad: "x".repeat(1000001) }
  ];
  for (const obj of bad) {
    const r = C.validateImport(obj);
    assert.equal(r.ok, false, JSON.stringify(obj)?.slice(0, 120));
    assert.equal(typeof r.error, "string");
  }
  assert.equal(C.validateImport(good()).ok, true);
});

test("diffCounts counts added and updated entries", () => {
  const local = { fuexam: site({ checklist: { 1: { done: true, at: 1 } } }) };
  assert.deepEqual(C.diffCounts(local, { fuexam: site({ checklist: { 2: { done: true, at: 1 } } }) }).fuexam, {
    added: 1,
    updated: 0
  });
  assert.deepEqual(C.diffCounts(local, { fuexam: site({ checklist: { 1: { done: false, at: 2 } } }) }).fuexam, {
    added: 0,
    updated: 1
  });
  assert.deepEqual(C.diffCounts(local, local).fuexam, { added: 0, updated: 0 });
});

test("sync items round-trip with every item under 7500 bytes", () => {
  const s = C.emptySite();
  for (let t = 0; t < 100; t++) {
    s.flags[String(1000 + t)] = {};
    for (let q = 0; q < 30; q++) s.flags[String(1000 + t)][String(q)] = { on: true, at: 1700000000000 + q };
    s.checklist[String(1000 + t)] = { done: true, at: 1700000000000 };
  }
  const items = C.toSyncItems("fuexam", s);
  for (const [k, v] of Object.entries(items)) {
    assert.match(k, /^s:(fuoverflow|fuexam):(checklist|progress|flags):\d+$/);
    assert.ok(JSON.stringify(v).length <= 7500, k);
  }
  assert.deepEqual(C.fromSyncItems(items).fuexam, s);
});
