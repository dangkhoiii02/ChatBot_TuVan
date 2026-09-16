# Sổ Tay Hướng Dẫn Vận Hành (Runbook & Operations)

Tài liệu hướng dẫn vận hành Bot Trợ Lý Thầy Minh Piano trên môi trường máy chủ nội bộ / VPS.

---

## 1. Phân biệt các loại cập nhật

| Loại thay đổi | Tác động tới API | Cách thực hiện |
|---|---|---|
| **Cập nhật tri thức (Knowledge)** | **Không gián đoạn (0 downtime)**. Yêu cầu đang chạy dùng phiên bản cũ, yêu cầu mới dùng phiên bản mới. Không cần restart server. | Dùng lệnh CLI: `node bin/knowledge.js import ...` sau đó `publish ...` |
| **Cập nhật mã nguồn (Code Deploy)** | **Gián đoạn ngắn (< 5 giây)** khi tiến trình khởi động lại. Graceful shutdown hoàn tất các job đang xử lý. | Chạy supervisor / Docker restart sau khi kéo mã mới. |
| **Sự cố hạ tầng (Hỏng máy, đĩa)** | Gián đoạn dịch vụ. Khôi phục từ bản Online Backup mới nhất. | Làm theo quy trình Restore ở Mục 3. |

---

## 2. Các kịch bản xử lý sự cố thường gặp

### Kịch bản 1: Mất API Key hoặc Gemini Quota / Lỗi 429
- **Hiện tượng:** Gợi ý AI báo lỗi quá tải hoặc không thể kết nối.
- **Tác động:** Không làm sập server. Giao diện web vẫn mở bình thường, giáo viên vẫn có thể tự soạn tin và sao chép thủ công.
- **Xử lý:**
  1. Kiểm tra biến môi trường `GEMINI_API_KEY` trên server.
  2. Nếu tài khoản Google AI Studio hết hạn ngạch (quota limit): thay API key mới vào file `.env` trên server và restart server (`npm start`).
  3. Trong môi trường test/dev nội bộ không có key: đổi `PROVIDER=mock` trong `.env` để kiểm tra chức năng.

### Kịch bản 2: Dữ liệu chính sách mới bị sai hoặc phát hiện lỗi
- **Hiện tượng:** Cần thu hồi gấp phiên bản tri thức vừa xuất bản về phiên bản cũ an toàn.
- **Xử lý (Rollback tức thì):**
  ```bash
  # Xem danh sách các phiên bản đã xuất bản
  node bin/knowledge.js list

  # Thực hiện Rollback về phiên bản đã kiểm tra trước đó (ví dụ v1)
  node bin/knowledge.js rollback <target_version_id> --approved-by="<tên_bạn>"
  ```
  *Lưu ý:* Thao tác diễn ra trong SQLite transaction ngắn (< 5ms), không làm gián đoạn các kết nối đang mở.

### Kịch bản 3: Lỗi SQLITE_BUSY (Database bận)
- **Hiện tượng:** Nhiều luồng ghi đồng thời khiến một thao tác vượt quá `busy_timeout=5000ms`.
- **Xử lý:**
  1. Kiểm tra xem file database và thư mục `storage/` có đang nằm trên ổ đĩa mạng NFS/SMB dùng chung không (SQLite WAL chỉ hoạt động an toàn và hiệu năng cao trên Local Volume / Block Storage).
  2. Kiểm tra tiến trình có giữ transaction lâu hay không. Hệ thống đã thiết kế giao dịch ghi tách biệt với lời gọi Gemini/đọc file lớn.

### Kịch bản 4: Đĩa đầy (>80%) hoặc file WAL phình to
- **Hiện tượng:** Cảnh báo dung lượng ổ cứng tăng cao do log và jobs tích lũy.
- **Xử lý:**
  ```bash
  # Chạy dọn dẹp các job/generation đã hết hạn TTL (mặc định giữ 7 ngày cho job, 90 ngày cho feedback):
  node bin/cleanup.js

  # Chạy thử nghiệm xem trước (dry-run):
  node bin/cleanup.js --dry-run
  ```

---

## 3. Quy trình Sao lưu & Khôi phục (Backup & Restore)

### Sao lưu Online (Không khóa DB)
Hệ thống sử dụng cơ chế SQLite `VACUUM INTO`, cho phép tạo bản sao lưu snapshot nhất quán ngay cả khi server đang ghi WAL:
```bash
# Thực hiện sao lưu vào thư mục backups/
npm run backup
```
Lệnh này sinh ra 2 tệp:
- `backup_YYYYMMDD_HHmmss.db`: Bản snapshot cơ sở dữ liệu.
- `backup_YYYYMMDD_HHmmss.db.meta.json`: Metadata gồm SHA-256 checksum, số lượng bản ghi và active version.

### Khôi phục & Kiểm định toàn vẹn (Restore & Verify)
Tuyệt đối không ghi đè trực tiếp lên file `app.db` đang chạy. Quy trình khôi phục:
```bash
# Khôi phục vào thư mục kiểm định cách ly
node bin/restore.js backups/backup_FILE.db restore_test/verify.db
```
Lệnh sẽ tự động:
1. Đối chiếu Checksum SHA-256 với metadata.
2. Chạy `PRAGMA integrity_check;`.
3. Kiểm tra số lượng bản ghi và `active_version_id`.
4. Thực hiện thử một câu lệnh truy vấn mẫu.

---

## 4. Lịch Cron mẫu đề xuất cho máy chủ

```crontab
# 1. Sao lưu database mỗi giờ một lần
0 * * * * cd /path/to/chatbot_TTD && npm run backup >> /var/log/chatbot_backup.log 2>&1

# 2. Dọn dẹp dữ liệu hết hạn định kỳ mỗi ngày vào lúc 02:00 sáng
0 2 * * * cd /path/to/chatbot_TTD && npm run cleanup >> /var/log/chatbot_cleanup.log 2>&1
```

*Lưu ý bảo mật backup:* Sau khi file backup được tạo tại `backups/`, cần đồng bộ sang lưu trữ ngoài máy chủ (ví dụ S3 bucket, rsync sang máy chủ lưu trữ riêng) và thiết lập xóa bản sao cục bộ sau 48 giờ.
