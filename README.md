# Exam Checklist for FuOverflow & FuExam

Extension trình duyệt (Manifest V3) cho hai diễn đàn [FuOverflow](https://fuoverflow.com) và
[FuExam](https://fuexam.me), giúp bạn theo dõi việc ôn đề thi:

- đánh dấu những đề đã ôn xong ngay trên danh sách thread hoặc ngay trong đề;
- theo dõi đề đang học và câu đang làm dở ngay trên danh sách đề;
- nhảy nhanh tới câu bất kỳ khi xem ảnh đề, gắn cờ những câu chưa chắc;
- **chụp màn hình tự động toàn bộ câu hỏi kèm khung chat thảo luận đáp án** (nén sẵn file ZIP);
- mang dữ liệu sang máy khác bằng **Xuất/Nhập file**, hoặc tự đồng bộ qua **Chrome Sync**.

> Không phải extension chính thức của FuOverflow / FuExam.

![Danh sách đề](store/screenshots/01-list.png)

## Tính năng

### Checklist đề đã ôn

- Checkbox trước tiêu đề mỗi thread trong danh sách (và ở tiêu đề trang chi tiết đề).
- Thread đã tick bị gạch ngang và có nhãn **"Đã ôn xong"**.
- Thanh tiến độ cho biết tổng số đề đã ôn / đang học và số đề trên trang hiện tại.

### Theo dõi đề đang học & tiến độ câu

- Bấm vào một đề (hoặc mở trang đề) là đề đó được đánh dấu **"Đang học"**.
- Xem tới câu nào trong lightbox thì danh sách hiện **"Đang học tới câu 8/60"**.
- Mở lại đề từ câu 1, panel có nút **"Tiếp tục câu X"** để quay về chỗ đang học.
- Rê chuột vào nhãn "Đang học" sẽ hiện nút `×` để xoá trạng thái nếu bấm nhầm.

### Nhảy câu, gắn cờ & chụp màn hình trong lightbox

![Lightbox](store/screenshots/02-lightbox.png)

Khi mở ảnh đề, cột bên phải có panel điều khiển:

- **"Câu x/N"**: mở bảng số để nhảy thẳng tới câu bất kỳ.
- **Che đáp án** (nút con mắt gạch): thêm vùng che kính mờ nổi trên ảnh đề, kéo để di chuyển, kéo góc
  để đổi cỡ, giữ nút con mắt để xem nhanh, `×` để bỏ. Vùng che được nhớ theo từng đề trên máy này,
  giữ nguyên khi chuyển câu và tự ẩn khi chụp màn hình.
- **"Gắn cờ"**: đánh dấu câu đang xem là chưa chắc. Khi đã có cờ sẽ hiện thêm **"Câu cờ tiếp theo"**.
- **Chụp câu này**: chụp câu đang xem kèm khung chat, tải về 1 file PNG.
- **Chụp nhiều**: chọn
  - **Câu**: Tất cả hoặc chỉ các câu có cờ;
  - **Nội dung**: Kèm đáp án (ảnh câu hỏi + khung chat thảo luận) hoặc Chỉ đề (chỉ ảnh đề);
  - **Tốc độ** mỗi câu (0.5s – 1.5s) để ảnh và bình luận kịp tải;

  rồi bấm **Bắt đầu chụp**. Kết quả nén thành ZIP, ví dụ `fuexam-<id>-kem-chat-tat-ca.zip` hoặc
  `fuoverflow-<id>-chi-de-cau-co.zip`. Có nút **Dừng** bất kỳ lúc nào, tự tạm dừng khi bạn chuyển tab.

**Lần đầu chụp** trình duyệt cần quyền chụp tab: bấm icon extension trên thanh công cụ →
**"Cho phép"**. Extension chỉ chụp khi bạn bấm nút chụp.

### Popup: thống kê, Xuất/Nhập, đồng bộ

Bấm icon extension để xem số đề đã ôn / đang học / câu gắn cờ của từng diễn đàn.

- **Xuất dữ liệu**: tải về `fu-exam-checklist-YYYY-MM-DD.json`.
- **Nhập dữ liệu**: chọn file đã xuất ở máy khác. Dữ liệu được **gộp** (bản mới hơn được giữ, không xoá
  gì), có bước xác nhận cho biết bao nhiêu đề được thêm / cập nhật. File sai định dạng bị từ chối.
- **Chrome**: nếu đăng nhập Chrome và bật Sync, dữ liệu tự đồng bộ giữa các máy.
  **Brave**: không đồng bộ được, dùng Xuất/Nhập file.

## Cài đặt (Brave / Chrome)

1. Mở `brave://extensions` (hoặc `chrome://extensions`).
2. Bật **Developer mode** ở góc trên bên phải.
3. Bấm **Load unpacked** và chọn thư mục này (đã cài rồi thì bấm **Reload** của extension).
4. Mở một trang diễn đàn, ví dụ https://fuoverflow.com/forums/MLN111/ hoặc https://fuexam.me/.

> Sau khi cập nhật extension, bấm **Reload** ở trang extensions rồi **F5** lại tab diễn đàn.
> Nếu quên F5, panel sẽ hiện hộp thoại nhắc tải lại trang.

Nâng cấp từ bản 1.x: dữ liệu cũ trong `localStorage` của FuOverflow được chuyển sang tự động ở lần
mở trang đầu tiên (bản cũ vẫn được giữ lại làm dự phòng).

## Quyền riêng tư

Extension không thu thập, không gửi dữ liệu, không analytics, không tải code từ xa. Chi tiết:
[PRIVACY.md](PRIVACY.md).

## Phát triển

- Cần Brave/Chrome từ bản 111 (Manifest V3, script lightbox chạy trong `"world": "MAIN"`).
- Không có build step hay dependency. Logic dữ liệu nằm trong `lib/store-core.js` (thuần JS) và
  `lib/storage.js` (`chrome.storage`).
- Chạy test (Node ≥ 18): `node --test`
- Đóng gói lên Chrome Web Store: xem [store/listing.md](store/listing.md).
