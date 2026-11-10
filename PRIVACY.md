# Chính sách quyền riêng tư / Privacy Policy

**FU Study Kit: Exam Checklist & FAP Timetable** · cập nhật / last updated: 2026-11-11

Đây không phải extension chính thức của FuOverflow / FuExam.
This is not an official FuOverflow / FuExam extension.

---

## Tiếng Việt

**Extension không có máy chủ riêng và không gửi dữ liệu cho tác giả hay bên thứ ba nào.** Không có
phân tích (analytics), không tải code từ xa. Extension chỉ kết nối mạng khi bạn tự bật: đọc thời khóa
biểu FAP, và đồng bộ lên Google Drive của chính bạn (xem bên dưới).

### Dữ liệu được lưu, và lưu ở đâu

Extension chỉ lưu tiến độ ôn đề của bạn:

- các đề bạn đã tick "Đã ôn xong";
- đề đang học và câu đang học dở (ví dụ câu 8/60);
- các câu bạn gắn cờ "chưa chắc".

Dữ liệu chỉ gồm mã số thread, số câu và thời điểm thay đổi. Không có tên tài khoản, nội dung bài
viết, ảnh đề hay lịch sử duyệt web.

Dữ liệu nằm trong `chrome.storage.local`, trên máy của bạn. Extension không dùng Chrome Sync; muốn
chuyển sang máy khác thì dùng Xuất/Nhập file, hoặc bật đồng bộ Google Drive (bên dưới). (Bản 2.0 trở về trước có sao chép sang `chrome.storage.sync`;
bản này chuyển phần đó về máy một lần rồi xoá khỏi `chrome.storage.sync`.)

Tốc độ chụp màn hình và vị trí các vùng che đáp án được lưu trong `localStorage` của trang diễn đàn.
Các công tắc ẩn banner/popup của diễn đàn được lưu trong `chrome.storage.local`.
Để popup liệt kê được những gì bạn đã ôn, tên và môn (tên diễn đàn môn và link) của các đề bạn đã ôn
cũng được lưu trong `chrome.storage.local`, chỉ trên máy này và không nằm trong file xuất.

**Thời khóa biểu FAP (tuỳ chọn, tắt mặc định):** khi bạn bấm "Bật thời khóa biểu", extension mở trang
`fap.fpt.edu.vn/WeeklyTimetable` trong một tab bằng phiên đăng nhập sẵn có của bạn, đọc bảng lịch
của các tuần trong kỳ (môn, giờ, phòng, giảng viên, điểm danh, link học online), sau đó mở trang
`fap.fpt.edu.vn/Report/Attendance` để đếm số buổi có mặt / vắng / chưa điểm danh của từng môn trong kỳ
hiện tại, rồi đóng tab. Lịch và số liệu điểm danh chỉ được lưu trong `chrome.storage.local` trên máy bạn, không nằm trong file xuất và không gửi đi đâu.
Extension không đọc mật khẩu, cookie hay trang FAP nào khác ngoài hai trang trên; nếu FAP đòi đăng nhập, bạn tự đăng nhập
trong tab đó.

**Đồng bộ Google Drive (tuỳ chọn, tắt mặc định):** khi bạn bấm nút đám mây và đăng nhập Google,
extension lưu một file `fu-study-kit.json` vào thư mục dữ liệu ẩn của ứng dụng trên Google Drive của
chính bạn (`appDataFolder`, quyền `drive.appdata`): tiến độ ôn đề, tên đề và môn, thời khóa biểu và
số liệu điểm danh. Extension không đọc được file nào khác trong Drive của bạn. Để hiện bạn đang đăng
nhập tài khoản nào, extension đọc tên, email và ảnh đại diện Google và chỉ lưu chúng trên máy này.
Đăng nhập dùng cửa sổ của Google; extension không thấy mật khẩu. Mã truy cập chỉ nằm trong bộ nhớ của
trình duyệt và bị thu hồi khi bạn bấm Đăng xuất. Dữ liệu đi thẳng từ trình duyệt của bạn tới Google,
không qua máy chủ nào khác. Muốn xoá file trên Drive: vào Google Drive → Cài đặt → Quản lý ứng dụng →
FU Study Kit → Xoá dữ liệu ứng dụng ẩn.

**Xuất/Nhập dữ liệu:** file JSON bạn xuất ra được lưu vào máy của bạn và chỉ được đọc khi bạn chủ
động chọn nó để nhập. Extension không gửi file đó đi đâu.

**Ảnh chụp màn hình:** chỉ được chụp khi bạn bấm nút chụp, được ghép (ZIP) ngay trong trình
duyệt và tải thẳng vào máy bạn.

### Quyền extension yêu cầu

