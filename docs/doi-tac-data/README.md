# Hướng dẫn thu thập và bàn giao dữ liệu

Bộ này dành cho đối tác thu thập dữ liệu Bot Trợ Lý Thầy Minh Piano. Các tệp `.example.*` là dữ liệu giả minh họa, chưa được duyệt, không được nhập thẳng vào production.

## 1. Cách bàn giao

Mỗi đợt gửi một thư mục gồm `manifest.json`, `persona.md`, `policies.jsonl`, `faq.jsonl`, `conversations.jsonl`, `safety_rules.jsonl`. Chỉ cần gửi các tệp có thay đổi và khai báo trong manifest. Sao chép tệp mẫu, bỏ `.example` khỏi tên, xóa dòng minh họa và điền dữ liệu thật đã ẩn danh.

JSONL: mỗi dòng là một đối tượng JSON hoàn chỉnh; mã hóa UTF-8, không có dấu phẩy giữa các dòng. Xuống dòng trong nội dung dùng `\n`. Không cần gửi file SQLite. Nếu đối tác chỉ nhập được bảng tính, có thể dùng các trường bên dưới làm tên cột và nhờ đầu mối kỹ thuật chuyển sang JSONL trước import; mảng hội thoại cần giữ đúng thứ tự lượt nói.

Manifest chứa schema_version, batch_id duy nhất, submitted_at theo ISO 8601 có múi giờ, collected_by (mã đối tác), mode=`delta`, danh sách files và deleted_item_ids. Với delta, thiếu một mục không có nghĩa xóa. Xóa phải chỉ rõ ID và lý do trong deleted_item_ids, ví dụ `{"id":"faq-002","reason":"Nội dung đã hết hiệu lực"}`. Server tự tính checksum khi nhận, đối tác không cần tự tính.

Không đặt tên file chứa thông tin học viên. Không gửi ảnh chụp chat nguyên bản kèm số điện thoại. Nguồn gốc chưa ẩn danh, nếu cần giữ để đối chiếu, do người được phép lưu riêng; source_ref trong gói chỉ là mã tham chiếu.

## 2. Trường chung cho mọi bản ghi JSONL

| Trường | Quy định |
|---|---|
| id | Bắt buộc, ổn định qua các lần sửa, duy nhất trong gói; dùng tiền tố policy-/faq-/conv-/safety- |
| source_ref | Bắt buộc, mã nguồn để người phụ trách đối chiếu được |
| collected_at | Bắt buộc, ISO 8601 có múi giờ |
| permission_status | `confirmed` hoặc `pending`; chỉ confirmed đủ điều kiện xét xuất bản |
| anonymized | Boolean; true khi đã loại thông tin nhận dạng, kể cả dữ liệu không có danh tính |
| review_status | `draft`, `approved` hoặc `rejected`; đối tác mặc định gửi draft |
| approved_by, approved_at | null khi chưa duyệt; khi approved phải có mã người duyệt nội dung và thời gian |

Trường approved do đối tác điền chỉ là thông tin bàn giao. Chủ dự án vẫn phải kiểm tra và xác nhận bằng lệnh publish trên server; không dùng trạng thái trong tệp bàn giao để tự động xuất bản. Không cần tài khoản ứng dụng cho đối tác hoặc người duyệt.

Không đoán thông tin còn thiếu. Dùng null hoặc ghi chú cần xác nhận; mục chưa rõ sẽ được giữ ở nháp. Chỉ dùng dữ liệu đã được cho phép thu thập và sử dụng cho mục đích trợ lý này. Thay tên bằng `[HOC_VIEN_001]`, bỏ số điện thoại, địa chỉ, tài khoản ngân hàng, tên người thân; giữ mã giả danh nhất quán trong một hội thoại. Giảm chi tiết sức khỏe không cần thiết cho việc phân loại/phản hồi.

## 3. Chính sách — policies.jsonl

Mỗi dòng một điều khoản, không gộp nhiều chính sách độc lập.

- `title`: tên điều khoản; `policy_key`: khóa nghiệp vụ như reservation_max_days.
- `scope`: đối tượng/khóa học áp dụng, dùng mã thống nhất.
- `value`, `unit`: giá trị có cấu trúc nếu là số; chưa xác nhận để null. Tiền dùng số nguyên VND, không dùng chuỗi “2tr8”.
- `rule_text`: diễn đạt đầy đủ; `conditions`: các điều kiện; `exceptions`: ngoại lệ cần ai phê duyệt.
- `effective_from`, `effective_to`: thời điểm bắt đầu/kết thúc; khoảng hiệu lực tính [from, to), null ở to nghĩa chưa xác định ngày kết thúc. Chưa biết from phải để nháp.
- `supersedes_id`: ID điều khoản cũ bị thay thế, hoặc null.

