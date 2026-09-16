# Báo Cáo Tiến Độ Triển Khai Bot Trợ Lý Thầy Minh Piano

**Cập nhật lần cuối:** 2026-09-16  
**Trạng thái tổng thể:** Hoàn thành triển khai kỹ thuật & Kiểm thử đạt (Completed & Verified)

---

## 1. Hiện trạng hệ thống & Quyết định kỹ thuật đã chốt

- **Ngôn ngữ & Runtime:** Node.js v25.9.0 (tương thích hoàn toàn Node >= 22.0.0 LTS).
- **Phụ thuộc bên ngoài:** 0 dependencies bên ngoài (chỉ dùng các module chuẩn của Node.js: `node:sqlite`, `node:test`, `node:crypto`, `node:http`, `node:fs`, `node:stream`).
- **Cơ sở dữ liệu:** SQLite cục bộ trên ổ đĩa bền vững (`storage/app.db`), cấu hình `journal_mode = WAL`, `busy_timeout = 5000ms`, `foreign_keys = ON`, `synchronous = NORMAL`.
- **Hàng đợi công việc (Job Queue):** Bảng `jobs` quản lý trạng thái (`queued`, `running`, `succeeded`, `failed`), timeout 30s/lần gọi, deadline tổng 120s, tối đa 2 lần retry cho lỗi tạm thời. Khóa công việc nguyên tử bằng cơ chế **Lease** chống tranh chấp đa worker.
- **Bảo mật truy cập kết quả:** Token ngẫu nhiên riêng (`X-Job-Token`) do client tạo, server chỉ lưu mã băm SHA-256 (`access_token_hash`). Không sử dụng ID để cấp quyền xem hoặc lưu phản hồi.
- **Tri thức phiên bản:** Schema 1.0 theo chuẩn đối tác (`docs/doi-tac-data/`). Hợp nhất snapshot Delta, kiểm định xung đột ngày hiệu lực của chính sách, kiểm tra toàn vẹn tham chiếu.
- **Xuất bản & Hoàn tác:** Lệnh CLI `bin/knowledge.js publish` và `rollback` sử dụng transaction Compare-And-Swap (CAS) trên trường `revision`, đảm bảo **0 downtime** và yêu cầu đang xử lý không bị xáo trộn phiên bản tri thức ghim.
- **Provider AI:** Tách biệt adapter, chỉ đọc `GEMINI_API_KEY` từ server. Có `mockProvider` cho môi trường test và phát triển offline. Không có ô nhập key trên giao diện web; dọn dẹp key cũ trong localStorage của trình duyệt.
- **Giao diện Web Widget:** Tối giản theo luồng: **Dán tin nhắn → Tạo gợi ý → Chọn/Sửa → Sao chép → Lưu phản hồi**. Không tài khoản, không quản trị viên, khôi phục phiên qua `sessionStorage`.

---

## 2. Checklist chi tiết các giai đoạn

- [x] **Giai đoạn 1: Nền tảng & SQLite**
  - [x] Tạo `.env.example`, `.gitignore`, `package.json`, `package-lock.json`
  - [x] Module cấu hình `src/config.js` với kiểm tra tính hợp lệ lúc khởi động
  - [x] Kết nối SQLite với WAL, foreign keys, busy_timeout tại `src/db/index.js`
  - [x] Quản lý và thực thi migrations tại `src/db/migrate.js`
  - [x] Migration khởi tạo 8 bảng: `knowledge_versions`, `knowledge_items`, `knowledge_state`, `jobs`, `generations`, `feedback`, `import_batches`, `_migrations`

- [x] **Giai đoạn 2: Tri thức có phiên bản & CLI**
  - [x] Trình kiểm định gói dữ liệu `src/knowledge/validator.js` (kiểm tra schema 1.0, date range overlap, path traversal, ID dedup)
  - [x] Module nhập và hợp nhất snapshot Delta `src/knowledge/importer.js`
  - [x] Module xuất bản và hoàn tác nguyên tử `src/knowledge/publisher.js`
  - [x] Module truy xuất tri thức `src/knowledge/retriever.js` (loại bỏ `eval` split, lọc theo ngày hiệu lực)
  - [x] CLI quản lý tri thức `bin/knowledge.js` (`validate`, `import`, `diff`, `publish`, `rollback`, `list`)
  - [x] Script di chuyển dữ liệu demo cũ sang gói Schema 1.0 `bin/migrate-demo-data.js` mà không xóa dữ liệu nguồn

