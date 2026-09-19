# Hướng dẫn phát hành FE và widget

## 1. Backend production

Thiết lập tối thiểu:

```dotenv
NODE_ENV=production
APP_SESSION_SECRET=<chuoi-ngau-nhien-dai>
PANCAKE_PAGE_ID=<page-id>
PANCAKE_PAGE_ACCESS_TOKEN=<page-access-token>
ALLOW_DEMO_MODE=0
AI_PROVIDER=<provider-he-thong>
AI_API_KEY=<api-key-he-thong>
AI_MODEL=<model-id>
CORS_ORIGINS=https://<ten-mien-fe>
CORS_EXTENSION_IDS=<id-extension-sau-khi-load-cai-dat>
```

Backend phải chạy HTTPS. Không đưa secret vào source, file build hoặc extension.

## 2. FE web

Chọn một trong hai cách:

- Đặt `VITE_API_BASE_URL=https://<backend>` trước khi `npm run build --prefix frontend`.
- Để trống và cấu hình reverse proxy cùng origin từ `/api` tới backend.

Đảm bảo `VITE_ENABLE_DEMO_MODE` không được đặt hoặc bằng `0`.

## 3. Widget và extension

```bash
npm run build --prefix widget
bash extension/scripts/sync-widget-dist.sh
```

Đặt `VITE_API_BASE_URL` trước khi build widget. Load thư mục `extension/` tại `chrome://extensions`, lấy ID extension và thêm ID đó vào `CORS_EXTENSION_IDS` của backend. Widget luôn dùng provider/key/model từ `backend/.env`; người dùng không cấu hình AI trong widget.

## 4. Smoke test bắt buộc

- Đăng nhập bằng Pancake token của nhân sự có quyền page.
- Mở hai hội thoại liên tiếp và xác nhận tên, `conversationId`, `studentId` không bị lẫn.
- Tạo gợi ý, sửa câu và đổ vào composer; extension không tự gửi.
- Đổi xưng hô và kiểm tra phần trích dẫn không bị sửa.
- Tạo nhận xét chấm bài; khi API lỗi, nội dung giáo viên nhập vẫn còn.
- Lưu hồ sơ, ghi nhớ, custom field; reload vẫn đọc lại đúng học viên.
- Hết hạn session phải quay về đăng nhập và không làm mất draft.
- Tắt backend/Pancake/AI lần lượt; UI phải báo lỗi thật và không hiện dữ liệu demo.

Chỉ phát hành sau khi các bước trên đạt trên tenant Pancake thật.
