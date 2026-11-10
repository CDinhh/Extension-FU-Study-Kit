# Sync, Multi-site, Store Readiness & UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move study data into `chrome.storage` (Chrome Sync mirror + JSON export/import), run on fuoverflow.com and fuexam.me, shrink permissions for the Chrome Web Store, and restyle every surface.

**Architecture:**
- A pure, dependency-free core (`lib/store-core.js`) owns the data shape, merging, tombstones, validation and the sync item layout, and is unit-tested with `node --test`.
- A thin `lib/storage.js` wraps `chrome.storage.local` (source of truth) plus a best-effort `chrome.storage.sync` mirror.
- `content.js` (isolated world) is the only page script touching storage. `lightbox.js` (MAIN world) talks to it over a validated `postMessage` bridge.
- A new popup holds stats, export/import, sync status and the capture-permission fallback.

**Tech Stack:** Manifest V3, plain JS/CSS (no build step, no npm deps), Node ≥ 18 built-in test runner for core tests.

**Spec:** `docs/superpowers/specs/2026-11-06-sync-store-ui-design.md` (read it first; this plan argues from it).

## Global Constraints

- Manifest V3; works in Chrome/Brave ≥ 111 (`"world": "MAIN"` content script).
- No build step, no runtime dependencies, no remote code, no `eval`, no analytics, no network requests by the extension.
- Sites: `*://fuoverflow.com/*`, `*://*.fuoverflow.com/*`, `*://fuexam.me/*`, `*://*.fuexam.me/*`; site ids `fuoverflow`, `fuexam`.
- `permissions: ["storage"]` only; `tabs` and `<all_urls>` removed from required permissions.
- Version `2.0.0`; name **"Exam Checklist for FuOverflow & FuExam"**; UI copy in Vietnamese; must state "Không phải extension chính thức của FuOverflow / FuExam".
- Export file: `{ app: "fu-exam-checklist", version: 1, exportedAt, sites: {...} }`, filename `fu-exam-checklist-YYYY-MM-DD.json`, max ~1 MB.
- Import **merges** (newer `at` wins, per thread; flags per question), never replaces; all-or-nothing on validation failure.
- Tombstones for removals; prune tombstones older than 90 days (`90 * 24 * 3600 * 1000` ms).
- Legacy `localStorage` keys `fuo-test-checklist`, `fuo-study-progress`, `fuo-question-flags` are migrated once per site and **left in place**.
- `fuo-capture-speed` stays in page `localStorage`.
- All injected CSS classes prefixed `fuo-`. No Inter/Roboto/Arial/Helvetica/Open Sans. Motion uses `cubic-bezier(0.32,0.72,0,1)`, transform/opacity only, honours `prefers-reduced-motion`.
- Git: branch `feature/sync-store-ui`, the owner's git identity, **no AI trailers** (no `Co-Authored-By`, no "Generated with"), short imperative messages like the existing log, **no push without asking**.

## Review Focus