Một khoản hoàn tiền từng xử lý cho một học viên không tự trở thành mức hoàn tiền chung. Cần chủ sở hữu xác nhận các số 20 tuần, 90 ngày, 2.800.000 đồng trong demo trước khi sử dụng. Hai điều khoản cùng policy_key/scope không được có khoảng hiệu lực chồng lấn nếu chưa xác định rõ quy tắc áp dụng.

## 4. FAQ — faq.jsonl

`question`, `answer`, `topic`, `policy_ids` (mảng ID chính sách liên quan). FAQ liên quan tiền/thời hạn phải dẫn policy; nếu chưa có policy xác nhận, câu trả lời yêu cầu người phụ trách kiểm tra. Không chép số liệu hết hạn từ chat cũ.

## 5. Hội thoại — conversations.jsonl

- `student_ref`: mã học viên giả danh; `topic`: chủ đề chính.
- `context`: xưng hô, mã khóa học và thông tin thực sự cần thiết; không thêm suy đoán.
- `messages`: mảng có thứ tự gồm `{role, text}`, role là `student` hoặc `teacher`. Chỉ chứa ngữ cảnh trước câu trả lời mục tiêu; lượt cuối là tin học viên cần trả lời.
- `approved_reply`: câu trả lời thật được chấp nhận, hoặc null nếu chưa có; không tự dùng AI tạo rồi ghi là câu trả lời thật.
- `sensitivity`: `xanh`, `vang`, `do`; `label_reason`: lý do có căn cứ.
- `policy_ids`: chính sách được áp dụng; `must_avoid`: nội dung phải tránh.
- `split`: `train` (ví dụ dùng trong prompt) hoặc `eval` (chỉ đánh giá, không được đưa vào truy xuất).

Xanh: chào hỏi/cảm ơn. Vàng: bài tập, lịch học, chính sách thông thường. Đỏ: ca nhạy cảm cần người phụ trách. Không chắc nhãn thì ghi rõ trong label_reason và để draft; người duyệt quyết định cuối cùng. Thu thập cả ví dụ phủ định/từ khóa mơ hồ để tránh phân loại chỉ dựa trên một chữ.

Không chia những đoạn cùng hội thoại/học viên hoặc bản sao gần giống sang cả train và eval. Nếu câu trả lời thật chưa tốt, ghi nhận để sửa và duyệt; không mặc nhiên coi mọi câu trả lời cũ là mẫu chuẩn.

## 6. Quy tắc nhạy cảm — safety_rules.jsonl

`category`, `keywords`, `instruction`, `safe_reply_template`, `requires_human_review` (true). Từ khóa là dấu hiệu chuyển người xử lý, không phải kết luận về sức khỏe. Mẫu đỏ không gây áp lực học tiếp, không cam kết hoàn tiền nếu chưa kiểm tra điều kiện; cần người phụ trách duyệt cả nội dung lẫn nhãn.

## 7. Giọng văn — persona.md

Dùng mẫu riêng: cách xưng hô; mức thân mật; từ hay dùng; từ cần tránh; cách hỏi lại khi thiếu thông tin; vài câu đúng giọng và sai giọng. Không chứa giá/hạn học, không dùng giọng văn để thay đổi policy. Kèm mã nguồn, quyền sử dụng và trạng thái duyệt ở đầu tệp. Importer phải chuyển metadata này sang mục tri thức có version trước khi publish.

## 8. Quy trình nghiệm thu với đối tác

1. Đợt đầu gửi toàn bộ chính sách hiện hành và 30–50 hội thoại đa dạng để thống nhất cách gắn nhãn.
2. Người phụ trách kiểm tra nguồn, quyền sử dụng và ẩn danh; kiểm tra toàn bộ chính sách và ca đỏ, phản hồi lỗi theo ID.
3. Đối tác sửa đúng ID cũ, không tạo ID mới cho cùng mục chỉ vì sửa câu chữ.
4. Mở rộng 100–300 hội thoại có chất lượng, bổ sung FAQ; dành bộ đánh giá riêng tối thiểu 50 ca. Có thể thêm ca giả lập nhưng phải ghi rõ source_ref là synthetic và được duyệt.
5. Chủ dự án chạy lệnh nhập nháp trên server, xem diff, chạy kiểm thử rồi xuất bản. Đối tác nhận báo cáo số mục hợp lệ/bị từ chối/cần bổ sung.

Điều kiện nhận để xét publish: đúng định dạng, nguồn đối chiếu được, quyền sử dụng confirmed, đã ẩn danh, không trùng/xung đột, policy đúng hiệu lực và được người có thẩm quyền phê duyệt. Dữ liệu thiếu không làm dừng hệ thống: bản tri thức cũ tiếp tục phục vụ.

## 9. Bổ sung dữ liệu cho UC-01–UC-05

