# Bot Trợ Lý "Thầy Minh Piano" 🎹

Hệ thống AI Chatbot và Trợ lý soạn thảo, duyệt phản hồi học viên cho Thầy Minh Piano theo kiến trúc bền vững: **Node.js LTS thuần + SQLite WAL + Server-side Gemini API**.

---

## 🌟 Tính Năng Cốt Lõi

1. **Giao diện Web Widget tinh giản (Không tài khoản, Không lộ Secret)**:
   - Luồng nghiệp vụ tối ưu: **Mở → Dán tin nhắn/ngữ cảnh → Tạo gợi ý → Chọn/Sửa → Sao chép → Lưu phản hồi**.
   - Không có màn hình đăng nhập, đăng ký, tài khoản nhân viên hay dashboard quản trị rườm rà.
   - Toàn bộ kết quả truy cập được bảo vệ bằng token ngẫu nhiên riêng (`X-Job-Token`), lưu trữ trong `sessionStorage` giúp khôi phục phiên làm việc sau khi tải lại trang.

2. **Hàng đợi & Worker nền bền vững (Resilient Job Queue)**:
   - Xử lý bất đồng bộ qua bảng `jobs` trong SQLite với cơ chế khóa nguyên tử bằng **Lease**, giới hạn thời gian chạy (timeout 30s/lần gọi, deadline tổng 120s, tối đa 2 lần retry cho lỗi tạm thời).
   - Chống gửi trùng và tranh chấp bằng `Idempotency-Key` và đối chiếu mã băm token an toàn.

3. **Kho Tri Thức Có Phiên Bản & Quản Trị Bằng CLI (Versioned Knowledge Engine)**:
   - Dữ liệu tuân thủ chuẩn Schema 1.0 của đối tác (`docs/doi-tac-data/`): Persona, Policies, FAQs, Safety Rules, Conversations.
   - Hỗ trợ hợp nhất Delta trên Snapshot cha, kiểm tra xung đột thời hạn chính sách, bảo toàn toàn vẹn tham chiếu.
   - Thao tác xuất bản (**Publish**) và hoàn tác (**Rollback**) diễn ra tức thời (<5ms) qua transaction kiểm tra `revision` (Compare-And-Swap), đảm bảo **0 downtime** và các yêu cầu đang chạy không bị xáo trộn phiên bản.

4. **Bảo Vệ Đa Lớp & Xử Lý Ca Đỏ An Toàn (Red Flag Safety Guard)**:
   - Bộ lọc cờ đỏ chạy độc lập trên quy tắc an toàn trước khi gọi AI.
   - Đối với ca đặc biệt nhạy cảm (bệnh nan y, tang sự, khủng hoảng tâm lý): tuyệt đối **không níu kéo**, không thúc ép bài vở, trả về mẫu đồng cảm đã được duyệt và hướng dẫn người thật xử lý.
   - Tách biệt hoàn toàn tập dữ liệu đánh giá (`split=eval`) khỏi ngữ cảnh truy xuất few-shot của mô hình.

5. **Vận Hành Bền Vững & Sao Lưu Trực Tuyến**:
   - Sao lưu trực tiếp SQLite Online qua lệnh `VACUUM INTO` mà không làm gián đoạn việc ghi WAL.
   - Kiểm định tính toàn vẹn cơ sở dữ liệu và checksum SHA-256 trước khi phục hồi.
   - Tự động dọn dẹp dữ liệu cũ (Job TTL 7 ngày, Feedback bảo lưu 90 ngày) có hỗ trợ chế độ xem trước `--dry-run`.

---

## 📁 Cấu Trúc Thư Mục

