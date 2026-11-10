# Sync, multi-site, Chrome Web Store readiness, and UI refresh

Date: 2026-11-06 · Branch: `feature/sync-store-ui`

## Intent

The owner studies on two machines, mainly in **Brave**. Today every piece of
study state (checked threads, "studying up to question N", flagged questions)
lives in the page's `localStorage`, so it is stuck in one browser on one
machine. They want to carry it across machines, run the same extension on a
second forum (**fuexam.me**), and publish to the **Chrome Web Store** with a
review that passes easily and a complete set of policy documents. The current
look is "ordinary"; it should feel polished and deliberate.

## Goals

1. **Export / import** all study data as one JSON file. This works in any
   Chromium browser, Brave included, and is the primary way to move data.
2. **Automatic sync on Chrome** through `chrome.storage.sync`, when the user is
   signed in with sync on. In Brave the same code simply acts as local storage.
   No extra UI is needed for this.
3. **Support fuexam.me** alongside fuoverflow.com with identical features:
   checklist, studying badge, progress bar, lightbox panel, and capture.
4. **Store-ready**: minimal permissions, privacy policy, permission
   justifications, icons, listing copy, and a non-affiliation disclaimer.
5. **UI refresh** of every surface (list checkbox and badges, progress bar,
   lightbox panel, and the new popup) following the `high-end-visual-design`
   skill, adapted to an extension.

## Non-goals

- No server, account system, or third-party sync service.
- No new study features beyond what exists, plus import and export.
- No i18n framework. UI stays Vietnamese, the language of the audience.
- No change to how capture/ZIP works beyond what permissions force.

## Anti-goals (failure even if it "works")

- **Losing existing data.** Users already have `localStorage` data on
  fuoverflow.com. The upgrade must migrate it, and an import must never wipe
  data silently.
- **Cross-site bleed.** Thread IDs collide across the two forums (thread `43`
  exists on both). A tick on one site must never show on the other.
- **A store rejection for over-broad permissions** (`<all_urls>`, `tabs`).
- UI that clashes with the forums' dark theme or slows the thread list.

## Findings that shape the design

- Both sites run **XenForo** with a **dark theme**. Verified on fuexam.me while
  logged in through the owner's Brave; fuoverflow per `docs/screenshot.png`.
- The list page on fuexam.me uses the same selectors `content.js` already
  relies on: `.structItem--thread`, `.structItem-title a[href*="/threads/"]`,
  `.labelLink`, and `.p-title-value`. Thread URLs follow the same
  `/threads/slug.<id>/` shape.
- The fuexam.me lightbox is the same **Fancybox** with a sidebar:
  `.fancybox__container.fancybox-has-sidebar`, `.fancybox-sidebar` with media
  comments, and 60 slides on a 60-question thread. `window.Fancybox.getInstance()`
  works. `lightbox.js` should work once the domain is added.
- On fuexam.me attachments require login. That is the user's own session and
  needs no handling.
- `lightbox.js` runs in the page's `MAIN` world and cannot call `chrome.*`.
  `content.js` (isolated world) already bridges `captureTab` via
  `window.postMessage`.

## Decisions

### Storage model (decided with the owner: file export/import + chrome.storage.sync)

