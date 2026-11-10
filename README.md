<div align="center">

<img src="assets/icons/icon-128.png" width="88" alt="FU Study Kit">

# FU Study Kit

**Ôn đề có kế hoạch, không lỡ buổi học hay lịch thi nào.**

[**Tải v2.1.0**](https://github.com/CDinhh/Extension-FU-Study-Kit/releases/latest) ·
[Trang chủ](https://cdinhh.github.io/Extension-FU-Study-Kit/vi/) ·
[Quyền riêng tư](https://cdinhh.github.io/Extension-FU-Study-Kit/vi/privacy.html) ·
[Báo lỗi](https://github.com/CDinhh/Extension-FU-Study-Kit/issues) ·
[English](README.en.md)

</div>

| Thời khóa biểu và điểm danh FAP | Tài khoản Google: Drive và Calendar |
|---|---|
| ![Popup với thời khóa biểu và tooltip điểm danh](store/screenshots/03-popup.png) | ![Menu tài khoản với đồng bộ Drive và Calendar](store/screenshots/04-account.png) |
| **Checklist đề đã ôn trên FuOverflow / FuExam** | **Nhảy câu, gắn cờ, chụp kèm thảo luận** |
| ![Danh sách đề với checkbox và thanh tiến độ](store/screenshots/01-list.png) | ![Khung xem ảnh đề với bảng số câu](store/screenshots/02-lightbox.png) |

## Tính năng

- **Thời khóa biểu FAP** ngay trong popup: đủ mọi tuần trong kỳ, lịch thi tô màu riêng, luôn ghi lần cập nhật gần nhất.
- **Điểm danh**: rê chuột vào một buổi học để xem đã vắng bao nhiêu, còn được vắng mấy buổi trước mức 20%.
- **Checklist đề đã ôn** trên FuOverflow và FuExam, kèm đề đang học và câu đang làm dở.
- **Khung xem ảnh đề**: nhảy tới câu bất kỳ, gắn cờ câu chưa chắc, che đáp án, chụp toàn bộ câu kèm khung thảo luận thành file ZIP.
- **Môn đã ôn** trong popup, bấm là mở thẳng đề hoặc trang môn.
- **Google Drive** (tùy chọn): tiến độ, thời khóa biểu và điểm danh theo bạn sang máy khác.
- **Google Calendar** (tùy chọn): buổi học và lịch thi vào một lịch riêng, tự sửa khi FAP đổi, không tạo trùng, nhắc qua thông báo hoặc email.
- Giao diện sáng/tối, xuất/nhập JSON.

## Cài đặt

Tải file ZIP ở [bản phát hành mới nhất](https://github.com/CDinhh/Extension-FU-Study-Kit/releases/latest) rồi giải nén. Mở `chrome://extensions`, bật **Developer mode**, bấm **Load unpacked** và chọn thư mục vừa giải nén. Chạy trên Chrome, Edge, Brave và các trình duyệt Chromium khác.

## Quyền riêng tư

Không có server riêng, không analytics, không quảng cáo. Dữ liệu nằm trong trình duyệt của bạn. Khi đăng nhập Google, tiện ích chỉ ghi một file vào thư mục ẩn của chính nó trên Drive (quyền `drive.appdata`) và, nếu bạn bật, quản lý một lịch do nó tạo (quyền `calendar.app.created`). Xem thêm ở [chính sách quyền riêng tư](https://cdinhh.github.io/Extension-FU-Study-Kit/vi/privacy.html).

Không phải sản phẩm chính thức của FuOverflow, FuExam hay Đại học FPT.

## Phát triển

Không có build step hay dependency. Chạy test: `node --test`. Muốn tự build với tài khoản Google của bạn: bật Google Drive API và Google Calendar API trong một project Google Cloud, tạo OAuth client loại **Web application** với redirect URI `https://<extension-id>.chromiumapp.org/`, rồi thay `DRIVE_CLIENT_ID` trong `drive.js`.

Dùng font [Be Vietnam Pro](https://github.com/bettergui/BeVietnamPro) (OFL) và icon [Font Awesome Free](https://fontawesome.com) trên trang web.