Yêu cầu mới nằm trong [plan nghiệp vụ](../../PLAN_LUONG_TRO_LY_HOC_VIEN_AI_BE.md). Không thu thập video, đường dẫn video, video_id hoặc yêu cầu người dùng chọn tệp. Thu thập nhận xét giáo viên bằng văn bản; bài/ngày là thông tin tùy chọn nếu có căn cứ.

Phân biệt hai gói:

- **Kho tri thức chung:** manifest/persona/policies/faq/conversations/safety_rules hiện có, tiếp tục theo schema_version 1.0 và CLI publish. Không nhập hồ sơ thật của học viên thành tri thức chung cho mọi người.
- **Bộ tình huống UC:** `uc_scenarios.jsonl`, bàn giao riêng, chưa thêm vào manifest tri thức 1.0. Dùng cho kiểm thử/mock và xác nhận nghiệp vụ; không đưa `expected` vào prompt khi chạy eval và không import tự động vào hồ sơ production. Mẫu: [uc_scenarios.example.jsonl](uc_scenarios.example.jsonl).

Hồ sơ thật phát sinh lúc sử dụng được lưu bằng API nghiệp vụ, có nguồn và xác nhận. Nếu cần chuyển dữ liệu hồ sơ từ hệ thống khác, lập công cụ import runtime riêng có scope/dedup/review; không dùng CLI publish tri thức thay thế.

### Cấu trúc một tình huống UC

Trường chung ở mục 2 vẫn áp dụng, thêm tiền tố ID `uc-`. Các trường chuyên biệt:

| Trường | Nội dung cần thu thập |
|---|---|
| schema_version, use_case, split | Phiên bản tình huống 1.0, UC-01 đến UC-05, `eval` hoặc `mock`; không phải dữ liệu train |
| scope | workspace_ref/page_ref/conversation_ref/student_ref bằng mã giả; không gộp người trùng tên |
| participant | participant_ref, relation student/parent/unknown; nếu phụ huynh nhiều con, khai báo candidate_student_refs, student_ref có thể null khi chưa xác định |
| messages | Mỗi lượt có id, role student/teacher/parent, text và occurred_at; căn cứ phải tham chiếu ID tồn tại |
| history_window | loaded_message_ids, has_more true/false/null (null là không biết); không khẳng định đã đọc toàn bộ lịch sử |
| pronouns | sender, recipient; có thể null khi chưa chọn, không suy tuổi từ cặp xưng hô |
| teacher_review | null hoặc review_context_ref, teacher_input, positive_points/guidance optional, occurred_at; không có video_id |
| existing_notes | id, text, status active/archived/expired, source_message_ids, revision, review_at, expires_at, manually_confirmed |
| custom_fields | id, name, type text/number/select, options nếu select, input_mode, criteria nếu inference, use_in_generation, value, source_message_ids, assessment_period nếu đánh giá |
| action | Hành động kiểm thử: analyze, change_pronouns, teacher_review, propose_note hoặc propose_field |
| expected | Người phụ trách điền kết quả đúng: dữ kiện được phép dùng, điều chưa biết, đề xuất cần xác nhận, điều cấm, số gợi ý; đây là đáp án kiểm thử, không phải hồ sơ đã lưu |

Bổ sung câu trả lời/nhận xét thật khi đã được cho phép, nhưng không điền suy đoán để đủ cột. Thời điểm, tuổi, tốc độ học và mốc hết hiệu lực thiếu thì để null. Ghi rõ câu nào giáo viên nhập, câu nào AI đề xuất, câu nào người dùng xác nhận; không coi gợi ý AI là sự thật.

### Danh mục tình huống cần có

1. Hai học viên trùng tên ở hai page; phụ huynh nhắn cho một hoặc nhiều con; chưa đủ dữ kiện để chọn hồ sơ.
2. Tin nhắn chỉ tải được một phần, thông tin mới mâu thuẫn note cũ, người dùng đã sửa trước khi AI trả kết quả.
3. Đổi thầy–em sang em–chị, có lời trích dẫn/người thứ ba; bản nháp đã sửa tay phải giữ nguyên.
4. Giáo viên chỉ ghi “Sai nhịp”, có/không hướng dẫn thêm, đầu vào trống; không suy thêm lỗi hay nhận đã xem bài.
5. Ghi chú tạm thời có hạn đã xác nhận, note chỉ có review_at, lỗi cũ chưa có chứng cứ đã khắc phục; AI đề xuất archive nhưng người dùng chưa đồng ý.
6. Tuổi có nguồn hoặc chưa biết; tốc độ học có tiêu chí/giai đoạn hoặc thiếu căn cứ; field chỉ để tham khảo không được dùng tạo câu.

Các mẫu đều giả lập, draft/pending để đối tác hiểu cách điền. Khi dùng làm bộ nghiệm thu cần người phụ trách xác nhận đáp án; không tính mẫu chưa duyệt là tiêu chí chất lượng đã đạt.
