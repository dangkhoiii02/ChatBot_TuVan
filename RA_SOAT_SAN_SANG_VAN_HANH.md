# Rà soát mức sẵn sàng vận hành — DigitalOcean + Groq

> Ngày rà soát: 19/09/2026  
> Phạm vi: `backend/`, `frontend/`, `widget/`, `extension/`, dữ liệu tri thức, cấu hình triển khai và kiểm thử.  
> Kết luận: **chưa đủ điều kiện đưa thẳng vào production**.

## 1. Kiến trúc cần chốt

Sản phẩm Pancake đang nằm ở các thư mục:

- `backend/`: API Express/TypeScript, đăng nhập Pancake, đọc hội thoại và gọi AI.
- `frontend/`: giao diện web.
- `widget/`: giao diện nhúng.
- `extension/`: Chrome extension kết nối Pancake với widget.
- `shared/ai-provider.cjs`: adapter gọi Groq và các nhà cung cấp khác.

Luồng `src/` + `public/` + `bin/` là một backend hàng đợi độc lập, không phải backend Pancake ở trên. Hai backend có schema SQLite và cách quản lý tri thức khác nhau. Khi triển khai phải chọn một luồng chính; với nhu cầu hiện tại, luồng chính phải là `backend/` + `frontend/` + `widget/` + `extension/`.

## 2. Kết quả kiểm thử hiện tại

| Hạng mục | Kết quả |
| --- | --- |
| Test backend hàng đợi `src/` | **21/21 đạt** |
| Build `backend/` | **Đạt** |
| Build `frontend/` | **Đạt** |
| Build `widget/` | **Đạt** |
| Test adapter AI và HTTP | **27/27 đạt** |
| Kết nối Groq thật | **Chưa kiểm tra** — không có API key production trong phiên rà soát |
| Kết nối Pancake thật | **Chưa kiểm tra** — cần page/token và tài khoản thật |
| Extension trên giao diện Pancake thật | **Chưa có E2E tự động** |
| Audit dependency online | **Chưa hoàn tất** — môi trường chưa được phép gửi metadata package tới npm registry |

Các test đang đạt chủ yếu kiểm tra adapter bằng `fetch` giả lập và backend hàng đợi cũ. Kết quả này chưa chứng minh toàn bộ sản phẩm Pancake chạy được trên VPS.

## 3. Lỗi chặn vận hành

### P0-01 — Docker đang deploy nhầm ứng dụng

`Dockerfile` chỉ copy `src/`, `bin/`, `public/` và chạy `src/index.js`. `docker-compose.yml` đặt `PROVIDER=mock` và cấu hình Gemini. Nó không build/chạy `backend/`, `frontend/`, `widget/` hoặc Groq.

**Tác động:** đưa source hiện tại lên DigitalOcean bằng Docker sẽ chạy backend cũ, không phải sản phẩm Pancake đã thiết kế.

**Cần làm:** tạo Dockerfile/Compose production cho backend Pancake, build FE/widget, cấu hình reverse proxy HTTPS và đặt `AI_PROVIDER=groq`, `AI_API_KEY`, `AI_MODEL=openai/gpt-oss-20b` trên server.

### P0-02 — Extension vẫn gọi localhost

`widget/.env.production` đang trỏ `http://127.0.0.1:4000`. `extension/manifest.json` chỉ cấp host permission cho Pancake và localhost, chưa có hostname/IP của VPS.

**Tác động:** extension đóng gói không gọi được backend DigitalOcean.

**Cần làm:** dùng một URL HTTPS ổn định cho API, build lại widget, đồng bộ vào extension và thêm đúng host permission. Không nên để HTTP public.

### P0-03 — Frontend mặc định chạy Mock và tự che lỗi production

`frontend/src/App.tsx` khởi tạo `isMockMode=true`. Khi backend hoặc Pancake lỗi, giao diện tự chuyển sang dữ liệu mẫu. Backend cũng tự trả dữ liệu SQLite demo khi Pancake lỗi.