1. **Two tabs of the same site tick/flag at nearly the same time.** Both changes must survive. Each write is a read-merge-write on fresh storage (Task 2 test `concurrent updateSite calls both survive`).
2. **A malformed, foreign, oversized or future-version JSON is imported.** Reject it with a Vietnamese message and leave storage untouched (Task 1 tests under `validateImport`, Task 2 test `applyImport rejects and writes nothing`).
3. **Upgrade with existing fuoverflow data.** It must show up after the update. Running migration again must not duplicate it or bump the timestamps (Task 2 test `migrateLegacy is idempotent`).
4. **The extension is reloaded while a forum tab is open** (context invalidated). Bridge calls must fail with a toast or modal telling the user to F5, with no uncaught errors or loops (Task 4 manual check, step 6).
5. **`storage.sync` quota exceeded** (many flags). Local data must still be saved and the popup must show a sync warning (Task 2 test `sync quota error keeps local and records syncError`).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/store-core.js` (new) | Pure data logic: shapes, legacy conversion, merge, prune, export/validate/diff, sync sharding. Exposes `FuoCore` global in browser, `module.exports` in Node. |
| `lib/storage.js` (new) | `chrome.storage` access: load/update site data, migration, import, change subscription, sync status. Exposes `FuoStorage` global. |
| `content.js` (modify) | List/thread decoration from an in-memory cache, MAIN-world bridge (state + capture). |
| `lightbox.js` (modify) | Panel UI; reads/writes progress and flags via the bridge only; modal instead of alert/confirm. |
| `background.js` (modify) | `captureTab` handler; clear error when the capture permission is missing. |
| `popup.html` / `popup.css` / `popup.js` (new) | Stats per site, export, import with confirmation, sync status, capture permission button, privacy and disclaimer links. |
| `content.css`, `lightbox.css` (modify) | Restyle per the UI direction. |
| `assets/fonts/` (new) | One OFL font (woff2) + its license. |
| `assets/icons/` (new) | `icon.svg` + `icon-16/32/48/128.png`. |
| `manifest.json` (modify) | Name, version, permissions, sites, popup, icons, web-accessible fonts. |
| `tests/store-core.test.js`, `tests/storage.test.js` (new) | `node --test tests/` |
| `PRIVACY.md`, `store/listing.md` (new), `README.md` (modify) | Store paperwork + docs. |

## Shared data shapes (used by every task)

```js
// SiteData: one per site id
{
  checklist: { [threadId: string]: { done: boolean, at: number } },
  progress:  { [threadId: string]: { current: number|null, total: number|null, at: number, removed?: true } },
  flags:     { [threadId: string]: { [questionIndex: string]: { on: boolean, at: number } } } // 0-based index
}
// storage.local keys: "site:<siteId>" -> SiteData, "migrated:<siteId>" -> true, "syncError" -> string|null
// storage.sync keys:  "s:<siteId>:<kind>:<n>" -> partial map for that kind (kind = checklist|progress|flags)
```

---

### Task 1: Core data logic (`lib/store-core.js`)

**Files:**
- Create: `lib/store-core.js`
- Test: `tests/store-core.test.js`

**Interfaces:**
- Produces (all pure, no `chrome`):
  - `SITES: { fuoverflow: { name: "FuOverflow" }, fuexam: { name: "FuExam" } }`
  - `siteFromHost(hostname: string): "fuoverflow"|"fuexam"|null`
  - `emptySite(): SiteData`
  - `fromLegacy(raw: { checklist?: string|null, progress?: string|null, flags?: string|null }, now: number): SiteData`. Takes the raw `localStorage` strings and tolerates bad JSON.
  - `mergeSite(a: SiteData, b: SiteData): SiteData`. Per entry, the newer `at` wins; on equal `at`, `b` wins. Flags merge per question.
  - `pruneTombstones(site: SiteData, now: number, maxAgeMs = 90*24*3600*1000): SiteData`
  - `isDone(site, tid): boolean`, `isStudying(site, tid): boolean` (progress present, not removed, not done), `flagSet(site, tid): Set<number>` (questions with `on: true`)
  - `countSite(site): { done: number, studying: number, flagged: number }` (flagged = total questions with `on: true`)
  - `buildExport(sites: Record<siteId, SiteData>, now: number): object`
  - `validateImport(obj: unknown): { ok: true, sites: Record<siteId, SiteData> } | { ok: false, error: string }` (Vietnamese error)
  - `diffCounts(local: Record<siteId, SiteData>, incoming: Record<siteId, SiteData>): Record<siteId, { added: number, updated: number }>`. An entry counts if merging would change it; a new key is "added", a changed key is "updated"; tombstones count as updated.
  - `toSyncItems(siteId, site: SiteData): Record<string, object>`. Shards each kind so every item's `JSON.stringify` is ≤ 7500 bytes; keys `s:<siteId>:<kind>:<n>` with `n` from 0.
  - `fromSyncItems(items: Record<string, object>): Record<siteId, SiteData>`

- [ ] **Step 1: Write failing tests** in `tests/store-core.test.js` using `node:test` + `node:assert/strict`, loading `require("../lib/store-core.js")`:
  - `siteFromHost`: `"fuoverflow.com"`→`"fuoverflow"`, `"www.fuoverflow.com"`→`"fuoverflow"`, `"fuexam.me"`→`"fuexam"`, `"evil-fuexam.me.com"`→`null`, `"example.com"`→`null`.
  - `fromLegacy`: `{checklist:'{"43":1700000000000}', progress:'{"43":{"current":8,"total":60,"updatedAt":1700000001000}}', flags:'{"43":[2,5]}'}`, now=`1800000000000` → `checklist["43"]` = `{done:true, at:1700000000000}`, `progress["43"]` = `{current:8,total:60,at:1700000001000}`, `flags["43"]["2"]` = `{on:true, at:1800000000000}`. Bad JSON `'{oops'` gives `emptySite()`.
  - `mergeSite`: newer tombstone `{done:false, at:20}` beats `{done:true, at:10}`; per-question flags merge (`{1:{on:true,at:5}}` + `{2:{on:true,at:6}}` → both); flag tombstone `{on:false, at:9}` beats `{on:true, at:5}`; merging is idempotent (`mergeSite(x, x)` deep-equals `x`) and commutative except for ties.
  - `pruneTombstones`: removes `{done:false, at: now-91d}`, keeps `{done:false, at: now-1d}`, never removes live entries; removes empty per-thread flag maps.
  - `isStudying` is false when `progress.removed` or when done.
  - **Same thread id on two sites stays separate:** `buildExport({fuoverflow: A, fuexam: B})` round-trips through `validateImport` with A and B unchanged (thread `"43"` in both).
  - `validateImport` rejects, with `ok:false`: non-object; `app !== "fu-exam-checklist"`; `version !== 1`; unknown site id; non-numeric thread id `"abc"`; `current` not a non-negative integer ≤ 10000; question index > 10000; `at` not a finite number; JSON string length > 1 000 000 (check via `JSON.stringify(obj).length`).
  - `diffCounts`: new thread → `added:1`; newer remote tombstone for a local done thread → `updated:1`; identical data → `{added:0, updated:0}`.
  - `toSyncItems` + `fromSyncItems` round-trip a site with 3000 flagged questions, every item ≤ 7500 bytes and keys match `/^s:(fuoverflow|fuexam):(checklist|progress|flags):\d+$/`.

- [ ] **Step 2: Run** `node --test tests/`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/store-core.js`.** Use a UMD-style wrapper: `(function (root) { …; if (typeof module === "object" && module.exports) module.exports = api; else root.FuoCore = api; })(globalThis);`. `siteFromHost` matches the exact host or a `.`-suffix (`h === "fuexam.me" || h.endsWith(".fuexam.me")`). Shard by greedily adding entries to the current chunk until its JSON would exceed 7500 bytes.

