# Chính sách quyền riêng tư / Privacy Policy

**FU Study Kit: Exam Checklist & FAP Timetable** · cập nhật / last updated: 2026-11-11

Đây không phải extension chính thức của FuOverflow / FuExam.
This is not an official FuOverflow / FuExam extension.

---

## Tiếng Việt

**Extension không thu thập và không gửi bất kỳ dữ liệu nào.** Không có máy chủ, không có tài
khoản, không có phân tích (analytics), không tải code từ xa. Extension chỉ mở trang thời khóa biểu
FAP khi bạn tự bật tính năng đó (xem bên dưới), ngoài ra không tự gửi request mạng nào.

### Dữ liệu được lưu, và lưu ở đâu

Extension chỉ lưu tiến độ ôn đề của bạn:

- các đề bạn đã tick "Đã ôn xong";
- đề đang học và câu đang học dở (ví dụ câu 8/60);
- các câu bạn gắn cờ "chưa chắc".

Dữ liệu chỉ gồm mã số thread, số câu và thời điểm thay đổi. Không có tên tài khoản, nội dung bài
viết, ảnh đề hay lịch sử duyệt web.

Dữ liệu chỉ nằm trong `chrome.storage.local`, trên máy của bạn. Extension không dùng Chrome Sync; muốn
chuyển sang máy khác thì dùng Xuất/Nhập file. (Bản 2.0 trở về trước có sao chép sang `chrome.storage.sync`;
bản này chuyển phần đó về máy một lần rồi xoá khỏi `chrome.storage.sync`.)

Tốc độ chụp màn hình và vị trí các vùng che đáp án được lưu trong `localStorage` của trang diễn đàn.
Các công tắc ẩn banner/popup của diễn đàn được lưu trong `chrome.storage.local`.
Để popup liệt kê được những gì bạn đã ôn, tên và môn (tên diễn đàn môn và link) của các đề bạn đã ôn
cũng được lưu trong `chrome.storage.local`, chỉ trên máy này và không nằm trong file xuất.

**Thời khóa biểu FAP (tuỳ chọn, tắt mặc định):** khi bạn bấm "Bật thời khóa biểu", extension mở trang
`fap.fpt.edu.vn/WeeklyTimetable` trong một tab bằng phiên đăng nhập sẵn có của bạn, đọc bảng lịch
của các tuần trong kỳ (môn, giờ, phòng, giảng viên, điểm danh, link học online) rồi đóng tab. Lịch chỉ được lưu trong
`chrome.storage.local` trên máy bạn, không nằm trong file xuất và không gửi đi đâu.
Extension không đọc mật khẩu, cookie hay trang FAP nào khác; nếu FAP đòi đăng nhập, bạn tự đăng nhập
trong tab đó.

**Xuất/Nhập dữ liệu:** file JSON bạn xuất ra được lưu vào máy của bạn và chỉ được đọc khi bạn chủ
động chọn nó để nhập. Extension không gửi file đó đi đâu.

**Ảnh chụp màn hình:** chỉ được chụp khi bạn bấm nút chụp, được ghép (ZIP) ngay trong trình
duyệt và tải thẳng vào máy bạn.

### Quyền extension yêu cầu

| Quyền | Lý do |
|---|---|
| `storage` | Lưu tiến độ ôn đề và thời khóa biểu trên máy (`chrome.storage.local`). |
| Truy cập `fuoverflow.com`, `fuexam.me` | Hiện checkbox, nhãn tiến độ và panel nhảy câu trên hai diễn đàn này. Extension không chạy trên trang nào khác. |
| `scripting` + truy cập `fap.fpt.edu.vn` (tuỳ chọn, chỉ xin khi bạn bấm "Bật thời khóa biểu") | Đọc bảng lịch tuần từ tab FAP để hiện trong popup. |
| `<all_urls>` (tuỳ chọn, chỉ xin khi bạn bấm "Cho phép chụp màn hình") | Trình duyệt chỉ cho phép `chrome.tabs.captureVisibleTab` khi có quyền này. Chỉ dùng để chụp tab diễn đàn đang mở khi bạn bấm nút chụp. |

### Xoá dữ liệu

Gỡ extension sẽ xoá toàn bộ dữ liệu trong `chrome.storage`. Dữ liệu cũ dạng `localStorage`
(`fuo-test-checklist`, `fuo-study-progress`, `fuo-question-flags`) được giữ lại trên trang diễn đàn
làm bản sao lưu; bạn có thể xoá bằng cách xoá dữ liệu trang web của diễn đàn trong trình duyệt.

### Liên hệ

Mở issue tại https://github.com/CDinhh/Extension-FU-Study-Kit/issues

---

## English

**The extension collects nothing and sends nothing.** There is no server, no account, no
analytics and no remote code. The extension opens the FAP timetable page only if you turn that
feature on (see below); otherwise it makes no network requests of its own.

### What is stored, and where

Only your study progress:

- threads you ticked as "reviewed";
- threads you are studying and the question you reached (e.g. 8/60);
- questions you flagged as "unsure".

It consists of thread ids, question numbers and timestamps only. No account names, post content,
exam images or browsing history.

It lives only in `chrome.storage.local`, on your device. The extension does not use Chrome Sync; to
move to another device, use Export/Import. (Version 2.0 and earlier mirrored it to
`chrome.storage.sync`; this version moves that copy back to the device once and then clears
`chrome.storage.sync`.)

The capture speed and the answer-cover positions are kept in the forum page's `localStorage`.
The switches that hide the forums' banner/popup are kept in `chrome.storage.local`.
So the popup can list what you studied, the title and subject (forum name and link) of each thread
you studied are also kept in `chrome.storage.local`, on this device only, and are not included in
the export file.

**FAP timetable (optional, off by default):** when you press "Bật thời khóa biểu", the extension
opens `fap.fpt.edu.vn/WeeklyTimetable` in a tab using your existing session, reads the weekly tables
of the term (class, time, room, lecturer, attendance, online-class link) and closes the tab. The timetable is
kept only in `chrome.storage.local` on your device; it is not included in exports and
never sent anywhere. The extension does not read passwords, cookies or any other FAP page; if FAP
asks you to sign in, you do that yourself in that tab.

**Export/Import:** the JSON file you export is saved on your device and is read only when you
choose it for import. The extension never uploads it.

**Screenshots:** taken only when you press a capture button, zipped inside the browser and
downloaded straight to your device.

### Permissions

| Permission | Why |
|---|---|
| `storage` | Save study progress and the timetable on your device (`chrome.storage.local`). |
| Access to `fuoverflow.com`, `fuexam.me` | Show checkboxes, progress badges and the question-jump panel on these two forums. The extension runs on no other site. |
| `scripting` + access to `fap.fpt.edu.vn` (optional, requested only when you press "Bật thời khóa biểu") | Read the weekly timetable from a FAP tab to show it in the popup. |
| `<all_urls>` (optional, requested only when you press "Cho phép chụp màn hình") | Chrome allows `chrome.tabs.captureVisibleTab` only with this permission. It is used only to capture the open forum tab when you press a capture button. |

### Deleting data

Removing the extension deletes everything in `chrome.storage`. Older `localStorage` data
(`fuo-test-checklist`, `fuo-study-progress`, `fuo-question-flags`) is left on the forum site as a
backup; clear the forum's site data in your browser to remove it.

### Contact

Open an issue at https://github.com/CDinhh/Extension-FU-Study-Kit/issues
