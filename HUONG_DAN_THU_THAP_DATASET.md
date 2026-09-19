# Hướng dẫn thu thập dataset cho Trợ lý học viên AI

> Phiên bản: 1.0 — cập nhật 19/09/2026  
> Phạm vi: hội thoại Pancake, câu trả lời đã duyệt, chính sách, FAQ, giọng văn và tình huống an toàn.  
> Không thu thập video/audio; phiên bản hiện tại chỉ sử dụng nội dung văn bản và ghi chú của giáo viên.

## 1. Mục tiêu và số lượng nên thu thập

Dataset dùng để cung cấp tri thức, ví dụ đúng giọng và bộ đánh giá chất lượng. Đây không phải yêu cầu phải fine-tune model.

| Nhóm dữ liệu | Đợt thử | Mức nên có khi chạy thật | Yêu cầu |
| --- | ---: | ---: | --- |
| Chính sách | Toàn bộ chính sách đang hiệu lực | Toàn bộ + lịch sử thay đổi cần thiết | Chủ sở hữu phê duyệt 100% |
| FAQ | 20–30 câu | 50–100 câu | Dẫn đúng chính sách liên quan |
| Hội thoại mẫu | 30–50 hội thoại | 200–500 hội thoại | Đã ẩn danh và có quyền sử dụng |
| Ca nhạy cảm/cờ đỏ | 10–20 tình huống | 50–100 tình huống | Người phụ trách duyệt 100% |
| Bộ đánh giá `eval` | Tối thiểu 30 ca | Tối thiểu 60–100 ca | Không đưa vào prompt hoặc kho ví dụ `train` |
| Persona | 1 bản | 1 bản đang hiệu lực | Có ví dụ đúng giọng và sai giọng |

Ưu tiên chất lượng và độ phủ tình huống hơn số lượng. Không đưa một hội thoại vào dataset chỉ để đủ chỉ tiêu nếu câu trả lời chưa được xác nhận là đúng.

## 2. Nguồn dữ liệu được sử dụng

| Nguồn | Dữ liệu lấy | Điều kiện |
| --- | --- | --- |
| Pancake/Messenger | Tin nhắn học viên và câu trả lời thực tế | Có quyền sử dụng; phải ẩn danh trước khi bàn giao |
| Giáo viên/nhân viên | Câu trả lời đã sửa và được chấp nhận | Ghi người duyệt và thời điểm duyệt |
| Văn bản nội bộ | Học phí, bảo lưu, hoàn tiền, lịch học | Xác nhận phiên bản và ngày hiệu lực |
| Danh sách câu hỏi thường gặp | Câu hỏi và câu trả lời chuẩn | Mọi số tiền/thời hạn phải dẫn tới policy |
| Tình huống giả lập | Ca hiếm hoặc nguy hiểm chưa đủ dữ liệu thật | Gắn `source_ref` là `synthetic`; vẫn phải được duyệt |

Không lấy dữ liệu từ nguồn không rõ quyền sử dụng, không mua danh sách hội thoại bên ngoài và không dùng câu trả lời do AI tạo làm “đáp án thật” nếu chưa có người duyệt.

## 3. Quy trình thu thập

### Bước 1 — Chốt phạm vi

Lập danh sách chủ đề cần phủ trước khi xuất dữ liệu:

- Chào hỏi, cảm ơn, nhắc lịch và hỏi thăm tiến độ.
- Hỏi bài, lỗi kỹ thuật, nhận xét bài dựa trên ghi chú giáo viên.
- Học phí, bảo lưu, hoàn tiền và lịch học.
- Học viên có nguy cơ nghỉ, phàn nàn hoặc khó khăn tài chính.
- Bệnh nặng, tai nạn, tang sự, khủng hoảng tâm lý và các ca cần người thật xử lý.
- Trường hợp mơ hồ: trùng tên, phụ huynh nhắn cho nhiều con, lịch sử chưa tải đủ, thông tin mới mâu thuẫn ghi chú cũ.

### Bước 2 — Xuất dữ liệu thô

Chỉ người được phân quyền mới được xuất dữ liệu từ Pancake. Mỗi bản ghi thô cần có mã tham chiếu nội bộ, thời gian, thứ tự tin nhắn và nguồn. Không gửi ảnh chụp màn hình nếu có thể xuất dạng văn bản.

Dữ liệu thô phải nằm ở vùng lưu trữ riêng có kiểm soát truy cập. Không commit dữ liệu thô vào Git và không gửi dữ liệu chưa ẩn danh qua email, ứng dụng chat hoặc dịch vụ AI công cộng.

### Bước 3 — Lọc và chia hội thoại

- Chỉ giữ các lượt cần thiết để hiểu câu hỏi và câu trả lời.
- Giữ nguyên thứ tự hội thoại; không ghép các học viên khác nhau.
- Lượt cuối trong `messages` phải là tin cần trả lời.
- Câu trả lời mục tiêu đặt tại `approved_reply`, không đưa vào `messages`.
- Loại hội thoại chỉ có sticker, tệp trống, spam hoặc không có giá trị nghiệp vụ.
- Không suy nội dung video/ảnh; chỉ giữ phần mô tả hoặc ghi chú văn bản đã xác thực.