```text
chatbot_TTD/
├── bin/
│   ├── knowledge.js          # CLI quản lý tri thức (validate, import, diff, publish, rollback, status)
│   ├── backup.js             # CLI sao lưu SQLite trực tuyến (Online Backup)
│   ├── restore.js            # CLI kiểm thử toàn vẹn và khôi phục bản sao lưu
│   ├── cleanup.js            # CLI dọn dẹp dữ liệu hết hạn (Job & Feedback Retention)
│   └── migrate-demo-data.js  # Chuyển đổi dữ liệu demo cũ sang gói Schema 1.0 chuẩn
├── src/
│   ├── index.js              # Entrypoint chính: khởi động DB, Worker, HTTP server
│   ├── config.js             # Đọc và xác thực biến môi trường (.env)
│   ├── api/
│   │   └── server.js         # HTTP Server phục vụ API v1 và Web tĩnh an toàn
│   ├── db/
│   │   ├── index.js          # Kết nối SQLite với WAL, foreign keys, busy_timeout
│   │   ├── migrate.js        # Trình chạy migrations tự động
│   │   └── migrations/       # Các file schema SQL
│   ├── jobs/
│   │   ├── queue.js          # Quản lý hàng đợi job, idempotency và access token
│   │   └── worker.js         # Worker xử lý nền, atomic lease claim, backoff retry
│   ├── knowledge/
│   │   ├── validator.js      # Kiểm tra quy chuẩn Schema 1.0 của gói dữ liệu
│   │   ├── importer.js       # Hợp nhất delta snapshot và lưu bản nháp
│   │   ├── publisher.js      # Atomic publish CAS revision và rollback
│   │   └── retriever.js      # Truy xuất persona, policy hiệu lực, lọc eval few-shots
│   ├── providers/
│   │   ├── gemini.js         # Adapter gọi Google Gemini API có timeout & JSON Schema
│   │   ├── mock.js           # Provider giả lập cho kiểm thử và phát triển offline
│   │   └── index.js          # Bộ chọn provider
│   └── utils/
│       ├── crypto.js         # Băm SHA-256, sinh token và so sánh constant-time
│       └── text.js           # Chuẩn hóa tiếng Việt và so khớp từ khóa
├── public/
│   ├── index.html            # Giao diện widget tinh gọn (đã bỏ input key ở client)
│   ├── style.css             # Giao diện thanh lịch, responsive
│   └── app.js                # Xử lý luồng widget, polling job, sessionStorage
├── data/
│   ├── demo_knowledge_batch/ # Gói tri thức khởi tạo chuẩn Schema 1.0
│   └── ...                   # Dữ liệu nguồn ban đầu (được bảo tồn nguyên vẹn)
├── docs/
│   ├── IMPLEMENTATION-STATUS.md # Báo cáo tiến độ và bằng chứng kiểm thử
│   ├── OPERATIONS.md         # Sổ tay hướng dẫn vận hành và xử lý sự cố
│   └── doi-tac-data/         # Hướng dẫn và các tệp mẫu hợp đồng dữ liệu đối tác
├── tests/                    # Toàn bộ bộ kiểm thử tự động 21 test + Load + Soak
├── Dockerfile                # Docker container tối thiểu
├── docker-compose.yml        # Docker compose ràng buộc loopback 127.0.0.1
├── .env.example              # Mẫu biến môi trường không chứa bí mật
└── package.json              # Quản lý scripts và thông tin dự án
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Động

### Yêu cầu môi trường
- **Node.js**: Phiên bản 22.0.0 trở lên (khuyến nghị Node 22 hoặc 25 LTS).
- Dự án sử dụng hoàn toàn các module native (`node:sqlite`, `node:test`, `crypto`, `fetch`), **không yêu cầu cài đặt thêm thư viện bên ngoài**.

### 1. Cấu hình ban đầu
Sao chép file cấu hình mẫu:
```bash
cp .env.example .env
```
Mặc định hệ thống chạy với `PROVIDER=mock` (dành cho kiểm thử và phát triển mà không cần API key).

Để sử dụng AI thật từ Google Gemini, mở file `.env` và cập nhật:
```env
PROVIDER=gemini
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash
```

### 2. Khởi chạy Server
```bash
# Khởi chạy server ứng dụng (mặc định tại http://127.0.0.1:3000)
npm start

# Hoặc chế độ tự động reload khi sửa code (development)
npm run dev
```

Truy cập giao diện tại: 👉 **[http://127.0.0.1:3000](http://127.0.0.1:3000)**

---

## 📚 Quản Trị Tri Thức Qua CLI (bin/knowledge.js)

Tất cả các thao tác nhập và xuất bản tri thức đều thực hiện qua dòng lệnh trên server (không mở API HTTP công khai để sửa tài liệu):

```bash
# 1. Kiểm tra tính hợp lệ của gói dữ liệu đối tác bàn giao
node bin/knowledge.js validate data/demo_knowledge_batch

# 2. Nhập gói dữ liệu vào phiên bản nháp (Draft Version)
node bin/knowledge.js import data/demo_knowledge_batch

# 3. Xem khác biệt giữa phiên bản nháp và phiên bản active hiện tại
node bin/knowledge.js diff <version_id>

# 4. Xuất bản phiên bản tri thức thành Active
node bin/knowledge.js publish <version_id> --approved-by="Thầy Minh"

# 5. Hoàn tác về phiên bản trước (Rollback tức thì)
node bin/knowledge.js rollback <previous_version_id> --approved-by="Thầy Minh"

# 6. Xem trạng thái các phiên bản và phiên bản active
node bin/knowledge.js list
```

---

## 🛡️ Vận Hành: Sao Lưu, Khôi Phục & Dọn Dẹp

```bash
# Sao lưu cơ sở dữ liệu trực tuyến (Online Backup qua VACUUM INTO)
npm run backup

# Khôi phục và kiểm thử tính toàn vẹn vào thư mục cách ly
node bin/restore.js backups/backup_FILE.db restore_test/verify.db

# Dọn dẹp dữ liệu hết hạn (chạy thử nghiệm xem trước)
node bin/cleanup.js --dry-run

# Dọn dẹp dữ liệu hết hạn thực tế (Job > 7 ngày, Feedback > 90 ngày)
npm run cleanup
```

Xem hướng dẫn chi tiết các tình huống xử lý sự cố tại [docs/OPERATIONS.md](docs/OPERATIONS.md).

---

## 🧪 Kiểm Thử Tự Động (Test Suite)

Hệ thống đi kèm bộ kiểm thử toàn diện thực thi qua `node:test` native runner:

```bash
# Chạy toàn bộ 21 kiểm thử tự động (Unit & Integration)
npm test

# Chạy bài kiểm thử tải (10 clients đồng thời, import 1.000 mục, đo p95 API)
npm run test:load

# Chạy kiểm thử độ ổn định dài hạn (Soak Test)
npm run test:soak -- --seconds=30
```