- [ ] **Step 4: Run** `node --test tests/`. Expected: all pass.

- [ ] **Step 5: Commit** `git add lib/store-core.js tests/store-core.test.js && git commit -m "Add core data model with merge, tombstones and import validation"`

---

### Task 2: Storage layer (`lib/storage.js`)

**Files:**
- Create: `lib/storage.js`
- Test: `tests/storage.test.js` (in-memory fake of `chrome.storage.local/sync` with `get/set/remove`, `onChanged.addListener`, and a switch that makes `sync.set` reject with `QUOTA_BYTES quota exceeded`)

**Interfaces:**
- Consumes: Task 1 `FuoCore` (via `globalThis.FuoCore` in browser; tests set `globalThis.FuoCore = require("../lib/store-core.js")` before requiring storage).
- Produces `FuoStorage` (all async):
  - `loadSite(siteId): Promise<SiteData>`. Merges local `site:<id>` with `fromSyncItems(sync)`; if the merge differs from local, writes it back.
  - `updateSite(siteId, mutate: (draft: SiteData, now: number) => void): Promise<SiteData>`. Reads fresh, clones, mutates, `mergeSite(fresh, draft)`, prunes, writes local, then mirrors to sync (removing stale `s:<id>:*` keys beyond the new shard count). A sync failure sets local `syncError` (string) without throwing; a sync success clears it.
  - `loadAllSites(): Promise<Record<siteId, SiteData>>`
  - `migrateLegacy(siteId, raw): Promise<boolean>`. A no-op returning `false` if `migrated:<id>` is set; otherwise `updateSite` with `mergeSite(current, fromLegacy(raw, now))`, sets the flag, returns `true`.
  - `previewImport(obj): Promise<{ ok: true, counts } | { ok: false, error }>` (uses `validateImport` + `diffCounts`)
  - `applyImport(obj): Promise<{ ok: true } | { ok: false, error }>`. Validates first; writes nothing on failure.
  - `getSyncError(): Promise<string|null>`
  - `onSiteChanged(cb: (siteId) => void): void`. Fires for local `site:*` changes and for sync `s:*` changes (after merging sync into local).

