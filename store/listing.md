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

Paste both parts into the one description field, Vietnamese first.

### Tiếng Việt

Bộ công cụ học tập cho sinh viên FPT: theo dõi việc ôn đề thi trên diễn đàn FuOverflow (fuoverflow.com) và FuExam (fuexam.me), và xem thời khóa biểu, lịch thi, điểm danh FAP ngay trong popup.

• Checklist: tick các đề đã ôn xong ngay trên danh sách thread hoặc trong trang đề. Thanh tiến độ cho biết bạn đã ôn bao nhiêu đề.
• Đang học: mở một đề là nó được đánh dấu "Đang học"; danh sách hiện luôn câu bạn đang xem dở (ví dụ "Đang học tới câu 8/60").
• Trong khung xem ảnh đề: nhảy nhanh tới câu bất kỳ, gắn cờ câu chưa chắc, che đáp án để tự kiểm tra, "Tiếp tục câu X" để quay lại chỗ đang học.
• Chụp màn hình kèm khung chat: chụp từng câu hoặc cả đề (kèm phần bình luận đáp án) và tải về một file ZIP.
• Thời khóa biểu FAP (tuỳ chọn): xem lịch tuần dạng bảng, lịch thi tô màu riêng. Bấm làm mới là extension mở FAP bằng phiên đăng nhập sẵn có của bạn, đọc lịch và điểm danh rồi tự đóng tab. Rê chuột vào một buổi học để xem đã vắng bao nhiêu, còn được vắng mấy buổi trước mức 20%.
• Thành phần điểm (tuỳ chọn): đọc từ syllabus trên FLM (flm.fpt.edu.vn), hiện trọng số từng phần và điểm tối thiểu ngay trong tooltip. Bấm vào ô môn học để mở syllabus trên FLM.
• Đồng bộ Google Drive (tuỳ chọn): tiến độ ôn, thời khóa biểu và điểm danh theo bạn sang máy khác. Hoặc Xuất/Nhập file JSON.
• Google Calendar (tuỳ chọn): đưa buổi học và lịch thi vào một lịch riêng, tự sửa khi lịch FAP đổi, không tạo trùng, nhắc qua thông báo hoặc email.
• Gọn diễn đàn: ẩn banner Donate trên FuExam và popup cộng đồng trên FuOverflow. Bật sẵn khi cài, tắt được bằng công tắc trong popup.

Quyền riêng tư: không có máy chủ riêng, không analytics, không tải code từ xa. Dữ liệu nằm trong trình duyệt của bạn; chỉ khi bạn bật, extension mới lưu vào Google Drive và Google Calendar của chính bạn.

Không phải extension chính thức của FuOverflow / FuExam / Đại học FPT.

### English

A study toolkit for FPT University students: track exam revision on the FuOverflow (fuoverflow.com) and FuExam (fuexam.me) forums, and see your FAP timetable, exams and attendance in the popup.

• Checklist: tick exam threads you have reviewed, right in the thread list or on the thread page. A progress bar shows how far you are.
• Studying: opening a thread marks it "studying"; the list shows the question you reached (e.g. "question 8/60").
• In the image viewer: jump to any question, flag unsure ones, cover the answer to test yourself, and resume where you left off.
• Screenshots with the discussion panel: capture one question or the whole exam (including the answer comments) as a ZIP.
• FAP timetable (optional): your week as a table with exams highlighted. Press refresh and the extension opens FAP with your existing session, reads your timetable and attendance, then closes the tab. Hover a class to see your absences and how many you can still miss before the 20% limit.
• Grade components (optional): read from the course syllabus on FLM (flm.fpt.edu.vn), with each part's weight and minimum score in the tooltip. Click a class to open its syllabus on FLM.
• Google Drive sync (optional): progress, timetable and attendance follow you to another computer. Or export/import a JSON file.
• Google Calendar (optional): classes and exams in a separate calendar that follows FAP changes, never duplicated, with notification or email reminders.
• Tidier forums: hides FuExam's donate banner and FuOverflow's community pop-ups. On by default, each one switched off from the popup.

Privacy: no server of its own, no analytics, no remote code. Your data stays in your browser; only when you turn it on does the extension write to your own Google Drive and Google Calendar.

The interface is in Vietnamese. Not an official FuOverflow / FuExam / FPT University extension.

## Single purpose

A study companion for FPT University students: track which exam threads and questions they have reviewed on fuoverflow.com and fuexam.me (checklist, study progress, question flags, optional screenshots of the exam they are viewing) and see their own class timetable and attendance from fap.fpt.edu.vn, with each course's grade components from its syllabus on flm.fpt.edu.vn, in the popup, optionally kept in their own Google Drive and Google Calendar.

## Permission justifications

**storage**
Stores the user's study progress (reviewed threads, current question, flagged questions), the FAP timetable and attendance the user chose to load, and the extension's settings in chrome.storage.local on the user's device. Only if the user turns on Google Drive sync is the same data copied to one file in the app's hidden folder of the user's own Drive. Nothing is sent to the developer.