| Quyền | Lý do |
|---|---|
| `storage` | Lưu tiến độ ôn đề và thời khóa biểu trên máy (`chrome.storage.local`). |
| `identity` | Mở cửa sổ đăng nhập Google khi bạn bấm nút đám mây, để đồng bộ với Google Drive của bạn. |
| Truy cập `fuoverflow.com`, `fuexam.me` | Hiện checkbox, nhãn tiến độ và panel nhảy câu trên hai diễn đàn này. Extension không chạy trên trang nào khác. |
| `scripting` + truy cập `fap.fpt.edu.vn` (tuỳ chọn, chỉ xin khi bạn bấm "Bật thời khóa biểu") | Đọc bảng lịch tuần và báo cáo điểm danh từ tab FAP để hiện trong popup. |
| `<all_urls>` (tuỳ chọn, chỉ xin khi bạn bấm "Cho phép chụp màn hình") | Trình duyệt chỉ cho phép `chrome.tabs.captureVisibleTab` khi có quyền này. Chỉ dùng để chụp tab diễn đàn đang mở khi bạn bấm nút chụp. |

### Xoá dữ liệu

Gỡ extension sẽ xoá toàn bộ dữ liệu trong `chrome.storage`. Dữ liệu cũ dạng `localStorage`
(`fuo-test-checklist`, `fuo-study-progress`, `fuo-question-flags`) được giữ lại trên trang diễn đàn
làm bản sao lưu; bạn có thể xoá bằng cách xoá dữ liệu trang web của diễn đàn trong trình duyệt.

### Liên hệ

Mở issue tại https://github.com/CDinhh/Extension-FU-Study-Kit/issues

---

## English

**The extension has no server of its own and sends no data to its author or any third party.**
There is no analytics and no remote code. It goes online only for what you turn on: reading your FAP
timetable, and syncing to your own Google Drive (see below).

### What is stored, and where

Only your study progress:

- threads you ticked as "reviewed";
- threads you are studying and the question you reached (e.g. 8/60);
- questions you flagged as "unsure".

It consists of thread ids, question numbers and timestamps only. No account names, post content,
exam images or browsing history.

It lives in `chrome.storage.local`, on your device. The extension does not use Chrome Sync; to move
to another device, use Export/Import, or turn on Google Drive sync (below). (Version 2.0 and earlier mirrored it to
`chrome.storage.sync`; this version moves that copy back to the device once and then clears
`chrome.storage.sync`.)

The capture speed and the answer-cover positions are kept in the forum page's `localStorage`.
The switches that hide the forums' banner/popup are kept in `chrome.storage.local`.
So the popup can list what you studied, the title and subject (forum name and link) of each thread
you studied are also kept in `chrome.storage.local`, on this device only, and are not included in
the export file.

**FAP timetable (optional, off by default):** when you press "Bật thời khóa biểu", the extension
opens `fap.fpt.edu.vn/WeeklyTimetable` in a tab using your existing session, reads the weekly tables
of the term (class, time, room, lecturer, attendance, online-class link), then opens
`fap.fpt.edu.vn/Report/Attendance` to count each current course's present / absent / not-yet-taken
sessions, and closes the tab. The timetable and attendance counts are kept only in `chrome.storage.local` on your device; it is not included in exports and
never sent anywhere. The extension does not read passwords, cookies or any FAP page other than these two; if FAP
asks you to sign in, you do that yourself in that tab.

**Google Drive sync (optional, off by default):** when you press the cloud button and sign in with
Google, the extension keeps one file, `fu-study-kit.json`, in the hidden app-data folder of your own
Google Drive (`appDataFolder`, scope `drive.appdata`): study progress, thread titles and subjects,
the timetable and attendance counts. It cannot see any other file in your Drive. To show which account
is signed in, it reads your Google name, email and profile picture and keeps them on this device only.
Sign-in happens in Google's own window; the extension never sees your password. The access token is
kept in browser memory only and is revoked when you press Sign out. Data goes straight from your
browser to Google, through no other server. To delete the Drive file: Google Drive → Settings →
Manage apps → FU Study Kit → Delete hidden app data.

**Export/Import:** the JSON file you export is saved on your device and is read only when you
choose it for import. The extension never uploads it.

**Screenshots:** taken only when you press a capture button, zipped inside the browser and
downloaded straight to your device.

### Permissions

| Permission | Why |
|---|---|
| `storage` | Save study progress and the timetable on your device (`chrome.storage.local`). |
| `identity` | Open Google's sign-in window when you press the cloud button, to sync with your Google Drive. |
| Access to `fuoverflow.com`, `fuexam.me` | Show checkboxes, progress badges and the question-jump panel on these two forums. The extension runs on no other site. |
| `scripting` + access to `fap.fpt.edu.vn` (optional, requested only when you press "Bật thời khóa biểu") | Read the weekly timetable and the attendance report from a FAP tab to show them in the popup. |
| `<all_urls>` (optional, requested only when you press "Cho phép chụp màn hình") | Chrome allows `chrome.tabs.captureVisibleTab` only with this permission. It is used only to capture the open forum tab when you press a capture button. |

### Deleting data

Removing the extension deletes everything in `chrome.storage`. Older `localStorage` data
(`fuo-test-checklist`, `fuo-study-progress`, `fuo-question-flags`) is left on the forum site as a
backup; clear the forum's site data in your browser to remove it.

### Contact

Open an issue at https://github.com/CDinhh/Extension-FU-Study-Kit/issues