- [x] **Giai đoạn 3: API & Job bền vững**
  - [x] Tiện ích mật mã và băm token `src/utils/crypto.js`
  - [x] Quản lý hàng đợi và idempotency `src/jobs/queue.js`
  - [x] Worker nền với cơ chế lease claim và backoff retry `src/jobs/worker.js`
  - [x] Máy chủ HTTP `src/api/server.js` phục vụ các endpoint:
    - `POST /api/v1/generate` (202 Accepted + job_id)
    - `GET /api/v1/jobs/:id` (200 OK kết quả bảo vệ bằng X-Job-Token)
    - `POST /api/v1/jobs/:id/feedback` (201 Created + chống lưu trùng)
    - `GET /api/v1/health/live` (200 OK kiểm tra tiến trình)
    - `GET /api/v1/health/ready` (200/503 kiểm tra DB và active version)
  - [x] Vô hiệu hóa toàn bộ endpoint cũ (`/api/documents`, `/api/history`, `/api/samples`, `/api/generate`) trả về mã 410 Gone

- [x] **Giai đoạn 4: Gemini Adapter & Chất lượng phản hồi**
  - [x] Adapter gọi Google Gemini API `src/providers/gemini.js` với timeout AbortSignal, JSON schema và retry hữu hạn
  - [x] Provider giả lập `src/providers/mock.js` phục vụ test độc lập
  - [x] Bộ lọc cờ đỏ độc lập (`checkRedFlags`): ca đỏ trúng từ khóa an toàn lập tức chuyển sang mẫu đồng cảm, không níu kéo, không ép sinh 5 câu
  - [x] Ngữ cảnh prompt cách ly rõ ràng với nội dung người dùng (phòng chống prompt injection)

- [x] **Giai đoạn 5: Web Widget tối giản**
  - [x] Giao diện HTML tinh gọn `public/index.html` (loại bỏ ô nhập key, bỏ drawer sửa doc)
  - [x] Controller `public/app.js` xử lý luồng: Dán → Poll job → Chọn/Sửa → Sao chép → Lưu phản hồi
  - [x] Phục hồi trạng thái job qua `sessionStorage` sau khi tải lại trang
  - [x] Cơ chế hiển thị cờ cảnh báo kết quả tạo từ phiên bản tri thức cũ (`is_outdated_version`)
  - [x] Xóa bỏ an toàn key demo cũ trong `localStorage` khi khởi động app

- [x] **Giai đoạn 6: Vận hành & Bàn giao**
  - [x] Script sao lưu trực tuyến `bin/backup.js` qua `VACUUM INTO` kèm metadata checksum
  - [x] Script khôi phục và kiểm thử toàn vẹn `bin/restore.js` vào thư mục độc lập
  - [x] Script dọn dẹp dữ liệu hết hạn `bin/cleanup.js` (Job 7 ngày, Feedback 90 ngày) có cờ `--dry-run`
  - [x] Cấu hình container hóa `Dockerfile` và `docker-compose.yml` ràng buộc loopback `127.0.0.1`
  - [x] Sổ tay hướng dẫn vận hành chi tiết `docs/OPERATIONS.md`
  - [x] Cập nhật tài liệu hướng dẫn hoàn chỉnh tại `README.md`
  - [x] Dọn dẹp các tệp cũ không cần thiết (`server.js`, `.DS_Store`)

---

## 3. Nhật ký kiểm thử & Kết quả thực tế

### 3.1 Bộ kiểm thử tự động toàn diện (`npm test`)
- **Lệnh thực thi:** `node --test tests/**/*.test.js`
- **Kết quả:** **21/21 tests ĐẠT (PASS 100%)**, thời gian thực thi: **316 ms**.
- **Chi tiết các nhóm test:**
  1. `tests/unit/crypto.test.js`:
     - SHA-256 deterministic hash: PASS
     - Sinh token ngẫu nhiên an toàn: PASS
     - Băm và xác thực constant-time token: PASS
  2. `tests/unit/validator.test.js`:
     - Chặn đường dẫn thoát thư mục (Path traversal): PASS
     - Bắt lỗi cú pháp JSON kèm số dòng chính xác: PASS
     - Từ chối ID trùng lặp trong cùng một lô: PASS
     - Từ chối khoảng hiệu lực ngày bị chồng chéo cho cùng policy_key và scope: PASS
  3. `tests/integration/import_publish.test.js`:
     - Từ chối xóa mục đang được tham chiếu; bản active giữ nguyên khi có lỗi: PASS
     - Nhập lại cùng lô là idempotent; cùng batch_id khác nội dung báo lỗi xung đột: PASS
     - Version pinning: Concurrency CAS với expected revision và rollback an toàn: PASS
  4. `tests/integration/job_workflow.test.js`:
     - Tạo job idempotent, từ chối cùng key khác payload (409 Conflict): PASS
     - Xác thực token bảo vệ (403 Forbidden nếu sai/thiếu token): PASS
     - Worker xử lý hoàn tất job với phiên bản tri thức đã ghim: PASS
     - Worker thu hồi lease đã hết hạn từ tiến trình cũ bị chết: PASS
  5. `tests/integration/safety_red_flags.test.js`:
     - Nhận diện cờ đỏ ca bệnh nan y và trả về mẫu đồng cảm đã duyệt: PASS
     - Ca đỏ không ép sinh 5 phong cách tiếp thị/thúc ép: PASS
     - Hội thoại có `split=eval` tuyệt đối không bị đưa vào ngữ cảnh few-shots: PASS
  6. `tests/integration/api_security.test.js`:
     - Các endpoint demo cũ bị chặn triệt để với mã 410 Gone: PASS
     - Từ chối payload quá lớn (>1MB) với mã 413 Payload Too Large: PASS
     - Endpoint kiểm tra sức khỏe `health/live` (200) và `health/ready` (503 khi chưa có version, 200 khi sẵn sàng): PASS
  7. `tests/integration/widget_flow.test.js`:
     - Luồng khép kín: Generate (202) -> Poll (200) -> Edit -> Feedback (201): PASS
     - Chống lưu phản hồi trùng lặp (Anti-duplicate feedback): PASS
     - Cảnh báo kết quả thuộc phiên bản tri thức cũ khi có bản mới được publish: PASS
  8. `tests/integration/backup_restore.test.js`:
     - Sao lưu SQLite online qua `VACUUM INTO`, tạo file metadata và tính SHA-256: PASS
     - Phục hồi sang đường dẫn cách ly, kiểm tra `PRAGMA integrity_check = ok`: PASS
     - Đối chiếu chính xác số bản ghi và phiên bản active sau khôi phục: PASS