**Tác động:** nhân viên có thể tưởng đang xem học viên thật trong khi thực tế là dữ liệu demo; sự cố Pancake bị che giấu.

**Cần làm:** production mặc định Live, tắt nút Mock, không tự fallback sang demo và hiển thị lỗi rõ ràng khi Pancake không truy cập được.

### P0-04 — Fallback có thể bịa thông tin chuyên môn

Fallback chấm bài tự thêm các dữ kiện như đã xem bài, thả lỏng cổ tay, thời lượng tập, số lượt tập và “đã tiến bộ”. Fallback hội thoại thường còn khẳng định “Thầy xem clip rồi”, chẩn đoán ngón/cổ tay và tự nêu chính sách bảo lưu.

**Tác động:** vi phạm UC-03 và có thể gửi thông tin không có căn cứ khi Groq lỗi — đúng thời điểm hệ thống cần an toàn nhất.

**Cần làm:** fallback chỉ được diễn đạt lại đúng `teacherInput`, hoặc trả trạng thái “AI lỗi, cần người dùng tự soạn”; không thêm bất kỳ dữ kiện chuyên môn, thời gian, tiến bộ hay chính sách nào.

### P0-05 — UC-01, UC-04 và UC-05 mới chỉ là giao diện

Hồ sơ, ghi nhớ, custom field và thay đổi xưng hô chỉ cập nhật React state trong `frontend/src/App.tsx`. Backend chưa có bảng/API cho các dữ liệu này.

**Tác động:** reload trang hoặc đổi máy là mất dữ liệu; nhân viên khác không tiếp tục được; chưa đạt nghiệp vụ lưu hồ sơ lâu dài.

**Cần làm:** thêm schema, migration và API cho hồ sơ học viên, xưng hô, memory, custom field, nguồn/căn cứ, revision và lịch sử thay đổi.

### P0-06 — Ghi audit lượt tạo AI đang lỗi schema nhưng bị nuốt lỗi

`suggestionService.ts` ghi các cột `knowledge_version_id`, `status`, `updated_at` vào bảng `generations`, nhưng schema của `backend/src/db/index.ts` không tạo các cột này. Lỗi bị `catch` và chỉ `console.warn`.

**Tác động:** người dùng vẫn nhận gợi ý nhưng lịch sử/audit không được lưu; vận hành không phát hiện qua HTTP response.

**Cần làm:** tạo migration đúng schema, không sửa schema bằng khối `CREATE TABLE IF NOT EXISTS` rời rạc và thêm test xác nhận bản ghi generation thực sự tồn tại.

### P0-07 — Hai hệ quản lý tri thức không nối với nhau

CLI `bin/knowledge.js` publish dữ liệu vào SQLite của backend `src/`. Backend Pancake lại đọc trực tiếp `data/persona.md`, `policy.md`, `red_flags.json`, `few_shots.json` và cache một lần đến khi restart.

**Tác động:** import/publish/rollback dataset thành công nhưng Groq trong sản phẩm Pancake không dùng phiên bản vừa publish. Tài liệu vận hành hiện tại có thể làm người vận hành hiểu sai.

**Cần làm:** nối backend Pancake với kho tri thức có version, hoặc bỏ CLI/versioning khỏi phạm vi và định nghĩa quy trình deploy file rõ ràng. Với vận hành thật nên dùng một nguồn tri thức duy nhất.

### P0-08 — Quy trình publish chưa chặn dữ liệu chưa duyệt

Validator chấp nhận cả `permission_status=pending`, `anonymized=false`, `review_status=draft/rejected`. Lệnh publish chỉ kiểm tra trạng thái phiên bản, không kiểm tra từng item.

**Tác động:** dữ liệu chưa có quyền sử dụng, chưa ẩn danh hoặc bị từ chối vẫn có thể được publish.

**Cần làm:** chặn publish nếu bất kỳ item nào không có `permission_status=confirmed`, `anonymized=true`, `review_status=approved` và thông tin người duyệt hợp lệ.

