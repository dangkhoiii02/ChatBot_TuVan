# Kế hoạch xây dựng server Bot Trợ Lý Thầy Minh Piano

Ngày cập nhật: 16/09/2026. Nguồn nghiệp vụ: [UC-01–UC-06](PLAN_LUONG_TRO_LY_HOC_VIEN_AI_BE.md); giao diện: [plan UI mock](PLAN_UI_MOCK_TRO_LY_HOC_VIEN.md). Đây là thiết kế triển khai tiếp theo, không phải mô tả các tính năng đã hoàn thành.

## 1. Quyết định kiến trúc

**Nên có cơ sở dữ liệu và chọn SQLite cho phiên bản đầu.** Widget hoặc extension cung cấp giao diện gọn, không có đăng nhập/đăng ký. Một server Node.js phục vụ API và xử lý nghiệp vụ; SQLite lưu dữ liệu trên ổ đĩa bền vững của server. Gemini chỉ được gọi từ backend. Người dùng mở widget/extension, không phải tải database hay cài model AI.

Giả định để lập kế hoạch: một đơn vị vận hành, khoảng 1–10 nhân viên, tối đa 10 yêu cầu sinh phản hồi đồng thời ở đợt kiểm thử đầu; dữ liệu chủ yếu là văn bản. Đây là phạm vi kiểm thử dự kiến, chưa phải năng lực đã đo. Nếu cần nhiều server hoạt động đồng thời hoặc cam kết sẵn sàng cao khi một máy hỏng, cần thiết kế lại phần hạ tầng trước khi phát hành.

| Câu hỏi | Phương án chốt |
|---|---|
| Có bắt buộc database không? | Demo có thể dùng file. Bản vận hành nên dùng database để lưu kết quả, phản hồi đã sửa và các phiên bản tri thức nhất quán. |
| SQLite dùng được không? | Có, với một máy chủ, giao dịch ghi ngắn và tải được kiểm thử. Không cần cài dịch vụ database riêng. |
| Phát hành có nặng không? | Database ở server, không đóng gói vào frontend. Dung lượng tăng theo lịch sử văn bản, hồ sơ, ghi chú và phiên bản tri thức. |
| Nạp data có phải ngừng API không? | Không đối với cập nhật tri thức: nhập bản nháp, kiểm tra, duyệt rồi chuyển phiên bản đang dùng bằng một giao dịch ngắn. |
| API có tự nhớ dữ liệu đã nạp không? | Không coi API sinh nội dung là kho nhớ của dự án. Mỗi yêu cầu phải có ngữ cảnh phù hợp do backend lấy từ dữ liệu của mình. |
| Có cần vector database, Redis hay huấn luyện model ngay không? | Chưa cần. Bắt đầu với tìm kiếm theo chủ đề/từ khóa và hàng đợi nhỏ lưu trong SQLite. |