### Bước 4 — Ẩn danh

Thay hoặc xóa trước khi gắn nhãn:

| Dữ liệu | Cách xử lý |
| --- | --- |
| Họ tên | `[HOC_VIEN_001]`, `[PHU_HUYNH_001]` |
| Số điện thoại, email, địa chỉ | Xóa hoặc thay bằng placeholder tương ứng |
| ID Facebook/Pancake, URL hồ sơ | Thay bằng mã giả danh nội bộ |
| Số tài khoản, hóa đơn có định danh | Xóa khỏi dataset |
| Tên người thân hoặc trường học | Tổng quát hóa nếu không cần cho nghiệp vụ |
| Thông tin sức khỏe | Chỉ giữ mức tối thiểu cần để phân loại và trả lời an toàn |

Một người phải dùng cùng mã giả danh trong một hội thoại. Không dùng bảng ánh xạ danh tính làm một phần của gói dataset bàn giao.

### Bước 5 — Gắn nhãn

Mỗi hội thoại cần tối thiểu:

- `topic`: chủ đề chính.
- `sensitivity`: `xanh`, `vang` hoặc `do`.
- `label_reason`: lý do cụ thể cho nhãn.
- `approved_reply`: câu trả lời được chấp thuận, hoặc `null` nếu chưa có.
- `policy_ids`: các chính sách được dùng để trả lời.
- `must_avoid`: điều AI không được khẳng định hoặc thực hiện.
- `split`: `train` hoặc `eval`.

Quy ước nhãn:

| Nhãn | Ví dụ | Yêu cầu |
| --- | --- | --- |
| `xanh` | Chào hỏi, cảm ơn, trao đổi thường quy | Có thể gợi ý bình thường |
| `vang` | Hỏi bài, bảo lưu, khiếu nại nhẹ, nguy cơ nghỉ | Cẩn trọng với dữ kiện và chính sách |
| `do` | Bệnh nặng, cấp cứu, tang sự, khủng hoảng | Không gây áp lực; bắt buộc người thật duyệt |

Từ khóa chỉ là dấu hiệu, không tự động chứng minh một ca là đỏ. Ca không chắc chắn phải để `review_status: "draft"` và chuyển người duyệt.

### Bước 6 — Duyệt hai lớp

1. Người gắn nhãn kiểm tra định dạng, nguồn, quyền sử dụng và ẩn danh.
2. Giáo viên/chủ sở hữu duyệt nội dung, giọng văn, chính sách và ca nhạy cảm.

Không để cùng một người vừa tạo đáp án vừa tự nghiệm thu toàn bộ bộ `eval`. Chính sách và ca đỏ phải được kiểm tra 100%, không lấy mẫu ngẫu nhiên.

### Bước 7 — Chia `train` và `eval`

- Gợi ý tỷ lệ ban đầu: 80% `train`, 20% `eval`.
- Chia theo `student_ref` hoặc toàn bộ cuộc hội thoại, không chia theo từng tin nhắn.
- Các bản sao hoặc câu gần giống phải nằm cùng một phía.
- `eval` là bộ kiểm thử khóa; không đưa đáp án `approved_reply` của nó vào prompt hoặc few-shot.
- Giữ đủ xanh/vàng/đỏ và đủ các chủ đề quan trọng trong `eval`.

## 4. Định dạng bàn giao

Mỗi đợt là một thư mục:

```text
batch-YYYYMMDD-NNN/
├── manifest.json
├── persona.md
├── policies.jsonl
├── faq.jsonl
├── conversations.jsonl
└── safety_rules.jsonl
```

Chỉ khai báo trong `manifest.files` những tệp thực sự có trong đợt đó. Dùng UTF-8. Mỗi dòng trong JSONL là một JSON object hoàn chỉnh, không có dấu phẩy giữa các dòng. Mỗi tệp tối đa 5 MB theo validator hiện tại.

Các mẫu chuẩn nằm tại [docs/doi-tac-data](docs/doi-tac-data/README.md). Sao chép tệp `.example`, bỏ phần `.example` khỏi tên rồi thay toàn bộ dữ liệu minh họa.

### Trường chung bắt buộc

| Trường | Giá trị |
| --- | --- |
| `id` | ID ổn định, duy nhất; tiền tố `policy-`, `faq-`, `conv-`, `safety-` |
| `source_ref` | Mã nguồn nội bộ có thể đối chiếu, không chứa danh tính |
| `collected_at` | ISO 8601 có múi giờ, ví dụ `2026-09-19T10:30:00+07:00` |
| `permission_status` | `confirmed` hoặc `pending` |
| `anonymized` | Chỉ đặt `true` sau khi kiểm tra ẩn danh |
| `review_status` | `draft`, `approved` hoặc `rejected` |
| `approved_by` | Mã người duyệt; `null` nếu chưa duyệt |
| `approved_at` | Thời điểm duyệt; `null` nếu chưa duyệt |