## 4. Nghiệp vụ UC-01 đến UC-05

| UC | Trạng thái | Nhận xét |
| --- | --- | --- |
| UC-01 — Hiểu ngữ cảnh/hồ sơ | **Chưa đạt** | Đọc được hội thoại nhưng chưa trích xuất, lưu nguồn, lịch sử hoặc hồ sơ bền vững |
| UC-02 — Đổi xưng hô | **Đạt một phần** | Đổi được trên FE, nhưng không lưu; thuật toán vẫn thay từ trong lời trích dẫn/người thứ ba |
| UC-03 — Giáo viên nhập nhận xét | **Đạt một phần** | Đã gọi backend/Groq-compatible API, nhưng fallback bịa thêm dữ kiện và chưa lưu input bền vững |
| UC-04 — Lưu/cập nhật/bỏ ghi chú | **Chưa đạt** | UI có thao tác, backend không có vòng đời ghi chú hoặc lịch sử |
| UC-05 — Custom field | **Chưa đạt** | UI tạo field được, nhưng không có API/schema/validation/persistence |

## 5. Các thiếu sót vận hành quan trọng

### P1-01 — Backup hiện không áp dụng chắc chắn cho backend Pancake

Script backup/restore và tài liệu vận hành thuộc backend `src/`, trong khi backend Pancake dùng schema khác và hardcode `storage/app.db`. Chưa có bài test backup/restore cho đúng database Pancake.

### P1-02 — Backend Pancake chưa có graceful shutdown

`backend/src/server.ts` gọi `app.listen` nhưng không xử lý `SIGTERM`/`SIGINT` và không đóng SQLite. Khi deploy/restart trên VPS có thể dừng đột ngột.

### P1-03 — Health check luôn báo `ok: true`

Endpoint health không kiểm tra SQLite, Pancake hoặc cấu hình Groq. Monitoring có thể báo khỏe dù dịch vụ không tạo được gợi ý hoặc không đọc được hội thoại.

### P1-04 — Nút gửi không gửi tin thật

Giao diện web gọi `/api/demo-replies`; backend chỉ ghi SQLite/JSONL rồi trả thành công, không gửi Pancake. Hàm còn trả thành công ngay cả khi cả hai thao tác lưu đều lỗi.

Nếu yêu cầu chỉ là “điền vào ô soạn để người dùng tự gửi”, extension đang đúng định hướng. Khi đó cần bỏ/đổi nhãn nút gửi ở web để tránh hiểu nhầm. Nếu cần gửi thật qua API Pancake thì chức năng này chưa có.

### P1-05 — Thiếu kiểm soát tải và lạm dụng

Backend chưa có rate limit theo user/IP, giới hạn số lượt AI đồng thời, hàng đợi, timeout tổng và cơ chế chống gọi trùng. Một người bấm nhiều lần có thể tạo nhiều request Groq đồng thời.

### P1-06 — Chọn provider, API key và model từ FE/widget là chức năng chủ đích

Hệ thống cần hỗ trợ đồng thời hai cách:

- Không nhập cấu hình trên FE/widget: backend dùng `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` trên VPS.
- Người dùng chủ động nhập provider, API key hoặc model: cấu hình này ghi đè cấu hình server cho lượt gọi của người dùng đó.

Luồng ưu tiên hiện tại trong `shared/ai-provider.cjs` đã hỗ trợ nguyên tắc này và không để cấu hình nhập dở mượn key/model còn thiếu từ server. Đây **không phải chức năng cần loại bỏ**.

Phần còn cần hoàn thiện cho production là trải nghiệm và bảo mật: có lựa chọn rõ “Dùng cấu hình hệ thống”, chỉ lưu key khi người dùng đồng ý, có nút xóa key, che giá trị, không ghi key vào log/database và cảnh báo khi dùng trên máy dùng chung. Server tuyệt đối không trả API key mặc định về trình duyệt.

### P1-07 — Chưa có retention/cleanup cho dữ liệu Pancake