- [ ] **Step 1: Write failing tests:**
  - `concurrent updateSite calls both survive`: `Promise.all([updateSite("fuexam", d => d.checklist["1"] = {done:true, at:now}), updateSite("fuexam", d => d.checklist["2"] = {done:true, at:now})])` leaves both entries in local storage.
  - `migrateLegacy is idempotent`: second call returns `false`, and data deep-equals the first result.
  - `applyImport rejects and writes nothing`: an invalid object leaves the local snapshot byte-identical.
  - `applyImport merges`: a remote newer tombstone un-ticks the local thread; a remote older tick does not overwrite a newer local tombstone.
  - `sync quota error keeps local and records syncError`: with the fake sync set to reject, `updateSite` resolves, local has the change, and `getSyncError()` is a non-empty string; after re-enabling, the next update clears it.
  - `loadSite pulls sync-only data`: data present only in fake sync items appears in `loadSite`.

- [ ] **Step 2: Run** `node --test tests/`. Expected: new tests FAIL.
- [ ] **Step 3: Implement `lib/storage.js`** with the same UMD wrapper (`root.FuoStorage`). Serialize `updateSite` calls per site through an in-module promise chain (covers same-context races); cross-tab races are covered by read-merge-write.
- [ ] **Step 4: Run** `node --test tests/`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Add chrome.storage layer with sync mirror, migration and import"`

---

### Task 3: Manifest + `content.js` on the new storage, both sites

