# FU Study Kit: Exam Checklist & FAP Timetable

[Tiếng Việt](README.md) · **English**

A Manifest V3 browser extension for FPT University students: track exam revision on the
[FuOverflow](https://fuoverflow.com) and [FuExam](https://fuexam.me) forums, and see your FAP timetable
right in the popup.

- Tick the exams you have finished, and see which ones you are studying and the question you reached,
  right in the thread list.
- Jump to any question while viewing exam images, flag the ones you are unsure about, cover the answer to
  test yourself.
- **Automatically screenshot every question together with its answer discussion**, zipped for you.
- **Your FAP weekly timetable, exams and attendance report** in the popup (optional).
- **Sync to other computers through Google Drive**, and **put your classes into Google Calendar**
  (optional).

> Not an official extension of FuOverflow, FuExam or FPT University.

The extension's interface is in Vietnamese; button names below are quoted as they appear, with a
translation.

![Thread list](store/screenshots/01-list.png)

## Features

### Revision checklist

- A checkbox before each thread title in the list (and on the exam page title).
- Ticked threads are struck through and labelled **"Đã ôn xong"** (finished).
- A progress bar shows how many exams you have finished or are studying, overall and on the current page.

### Studying status and question progress

- Clicking an exam (or opening its page) marks it **"Đang học"** (studying).
- The question you reach in the image viewer shows in the list, e.g. **"Đang học tới câu 8/60"**.
- Reopen the exam at question 1 and the panel offers **"Tiếp tục câu X"** to jump back.
- Hover the "Đang học" label to get a `×` that clears the status if you clicked by mistake.

### Question jump, flags and screenshots in the image viewer

![Image viewer](store/screenshots/02-lightbox.png)

When an exam image is open, a control panel sits on the right:

- **"Câu x/N"**: opens a number grid to jump straight to any question.
- **Answer cover** (crossed-eye button): adds a frosted cover over the image. Drag to move, drag a corner
  to resize, hold the eye button to peek, `×` to remove. Covers are remembered per exam on this computer,
  stay in place when you change question, and hide themselves in screenshots.
- **"Gắn cờ"**: flags the current question as unsure. Once there are flags, **"Câu cờ tiếp theo"** jumps
  to the next flagged one.
- **"Chụp câu này"**: screenshots the current question with its discussion as one PNG.
- **"Chụp nhiều"**: choose **Câu** (all questions or flagged only), **Nội dung** (with answers or exam
  only) and **Tốc độ** (0.5–1.5 s per question so images and comments can load), then press
  **"Bắt đầu chụp"**. The result is a ZIP such as `fuexam-<id>-kem-chat-tat-ca.zip`. **"Dừng"** stops at
  any time, and capture pauses when you switch tabs.

**First capture:** the browser needs permission to capture tabs. Click the extension icon in the toolbar
→ **"Cho phép"** (allow). The extension only captures when you press a capture button.

### FAP timetable, exams and attendance

- Off by default. Press **"Bật thời khóa biểu"** in the popup and the browser asks for access to
  `fap.fpt.edu.vn`.
- The extension opens the WeeklyTimetable page in a background tab with your existing session, reads every
  week (past and upcoming), then reads the attendance report of each course in the term. The tab closes
  when done. If your FAP session has expired, the tab comes forward so you can sign in (any method works)
  and the data updates by itself.
- The timetable shows as a table. Use `‹` `›` to change week and click the dates to return to this week.
  **Exams** get their own colour.
- A status line always shows the last update. Opening the popup refreshes a timetable older than one hour;
  the refresh button updates it now, and the ↗ button opens the FAP timetable page in a new tab.
- **Attendance:** hover (or Tab to) a class in the timetable to see the course code, class, time, room,
  lecturer, whether you attended that session, and the course's attendance: **"Đã vắng"** (absences, e.g.
  3/20 sessions, 15%), **"Được vắng tối đa"** (the 20% allowance) and **"Còn được vắng"** (absences left).
  Classes of a course with no absences left get an amber bottom edge; over the limit, a red one.

### Studied subjects in the popup

- Each forum lists the subjects you have studied, most recent first. Each subject is a chip with its number
  of exams; with 7 or more, the older ones fold into a `+N` chip.
- Click a chip to list its exams with their status (**Đã ôn** finished, **Câu x/N** question reached, or
  **Đang học** studying) and flag count. Click an exam to open it, **"Mở môn ↗"** to open the subject's
  forum, or a forum's name to open its home page.