Ví dụ một hội thoại tối giản:

```json
{"source_ref":"pancake-batch-20260919-001","collected_at":"2026-09-19T10:30:00+07:00","permission_status":"confirmed","anonymized":true,"review_status":"approved","approved_by":"GV_001","approved_at":"2026-09-19T15:00:00+07:00","id":"conv-practice-001","student_ref":"HOC_VIEN_001","topic":"practice","context":{"pronoun":"thay-em","course_id":"course-standard"},"messages":[{"role":"student","text":"Em tập đoạn này chưa đều, thầy hướng dẫn giúp em với ạ."}],"approved_reply":"Em tập chậm từng ô nhịp trước nhen, khi nhịp đều rồi mình tăng tốc từ từ.","sensitivity":"vang","label_reason":"Học viên hỏi kỹ thuật luyện tập thông thường.","policy_ids":[],"must_avoid":["Không khẳng định đã xem video."],"split":"train"}
```

## 5. Kiểm tra và nhập dữ liệu

Từ thư mục gốc dự án:

```bash
node bin/knowledge.js validate path/to/batch-YYYYMMDD-NNN
node bin/knowledge.js import path/to/batch-YYYYMMDD-NNN
node bin/knowledge.js diff <version_id>
node bin/knowledge.js publish <version_id> --approved-by="GV_001"
```

Không publish ngay sau import. Người duyệt phải xem diff, chạy bộ đánh giá và kiểm tra các câu có tiền, thời hạn, sức khỏe hoặc cam kết dịch vụ.

Nếu chỉ cập nhật một phần, dùng `mode: "delta"`. Thiếu một ID trong lô delta không có nghĩa là xóa; muốn xóa phải khai báo rõ trong `deleted_item_ids` cùng lý do. Không tái sử dụng `batch_id` cho nội dung khác.

## 6. Tiêu chí chấp nhận

| Kiểm tra | Mức đạt |
| --- | ---: |
| Bản ghi còn thông tin nhận dạng trực tiếp | **0** |
| Policy/ca đỏ chưa được người có thẩm quyền duyệt | **0** trong bản publish |
| ID trùng hoặc tham chiếu `policy_ids` bị gãy | **0** |
| Hội thoại trùng giữa `train` và `eval` | **0** |
| File sai JSON/JSONL hoặc vượt 5 MB | **0** |
| Hội thoại có nguồn và trạng thái quyền sử dụng | **100%** |
| Câu trả lời chứa số tiền/thời hạn nhưng không dẫn policy | **0** |

Ngoài kiểm tra tự động, lấy tối thiểu 30–50 ca đại diện để chạy thử với từng model dự kiến dùng. Chỉ chốt model sau khi so sánh: đúng dữ kiện, đúng chính sách, đúng giọng, phân loại cờ đỏ, nội dung cần tránh và chi phí token thực tế.

## 7. Bảo quản và cập nhật

- Tách vùng dữ liệu thô khỏi dataset đã ẩn danh.
- Chỉ cấp quyền theo vai trò; ghi nhật ký người xuất, người sửa và người duyệt.
- Mã hóa khi lưu và khi truyền; không lưu API key trong dataset.
- Thời hạn giữ dữ liệu thô phải được chủ dữ liệu và bộ phận phụ trách pháp lý phê duyệt; xóa khi hết mục đích.
- Rà soát policy khi có thay đổi; thu thập bổ sung hằng tháng từ các lỗi AI hoặc câu nhân viên phải sửa nhiều.
- Không tự đưa phản hồi AI vào `train`. Chỉ đưa bản cuối đã được con người chấp nhận và gắn lại nguồn.

Việc thu thập và xử lý dữ liệu cá nhân phải tuân theo [Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15](https://vanban.chinhphu.vn/?docid=214590&pageid=27160), có hiệu lực từ 01/01/2026. Tài liệu này là hướng dẫn kỹ thuật, không thay thế tư vấn pháp lý cho quy trình xin phép, lưu giữ hoặc chuyển dữ liệu cho nhà cung cấp AI ở nước ngoài.

## 8. Checklist trước khi bàn giao

- [ ] Đã xác định mục đích và phạm vi dataset.
- [ ] Có căn cứ/quyền sử dụng cho từng nguồn dữ liệu.
- [ ] Dữ liệu thô không nằm trong Git hoặc thư mục bàn giao.
- [ ] Đã xóa tên, số điện thoại, email, địa chỉ, tài khoản và ID nền tảng.
- [ ] Mỗi hội thoại có nguồn, nhãn, lý do nhãn và trạng thái duyệt.
- [ ] Policy có ngày hiệu lực và người phê duyệt.
- [ ] Ca đỏ và mẫu trả lời an toàn được duyệt 100%.
- [ ] Không rò rỉ cùng học viên/hội thoại giữa `train` và `eval`.
- [ ] `node bin/knowledge.js validate ...` chạy thành công.
- [ ] Đã xem diff và chạy bộ đánh giá trước khi publish.
