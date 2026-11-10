# Chính sách quyền riêng tư / Privacy Policy

**Exam Checklist for FuOverflow & FuExam** · cập nhật / last updated: 2026-11-06

Đây không phải extension chính thức của FuOverflow / FuExam.
This is not an official FuOverflow / FuExam extension.

---

## Tiếng Việt

**Extension không thu thập và không gửi bất kỳ dữ liệu nào.** Không có máy chủ, không có tài
khoản, không có phân tích (analytics), không tải code từ xa và không tự gửi request mạng nào.

### Dữ liệu được lưu, và lưu ở đâu

Extension chỉ lưu tiến độ ôn đề của bạn:

- các đề bạn đã tick "Đã ôn xong";
- đề đang học và câu đang học dở (ví dụ câu 8/60);
- các câu bạn gắn cờ "chưa chắc".

Dữ liệu chỉ gồm mã số thread, số câu và thời điểm thay đổi. Không có tên tài khoản, nội dung bài
viết, ảnh đề hay lịch sử duyệt web.

Dữ liệu nằm trong `chrome.storage` của trình duyệt:

- `chrome.storage.local`: trên máy của bạn;
- `chrome.storage.sync`: nếu bạn đăng nhập Chrome và bật Chrome Sync, trình duyệt tự đồng bộ dữ
  liệu này giữa các máy của bạn qua tài khoản Google của bạn. Việc đồng bộ do Chrome thực hiện, extension
  không nhận được bản sao nào. Trong Brave, phần này chỉ nằm trên máy.

Tốc độ chụp màn hình và vị trí các vùng che đáp án được lưu trong `localStorage` của trang diễn đàn.
Các công tắc ẩn banner/popup của diễn đàn được lưu trong `chrome.storage.local`.

**Xuất/Nhập dữ liệu:** file JSON bạn xuất ra được lưu vào máy của bạn và chỉ được đọc khi bạn chủ
động chọn nó để nhập. Extension không gửi file đó đi đâu.

**Ảnh chụp màn hình:** chỉ được chụp khi bạn bấm nút chụp, được ghép (ZIP) ngay trong trình
duyệt và tải thẳng vào máy bạn.

### Quyền extension yêu cầu

| Quyền | Lý do |
|---|---|
| `storage` | Lưu tiến độ ôn đề (local, và Chrome Sync nếu bạn bật). |
| Truy cập `fuoverflow.com`, `fuexam.me` | Hiện checkbox, nhãn tiến độ và panel nhảy câu trên hai diễn đàn này. Extension không chạy trên trang nào khác. |
| `<all_urls>` (tuỳ chọn, chỉ xin khi bạn bấm "Cho phép chụp màn hình") | Trình duyệt chỉ cho phép `chrome.tabs.captureVisibleTab` khi có quyền này. Chỉ dùng để chụp tab diễn đàn đang mở khi bạn bấm nút chụp. |

### Xoá dữ liệu

Gỡ extension sẽ xoá toàn bộ dữ liệu trong `chrome.storage`. Dữ liệu cũ dạng `localStorage`
(`fuo-test-checklist`, `fuo-study-progress`, `fuo-question-flags`) được giữ lại trên trang diễn đàn
làm bản sao lưu; bạn có thể xoá bằng cách xoá dữ liệu trang web của diễn đàn trong trình duyệt.

### Liên hệ

Mở issue tại https://github.com/CDinhh/Extension-Fuoverflow-test-checklist/issues

---

## English

**The extension collects nothing and sends nothing.** There is no server, no account, no
analytics, no remote code, and the extension makes no network requests of its own.

### What is stored, and where

Only your study progress:

- threads you ticked as "reviewed";
- threads you are studying and the question you reached (e.g. 8/60);
- questions you flagged as "unsure".

It consists of thread ids, question numbers and timestamps only. No account names, post content,
exam images or browsing history.

It lives in the browser's `chrome.storage`:

- `chrome.storage.local`: on your device;
- `chrome.storage.sync`: if you are signed in to Chrome with sync turned on, Chrome syncs this
  data between your own devices through your Google account. Chrome does the syncing; the
  extension never receives a copy. In Brave this stays on the device.

The capture speed and the answer-cover positions are kept in the forum page's `localStorage`.
The switches that hide the forums' banner/popup are kept in `chrome.storage.local`.

**Export/Import:** the JSON file you export is saved on your device and is read only when you
choose it for import. The extension never uploads it.

**Screenshots:** taken only when you press a capture button, zipped inside the browser and
downloaded straight to your device.

### Permissions

| Permission | Why |
|---|---|
| `storage` | Save study progress (local, plus Chrome Sync if you enabled it). |
| Access to `fuoverflow.com`, `fuexam.me` | Show checkboxes, progress badges and the question-jump panel on these two forums. The extension runs on no other site. |
| `<all_urls>` (optional, requested only when you press "Cho phép chụp màn hình") | Chrome allows `chrome.tabs.captureVisibleTab` only with this permission. It is used only to capture the open forum tab when you press a capture button. |

### Deleting data

Removing the extension deletes everything in `chrome.storage`. Older `localStorage` data
(`fuo-test-checklist`, `fuo-study-progress`, `fuo-question-flags`) is left on the forum site as a
backup; clear the forum's site data in your browser to remove it.

### Contact

Open an issue at https://github.com/CDinhh/Extension-Fuoverflow-test-checklist/issues