### 3.2 Kiểm thử tải đồng thời (`npm run test:load`)
- **Lệnh thực thi:** `node tests/load/load_test.js`
- **Kịch bản:** 10 clients gửi requests đồng thời trong khi nền đang thực hiện Import một lô 1.000 mục chính sách vào SQLite.
- **Kết quả đo đạc thực tế:**
  - Tổng số request: 50/50 thành công (100%).
  - Độ trễ tiếp nhận job p50: **2 ms**.
  - Độ trễ tiếp nhận job p95: **3 ms** (Mục tiêu nghiệm thu: < 500 ms -> **ĐẠT XUẤT SẮC**).
  - Độ trễ tiếp nhận job p99: **4 ms**.
  - Lỗi khóa cơ sở dữ liệu `SQLITE_BUSY`: **0 lỗi** (Mục tiêu: 0 -> **ĐẠT**).

### 3.3 Kiểm thử độ ổn định (Soak Test)
- **Lệnh thực thi:** `npm run test:soak -- --seconds=5` (kèm script mẫu sẵn sàng chạy 8 giờ).
- **Kết quả:** Khởi tạo job và worker nền liên tục, bộ nhớ RAM ổn định (~51.3 MB RSS), không phình to bất thường, `PRAGMA integrity_check` sau bài test đạt **OK**.

---

## 4. Các cấu hình & Dữ liệu cần cung cấp trước khi chạy Production thật

1. **Google Gemini API Key:**
   - Cần điền khóa API thật vào biến `GEMINI_API_KEY` trong file `.env` và đặt `PROVIDER=gemini`.
2. **Dữ liệu đối tác chính thức được Thầy Minh phê duyệt:**
   - Dữ liệu hiện tại nạp trong DB (`data/demo_knowledge_batch`) được tạo từ các file demo ban đầu (`data/policy.md`, `data/red_flags.json`, `data/few_shots.json`).
   - Cần đối tác bàn giao gói dữ liệu thật theo đúng `docs/doi-tac-data/README.md`, có người có thẩm quyền xác nhận các con số (mức hoàn tiền 2.800.000đ, bảo lưu 90 ngày) trước khi dùng trả lời học viên thật.
3. **Môi trường triển khai hạ tầng:**
   - Đặt server sau Reverse Proxy (Nginx/Caddy) có HTTPS và giới hạn truy cập trong mạng riêng/VPN của đơn vị.
   - Cấu hình Cron định kỳ cho backup và cleanup theo hướng dẫn tại `docs/OPERATIONS.md`.

---

## 5. Danh sách các file đã xóa hoặc thay thế

1. `server.js`:
   - *Lý do:* Đây là file server demo cũ dài 495 dòng đọc/ghi file đồng bộ, chứa các endpoint không an toàn (`/api/documents`, `/api/history`, `/api/samples`, `/api/generate`), và nhận API key từ trình duyệt. Đã được thay thế hoàn toàn bởi kiến trúc module mới tại `src/` (`src/index.js`, `src/api/server.js`, `src/jobs/`, `src/db/`, v.v.).
2. `.DS_Store`:
   - *Lý do:* File rác của hệ điều hành macOS, không phục vụ mã nguồn.
3. `test.sock`:
   - *Lý do:* File socket tạm phát sinh trong quá trình thử nghiệm.

*Ghi chú bảo toàn:* Toàn bộ dữ liệu gốc trong thư mục `data/` (`persona.md`, `policy.md`, `red_flags.json`, `few_shots.json`, `raw_messages.txt`, `history.jsonl`) và tài liệu kế hoạch/prompt đều được giữ nguyên vẹn 100%.
