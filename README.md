# Bot Trợ Lý "Thầy Minh Piano" 🎹

Hệ thống AI Chatbot và Trợ lý duyệt tin nhắn học viên cho Thầy Minh Piano, xây dựng theo kế hoạch chi tiết tại [ke-hoach-xay-dung-bot-thay-minh.md](ke-hoach-xay-dung-bot-thay-minh.md).

---

## 🌟 Tính Năng Nổi Bật

1. **Bộ Lọc Phân Loại Nhạy Cảm 2 Lớp (Đỏ - Vàng - Xanh)**:
   - 🔴 **CỜ ĐỎ**: Tự động chặn và cảnh báo các ca nhạy cảm cao (học viên bị ung thư, nằm viện, tang sự, khủng hoảng tâm lý...). Tuyệt đối không níu kéo, chỉ an ủi, tôn trọng quyết định tạm ngưng/hoàn tiền và bắt buộc người thật duyệt.
   - 🟡 **CỜ VÀNG**: Các ca hỏi bài, phân tích kỹ thuật ngón, xin bảo lưu khóa học thông thường...
   - 🟢 **CỜ XANH**: Chào hỏi, hỏi thăm, động viên tập đàn 15 phút.
2. **Sinh 5 Phương Án Trả Lời Tối Ưu**:
   - Phương án 1: Tình cảm & Đồng cảm sâu sắc
   - Phương án 2: Kỹ thuật & Sư phạm chuẩn (chuẩn xác từng giây theo clip, sửa rotation, xếp ngón...)
   - Phương án 3: Rõ ràng theo Quy định & Chính sách (Policy bảo lưu 90 ngày, hoàn 2tr800...)
   - Phương án 4: Ngắn gọn & Súc tích
   - Phương án 5: Khích lệ & Động lực tích cực
3. **Form "Bắt Bệnh Ngón Đàn" Chuẩn Văn Phong Thầy Minh (Ảnh 2)**:
   - Hỗ trợ xưng hô (thầy - em, thầy - chị...)
   - Bệnh cũ, chỉ định cũ, bệnh hiện tại, chỉ định hiện tại, số ngày hẹn nộp bài.
4. **Kho Quản Lý & Nạp Tài Liệu Trực Tiếp (Knowledge Base)**:
   - Xem và chỉnh sửa trực tiếp `persona.md`, `policy.md`, `red_flags.json`, `few_shots.json`, `raw_messages.txt` ngay trên giao diện web.
   - Khi bấm lưu, dữ liệu được cập nhật tức thì vào bộ nhớ AI cho các lần phân tích tiếp theo.
5. **Duyệt, Tùy Chỉnh & Nhật Ký Gửi**:
   - Cho phép chọn 1 trong 5 gợi ý, sửa nhanh trong khung soạn thảo trước khi sao chép hoặc xác nhận gửi.
   - Lưu lại lịch sử các câu trả lời đã duyệt để liên tục tối ưu hệ thống (Feedback loop).
6. **Mẫu Tin Nhắn Thử Nghiệm 1-Click**:
   - Có sẵn các nút test nhanh lấy trực tiếp từ dữ liệu ảnh thực tế (Ảnh 1 đến Ảnh 7).

---

## 🚀 Hướng Dẫn Khởi Động

Dự án được viết bằng **Node.js thuần**, không phụ thuộc vào `node_modules` ngoài, cực kỳ nhẹ và chạy ngay lập tức:

```bash
# Khởi động server (chạy trên cổng 3000)
node server.js
```

Sau đó mở trình duyệt và truy cập:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🔑 Cấu Hình Gemini API Key

- Bạn chỉ cần dán **Gemini API Key** vào ô ở góc trên bên phải màn hình web và bấm **Lưu Key**.
- Key được lưu an toàn trong `localStorage` trên trình duyệt của bạn và tự động gửi kèm mỗi request phân tích.
- Nếu chưa có API Key, bạn vẫn có thể bấm vào các nút **Mẫu tin nhắn thử nghiệm** ở trên cùng để xem demo hoạt động ngay lập tức với dữ liệu mẫu!

---

## 📁 Cấu Trúc Thư Mục

```
chatbot_TTD/
├── data/
│   ├── persona.md          # Hồ sơ văn phong, xưng hô, khẩu ngữ nè/ha/nhen, kỹ thuật bắt bệnh ngón
│   ├── policy.md           # Số liệu cứng: khóa 20 tuần, bảo lưu tối đa 90 ngày, hoàn 2.800.000đ
│   ├── red_flags.json      # Danh mục từ khóa cờ đỏ (ung thư, cấp cứu, trầm cảm, đám tang...)
│   ├── few_shots.json      # Các ví dụ hội thoại mẫu Xanh/Vàng/Đỏ
│   └── raw_messages.txt    # Toàn bộ tin nhắn gốc được cung cấp từ ảnh 1 -> 7
├── public/
│   ├── index.html          # Giao diện web chính
│   ├── style.css           # Giao diện hiện đại, responsive
│   └── app.js              # Xử lý tương tác, gọi API, nạp tài liệu
├── ke-hoach-xay-dung-bot-thay-minh.md # Kế hoạch kiến trúc ban đầu
├── server.js               # Backend Node.js siêu nhẹ phục vụ Web & API
└── README.md
```
