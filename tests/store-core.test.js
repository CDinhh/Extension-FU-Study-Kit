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

test("validateImport rejects timestamps in the future", () => {
  const future = Date.now() + 2 * DAY;
  for (const s of [
    site({ checklist: { 1: { done: true, at: future } } }),
    site({ progress: { 1: { current: 1, total: 2, at: future } } }),
    site({ flags: { 1: { 2: { on: true, at: future } } } })
  ]) {
    const r = C.validateImport(C.buildExport({ fuexam: s }, 1));
    assert.equal(r.ok, false);
  }
  const ok = C.validateImport(C.buildExport({ fuexam: site({ checklist: { 1: { done: true, at: Date.now() } } }) }, 1));
  assert.equal(ok.ok, true);
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

test("diffCounts ignores key order (chrome.storage returns keys sorted)", () => {
  const local = {
    fuexam: site({ checklist: { 1: { at: 1, done: true } }, flags: { 1: { 2: { at: 3, on: true } } } })
  };
  const incoming = {
    fuexam: site({ checklist: { 1: { done: true, at: 1 } }, flags: { 1: { 2: { on: true, at: 3 } } } })
  };
  assert.deepEqual(C.diffCounts(local, incoming).fuexam, { added: 0, updated: 0 });
  assert.equal(C.sameData(local.fuexam, incoming.fuexam), true);
  assert.equal(C.sameData(local.fuexam, site()), false);
});

test("fromSyncItems joins the old Chrome Sync shards and skips unknown keys", () => {
  const items = {
    "s:fuexam:checklist:0": { 1: { done: true, at: 5 } },
    "s:fuexam:checklist:1": { 2: { done: true, at: 6 } },
    "s:fuexam:flags:0": { 1: { 3: { on: true, at: 7 } } },
    "s:other:checklist:0": { 9: { done: true, at: 1 } },
    unrelated: 1
  };
  assert.deepEqual(C.fromSyncItems(items), {
    fuexam: { checklist: { 1: { done: true, at: 5 }, 2: { done: true, at: 6 } }, progress: {}, flags: { 1: { 3: { on: true, at: 7 } } } }
  });
});

test("studiedBySubject groups touched threads by course code, newest first", () => {
  const s = site({
    checklist: { 1: { done: true, at: 100 }, 2: { done: false, at: 900 } },
    progress: { 3: { current: 4, total: 50, at: 300 }, 4: { current: null, total: null, removed: true, at: 400 } },
    flags: { 5: { 2: { on: true, at: 200 } }, 6: { 1: { on: false, at: 500 } } }
  });
  const meta = {
    1: { title: "MLN122 - Q2 - 6", subject: "MLN122", subjectUrl: "https://fuoverflow.com/forums/MLN122/" },
    3: { title: "SDN302 SP25 PE", subject: "SDN302 - Server-side" },
    5: { title: "Đề MLN122 FE" }
  };
  const groups = C.studiedBySubject(s, meta);
  assert.deepEqual(groups.map((g) => g.subject), ["SDN302", "MLN122"]);
  assert.deepEqual(groups[1].tests.map((t) => t.tid), ["5", "1"]);
  assert.equal(groups[1].url, "https://fuoverflow.com/forums/MLN122/");
  assert.deepEqual(groups[0].tests[0], { tid: "3", title: "SDN302 SP25 PE", done: false, current: 4, total: 50, flags: 0, at: 300 });
  assert.equal(groups[1].tests[0].flags, 1);
  assert.deepEqual(C.studiedBySubject(site({ checklist: { 9: { done: true, at: 1 } } }))[0].subject, "Khác");
});

test("cleanCloud keeps checked fields and drops junk", () => {
  const raw = {
    app: "fu-exam-checklist",
    sites: { fuexam: { checklist: { 7: { done: true, at: 5 } } }, fuoverflow: { checklist: { x: 1 } } },
    threads: {
      fuoverflow: { 12: { title: "MLN122 - Q2", subject: "MLN122", subjectUrl: "https://fuoverflow.com/forums/MLN122/" }, 13: { subjectUrl: "https://evil.com/" }, bad: {} }
    },
    fapTimetable: { fetchedAt: 10, weeks: { "2026-11-09": { days: ["Thứ 2"], items: [{ day: 9, title: "WDP301 - SE1924", online: "yes", evil: 1 }] }, nope: {} } },
    fapAttendance: { fetchedAt: 11, term: "Fall2026", courses: [{ code: "WDP301", absent: 3, total: -1 }] }
  };
  const c = C.cleanCloud(raw);
  assert.equal(C.isDone(c.sites.fuexam, "7"), true);
  assert.deepEqual(c.sites.fuoverflow, C.emptySite()); // invalid site falls back to empty
  assert.deepEqual(c.threads.fuoverflow["12"].subjectUrl, "https://fuoverflow.com/forums/MLN122/");
  assert.equal("subjectUrl" in c.threads.fuoverflow["13"], false);
  assert.equal("bad" in c.threads.fuoverflow, false);
  assert.deepEqual(Object.keys(c.fapTimetable.weeks), ["2026-11-09"]);
  const item = c.fapTimetable.weeks["2026-11-09"].items[0];
  assert.equal(item.day, 0);
  assert.equal(item.online, false);
  assert.equal("evil" in item, false);
  assert.deepEqual(c.fapAttendance.courses[0].total, 0);
  assert.deepEqual(C.cleanCloud({ app: "other" }).fapTimetable, null);
});

test("mergeCloud: newer study entry wins, titles fill gaps, newer crawl wins", () => {
  const empty = { sites: {}, threads: {}, fapTimetable: null, fapAttendance: null };
  const local = { ...empty, sites: { fuexam: site({ checklist: { 1: { done: true, at: 10 } } }) }, threads: { fuexam: { 1: { title: "A" } } }, fapTimetable: { fetchedAt: 5, weeks: {} } };
  const remote = { ...empty, sites: { fuexam: site({ checklist: { 1: { done: false, at: 20 }, 2: { done: true, at: 1 } } }) }, threads: { fuexam: { 1: { title: "old", subject: "SDN302" }, 2: { title: "B" } } }, fapTimetable: { fetchedAt: 9, weeks: { k: 1 } }, fapAttendance: { fetchedAt: 1, courses: [] } };
  const m = C.mergeCloud(local, remote);
  assert.equal(C.isDone(m.sites.fuexam, "1"), false);
  assert.equal(C.isDone(m.sites.fuexam, "2"), true);
  assert.deepEqual(m.sites.fuoverflow, C.emptySite());
  assert.deepEqual(m.threads.fuexam, { 1: { title: "A", subject: "SDN302" }, 2: { title: "B" } });
  assert.equal(m.fapTimetable.fetchedAt, 9);
  assert.equal(m.fapAttendance.fetchedAt, 1);
});

test("calendarEvents builds one keyed event per class from the given week on", () => {
  const tt = {
    fetchedAt: 1,
    weeks: {
      "2026-11-02": { days: [], items: [{ day: 0, slot: "2", title: "WDP301 - SE1924", time: "09h30-11h45" }] },
      "2026-11-09": {
        days: [],
        items: [
          { day: 1, slot: "2", title: "WDP301 - SE1924", time: "09h30-11h45", room: "NVH 606", teacher: "ThinhDP2" },
          { day: 1, slot: "2", title: "WDP301 - SE1924", time: "09h30-11h45", room: "NVH 606" }, // listed twice
          { day: 6, slot: "6", title: "MLN111 - Half1_SE1915", time: "16h10-17h40", room: "131", teacher: "-", kind: "Lịch thi" },
          { day: 2, slot: "4", title: "EXE201 - SE1920", time: "15h00-17h15", online: true, meet: "https://meet.google.com/x" },
          { day: 3, slot: "1", title: "NO TIME", time: "" }
        ]
      }
    }
  };
  const ev = C.calendarEvents(tt, "2026-11-09");
  assert.equal(ev.length, 3);
  const [wdp, mln, exe] = ev;
  assert.equal(wdp.key, "2026-11-10|2|WDP301|class");
  assert.equal(wdp.summary, "WDP301 · NVH 606");
  assert.equal(wdp.start, "2026-11-10T09:30:00+07:00");
  assert.equal(wdp.end, "2026-11-10T11:45:00+07:00");
  assert.match(wdp.description, /Giảng viên: ThinhDP2/);
  assert.equal(mln.key, "2026-11-15|6|MLN111|exam");
  assert.equal(mln.summary, "Thi MLN111 · 131");
  assert.equal(mln.exam, true);
  assert.doesNotMatch(mln.description, /Giảng viên/);
  assert.equal(exe.location, "Online");
  assert.match(exe.description, /Học online: https:\/\/meet\.google\.com\/x/);
});

test("calendar settings travel through the cloud copy, newer wins", () => {
  const c = C.cleanCloud({ app: "fu-exam-checklist", calendar: { id: "abc@group.calendar.google.com", on: true, remind: 99999, at: 5 } });
  assert.deepEqual(c.calendar, { id: "abc@group.calendar.google.com", on: true, classes: true, exams: true, remind: 30, remindExam: 1440, at: 5 });
  assert.equal(C.cleanCloud({ app: "fu-exam-checklist", calendar: { exams: false, remindExam: -1, at: 5 } }).calendar.exams, false);
  assert.equal(C.cleanCloud({ app: "fu-exam-checklist", calendar: { id: "x y", on: true, at: 5 } }).calendar.id, null);
  const empty = { sites: {}, threads: {}, fapTimetable: null, fapAttendance: null };
  const m = C.mergeCloud({ ...empty, calendar: { id: null, on: false, remind: 30, at: 9 } }, { ...empty, calendar: c.calendar });
  assert.equal(m.calendar.on, false); // the local "turned off" is newer
});
