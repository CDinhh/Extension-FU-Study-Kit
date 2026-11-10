# Handoff: sync / store / UI work (2026-11-06)

State at handoff:
- Branch `feature/sync-store-ui`. The spec and plan are committed. **No product code
  has been written yet.**
- The owner has not yet reviewed the plan or picked an execution method.

## Prompt to paste into the next Claude session

```
Tiếp tục dự án extension trong repo này (branch feature/sync-store-ui).

1. Đọc docs/superpowers/HANDOFF.md, rồi spec docs/superpowers/specs/2026-11-06-sync-store-ui-design.md
   và plan docs/superpowers/plans/2026-11-06-sync-store-ui.md.
2. Hỏi tôi đã duyệt plan chưa và chọn cách chạy (đề xuất: Native = superpowers:executing-plans,
   vì các task phụ thuộc chặt vào interface storage/bridge và chỉ có 9 task).
3. Làm theo plan từng task, TDD cho lib/ (node --test tests/), commit sau mỗi task.
   Không thêm Co-Authored-By hay dòng AI nào vào commit. Không push nếu tôi chưa bảo.
4. Task 7 (UI): dùng skill high-end-visual-design nếu máy có (~/.claude/skills), không thì theo
   mục "UI direction" trong spec.
5. Trước khi giả định đường dẫn/ổ đĩa/SDK, kiểm tra máy hiện tại (máy này khác máy trước).
6. Các quyết định "my call" trong spec (tên extension, tombstone 90 ngày, merge newer-wins,
   style Ethereal Glass) tôi có thể đổi — nêu lại ngắn gọn khi báo cáo.
```

## Decisions made without the owner (flag them when reporting)

- Extension name: "Exam Checklist for FuOverflow & FuExam", with a non-affiliation line.
- Removals propagate through tombstones, which are pruned after 90 days.
- Import merges: the newer entry wins, and a confirmation shows counts before anything is applied.
- Export/import live in the toolbar popup.
- UI vibe: Ethereal Glass, dark, matching both forums (both use dark XenForo themes).

## Facts verified on 2026-11-06 (owner's Brave, logged in)

- fuexam.me is XenForo, like fuoverflow.com.
- The list selectors match the code: `.structItem--thread`, `.structItem-title`, `.p-title-value`.
- Thread URLs follow `/threads/<slug>.<id>/`.
- The fuexam.me lightbox is Fancybox with a sidebar (`.fancybox__container.fancybox-has-sidebar`,
  `.fancybox-sidebar`, comments in the sidebar), and `window.Fancybox.getInstance()` works.
- Attachments on fuexam.me need login.
- The repo `CDinhh/Extension-Fuoverflow-test-checklist` is **public** (privacy URL works).
- **Not verified:** whether `captureVisibleTab` works with only site host permissions (plan Task 5).

## Driving the owner's Brave without installing anything (optional, for checks/screenshots)

The `browser-use` CLI was **not** installed on the previous machine. What worked
instead was talking to Brave over CDP with the Node that was already installed
(Node ≥ 22, which has a global `WebSocket`):

1. The owner enables "Allow remote debugging for this browser instance" at
   `brave://inspect/#remote-debugging` (the `--remote-debugging-port` flag is blocked on the
   default profile). Brave may ask the owner to click Allow.
2. Read the port and path from `%LOCALAPPDATA%/BraveSoftware/Brave-Browser/User Data/DevToolsActivePort`.
3. Do **all** steps in **one** WebSocket connection per run. Repeated short connections
   sometimes hung. A long-running local HTTP bridge was refused by the permission
   classifier as an RCE surface, so don't do that.

Keep this script in the scratchpad/temp dir, not in the repo:

```js
// node lb.mjs <tabUrlSubstring> <steps.json>
// steps: [{"eval":"js expr"}, {"sleep":ms}, {"shot":"file.png"}]
import fs from "node:fs";
const f = process.env.LOCALAPPDATA + "/BraveSoftware/Brave-Browser/User Data/DevToolsActivePort";
const [port, path] = fs.readFileSync(f, "utf8").trim().split("\n");
const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
let id = 0; const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ws.onopen = async () => {
  try {
    const { targetInfos } = await send("Target.getTargets");
    const t = targetInfos.find((t) => t.type === "page" && t.url.includes(process.argv[2]));
    const { sessionId } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId)).result.value;
    for (const step of JSON.parse(fs.readFileSync(process.argv[3], "utf8"))) {
      if (step.sleep) await sleep(step.sleep);
      if (step.eval) console.log(JSON.stringify(await ev(step.eval), null, 1));
      if (step.shot) { const r = await send("Page.captureScreenshot", { format: "png" }, sessionId); fs.writeFileSync(step.shot, Buffer.from(r.data, "base64")); console.log("shot", step.shot); }
    }
  } catch (e) { console.error(e.message); }
  process.exit(0);
};
```