**identity**
Used only for the optional Google Drive and Google Calendar sync: when the user presses the account button or turns on Google Calendar, chrome.identity.launchWebAuthFlow opens Google's sign-in window. The extension asks for openid, email, profile (to show which account is signed in), drive.appdata (one file in the app's hidden folder of the user's own Drive) and, only when the user turns on Google Calendar, calendar.app.created (one calendar the extension creates for the user's classes and exams). No other Google data is accessed.

**scripting**
Used only for the optional FAP timetable, and only when the user presses refresh (or "Bật thời khóa biểu" the first time): in a tab that the extension opens and closes, chrome.scripting.executeScript reads the weekly timetable from fap.fpt.edu.vn/WeeklyTimetable, the per-course attendance counts from fap.fpt.edu.vn/Report/Attendance and, if the user allowed flm.fpt.edu.vn, each course's grade components from its syllabus on flm.fpt.edu.vn. In that same tab it shows a progress card while reading, and a card asking the user to sign in when FAP or FLM needs it. FAP or FLM tabs the user opens are never touched. No code is injected into any other site.

**Host permissions** (one field covers the forum hosts and the optional <all_urls>)
fuoverflow.com and fuexam.me (and their subdomains): the content scripts add the checklist checkbox, progress badges and the question-jump panel to these two forums only. Optional <all_urls> is requested at runtime and narrowed to what the user asks for: https://fap.fpt.edu.vn/* and https://flm.fpt.edu.vn/* when they press "Bật thời khóa biểu" (to read their own timetable and attendance, and their courses' grade components; users who turned the timetable on before see a card in the popup with a button to allow FLM), or <all_urls> when they press "Cho phép chụp màn hình", because chrome.tabs.captureVisibleTab needs it for the screenshot buttons inside the forum's image viewer (activeTab is not granted by clicks inside a page). It is used only to capture the visible forum tab when the user presses a capture button. Nothing is read from or injected into other sites.

**Remote code**
No. All code is packaged in the extension. (The current dashboard no longer asks this.)

## Data usage (privacy practices form)

- Collected data:
  - "Website content" only if the user turns on the FAP timetable: their weekly class timetable and per-course attendance counts are read from fap.fpt.edu.vn, and the grade components of their courses from flm.fpt.edu.vn, and stored locally in chrome.storage.local to display in the popup. Grade components stay on the device and are not synced.
  - "Personally identifiable information" (name, email address, profile picture) and "Authentication information" (a Google access token) only if the user signs in for Google Drive sync: shown in the popup to say which account is signed in; the token is kept in memory to call the Drive API.
  - With Drive sync on, the study data, timetable and attendance are written to the user's own Google Drive (hidden app-data folder). With Calendar sync on, the classes and exams are written as events to a calendar the extension creates in the user's own Google Calendar. Nothing is sent to the developer or any other party.
  - Nothing else is collected (no health, financial, personal communications, location, web history or user activity).
- Certifications (tick all three):
  - I do not sell or transfer user data to third parties, outside of the approved use cases.
  - I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL

https://cdinhh.github.io/Extension-FU-Study-Kit/privacy.html

## Screenshots (1280×800)

`store/screenshots/`:

1. `01-list.png`: thread list with checkboxes, badges and the progress bar.
2. `02-lightbox.png`: image viewer with the question grid, flagged questions and screenshot tools.
3. `03-popup.png`: popup with the FAP timetable and the attendance tooltip (light theme). Retake for 2.2.x so the tooltip shows the grade components.
4. `04-account.png`: account menu with Google Drive sync and the Google Calendar options (dark theme).
5. `05-fuexam.png`: the checklist and progress bar on FuExam.

## Promo tiles

- Small (440×280): `store/promo-small.png`.
- Marquee (1400×560): `store/promo-marquee.png`.

## Packaging

Commit first, then run from the repository root (PowerShell or Git Bash). `git archive` packs the
committed files with forward-slash paths, which the Chrome Web Store expects (PowerShell 5.1's
`Compress-Archive` writes backslashes).

```sh
mkdir -p dist
git archive --format=zip -o dist/fu-study-kit-2.2.1.zip HEAD manifest.json background.js drive.js calendar.js content.js content.css lightbox.js lightbox.css popup.html popup.css popup.js lib assets/fonts assets/icons/icon-16.png assets/icons/icon-32.png assets/icons/icon-48.png assets/icons/icon-128.png assets/icons/avatar.jpg
```

This leaves out `docs`, `tests`, `store`, the READMEs and the 512 px logo master. `dist/` is ignored
by git. Unzip it into an empty folder and load it with "Load unpacked" to smoke-test before uploading.

## After the first upload

The Web Store gives the item its own extension id, different from the unpacked one. Google sign-in
redirects to `https://<extension-id>.chromiumapp.org/`, so add that URI (with the store id) to the
OAuth client's **Authorized redirect URIs** in Google Cloud (store id `galbpjelfcjibchlldbobcghedbccoke`, so `https://galbpjelfcjibchlldbobcghedbccoke.chromiumapp.org/`), or sign-in fails with
`redirect_uri_mismatch`. Data saved by an unpacked copy does not move to the store copy by itself:
use Export / Import, or Google Drive sync.