**Files:**
- Modify: `manifest.json`, `content.js` (whole file; it keeps today's DOM behaviour)

**Interfaces:**
- Consumes: `FuoCore.siteFromHost/isDone/isStudying/countSite`, `FuoStorage.loadSite/updateSite/migrateLegacy/onSiteChanged`.
- Produces the bridge used by Task 4 (all messages via `window.postMessage(msg, location.origin)`, filtered by `event.source === window`):
  - MAIN → isolated: `{ source: "fuo-main", action: "getThreadState", requestId: string, threadId: string }`
  - isolated → MAIN: `{ source: "fuo-isolated", action: "threadState", requestId, state: { current: number|null, total: number|null, flags: number[] } }`
  - MAIN → isolated: `{ source: "fuo-main", action: "setProgress", threadId, current: number, total: number }`
  - MAIN → isolated: `{ source: "fuo-main", action: "setFlags", threadId, flags: number[] }`. Isolated diffs against stored flags: added → `{on:true, at:now}`, removed → `{on:false, at:now}`.
  - isolated → MAIN: `{ source: "fuo-isolated", action: "stateChanged" }` after any storage change for this site.
  - existing `captureTab` / `captureTabResponse` unchanged.
  - Validation in isolated: `threadId` matches `/^\d{1,12}$/`; `current`/`total` are integers 0..10000; `flags` is an array of ≤ 1000 integers 0..10000. Anything else is ignored.

- [ ] **Step 1: Update `manifest.json`:**
  - `name`/`version`/`description` per Global Constraints;
  - `permissions: ["storage"]`; `host_permissions` = the 4 site patterns;
  - `optional_host_permissions: ["<all_urls>"]` (used only if Task 5 proves it necessary; delete it there otherwise);
  - both `content_scripts` entries match the 4 patterns, and the isolated one loads `["lib/store-core.js", "lib/storage.js", "content.js"]`;
  - `action: { default_popup: "popup.html", default_icon: {...} }`; `icons`;
  - `web_accessible_resources: [{ resources: ["assets/fonts/*"], matches: <4 patterns> }]`.
- [ ] **Step 2: Rewrite `content.js` storage use.**
  - On start: `siteId = FuoCore.siteFromHost(location.hostname)`. If it is null, return.
  - Run `migrateLegacy(siteId, { checklist: localStorage.getItem("fuo-test-checklist"), progress: localStorage.getItem("fuo-study-progress"), flags: localStorage.getItem("fuo-question-flags") })`.
  - Then `cache = await loadSite(siteId)` and `decorate()`.
  - All reads come from `cache`. Every write goes through `updateSite`: tick → `{done:true}`, untick → `{done:false}`, ✕ → `progress[id] = {removed:true, at}`, `markStudying` keeps the existing `current/total`. After the write, update `cache` and re-render.
  - Replace the `storage` window listener with `onSiteChanged`, which reloads the cache, calls `decorate()` and posts `stateChanged`.
  - Remove the `fuo:progress-updated` listener (superseded by the bridge).
  - Keep the MutationObserver no-op guard.
- [ ] **Step 3: Run** `node --test tests/` (still green), then load unpacked in Brave and check manually on **both** sites:
  - a list page shows checkboxes and the progress bar;
  - ticking persists across F5;
  - the same thread id on the other site is unaffected;
  - an existing fuoverflow profile keeps its old ticks after the upgrade.
- [ ] **Step 4: Commit** `git commit -m "Store study data in chrome.storage and support fuexam.me"`

---

### Task 4: `lightbox.js` via the bridge + modal instead of alert/confirm

**Files:**
- Modify: `lightbox.js`

**Interfaces:**
- Consumes: the bridge messages from Task 3.
- Produces: `bridgeRequest(action, payload, timeoutMs = 5000): Promise<any>` (MAIN-world helper, rejects on timeout); `showModal({ title, body, confirmText?, cancelText? }): Promise<boolean>` (in-panel modal, `fuo-modal` classes).

- [ ] **Step 1:**
  - Delete the `localStorage` access to `fuo-question-flags` and `fuo-study-progress`.
  - `build()` awaits `getThreadState` before rendering flags and the "Tiếp tục câu X →" button.
  - `saveStudyProgress` → `setProgress` message; `saveFlags` → `setFlags` message.
  - On `stateChanged`, re-request state and re-render flags (keep the local `flags` Set in sync).
- [ ] **Step 2:**
  - Replace every `alert`/`confirm` with `showModal`. Keep the same Vietnamese guidance, but name the new extension and the current site (`SITES[siteId].name`) instead of hard-coded "FuOverflow".
  - Download names use the site id prefix: `${siteId}-${threadKey()}-…`. Title text: `Đang chụp... - ${siteName}`.
  - Get the site id from `location.hostname` with the same rule as `FuoCore.siteFromHost`. `lightbox.js` cannot load `lib/`, so inline the two-line host check with a `// keep in sync with lib/store-core.js siteFromHost` comment.
- [ ] **Step 3: Manual check on both sites (Brave):**
  - open the lightbox;
  - flag questions 2 and 5, close it, F5 and reopen: the flags persist;
  - unflag 5, then reopen the lightbox in a second tab of the same thread and check it reflects the change;
  - "Tiếp tục câu X" appears after reopening at question 1.
- [ ] **Step 4:** With a forum tab open, reload the extension and click "Gắn cờ". Expected: the modal says to F5, with no uncaught console errors.
- [ ] **Step 5: Commit** `git commit -m "Route lightbox state through the content bridge and replace alerts with modal"`

---

### Task 5: Capture permission check (main technical risk)

**Files:**
- Modify: `background.js`, `manifest.json`, and `lightbox.js` only if the fallback is needed

**Interfaces:**
- Produces, if the fallback is needed: popup button behaviour `chrome.permissions.request({ origins: ["<all_urls>"] })`; background `captureTab` returns `{ success:false, error, needsPermission: true }` when `chrome.permissions.contains({origins:["<all_urls>"]})` is false and capture failed.

- [ ] **Step 1:** With **only** the 4 site host permissions granted, use "Chụp câu này" on both sites in **Brave and Chrome**. Record in the commit message whether `captureVisibleTab` succeeded.
- [ ] **Step 2a (it works):** Remove `optional_host_permissions` from the manifest. Done.
- [ ] **Step 2b (it fails):**
  - keep `optional_host_permissions: ["<all_urls>"]`;
  - `background.js` returns `needsPermission: true`;
  - `lightbox.js` shows `showModal` with the copy "Cần cấp quyền chụp màn hình: bấm icon extension → 'Cho phép chụp màn hình'";
  - the popup (Task 6) shows that button only when the permission is missing.
  - Retest the batch capture "Chụp tất cả" on a 60-question thread.
- [ ] **Step 3: Commit** `git commit -m "Narrow capture permission to <result>"`

---

### Task 6: Popup (stats, export/import, sync status)

**Files:**
- Create: `popup.html`, `popup.css`, `popup.js`

**Interfaces:**
- Consumes: `FuoStorage.loadAllSites/previewImport/applyImport/getSyncError`, `FuoCore.countSite/buildExport/SITES`.

- [ ] **Step 1: `popup.html`.**
  - Load `lib/store-core.js`, `lib/storage.js`, `popup.js`.
  - Sections: one stats card per site (done / studying / flagged); actions **"Xuất dữ liệu"** and **"Nhập dữ liệu"** (hidden `<input type=file accept="application/json,.json">`).
  - Sync line: "Tự đồng bộ qua Chrome Sync khi bật · Brave: dùng Xuất/Nhập file". When `getSyncError()` is non-null, show a warning with the message.
  - Footer: disclaimer "Không phải extension chính thức của FuOverflow / FuExam", plus links to `PRIVACY.md` and the repo on GitHub (`https://github.com/CDinhh/Extension-Fuoverflow-test-checklist`).
- [ ] **Step 2: Export.** `Blob` + `URL.createObjectURL` + `<a download="fu-exam-checklist-YYYY-MM-DD.json">` (local date).
- [ ] **Step 3: Import.**
  - Read the file with a size check (> 1 MB rejects before parsing), `JSON.parse` in try/catch, then `previewImport`.
  - Show a confirmation modal listing `+added / ~updated` per site.
  - `applyImport` on confirm, then re-render the stats. Errors show the Vietnamese message from `validateImport`.
- [ ] **Step 4: Manual check.**
  - Export in Brave profile A, import in Brave profile B (or a second machine); the counts match.
  - Import the same file twice: the second preview shows `+0 / ~0`.
  - Import a random `.json`: it is rejected and the counts are unchanged.
- [ ] **Step 5: Commit** `git commit -m "Add popup with stats, export and import"`

---

### Task 7: UI refresh (all surfaces) using `high-end-visual-design`

**Files:**
- Modify: `content.css`, `lightbox.css`, `popup.css`, and small markup tweaks in `content.js`/`lightbox.js` (icons, wrappers)
- Create: `assets/fonts/<Font>-Variable.woff2` + `assets/fonts/OFL.txt`

**Interfaces:**
- Consumes: the class names already emitted (`fuo-check`, `fuo-badge--done|--learning`, `fuo-progress`, `fuo-jump*`, `fuo-modal*`).

- [ ] **Step 1:** Load the `high-end-visual-design` skill (it lives in `~/.claude/skills/`; on a machine without it, follow the spec's "UI direction" section, which captures the rules).
- [ ] **Step 2: Tokens** on `.fuo-jump`, `.fuo-modal`, `:root` of the popup:
  - near-black surface, `rgba(255,255,255,.08)` hairline;
  - accents: emerald (done), blue (studying), amber (flag);
  - diffuse shadow only (e.g. `0 20px 40px -24px rgba(0,0,0,.6)`);
  - `--fuo-ease: cubic-bezier(0.32,0.72,0,1)`.
- [ ] **Step 3: List page.**
  - custom checkbox: hide the native one visually but keep it focusable, with an animated SVG tick;
  - pill badges: done = emerald, studying = blue with a pulsing dot;
  - ✕ appears on hover/focus;
  - a progress bar with a spring-filled track plus a compact text line.
  - Rows stay compact. The font is inherited from the forum.
- [ ] **Step 4: Lightbox panel.**
  - double-bezel shell, pill buttons;
  - the primary actions ("Chụp tất cả", "Tiếp tục câu X") use a trailing icon in its own circle;
  - the jump grid reveals with staggered cells (≤ 300 ms total);
  - the toast slides and fades; the modal scales in from 0.96 with a backdrop blur;
  - thin-stroke inline SVG icons instead of emoji (⚑ ⚐ ▾);
  - the bundled font via `@font-face { src: url("chrome-extension://__MSG_@@extension_id__/assets/fonts/…") }`.
- [ ] **Step 5: Popup.** Ethereal Glass layout with double-bezel cards per site, island buttons, and generous spacing (the macro-whitespace rule applies here only).
- [ ] **Step 6: Verify.**
  - `prefers-reduced-motion: reduce` disables the animations (DevTools rendering emulation).
  - No `backdrop-filter` on list rows.
  - Screenshots on both sites look native to the dark theme. Capture with the CDP method in `HANDOFF.md` or manually.
- [ ] **Step 7: Commit** `git commit -m "Restyle list, lightbox panel and popup"`

---

### Task 8: Store paperwork, icons, README, packaging

**Files:**
- Create: `PRIVACY.md`, `store/listing.md`, `assets/icons/icon.svg`, `assets/icons/icon-{16,32,48,128}.png`, `store/screenshots/*.png` (1280×800)
- Modify: `README.md`

- [ ] **Step 1: Icon.** Design `icon.svg` (simple check mark in a rounded square, matching the accent palette). Rasterize to the 4 PNG sizes without new dependencies: PowerShell `System.Drawing`, or open the SVG in Brave and take a CDP `Page.captureScreenshot` with a clip.
- [ ] **Step 2: `PRIVACY.md`** in Vietnamese and English. Content:
  - no data is collected or transmitted;
  - data lives in `chrome.storage` (local + Chrome Sync if the user enabled it);
  - export files stay on the user's device;
  - no analytics, no remote code;
  - permissions are listed with the reason for each;
  - include a contact (GitHub issues).
- [ ] **Step 3: `store/listing.md`:**
  - name; short description ≤ 132 chars (VI);
  - long description (VI + EN), including the non-affiliation disclaimer;
  - category Education;
  - single-purpose statement;
  - justifications for `storage`, the host permissions, and (if kept) the optional `<all_urls>`;
  - answers for the Data usage form (collects nothing; certifications ticked);
  - privacy URL `https://github.com/CDinhh/Extension-Fuoverflow-test-checklist/blob/main/PRIVACY.md`;
  - packaging command (PowerShell `Compress-Archive` of exactly: `manifest.json background.js content.js content.css lightbox.js lightbox.css popup.html popup.css popup.js lib assets`, excluding `docs tests store`).
- [ ] **Step 4: Screenshots.** Take ≥ 2 at 1280×800 (list page, lightbox panel), plus the popup if possible.
- [ ] **Step 5: README.** Update the name, both sites, export/import, Chrome Sync vs Brave note, privacy link, and `node --test tests/`.
- [ ] **Step 6: Commit** `git commit -m "Add privacy policy, store listing, icons and update README"`

---

### Task 9: Final verification

- [ ] Run `node --test tests/`: all pass.
- [ ] Brave, both sites: list tick/untick, ✕ studying, thread page checkbox, lightbox flags/resume/jump, capture single + batch + flagged, popup stats, export, import (same file twice = no changes).
- [ ] Chrome (signed in with sync on, two profiles or two machines if available): a tick on one appears on the other; an untick propagates (tombstone).
- [ ] Grep for leftovers: `localStorage` appears only in the migration read and `fuo-capture-speed`; there is no `alert(`/`confirm(`; `<all_urls>` appears only if Task 5 needed it.
- [ ] Build the store zip with the command in `store/listing.md`; load the unzipped folder as unpacked and smoke-test.
- [ ] Use superpowers:finishing-a-development-branch. **Ask the owner before pushing or opening a PR.**
