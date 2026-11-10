# Chrome Web Store listing

Copy these fields into the Developer Dashboard.

## Name

FU Study Kit: Exam Checklist & FAP Timetable

## Short description (≤ 132 characters)

Tick đề đã ôn trên FuOverflow & FuExam, gắn cờ câu chưa chắc và xem thời khóa biểu FAP ngay trong popup. Không chính thức.

## Category

Education

## Language

Vietnamese

## Long description

### Tiếng Việt

Bộ công cụ học tập cho sinh viên FPT: theo dõi việc ôn đề thi trên diễn đàn FuOverflow (fuoverflow.com) và FuExam (fuexam.me), và xem thời khóa biểu FAP ngay trong popup.

• Checklist: tick các đề đã ôn xong ngay trên danh sách thread hoặc trong trang đề. Thanh tiến độ cho biết bạn đã ôn bao nhiêu đề.
• Đang học: mở một đề là nó được đánh dấu "Đang học"; danh sách hiện luôn câu bạn đang xem dở (ví dụ "Đang học tới câu 8/60").
• Trong khung xem ảnh đề: nhảy nhanh tới câu bất kỳ, gắn cờ câu chưa chắc, "Tiếp tục câu X" để quay lại chỗ đang học.
• Chụp màn hình kèm khung chat: chụp từng câu hoặc cả đề (kèm phần bình luận đáp án) và tải về một file ZIP.
• Thời khóa biểu FAP (tuỳ chọn): bật trong popup để xem lịch tuần dạng bảng, tự cập nhật từ fap.fpt.edu.vn bằng phiên đăng nhập sẵn có của bạn, luôn ghi rõ lần cập nhật gần nhất.
• Chuyển máy: Xuất/Nhập dữ liệu bằng file JSON trong popup. Trên Chrome có bật Sync, dữ liệu tự đồng bộ giữa các máy.

Quyền riêng tư: extension không gửi dữ liệu đi đâu, không analytics, không tải code từ xa. Tiến độ ôn và lịch học chỉ nằm trong trình duyệt của bạn.

Không phải extension chính thức của FuOverflow / FuExam / Đại học FPT.

### English

A study toolkit for FPT University students: track exam revision on the FuOverflow (fuoverflow.com) and FuExam (fuexam.me) forums, and see your FAP timetable in the popup.

• Checklist: tick exam threads you have reviewed, right in the thread list or on the thread page. A progress bar shows how far you are.
• Studying: opening a thread marks it "studying"; the list shows the question you reached (e.g. "question 8/60").
• In the image viewer: jump to any question, flag unsure ones, and "resume at question X".
• Screenshot with the discussion panel: capture one question or the whole exam (including the answer comments) as a ZIP.
• FAP timetable (optional): turn it on in the popup to see your week as a table, refreshed from fap.fpt.edu.vn with your existing session, with the last update time always shown.
• Move between devices: export/import a JSON file from the popup. On Chrome with Sync on, data follows you automatically.

Privacy: no data sent anywhere, no analytics, no remote code. Your progress and timetable stay in your browser.

Not an official FuOverflow / FuExam / FPT University extension.

## Single purpose

A study companion for FPT University students: track which exam threads and questions they have reviewed on fuoverflow.com and fuexam.me (checklist, study progress, question flags, optional screenshots of the exam they are viewing) and see their own weekly class timetable from fap.fpt.edu.vn in the popup.

## Permission justifications

**storage**
Stores the user's study progress (reviewed threads, current question, flagged questions) in chrome.storage.local, mirrored to chrome.storage.sync so it follows the user between their own devices when Chrome Sync is on.

**Host permissions: \*://fuoverflow.com/\*, \*://\*.fuoverflow.com/\*, \*://fuexam.me/\*, \*://\*.fuexam.me/\***
The content scripts add the checklist checkbox, progress badges and the question-jump panel to these two forums only. The extension does not run on any other site.

**scripting**
Used only for the optional FAP timetable: after the user presses "Bật thời khóa biểu", chrome.scripting.executeScript reads the weekly timetable table from a fap.fpt.edu.vn/WeeklyTimetable tab that the extension opens. No code is injected into any other site.

**Optional host permission: <all_urls>**
Requested at runtime, narrowed to what the user asks for: https://fap.fpt.edu.vn/* when they press "Bật thời khóa biểu" (to read their weekly timetable), or <all_urls> when they press "Cho phép chụp màn hình" in the popup. chrome.tabs.captureVisibleTab requires <all_urls> or activeTab; activeTab is not granted by clicks inside the page, so the screenshot buttons in the forum's image viewer need this permission. It is used only to capture the visible forum tab when the user presses a capture button. Nothing is read from or injected into other sites.

**Remote code**
No. All code is packaged in the extension.

## Data usage (privacy practices form)

- Collected data: "Website content" only if the user turns on the FAP timetable: their weekly class timetable is read from fap.fpt.edu.vn and stored locally in chrome.storage.local to display in the popup. It is never transmitted. Nothing else is collected (no personally identifiable information, health, financial, authentication, personal communications, location, web history or user activity).
- Certifications (tick all three):
  - I do not sell or transfer user data to third parties, outside of the approved use cases.
  - I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL

https://github.com/CDinhh/Extension-Fuoverflow-test-checklist/blob/main/PRIVACY.md

## Screenshots (1280×800)

`store/screenshots/`:

1. `01-list.png`: thread list with checkboxes, badges and the progress bar.
2. `02-lightbox.png`: question-jump panel inside the image viewer.
3. `03-popup.png`: popup with per-site stats and export/import.

## Packaging

Run from the repository root in PowerShell:

```powershell
$files = "manifest.json","background.js","content.js","content.css","lightbox.js","lightbox.css","popup.html","popup.css","popup.js","lib","assets"
Remove-Item exam-checklist.zip -ErrorAction SilentlyContinue
Compress-Archive -Path $files -DestinationPath exam-checklist.zip
```

This leaves out `docs`, `tests` and `store`. Unzip it into an empty folder and load it with "Load unpacked" to smoke-test before uploading.
