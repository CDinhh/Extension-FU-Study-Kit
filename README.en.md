# FU Study Kit: Exam Checklist & FAP Timetable

[Tiếng Việt](README.md) · **English**

A Manifest V3 browser extension for the [FuOverflow](https://fuoverflow.com) and
[FuExam](https://fuexam.me) forums that tracks your exam revision and shows your FAP timetable:

- tick the exams you have finished, right in the thread list or inside the exam;
- see which exams you are studying and the question you reached, right in the list;
- jump to any question while viewing exam images, and flag the ones you are unsure about;
- **automatically screenshot every question together with its answer discussion** (zipped for you);
- **see your FAP weekly timetable and attendance report in the popup** (optional, refreshes itself, always shows when it was last updated);
- move your data to another computer with **Export/Import**.

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
- **Answer cover** (crossed-eye button): adds a frosted cover over the image. Drag to move, drag a
  corner to resize, hold the eye button to peek, `×` to remove. Covers are remembered per exam on
  this computer, stay in place when you change question, and hide themselves in screenshots.
- **"Gắn cờ"**: flags the current question as unsure. Once there are flags, **"Câu cờ tiếp theo"**
  jumps to the next flagged one.
- **"Chụp câu này"**: screenshots the current question with its discussion as one PNG.
- **"Chụp nhiều"**: choose
  - **Câu** (questions): all, or flagged only;
  - **Nội dung** (content): with answers (question image + discussion) or exam only (image only);
  - **Tốc độ** (speed) per question (0.5 s – 1.5 s) so images and comments have time to load;

  then press **"Bắt đầu chụp"**. The result is a ZIP such as `fuexam-<id>-kem-chat-tat-ca.zip` or
  `fuoverflow-<id>-chi-de-cau-co.zip`. **"Dừng"** stops at any time, and capture pauses when you
  switch tabs.

**First capture:** the browser needs permission to capture tabs. Click the extension icon in the
toolbar → **"Cho phép"** (allow). The extension only captures when you press a capture button.

### FAP timetable in the popup

- Off by default. Press **"Bật thời khóa biểu"** in the popup and the browser asks for access to
  `fap.fpt.edu.vn`.
- The extension opens the WeeklyTimetable page in a background tab with your existing session, reads
  every week it can (past and upcoming), stores it on your computer and shows it as a table.
- Use `‹` `›` to change week and click the dates to return to this week. **Exams** get their own colour.
- A status line always shows the last update. Opening the popup refreshes a timetable older than one
  hour, or press the refresh button.
- If your FAP session has expired, the extension opens a FAP tab so you can sign in (any sign-in
  method works), then the timetable updates by itself.
- **Attendance:** after the timetable, the extension goes through each course on the attendance
  report page for the current term. Hover (or Tab to) a class in the timetable to see the full course
  name, whether you attended that session, absences / total sessions and an "absence allowance" bar
  (FPT allows at most 20% of sessions): **"Còn vắng được N buổi"** (N more allowed), **"Hết lượt vắng"**
  (none left) or **"Quá 20%"** (over the limit). Classes of a course with no absences left get an
  amber bottom edge; over the limit, a red one.

### Popup: studied subjects, Export/Import

Click the extension icon to see the subjects you have studied on each forum, most recent first.

- Each subject is a chip with its number of exams. Click a chip to list its exams with their status
  (**Đã ôn** finished, **Câu x/N** question reached, or **Đang học** studying) and flag count. Click an
  exam to open it, or **"Mở môn ↗"** to open the subject's forum.
- With 7 or more subjects, the older ones fold into a `+N` chip.
- Exam and subject names are recorded when you open an exam or a subject page. Exams studied before
  this update, or on another computer, show as "Đề #id" under "Khác" (other) until you open them again.
- Click a forum's name to open its home page.

At the bottom of the popup:

- **"Xuất dữ liệu"** (export): downloads `fu-exam-checklist-YYYY-MM-DD.json`.
- **"Nhập dữ liệu"** (import): pick a file exported on another computer. Data is **merged** (the newer
  entry wins, nothing is deleted), after a confirmation showing how many exams are added or updated.
  Invalid files are rejected.
- **Clean-up switches** (off by default, next to each forum name): "Ẩn Donate" on FuExam (the floating
  donate banner at the bottom of the screen) and "Ẩn popup" on FuOverflow (the "join the FuOverflow
  community" box and the "Công cụ hỗ trợ học tập" promo, closed with the page's own close button).
  They take effect immediately, no reload needed.
- Data stays on this computer; the extension does not use Chrome Sync. To switch computers, export on
  the old one and import on the new one.

## Installation (Brave / Chrome)

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and choose this folder (if already installed, click the extension's **Reload**).
4. Open a forum page, e.g. https://fuoverflow.com/forums/MLN111/ or https://fuexam.me/.

> After updating the extension, click **Reload** on the extensions page, then reload (F5) the forum tab.
> If you forget, the panel shows a dialog asking you to reload the page.

Upgrading from 1.x: old data in FuOverflow's `localStorage` is moved over automatically the first
time you open the site (the old copy is kept as a backup).

## Privacy

The extension collects nothing, sends nothing, has no analytics and loads no remote code. Details:
[PRIVACY.md](PRIVACY.md).

## Development

- Requires Brave/Chrome 111 or later (Manifest V3, the image-viewer script runs in `"world": "MAIN"`).
- No build step and no dependencies. Data logic lives in `lib/store-core.js` (plain JS) and
  `lib/storage.js` (`chrome.storage`).
- Run the tests (Node ≥ 18): `node --test`
- Publishing to the Chrome Web Store: see [store/listing.md](store/listing.md).