SQLite phù hợp với dữ liệu cục bộ của ứng dụng; nên chuyển sang database client/server khi cần nhiều máy hoặc nhiều luồng ghi cạnh tranh. Đây là cơ sở cho lựa chọn, không phải bảo đảm hiệu năng cho dự án. [Tài liệu SQLite](https://www.sqlite.org/whentouse.html).

## 2. Hiện trạng cần sửa

Đã đọc `server.js`, giao diện và thư mục `data/`:

- Server Node.js hiện đọc/ghi file đồng bộ; lịch sử là `history.jsonl` và được đọc toàn bộ khi xem.
- `/api/documents` cho sửa tài liệu trực tiếp, chưa tách khỏi API dùng thường ngày, chưa kiểm tra nội dung hay có bản nháp.
- API key được lưu ở `localStorage` và chuyển từ trình duyệt. Cần chuyển sang cấu hình bí mật phía server; không coi localStorage là nơi lưu key an toàn.
- `persona.md`, `policy.md`, `red_flags.json` được đưa vào prompt; `few_shots.json` hiện chủ yếu phục vụ demo/dự phòng, chưa có bước chọn ví dụ liên quan đưa vào lời gọi Gemini. `raw_messages.txt` chưa là kho truy xuất.
- Prompt còn ghi cứng mức hoàn tiền; phải bỏ số liệu cứng khỏi mã nguồn và xác minh lại các con số trong dữ liệu mẫu.
- Chưa có timeout hữu hạn, retry có kiểm soát, hàng đợi bền vững và kiểm tra đầy đủ cấu trúc đầu ra.
- Đổi nhãn kết quả sang đỏ chưa đủ bảo đảm nội dung các gợi ý an toàn; cần đường xử lý riêng cho ca đỏ.
- Lưu lịch sử duyệt không có nghĩa đã gửi tin qua Zalo/Messenger. Chưa coi nút xác nhận hiện tại là tích hợp gửi thật.

## 3. Phạm vi bản phát hành đầu

Người dùng mở widget/extension → mở đúng hội thoại/học viên → xem ngữ cảnh, xưng hô và ghi chú → dán tin hoặc nhập nhận xét trực tiếp → tạo gợi ý → sửa và sao chép. Không có màn hình đăng nhập, đăng ký, hồ sơ tài khoản, phân vai nhân viên hoặc phân công hội thoại. Có hồ sơ học viên và lịch sử ghi chú phục vụ UC-01–UC-05; đây là dữ liệu nghiệp vụ, không phải tài khoản. Bản đầu dùng thao tác dán để tránh phụ thuộc DOM của trang đang mở; đọc đoạn được chọn chỉ bổ sung khi chốt nền tảng extension.

Chế độ chat xanh/vàng có tối đa 5 phương án hợp lệ; chế độ diễn đạt nhận xét giáo viên có 3 phương án cùng dữ kiện; ca đỏ hiện cảnh báo và mẫu đồng cảm đã duyệt, không ép sinh đủ 5 phong cách. Người dùng kiểm tra trước khi sao chép; không cần quy trình duyệt nhiều cấp. Chỉ lưu phản hồi chỉnh sửa khi người dùng chủ động xác nhận.

Chủ dự án nhập và xuất bản dữ liệu bằng lệnh trên server qua SSH, không xây dashboard quản trị hoặc API công khai quản lý kho tri thức chung. Hồ sơ/ghi chú/field học viên được sửa ngay trong widget qua API nghiệp vụ nội bộ. Đối tác chỉ bàn giao tệp. Có thể ghi tên người xác nhận nội dung làm metadata, không cần tạo tài khoản cho họ.

**Giả định phạm vi:** đây là công cụ nội bộ cho bạn/nhóm nhỏ. API triển khai sau mạng riêng/VPN hoặc gateway sẵn có, không thêm đăng nhập trong sản phẩm. Widget công khai cho mọi khách truy cập là phương án khác: khi chọn hướng đó cần chốt giới hạn sử dụng và ngân sách API trước khi mở Internet; không dùng khóa bí mật nhúng trong JavaScript làm hàng rào bảo vệ.

Chưa bao gồm: tự gửi tin, xử lý thanh toán/hoàn tiền, chọn/tải lên/phân tích video và huấn luyện model riêng. Không có video_id, file picker hoặc bước chọn bài bắt buộc; nhận xét gắn với review_context_id của lượt xử lý. Bot chỉ dùng nhận xét văn bản có căn cứ, không tự nhận đã xem clip hoặc bịa mốc thời gian.

## 4. Cấu trúc server

```text
Widget / Extension (nhập → gợi ý → sửa → sao chép)
    │ HTTPS qua kết nối nội bộ đã được cấu hình
Node.js API ─── SQLite trên ổ đĩa bền vững
    │             ├─ hồ sơ, hội thoại, ghi chú, field và revision
    │             ├─ kết quả, phản hồi và jobs
    │             └─ phiên bản tri thức, nguồn, nhật ký
    └─ Bộ xử lý job giới hạn đồng thời ─── Gemini API

Chủ dự án qua SSH → lệnh import / kiểm tra / publish / rollback
Backup SQLite → nơi lưu ngoài máy chủ
```

Giữ Node.js, tái sử dụng phần nhập liệu và hiển thị gợi ý của giao diện hiện có. Bổ sung validation và thư viện SQLite; chốt phiên bản Node LTS, driver và lockfile khi triển khai. Tách vừa đủ thành `generation`, `profiles`, `conversations`, `notes`, `fields`, `knowledge`, `imports`, `db`, `providers/gemini`. Không cần module tài khoản, microservices, Redis hoặc dashboard quản trị riêng.

Widget và extension dùng chung API. Chỉ triển khai một giao diện trước khi đã chọn hình thức phát hành; không xây cả hai cùng lúc. Extension chỉ xin quyền tối thiểu cho thao tác được dùng, không tự thu thập toàn bộ trang/hội thoại. API key Gemini luôn ở server.

API xử lý nhanh; tác vụ AI/import chạy qua job. Bản đầu có thể cùng một dịch vụ, nhưng import nặng chạy worker thread hoặc process riêng để tránh chặn event loop. Ghi database theo lô nhỏ. Không giữ transaction mở trong lúc chờ Gemini hoặc đọc tệp lớn.

## 5. Thiết kế database

Schema dưới đây là đặc tả để viết migration, chưa phải database đã tạo.

| Bảng | Trường và quan hệ chính |
|---|---|
| generations | id, input_text, context_json, knowledge_version_id, prompt_version, model, status, sensitivity, replies_json, source_ids_json, token_usage, latency_ms, error_code |
| feedback | id, generation_id, selected_reply, edited_reply, created_at; người dùng chủ động lưu |
| knowledge_versions | id, parent_id, status, checksum, approved_by_label, approved_at, published_at |
| knowledge_items | version_id, item_id, type, content_json, source_ref, content_hash; khóa ghép (version_id, item_id) |
| knowledge_state | một dòng chứa active_version_id, revision để chống hai lượt xuất bản ghi đè |
| jobs | id, access_token_hash, payload_json, state, attempt, run_after, lease_until, result_id, idempotency_key, expires_at |
| import_batches | id, checksum, status, errors_json, candidate_version_id |

Có bảng students để lưu hồ sơ học viên theo yêu cầu mới; không có users/sessions hay đăng nhập. Không mở rộng thành CRM. Nhật ký thay đổi hồ sơ/ghi chú cần nguồn và revision, không khẳng định biết danh tính người sửa khi chưa có tài khoản.

| Bảng bổ sung | Trường và ràng buộc chính |
|---|---|
| workspaces, pages | Phạm vi triển khai và page; bản local có workspace/page mặc định |
| students | id, workspace_id, page_id, external_student_ref nullable, display_label, revision; không unique theo tên |
| conversations | id, page_id, external_conversation_ref, active_student_id nullable, sender_pronoun, recipient_pronoun, revision |
| conversation_participants | conversation_id, participant_ref, role student/parent/unknown, student_id nullable; không đồng nhất phụ huynh với học viên |
| conversation_messages | id, conversation_id, external_message_ref nullable, role, text, occurred_at, source; dedup theo hội thoại/nguồn |
| review_contexts | id, conversation_id, student_id, teacher_input, optional_positive_points, optional_guidance, occurred_at, revision; không có video_id |
| profile_facts, learning_notes | student_id, conversation_id/source_id, value/text, evidence_kind, status, review_at, expires_at, revision, manually_confirmed |
| field_definitions | student_id, name, type text/number/select, options, input_mode, criteria nullable, use_in_generation=false, hidden, revision |
| field_values | student_id, definition_id, value_json, source_id, evidence_kind, assessment_period, confirmed, revision |
| change_proposals | target_type/id, expected_revision, proposed_action/value, reason, evidence_refs, state pending/applied/rejected/stale |
| entity_changes | entity_type/id, previous_revision, new_revision, source, changed_at, diff; không giữ payload đã xóa hẳn vô hạn |

Generation/job bổ sung conversation_id, student_id, review_context_id nullable, mode chat/teacher_review/context_analysis, profile_revision, conversation_revision, field_revision và input_snapshot. Snapshot chứa đúng ghi chú/field còn hiệu lực và các message_id đã đọc; không giữ transaction trong lúc gọi model. Sự kiện xóa hẳn phải xử lý cả snapshot/history chứa dữ liệu đó theo chính sách lưu giữ.

Bản đầu một workspace tin cậy trên mạng nội bộ; người có kết nối nội bộ được xem/sửa hồ sơ trong workspace, chưa có phân quyền cá nhân. Kiểm tra quan hệ workspace/page/conversation/student ở mọi truy vấn, không dùng ID client gửi để ghép tùy ý. Token job không cấp quyền riêng cho hồ sơ và không thay được bảo vệ mạng. Nếu cần cô lập người dùng/đơn vị qua Internet thì phải thiết kế lớp truy cập trước khi mở dịch vụ.

Bật foreign keys trên từng connection. Đặt unique cho idempotency key; khi tạo yêu cầu, client sinh khóa ngẫu nhiên và một token truy cập ngẫu nhiên riêng bằng bộ sinh số an toàn. Server chỉ lưu hash token, yêu cầu token đúng khi xem job/kết quả hoặc gửi feedback; không dùng ID đoán được để truy cập. Gửi lại cùng key phải kèm đúng token cũ. Token này chỉ bảo vệ kết quả của yêu cầu, không phải tài khoản hay cơ chế hạn chế chi phí tạo yêu cầu mới.

Widget lưu cặp job_id/token trong bộ nhớ phiên để phục hồi khi tải lại; extension dùng vùng lưu riêng của extension. Không đưa token vào URL hoặc log. Không có endpoint lịch sử toàn hệ thống; có API phân trang hội thoại/hồ sơ theo workspace/page và phạm vi đang xử lý. Tạo index `(state, run_after)` và `(version_id, type)`.

Khởi đầu với `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000` và `synchronous=FULL`; đo lại trên hạ tầng thật. WAL cho phép đọc và ghi cùng tiến hành nhưng vẫn chỉ có một writer tại một thời điểm; vẫn phải xử lý `SQLITE_BUSY`, giới hạn thời gian giao dịch và theo dõi checkpoint. Database cùng WAL/SHM ở local persistent volume, không đặt trên thư mục mạng dùng chung. [SQLite WAL](https://www.sqlite.org/wal.html).

Bản đầu không thu thập/lưu tệp media, chỉ lưu văn bản và nguồn tham chiếu cần thiết. Không đặt database, backup hay file nguồn trong `public/` hoặc Git.

## 6. Dữ liệu có làm hệ thống nặng không?

Các phép tính sau chỉ để dự trù, chưa đo thực tế:

- 10.000 mục tri thức × trung bình 2 KB ≈ 20 MB nội dung, chưa tính index và các phiên bản.
- 100.000 lượt xử lý × trung bình 10 KB (tin nhắn, gợi ý, bản sửa) ≈ 1 GB, chưa tính index, WAL và backup.
- Nếu sao chép toàn bộ kho 20 MB thành 10 phiên bản thì riêng nội dung khoảng 200 MB. Bản đầu dùng snapshot đầy đủ để dễ kiểm chứng; tối ưu lưu bản sửa khi số đo cho thấy cần thiết.
- Không có chi phí lưu video trong phạm vi này; không gửi lại tất cả tài liệu ở mỗi request.

Cấu hình thử nghiệm đề xuất: 2 vCPU, RAM 2 GB, SSD 20 GB; phải kiểm thử trước khi chốt. Không chạy model AI trên máy này. Đặt giới hạn upload ban đầu 10 MB/lô văn bản, 1.000 mục/lô; tệp lớn chia lô.

Chi phí hàng tháng = máy chủ + backup/lưu tệp + token Gemini + dịch vụ kênh nhắn tin nếu có. Đo input/output token mỗi lượt và đặt ngân sách theo ngày; không chốt giá model trong tài liệu này. Giới hạn ngữ cảnh đầu vào ban đầu khoảng 8.000 token, giới hạn đầu ra riêng theo model được chọn, lấy số đo thực tế để điều chỉnh.

Đề xuất giữ job/kết quả 7 ngày để mở lại khi cần; phản hồi người dùng chủ động lưu giữ 90 ngày để rà soát. Chốt thời hạn trước phát hành, dọn tự động theo lịch và áp dụng thời hạn tương ứng cho backup. Hồ sơ/ghi chú đã lưu đọc lại từ server khi mở hội thoại trên thiết bị thuộc cùng workspace; không đồng nghĩa phiên job hay bản nháp đồng bộ giữa thiết bị. Hồ sơ còn hoạt động không bị cleanup theo TTL 7 ngày của job; cleanup phải giữ căn cứ hoặc bản trích đã ẩn danh phù hợp cho ghi chú còn hiệu lực.

## 7. Nạp dữ liệu liên tục, không dừng ứng dụng

Phân biệt ba loại thay đổi: cập nhật tri thức có thể chuyển phiên bản trực tiếp; deploy code cần graceful shutdown; thay đổi schema có thể cần migration và cửa sổ bảo trì. Một máy chủ không bảo đảm không gián đoạn khi máy hoặc ổ đĩa hỏng.

### 7.1 Quy trình xuất bản tri thức

1. Đối tác gửi gói dữ liệu theo [hướng dẫn bàn giao](docs/doi-tac-data/README.md).
2. Chủ dự án chạy lệnh import trên server; lệnh lưu import batch và tạo bản nháp, không sửa dữ liệu đang hoạt động. Không cần màn hình upload.
3. Worker kiểm tra schema, ID trùng, nguồn, quyền sử dụng, ẩn danh, tham chiếu policy và khoảng hiệu lực. Lỗi trả theo tệp/dòng/trường. Tệp trùng checksum được báo đã nhập.
4. Tạo phiên bản nháp đầy đủ từ phiên bản cha cùng các mục thêm/sửa/xóa. Việc xóa phải được khai báo, không suy ra từ mục bị thiếu trong lô cập nhật.
5. Kiểm tra xung đột chính sách, tạo chỉ mục truy xuất, chạy bộ đánh giá cố định và trình bày diff cho người duyệt. Dữ liệu thiếu hoặc chưa xác nhận không được xuất bản.
6. Chủ dự án xác nhận nội dung và chạy lệnh publish. Transaction ngắn kiểm tra revision hiện tại, đánh dấu bản mới published, đổi `active_version_id` và ghi log vận hành cùng lúc. Nếu người khác đã xuất bản, báo xung đột và yêu cầu cập nhật bản nháp trên phiên bản cha mới.
7. Nếu validation, build hoặc transaction thất bại, bản đang hoạt động giữ nguyên. Rollback là chuyển con trỏ về phiên bản tốt đã kiểm tra bằng cùng quy trình có log vận hành.

### 7.2 Yêu cầu đang xử lý dùng phiên bản nào?

Tại lúc tiếp nhận job sinh phản hồi, backend đọc active_version_id và lưu vào job trong một transaction ngắn. Toàn bộ persona, policy, luật và ví dụ phải được lấy theo ID đó; nội dung phiên bản published là bất biến.

Ví dụ: A đã nhận phiên bản v12; chủ dự án xuất bản v13; A hoàn thành bằng v12, B tiếp nhận sau đó dùng v13. Kết quả hiển thị phiên bản để truy vết. Khi mở lại kết quả v12 sau khi v13 xuất bản, API trả cờ phiên bản cũ để giao diện nhắc kiểm tra lại chính sách tiền/hạn học. Nếu thay đổi khẩn cấp vì sai chính sách, đánh dấu kết quả cũ cần tạo lại; không thể thu hồi nội dung người dùng đã sao chép ra ngoài.

Bản đầu đọc con trỏ từ SQLite mỗi lần nhận job, chưa cần cache con trỏ. Có thể cache nội dung bất biến theo version_id với giới hạn bộ nhớ. Giữ phiên bản còn job đang chạy hoặc cần truy vết; không xóa theo số lượng đơn thuần. Import chạy riêng và chia lô để tránh giữ khóa ghi lâu.

### 7.3 “Nạp cho API” cụ thể là gì?

Server đọc hồ sơ đúng học viên và lịch sử giới hạn đã tải → chọn policy đúng phạm vi và còn hiệu lực → tìm vài FAQ/ví dụ liên quan → ghép persona, luật an toàn, tối đa 30 tin gần nhất trong phần lịch sử đã tải (còn bị giới hạn token), ý giáo viên và tin nhắn hiện tại → gọi Gemini. Đây là truy xuất ngữ cảnh khi trả lời, không phải huấn luyện lại model và không cần restart API.

Kho nhỏ: lọc theo chủ đề/khóa học/nhãn, xếp hạng từ khóa và chọn khoảng 3–5 ví dụ. Nếu thêm full-text search, phải đánh giá truy vấn tiếng Việt có/không dấu trên dữ liệu thật. Chỉ bổ sung embeddings khi bộ kiểm thử cho thấy truy xuất từ khóa bỏ sót đáng kể; index mới cũng phải sẵn sàng trước publish và gắn cùng version_id.

## 8. Luồng AI và vận hành khi Gemini lỗi

1. Kiểm tra kết nối qua gateway nội bộ, kiểu/độ dài dữ liệu, rate limit và ngân sách gọi AI.
2. Kiểm tra quan hệ học viên/hội thoại, revision và snapshot ngữ cảnh; lưu yêu cầu và job với idempotency key; UI nhận job_id, polling trạng thái và có thể mở lại sau khi tải lại trang.
3. Chạy luật cờ đỏ trước. Nếu trúng, hiện cảnh báo để người dùng xử lý trực tiếp, dùng mẫu an toàn đã duyệt. Nếu chỉ model phát hiện đỏ, áp dụng cùng quy trình; không chỉ đổi nhãn trên nội dung đã sinh.
4. Lấy ngữ cảnh theo phiên bản ghim. Nội dung người dùng/tài liệu tham khảo là dữ liệu, không được ghi đè system instruction. Policy là nguồn cho giá và thời hạn; ví dụ hội thoại không được biến ngoại lệ thành quy định chung.
5. Gọi provider adapter; model do server cấu hình bằng allowlist. Kiểm tra model thực sự khả dụng với tài khoản khi triển khai, không mặc định tên đang ghi trong demo là hợp lệ.
6. Kiểm tra JSON/schema, độ dài, nhãn, số gợi ý và nguồn policy. JSON đúng cấu trúc không chứng minh nội dung đúng. Các giá trị tiền/ngày quan trọng lấy bằng logic xác định và mẫu dựng từ policy; trường hợp không đối chiếu được chuyển người duyệt, không tự cam kết.
7. Lưu kết quả trước khi báo job hoàn thành. Người dùng sửa/chọn rồi sao chép; chỉ lưu nội dung chỉnh sửa và thời gian khi họ xác nhận, không thu danh tính. Phản hồi đã duyệt chỉ trở thành ứng viên ví dụ, phải rà soát trước khi nhập tri thức.

Gemini hỗ trợ structured outputs nhưng chỉ hỗ trợ một phần JSON Schema, nên phải chọn schema tương thích và kiểm tra lại phía backend. [Tài liệu Gemini](https://ai.google.dev/gemini-api/docs/structured-output).

Đề xuất timeout 30 giây/lần gọi, tối đa 2 lần retry cho lỗi tạm thời (429/5xx/mạng), backoff có jitter, tuân thủ Retry-After và tổng deadline job 120 giây. Hết hạn thì báo lỗi rõ ràng và cho thử lại; không giữ job chờ vô hạn. Không retry lỗi xác thực hoặc dữ liệu không hợp lệ. Giới hạn số job AI chạy đồng thời theo quota, khởi đầu 3 và điều chỉnh sau đo tải.

Worker dùng lease; job đang chạy được thu hồi sau khi worker chết và lease hết hạn. Idempotency ngăn tạo bản ghi/feedback trùng; timeout mạng vẫn có thể khiến provider đã xử lý và tính phí dù chưa nhận được kết quả. Không hứa chỉ gọi provider đúng một lần.

Gemini lỗi: tiếp tục cho nhập tin, xem kết quả đã có trong phiên và soạn thủ công, hiển thị trạng thái lỗi/hàng chờ rõ ràng. Không lấy mẫu khớp chuỗi một phần rồi trình bày như câu trả lời thật. Backup/job giúp phục hồi ứng dụng, không bảo đảm nhà cung cấp AI luôn hoạt động.

## 9. API dự kiến

Các endpoint cần cho luồng mới, dùng tiền tố `/api/v1`:

| Endpoint | Mục đích |
|---|---|
| POST /generate | Nhận mode, conversation_id, student_id, review_context_id nếu có, revision và tin nhắn/ngữ cảnh, Idempotency-Key và token truy cập kết quả; lưu job, trả 202 và job_id |
| GET /jobs/:id | Token đúng mới xem được trạng thái và kết quả; không trả nội dung nếu sai token |
| POST /jobs/:id/feedback | Token đúng mới lưu được câu đã chọn/sửa; chống lưu trùng |
| POST /conversations/resolve; GET /conversations/:id/context | Tạo/tìm đúng hội thoại theo page và ID nguồn; trả hồ sơ, người nhắn, phạm vi message đã tải, revision; không tự gộp theo tên |
| GET /pages/:id/conversations; GET /pages/:id/students | Danh sách phân trang đúng page/workspace cho widget; không tra cứu xuyên workspace |
| POST /students; PATCH /conversations/:id/student | Tạo hồ sơ hoặc gắn học viên được người dùng xác nhận; phụ huynh nhiều con phải chọn đúng em |
| POST /conversations/:id/messages | Nhập đoạn lịch sử văn bản được cung cấp, dedup; trả phạm vi đọc được và has_more=true/false/null |
| PATCH /conversations/:id/pronouns | Lưu cặp xưng hô với expected_revision; cập nhật gợi ý phía client không gọi AI lại |
| POST /conversations/:id/review-contexts; PATCH /review-contexts/:id | Lưu/sửa nhận xét trực tiếp theo lượt, trả revision; không đòi tệp đính kèm |
| POST /conversations/:id/analyze | Job đề xuất facts/notes/next_actions, nguồn và phạm vi đã đọc; chưa ghi vào hồ sơ chính thức |
| PATCH /students/:id/facts | Sửa/lưu dữ kiện hồ sơ bằng expected_revision, lưu căn cứ và lịch sử |
| POST /students/:id/notes; PATCH /notes/:id | Chủ động lưu/sửa/archive, expected_revision; phân biệt review_at và expires_at |
| DELETE /notes/:id | Xóa hẳn có xác nhận rõ; xử lý snapshot/history và log theo chính sách xóa |
| POST /students/:id/fields; PATCH /fields/:id; DELETE /fields/:id | Định nghĩa field riêng học viên; ẩn khác xóa định nghĩa, xóa phải nêu ảnh hưởng tới giá trị |
| PUT /students/:id/fields/:fieldId/value; DELETE /students/:id/fields/:fieldId/value | Kiểm tra kiểu/phạm vi; sửa hoặc xóa giá trị riêng, giữ định nghĩa |
| POST /proposals/:id/apply; POST /proposals/:id/reject | Người dùng áp dụng/từ chối đề xuất; revision thay đổi thì trả 409 và đánh stale |
| GET /students/:id/changes | Lịch sử thay đổi có phân trang, nguồn và thời gian; không bịa danh tính người sửa |
| GET /health/live; GET /health/ready | Tiến trình sống; DB và phiên bản tri thức sẵn sàng |

Không có endpoint đăng nhập/đăng ký, quản lý người dùng, liệt kê lịch sử toàn hệ thống hoặc chỉnh sửa kho tri thức chung qua HTTP. API hồ sơ/ghi chú chỉ phục vụ workspace nội bộ. Import, kiểm tra, publish và rollback là lệnh CLI chỉ chạy trên server. CLI và worker dùng chung validation và logic phiên bản.

Lỗi theo cấu trúc `{error: {code, message, request_id}}`; 400 dữ liệu lỗi, 403 token truy cập kết quả không hợp lệ, 409 xung đột, 413 quá lớn, 429 quá tải, 503 tạm không phục vụ. Không trả stack trace hoặc key. Không đánh readiness thất bại chỉ vì Gemini tạm lỗi: chế độ soạn thủ công vẫn dùng được.

Tích hợp gửi tin là giai đoạn sau: thêm outbox, khóa chống gửi trùng, webhook xác minh chữ ký và trạng thái delivered/failed. Trước đó UI chỉ ghi “đã duyệt/đã sao chép”, không ghi “đã gửi thành công”.

## 10. Bảo mật, triển khai và backup

- HTTPS và giới hạn truy cập hạ tầng cho bản nội bộ. Không xây mật khẩu, cookie đăng nhập hoặc phân quyền người dùng. Tách đường vận hành SSH khỏi API widget. Token từng job giới hạn việc đọc kết quả; gateway và quota giới hạn việc tạo yêu cầu.
- API key ở biến môi trường hoặc secret store; không đưa vào frontend, prompt log, Git hay URL ghi log. Bỏ nhận key/model tùy ý từ client production.
- CORS chỉ origin được phép; CORS không thay thế kiểm soát truy cập và không ngăn được client ngoài trình duyệt; validation body, giới hạn request, parameterized SQL, escape nội dung AI/người dùng khi render để tránh XSS.
- Thu thập tối thiểu thông tin học viên; không đưa số điện thoại, địa chỉ, tài khoản ngân hàng vào ví dụ. Chỉ gửi phần dữ liệu cần thiết sang provider sau khi thống nhất quyền sử dụng và cấu hình lưu giữ dữ liệu.
- Một VPS/container có persistent volume ngoài image. Restart có supervisor; SIGTERM ngừng nhận job mới, hoàn tất việc có thể hoàn tất và để lease phục hồi phần còn lại.
- Migration có đánh số, backup trước đổi schema; ưu tiên thêm bảng/cột tương thích rồi chuyển code. Cập nhật code một instance có thể có gián đoạn ngắn; nếu cần deploy không gián đoạn phải bổ sung cơ chế chuyển traffic và thử nghiệm riêng.
- Backup online bằng cơ chế SQLite hỗ trợ; không chỉ copy riêng file `.db` đang chạy WAL. [SQLite Online Backup API](https://www.sqlite.org/backup.html).
- Mục tiêu đề xuất: backup mỗi giờ, giữ bản giờ 48 giờ và bản ngày 30 ngày ngoài máy chủ, mã hóa và hạn chế truy cập; RPO ≤ 1 giờ, RTO ≤ 2 giờ phải được xác nhận bằng diễn tập. Backup cả manifest phiên bản và nguồn văn bản cần cho khôi phục.
- Diễn tập restore trên máy/thư mục tách biệt mỗi tháng: kiểm tra integrity, số bản ghi, phiên bản active, tạo/duyệt tin. Kiểm tra bản backup mới nhất trước phát hành.
- Metrics: độ trễ API, tuổi job lâu nhất, lỗi Gemini, token/chi phí, SQLITE_BUSY, dung lượng ổ, kích thước WAL, lỗi import và tuổi backup. Cảnh báo disk >80%, backup quá 2 giờ, job vượt deadline; tránh log nguyên văn hội thoại mặc định.

Khi cần nhiều máy cùng ghi, thời gian chờ khóa thường xuyên vượt mục tiêu sau tối ưu, hoặc cần dự phòng tự động khi một máy hỏng: chuyển PostgreSQL. Chuẩn bị bằng migration và repository layer; chuyển đổi vẫn cần thử dữ liệu, đối chiếu số bản ghi, ngừng ghi ngắn hoặc đồng bộ thay đổi có thiết kế riêng. Không coi đổi database là thao tác tức thời.

## 11. Lộ trình và điều kiện nghiệm thu

Ước lượng điều chỉnh 5–7 tuần cho một lập trình viên quen stack, với điều kiện đối tác bàn giao đúng hạn; cần điều chỉnh sau kiểm tra dữ liệu.

| Giai đoạn | Việc phải bàn giao | Điều kiện hoàn thành |
|---|---|---|
| 1: Chốt dữ liệu, 2–3 ngày | Bộ thu thập, policy được chủ sở hữu xác nhận, 30–50 ví dụ thử | Không coi số trong demo là chính sách đã phê duyệt; thống nhất người duyệt |
| 2: Server và giao diện nhỏ, 3–4 ngày | SQLite/migration, API generate, một widget hoặc extension tối thiểu | Không có tài khoản; nhập → tạo → sửa → sao chép hoạt động; dữ liệu còn sau restart |
| 3: AI/jobs, 3–4 ngày | Adapter, truy xuất, validation, retry/deadline, duyệt | Lỗi provider không mất tin, restart phục hồi job, ca đỏ vào đúng luồng |
| 3b: UC-01–UC-05, 8–12 ngày | Hồ sơ/page/conversation, ghi chú/field, proposal/revision, xưng hô token, nhận xét trực tiếp | Không lẫn học viên, không ghi đè sửa tay, mở lại còn dữ liệu, không cần chọn video |
| 3c: UI mock và ghép luồng, 3–5 ngày | Sidebar/profile, draft, field/note states theo plan UI riêng | Kiểm thử chuyển hội thoại, phản hồi muộn, responsive và lỗi lưu |
| 4: Tri thức phiên bản, 3–4 ngày | CLI import nháp, diff, publish/rollback | Publish đồng thời không ghi đè; request đang chạy không trộn phiên bản |
| 5: Production, 3–4 ngày | TLS, persistent volume, monitoring, backup/restore, tài liệu vận hành | Vượt kiểm thử tải/lỗi, khôi phục được từ backup, người vận hành thử chấp nhận |

Bộ nghiệm thu tối thiểu:

1. Import JSON lỗi, thiếu nguồn, policy xung đột, ID trùng: bản active không thay đổi; nhập lại cùng lô không nhân đôi dữ liệu.
2. Giữ request A đang chạy, publish v2, tạo B: A dùng trọn v1, B dùng trọn v2; rollback cũng nhất quán. Crash giữa publish không tạo trạng thái nửa chừng.
3. Gemini timeout/429/5xx, JSON hỏng hoặc thiếu candidate: lỗi có trạng thái, retry hữu hạn, không mất tin, UI soạn thủ công được.
4. Worker chết giữa job: lease được thu hồi, không nhân đôi kết quả/feedback; bấm gửi yêu cầu lặp cùng key trả cùng job.
5. Ca đỏ không sinh nội dung níu kéo; thiếu policy thì hỏi lại/chuyển người thật; không bịa số tiền hay nhận đã xem video.
6. Sai/thiếu token không đọc được job hay ghi feedback; API nội bộ không truy cập được từ mạng ngoài cấu hình; kiểm tra XSS, payload quá lớn, rate limit; Gemini key không có trong gói widget/extension hoặc log. Không có đường sửa dữ liệu công khai.
7. Mục tiêu tải thử: 10 người dùng giả lập, import 1.000 mục cùng lúc; p95 API không gọi AI <500 ms, nhận job <1 giây, không có lỗi khóa DB không xử lý. Đo AI riêng vì phụ thuộc quota/provider.
8. Chạy soak test ít nhất 8 giờ, theo dõi memory/WAL/hàng đợi; restore từ backup và đo RPO/RTO thực tế.
9. Bộ đánh giá cố định tối thiểu 50 ca, tách theo hội thoại khỏi dữ liệu ví dụ: đủ xanh/vàng/đỏ, phủ định từ khóa, hỏi giá, thiếu thông tin và prompt injection. Người duyệt chấm đúng policy, độ tự nhiên và mức cần sửa. Mọi ca kiểm thử sai tiền hoặc xử lý đỏ không đạt đều chặn phát hành.

10. Hai học viên trùng tên khác page không bị gộp; phụ huynh nhiều con chưa chọn em thì không truy xuất nhầm ghi chú. Kết quả AI muộn không áp sang hội thoại đang mở khác.
11. Revision thay đổi trong lúc AI chạy: giữ sửa tay, đề xuất cũ thành stale; ghi hai cửa sổ đồng thời nhận 409 thay vì last-write-wins.
12. Đổi thầy–em sang em–chị cập nhật gợi ý không gọi model, không thay người thứ ba/trích dẫn; draft sửa tay không đổi, thay draft có undo.
13. Chỉ nhập “Sai nhịp” nhận 3 cách nói cùng ý, không thêm lỗi ngón/timestamp/đã xem bài; không có đầu vào vẫn chỉ nhận lời tiếp nhận, không có bước chọn video.
14. Ghi chú review_at đến hạn vẫn chờ rà soát, expires_at đã xác nhận thì ngừng đưa vào prompt; AI không tự lưu/xóa; archive và xóa hẳn có hành vi khác nhau.
15. Field type validation, use_in_generation=false loại khỏi prompt, tuổi không suy từ xưng hô, tốc độ học thiếu tiêu chí thì không đánh giá. Ẩn/xóa giá trị/xóa định nghĩa phải phân biệt.
16. Mở lại hội thoại sau restart khôi phục hồ sơ/ghi chú/field và nguồn; báo đúng “đã đọc N tin trong phạm vi X”, không coi thiếu lịch sử là thiếu sự kiện.

## 12. Dữ liệu đối tác cần cung cấp

Bàn giao theo [docs/doi-tac-data/README.md](docs/doi-tac-data/README.md), kèm các tệp mẫu trong cùng thư mục. Đối tác không cần biết SQLite hay gửi database.

Ưu tiên: chính sách có nguồn và người phê duyệt → hồ sơ giọng văn → FAQ → hội thoại ẩn danh có câu trả lời thật đã duyệt → ca nhạy cảm và mẫu xử lý. Bắt đầu 30–50 hội thoại để rà cách thu thập, sau đó mở rộng khoảng 100–300 ca đa dạng; đây là mục tiêu thu thập, không phải cam kết đạt chất lượng khi đủ số lượng.

Dữ liệu thu thập và dữ liệu chạy thật có vòng đời riêng. Tin nhắn mới không tự trở thành tri thức; câu trả lời đã duyệt không tự trở thành chính sách. Người có quyền của Thầy Minh chịu trách nhiệm xác nhận nội dung cuối cùng trước publish.

## 13. Hợp đồng nghiệp vụ UC-01–UC-05

### Hồ sơ và phạm vi ngữ cảnh

Dùng mặc định đề xuất ở mục 9 của plan nghiệp vụ. Một workspace nội bộ có nhiều page; page có conversation và hồ sơ student riêng. Không suy quan hệ cha mẹ/con hay nối hai page chỉ bằng tên. Bản thử thủ công dùng page=local và mã hội thoại ổn định do host cung cấp hoặc người dùng tạo; chưa có tích hợp Zalo/Messenger thì không giả đã tự đồng bộ lịch sử.

Context response có loaded_message_count, used_message_ids, window_start/end, has_more (true/false/null; null là chưa biết), student_id, participant_role và revision. Tối đa 30 tin là giới hạn lựa chọn mặc định, không phải toàn bộ lịch sử. AI trả facts/observations/unknowns, source_refs và next_actions; nhận định suy ra chỉ là đề xuất, không tự thành sự thật.

### Đổi xưng hô không gọi lại AI

Gợi ý trả nội dung có cấu trúc: các đoạn literal và token sender/recipient cho đúng vai. Ví dụ [{type:"sender"},{type:"text",text:" gửi "},{type:"recipient"},{type:"text",text:" hướng dẫn nhé"}]. Renderer dùng cặp xưng hô đã chọn, xử lý viết hoa đầu câu; trích dẫn/người thứ ba là literal, không chạy replace toàn chuỗi. Validate segment schema và test các trường hợp nhập nhằng. Nếu output không phân vai chắc chắn, đánh dấu cần sửa thay vì hứa thay chính xác. Persona không ghi đè lựa chọn người dùng.

Lưu cặp xưng hô theo hội thoại. Gợi ý cập nhật tức thì; bản nháp sửa tay giữ nguyên. Người dùng bấm dùng lại gợi ý mới để thay draft và có undo. Tin lịch sử giữ nguyên. Generation gắn conversation_id, input revision và request sequence để UI không áp kết quả của hội thoại A sang B.

### Nhận xét trực tiếp và bộ nhớ

mode=teacher_review nhận teacher_input bắt buộc để có nhận xét chuyên môn, optional điểm tốt/hướng dẫn/điều tránh; tạo 3 cách nói đồng nghĩa nghiệp vụ. review_context_id định danh lượt nhận xét mới, không yêu cầu chọn bài, video, upload hay attachment_id. Bài/ngày chỉ là metadata tự do nếu người dùng cung cấp. Lượt mới không tái dùng nhận xét cũ làm kết quả hiện tại.

AI có thể đề xuất save/use_once/update/archive kèm lý do, evidence_refs, expected_revision và review_at nếu có căn cứ. Chỉ người dùng xác nhận mới thay dữ liệu chính thức. expires_at phải có căn cứ và xác nhận; review_at chỉ nhắc rà soát. Các note archived/expired không vào ngữ cảnh lưu ý hiện tại; có thể tham chiếu lịch sử với nhãn rõ khi người dùng yêu cầu. Không tự coi lỗi đã khắc phục vì không được nhắc lại.

Field custom gồm định nghĩa và giá trị riêng; text/number/select, manual/explicit_fact/inference, tiêu chí khi inference và use_in_generation. Bản đầu scope riêng từng student, chưa có template chung. Đầu ra suy luận phải có kỳ đánh giá/căn cứ; không suy tuổi từ xưng hô hoặc tốc độ học từ tốc độ nhắn tin.

### Chống kết quả cũ ghi đè dữ liệu mới

Mọi sửa hồ sơ/ghi chú/field dùng expected_revision. Lấy snapshot đầu job, lưu đề xuất riêng; khi apply kiểm tra revision target lẫn scope. Nếu đổi học viên/ngữ cảnh trong lúc job chạy, trả kết quả dưới nguồn cũ kèm stale, không tự áp. UI giữ input khi lỗi mạng/lưu, chỉ báo đã lưu sau commit. Retention và xóa hẳn phải xử lý cả proposal, snapshot, lịch sử thay đổi, dữ liệu ví dụ phát sinh và chu kỳ backup; không hứa xóa ngay các backup bất biến còn thời hạn lưu.