- Exam and subject names are recorded when you open an exam or a subject page. Exams studied before that
  show as "Đề #id" under "Khác" (other) until you open them again.
- **Clean-up switches** (off by default, next to each forum name): "Ẩn Donate" on FuExam (the floating
  donate banner) and "Ẩn popup" on FuOverflow (the "join the community" box and the "Công cụ hỗ trợ học
  tập" promo, closed with the page's own close button). They take effect immediately, no reload needed.

### Google account: Drive and Calendar (optional)

Press the cloud button at the top of the popup and sign in with Google. Then click your avatar to open the
account menu; each section has a **(?)** icon with the details.

- **Google Drive:** study progress, thread titles, the timetable, attendance and the Calendar settings are
  kept in the extension's own hidden folder in your Drive (scope `drive.appdata`; it cannot see any other
  file). Synced when the popup opens and a few seconds after each change; when two computers change the
  same thing, the newer change wins. A computer not signed in to FAP still shows the timetable from Drive.
  **"Đồng bộ ngay"** syncs now.
- **Google Calendar:** turn on the **Google Calendar** switch and grant access. Classes and exams are added
  to a separate calendar named **"FU Study Kit – Lịch học"** (scope `calendar.app.created`; the extension
  cannot read or change your other calendars).
  - When FAP changes, the events follow; a class that moved or was cancelled loses its old event. No
    duplicates.
  - Options: add **"Buổi học"** (classes) and/or **"Lịch thi"** (exams); **"Nhắc qua"** (remind by
    notification, email or both); **"Nhắc buổi học trước"** / **"Nhắc lịch thi trước"** (how long before a
    class / an exam, from none and 15 minutes to 2 days).
  - **"Xoá lịch đã thêm"** (press twice to confirm) deletes that calendar and turns Calendar sync off.
- **"Đăng xuất"** (sign out) at the bottom of the menu revokes access and forgets the account on this
  computer. Your Drive data and calendar stay.

### Export / Import

At the bottom of the popup, for anyone who would rather not sign in:

- **"Xuất dữ liệu"** (export): downloads `fu-exam-checklist-YYYY-MM-DD.json` (study progress on both forums).
- **"Nhập dữ liệu"** (import): pick a file exported on another computer. Data is **merged** (the newer
  entry wins, nothing is deleted), after a confirmation showing how many exams are added or updated.
  Invalid files are rejected.

### Look

- Light / dark theme follows your system; the round ◐ button at the top of the popup switches it and the
  choice is remembered.
- The popup header and footer stay put while the cards scroll.

## Installation (Brave / Chrome)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and choose this folder (if already installed, click the extension's **Reload**).
4. Open a forum page, e.g. https://fuoverflow.com/forums/MLN111/ or https://fuexam.me/.

> After updating the extension, click **Reload** on the extensions page, then reload (F5) the forum tab.
> If you forget, the panel shows a dialog asking you to reload the page.

Upgrading from an older version:

- Data in FuOverflow's `localStorage` (version 1.x) is moved over automatically the first time you open
  the site.
- Data synced through Chrome Sync (version 2.0) is moved back to the computer once; the extension no longer
  uses Chrome Sync.

## Privacy

The extension has no server of its own, sends no data to its author or any third party, has no analytics
and loads no remote code. Your data stays on your computer; only when you turn it on does the extension
read FAP and write to your own Google Drive / Google Calendar. Details: [PRIVACY.md](PRIVACY.md).

## Development

- Requires Brave/Chrome 111 or later (Manifest V3, the image-viewer script runs in `"world": "MAIN"`).
- No build step and no dependencies.
  - `lib/store-core.js`: plain-JS data logic (merging, import checks, the Drive copy, Calendar events).
  - `lib/storage.js`: `chrome.storage` access.
  - `background.js`: reads FAP; `drive.js` and `calendar.js`: Google sign-in, Drive and Calendar (in the
    service worker).
- Run the tests (Node ≥ 18): `node --test`
- **Google sign-in in your own build:** create a Google Cloud project, enable the **Google Drive API** and
  the **Google Calendar API**, create an OAuth client of type **Web application** with the redirect URI
  `https://<extension-id>.chromiumapp.org/`, and put its client ID in `DRIVE_CLIENT_ID` in `drive.js`.
  While the app is in Testing, add your account under **Test users**.
- Publishing to the Chrome Web Store: see [store/listing.md](store/listing.md).