Backend lưu input, replies và demo replies nhưng chưa có lịch dọn dữ liệu, giới hạn thời gian lưu hoặc công cụ xóa theo học viên. Script cleanup hiện có thuộc backend khác.

### P1-08 — Chỉ hỗ trợ một Pancake page

Backend buộc `PANCAKE_PAGE_ID` duy nhất. Nếu khách hàng chỉ có một page thì chấp nhận được; nếu có nhiều page thì chưa đủ nghiệp vụ.

### P1-09 — Chưa có test live và test UC

Chưa có test cho persistence hồ sơ/memory/custom field, fallback an toàn, generation audit, production mock-off, backup backend Pancake, Groq thật, Pancake thật và luồng extension end-to-end.

## 6. Điểm đã làm tốt

- Có xác thực Bearer session và production chặn demo login.
- Có giới hạn kích thước JSON request 1 MB và validation bằng Zod.
- Adapter Groq dùng endpoint Chat Completions đúng kiểu và không đưa API key vào URL.
- Có thể dùng cấu hình AI mặc định trên server hoặc cho người dùng ghi đè provider/key/model từ FE/widget.
- Custom base URL buộc HTTPS và allowlist.
- Có timeout khi gọi AI/Pancake; lỗi upstream không trả nguyên body chứa secret.
- Có lớp phát hiện cờ đỏ độc lập trước khi gọi AI.
- Build backend, frontend và widget đều thành công; bộ test hiện có đều đạt.
- Extension chỉ điền nội dung vào ô soạn, không tự bấm gửi — phù hợp mô hình người duyệt trước khi gửi.

## 7. Thứ tự cần hoàn thiện trước khi vận hành

1. Chốt `backend/` là backend production và tạo bộ deploy DigitalOcean riêng.
2. Sửa schema/migration và lỗi generation audit.
3. Tắt toàn bộ mock/demo fallback trong production.
4. Thay fallback bịa dữ kiện bằng fallback an toàn.
5. Thêm persistence/API cho UC-01, UC-02, UC-04, UC-05.
6. Hợp nhất kho tri thức và bắt buộc dữ liệu đã duyệt mới được publish.
7. Cấu hình URL HTTPS của VPS cho widget/extension; giữ cả chế độ AI mặc định trên server và cấu hình tùy chọn từ FE/widget.
8. Thêm backup/restore, graceful shutdown, readiness check, rate limit và retention cho backend Pancake.
9. Viết test cho từng UC, sau đó chạy smoke test bằng Groq/Pancake thật trên môi trường staging.
10. Chỉ mở production sau khi test khôi phục backup và hoàn thành checklist nghiệm thu với người dùng thực tế.

## 8. Tiêu chí được phép đưa vào production

- [ ] Docker/Compose chạy đúng backend Pancake với Groq, không chạy `mock`.
- [ ] FE và extension mặc định Live; lỗi upstream không hiện dữ liệu demo.
- [ ] Widget gọi được API HTTPS của VPS.
- [ ] Mọi fallback không bịa dữ kiện.
- [ ] Profile, xưng hô, memory và custom field còn nguyên sau reload/đổi máy.
- [ ] Generation audit lưu thành công và truy vết được user/conversation/model.
- [ ] Dataset chưa duyệt hoặc chưa ẩn danh không thể publish.
- [ ] Backup và restore đúng database Pancake đã được test.
- [ ] Health/readiness phát hiện được lỗi DB và thiếu cấu hình Groq/Pancake.
- [ ] Rate limit, timeout và giới hạn đồng thời hoạt động.
- [ ] Người dùng chọn được provider/key/model hoặc chọn “Dùng cấu hình hệ thống”; hai luồng đều được kiểm thử.
- [ ] Key do người dùng nhập không xuất hiện trong log/database và có thể xóa khỏi trình duyệt.
- [ ] Groq thật, Pancake thật và extension thật đã qua test staging.
- [ ] Chốt rõ sản phẩm chỉ điền bản nháp hay có quyền gửi tin thật.