- The source of truth moves from page `localStorage` to **`chrome.storage`**.
  Data is namespaced by site, keyed by a short site id (`fuoverflow`,
  `fuexam`) derived from the hostname:
  - `checklist:<site>` → `{ [threadId]: { done: true, at: <ms> } }` or the
    existing shape plus a timestamp.
  - `progress:<site>` → `{ [threadId]: { current, total, at } }`
  - `flags:<site>` → `{ [threadId]: { q: number[], at } }`
  - Capture speed stays a per-device preference (see "Decisions settled
    after the builder check").
- **`storage.sync` quota**: about 100 KB total, 8 KB per item, and 512 items.
  The builder chooses a layout that fits, for example one item per site per
  kind, or sharding per thread if 8 KB would be exceeded. If a sync write fails
  on quota, data must still be saved to `storage.local` and the user told.
  `storage.local` is always written, and sync is best-effort mirroring.
- **MAIN-world access**: `lightbox.js` keeps working through a message bridge
  via `content.js`, the same pattern as `captureTab`. It has read/write
  requests for progress and flags, plus a change notification. The bridge
  validates message `source` and shape. The page could forge messages, but they
  only affect this extension's study data on that same page. That is
  acceptable, though the bridge must never expose other keys or capabilities.
- **Migration**: on first run on each site, `content.js` reads the legacy
  `localStorage` keys (`fuo-test-checklist`, `fuo-study-progress`,
  `fuo-question-flags`) and merges them into the new store,
  then marks the migration as done. Legacy keys are **left in place** as a
  backup and removed in a later version.
- Cross-tab live updates: `chrome.storage.onChanged` replaces the current
  `storage` event listener.

### Export / import

- The format is a single JSON file:
  `{ app: "fu-exam-checklist", version: 1, exportedAt, sites: { fuoverflow: {...}, fuexam: {...} } }`.
  The filename is `fu-exam-checklist-YYYY-MM-DD.json`.
- **Import merges** and never replaces: entries are unioned per thread, and on a
  conflict the entry with the newer `at` wins. Flags union per thread. Before
  applying, a confirmation step shows the counts of threads that will be added
  or updated per site.
- Import validates strictly as a trust boundary: the `app` and `version` fields,
  a known site id, numeric thread ids, sane numbers, and a size cap of about
  1 MB. It rejects bad files with a clear message and never applies a partial
  import.
- Export and import live in the **extension popup** (toolbar icon). This is the
  builder's call (my call during brainstorming).

### Popup (new)

- Shows totals per site (done / studying / flagged questions), the export and
  import actions, a line about sync status ("Tự đồng bộ qua Chrome Sync khi
  bật" / note that Brave needs the file), and links to the privacy policy and
  repo.

### Permissions and manifest (store readiness)

- `host_permissions`: only `*://fuoverflow.com/*`, `*://*.fuoverflow.com/*`,
  `*://fuexam.me/*`, `*://*.fuexam.me/*`. Remove `<all_urls>`. Content scripts
  match the same four patterns.
- `permissions`: `storage`. Remove `tabs` unless proven necessary.
- **Capture**: `chrome.tabs.captureVisibleTab` historically needed `<all_urls>`
  or `activeTab`. The builder must **test** whether site host permissions alone
  are enough in current Chrome and Brave. If not, use the smallest workable
  alternative, for example requesting `<all_urls>` as an
  **optional_host_permission** at the moment the user first starts a capture.
  Write the justification text accordingly. This is unverified and is the main
  technical risk.
- Raise the version to 2.0.0. Rename and add a new description (see listing).
- Add `icons` (16/32/48/128) and `action.default_icon`.
- No remote code, no `eval`, no analytics, and no network requests by the
  extension.

### Store documentation (in repo, under `store/` + `PRIVACY.md`)

- `PRIVACY.md`, in Vietnamese and English: the extension collects nothing,
  sends nothing, stores study state in the browser and optionally Chrome Sync,
  and export files stay on the user's machine. It should be linkable via the
  GitHub URL.
- `store/listing.md`: the name, a short description (≤132 chars), a long
  description, the single-purpose statement, a justification for each permission,
  and the data-use disclosures (answers for the Web Store privacy form).
- Name (my call): **"Exam Checklist for FuOverflow & FuExam"**. This is the
  "for X" form plus a line in the description and popup saying "Không phải
  extension chính thức của FuOverflow / FuExam" (not official).
- Screenshots: at least one 1280×800 image of the list page and one of the
  lightbox panel, captured after the UI refresh.
- README updated for the new features, the new name, and both sites.

### UI direction (my call, using `high-end-visual-design`)

The skill targets websites. Adapt it to small surfaces injected into someone
else's dark forum:

- **Vibe: Ethereal Glass**, matching both dark forums. Use near-black surfaces,
  white/10 hairlines, a single emerald accent for "done", blue for "studying",
  and amber for flags. No harsh shadows; use diffuse, low-opacity ones.
- **Double-bezel** for the lightbox panel and popup cards: an outer shell with
  a hairline and a small padding, and an inner core with an inset top
  highlight and a concentric smaller radius.
- **Pill buttons**. The primary actions (Export, Capture all, Resume) use the
  button-in-button trailing icon circle.
- **Motion**: custom cubic-bezier (`0.32,0.72,0,1`). Use transform and opacity
  only. Add a spring press (`scale(.98)`) on buttons, an animated checkbox tick,
  a progress bar that fills with a spring, a jump-grid reveal with staggered
  cells, and a toast that slides and fades. Respect `prefers-reduced-motion`.
- **Type**: no Inter, Roboto, or Arial. Bundle one open-licensed font locally
  (e.g. Geist or Plus Jakarta Sans, woff2, OFL) for the popup and panel only.
  Badges in the list inherit the forum font so they sit naturally. No remote
  fonts.
- **Icons**: inline thin-stroke SVG (Phosphor Light style), with no icon font.
- `backdrop-filter` only on the fixed/overlay elements (panel, popup sheet,
  toast), never on list rows.
- Each injected element must stay compact. The "macro-whitespace" rule applies
  to the popup only, not to forum list rows.
- All styles stay prefixed `fuo-` so nothing leaks into the forum CSS.

### Decisions settled after the builder check (my calls, owner may override)

- **Removals propagate.** Un-ticking a thread, clearing "studying" (×) and
  unflagging a question are recorded as **tombstones** with their own `at`
  (`{ done: false, at }`, `{ removed: true, at }`, per-question
  `{ on: false, at }`) so merge (import and sync) does not resurrect them.
  Tombstones older than **90 days** are pruned. A removal counts as an
  "updated" entry in the import confirmation.
- Capture speed stays in the page's `localStorage` (`fuo-capture-speed`). It
  is a per-device preference and does not need to move.
- The current `alert()`/`confirm()` in `lightbox.js` are replaced by an
  in-panel modal that follows the new UI style.
- The repo is public (`https://github.com/CDinhh/Extension-Fuoverflow-test-checklist`),
  so `PRIVACY.md` on GitHub can serve as the privacy-policy URL.

## Constraints

- Manifest V3, Chrome/Brave ≥ 111 (MAIN-world content scripts).
- Plain JS/CSS, no build step and no dependencies (the repo has none today).
- Commits on `feature/sync-store-ui` under the owner's git identity. No AI
  trailers. No push without asking.

## Left to the builder

- The exact storage sharding scheme within the quota.
- The exact visual tokens, spacing, and animation timings within the direction
  above.
- Popup layout details.
- How to test: there is no test framework. Add a small dependency-free
  assert-based self-check for the merge/validate logic (runnable with
  `node`), and verify manually on both sites in Brave. Cover the list, the
  lightbox, capture, export on one profile, and import on another.
