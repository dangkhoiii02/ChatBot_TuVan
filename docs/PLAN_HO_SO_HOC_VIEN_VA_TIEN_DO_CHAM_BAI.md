# Kế hoạch hồ sơ học viên, ghi nhớ và tiến độ trả bài

Ngày lập: 21/09/2026; bổ sung yêu cầu theo dõi nhiều lỗi qua nhiều tin nhắn. Trạng thái: đã triển khai phần lớn chức năng trên backend, web và widget; nghiệm thu Pancake thật, đánh giá AI trên hội thoại thật và đo hiệu năng vẫn đang chờ. Phạm vi: backend, AI, web và widget Pancake.

## 1. Mục tiêu và hiện trạng

Mỗi học viên cần một hồ sơ ngắn, có căn cứ, để người trực biết cách xưng hô, lưu ý hiện hành, biến cố liên quan, bài đang tập, lỗi kỹ thuật trước đây và tiến độ sửa lỗi. API phải trả hồ sơ nhanh mà không phân tích lại toàn bộ lịch sử ở mỗi lần tạo gợi ý.

Hiện có `student_contexts` trong SQLite, khóa `(page_id, student_id)`, chứa profile/memories/custom fields dạng JSON và revision chống sửa chồng. Web và widget đã đọc/sửa phần này. Nhưng `/api/suggestions` chưa lấy hồ sơ đã lưu để đưa vào prompt: `studentId` và `contextRevision` chỉ được ghi vào log generation. Chế độ chấm bài chỉ nhận `teacherInput` và lịch sử tin nhắn, chưa có định danh lượt nhận xét. Danh sách tin Pancake được lấy theo trang, mặc định web 30 tin, API tối đa 50 tin mỗi lần; không có tiến trình đồng bộ lịch sử và liên kết bài tập. Vì vậy chưa thể suy ra số lần lặp hoặc số phiên trả bài trên toàn lịch sử một cách đáng tin.

Tên khách hàng, `customerId` hay một `conversationId` Pancake không luôn đồng nghĩa với một học viên. Tài khoản phụ huynh hoặc gia đình dùng chung phải được gắn rõ với từng học viên; khi chưa rõ thì hiển thị ngữ cảnh của hội thoại nhưng không lấy hồ sơ của một em bất kỳ để soạn lời.

## 2. Cách hiểu các thông tin cần lưu

| Mục | Dữ liệu cần có | Quy tắc dùng trong gợi ý |
| --- | --- | --- |
| Nhắc nhở/yêu cầu đặc biệt | Tên muốn được gọi, xưng hô, lịch liên hệ, cách phản hồi mong muốn, lưu ý học tập; nguồn và hiệu lực | Áp dụng yêu cầu đã xác nhận còn hiệu lực. Nếu tin mới mâu thuẫn, báo người trực kiểm tra. |
| Biến cố/sự kiện | Nội dung ngắn, ngày hoặc khoảng thời gian, người liên quan, mức liên quan, trạng thái và nguồn | Chỉ nhắc khi liên quan tới câu trả lời hiện tại; chuyện riêng tư hoặc nhạy cảm cần hạn chế đưa vào câu chữ gửi đi. |
| Tính cách/phong cách học | Quan sát có ích cho cách dạy, ví dụ “thích hướng dẫn từng bước”; có nguồn và có thể sửa | Không tự gắn nhãn tâm lý hay kết luận cố định về tính cách từ vài tin nhắn. |
| “Bệnh cũ – toa cũ gần nhất” | **Đã chốt:** lỗi kỹ thuật từng gặp và bài tập/cách sửa giáo viên đã dặn gần nhất cho từng lỗi, kèm bài, tin nhắn/lượt trả bài và ngày | Đưa vào mục tham khảo “lần trước”; không coi là lỗi của bài hiện tại nếu giáo viên chưa xác nhận. |
| Bị kẹt ở bài | Bài cụ thể, mốc bắt đầu có căn cứ, lần trả bài, trạng thái đã vượt/chưa vượt/chưa rõ | Hiện cả số ngày lịch và số lượt có phản hồi; ghi “từ ít nhất ngày…” nếu lịch sử chưa đủ. |
| Lỗi lặp lại | Một học viên có thể đồng thời mắc 2–3 lỗi khác nhau, mỗi lỗi xuất hiện ở nhiều tin nhắn và thời điểm; lưu tất cả lần xuất hiện có nguồn | Xem toàn bộ lỗi, lỗi xuất hiện gần đây nhất và lỗi còn tồn tại/chưa xác nhận đã sửa; tách số lần xuất hiện khỏi số lượt trả bài. |

“Bệnh” ở đây là cách nói nội bộ về lỗi chơi đàn. Nếu người dùng muốn lưu bệnh lý/sức khỏe thực tế, đó là loại ghi chú nhạy cảm riêng, không nhập chung với thống kê lỗi kỹ thuật.

## 3. Các phương án đã thảo luận và lựa chọn

### 3.1 Định danh học viên khi một tài khoản có nhiều người học — đã chọn B

| Phương án | Ưu điểm | Giới hạn |
| --- | --- | --- |
| A. Một hồ sơ cho mỗi `customerId` hoặc hội thoại | Ít thao tác, triển khai nhanh | Trộn lỗi, bài tập và biến cố của anh/chị/em dùng chung tài khoản; thống kê sai. |
| B. Hồ sơ học viên riêng, liên kết tài khoản/hội thoại với học viên; người trực chọn khi mơ hồ **(khuyến nghị)** | Thống kê đúng người, dùng được qua nhiều hội thoại, hỗ trợ phụ huynh nhiều con | Cần UI chọn học viên và bước chuyển dữ liệu cũ. |

Khuyến nghị tạo `student_id` nội bộ bất biến, phạm vi page/workspace. Bảng liên kết lưu `(page_id, customer_id, conversation_id, student_id, valid_from, valid_to, source, confirmed_by)`. Một hội thoại có thể chuyển học viên theo khoảng thời gian; gắn từng lượt trả bài với học viên đã chọn. Không tự gộp theo tên. Khi mapping chưa xác định, API trả `identity_status=needs_selection`, không ghi dữ kiện dài hạn.

### 3.2 Cách đưa dữ kiện mới vào hồ sơ — đã chọn C

| Phương án | Ưu điểm | Giới hạn |
| --- | --- | --- |
| A. Nhân viên nhập tay hết | Độ tin cậy cao | Dễ bỏ sót, tốn công đọc lịch sử. |
| B. AI trích xuất và lưu tự động | Ít thao tác | Có thể lưu sai người, sai bài, suy diễn sự kiện hoặc lỗi. |
| C. AI đề xuất, nhân viên duyệt; thống kê từ các lần xuất hiện đã xác nhận **(đã chọn)** | Cân bằng tốc độ và độ chính xác; dễ truy ngược nguồn | Cần giao diện duyệt đề xuất. |

AI trả các đề xuất có `type`, nội dung, `student_id`, `conversation_id`, `source_message_ids` hoặc `review_id`, thời điểm, mức chắc chắn và hành động `add/update/archive`. Đề xuất không tự trở thành dữ kiện đã xác nhận. Ưu tiên dữ liệu do người trực chỉnh; khi mâu thuẫn, giữ giá trị cũ và báo kiểm tra. Yêu cầu xưng hô do học viên nêu rõ có thể nổi bật để duyệt nhanh.

## 4. Mô hình dữ liệu đề xuất

Giữ `student_contexts` để tương thích profile đang có, nhưng tách dữ liệu có vòng đời và cần truy vấn thống kê sang bảng riêng. Không tiếp tục dồn toàn bộ lượt trả bài và lịch sử lỗi vào mảng JSON vì khó khóa ngoại, lọc theo thời gian, chống trùng và cập nhật đồng thời.

| Bảng/thực thể | Trường chính và vai trò |
| --- | --- |
| `students` | `id`, `page_id`, tên hiển thị, trạng thái, ngày tạo/sửa. Không dùng tên làm khóa. |
| `student_identity_links` | Liên kết Pancake customer/conversation với học viên, nguồn xác nhận, khoảng hiệu lực. |
| `student_facts` | Loại `preference/event/learning_note`, nội dung, hiệu lực, mức dùng trong gợi ý, trạng thái, nguồn, người xác nhận, revision. Có thể chuyển dữ liệu `specialNotes`/`memories` đang dùng sang đây từng bước. |
| `message_refs` hoặc kho tin tối thiểu | ID nguồn Pancake, page, conversation, sender, thời điểm, dấu vết đồng bộ và đoạn nguyên văn cần dẫn chứng. Có thể lưu bản nguyên văn đầy đủ theo chính sách lưu trữ; không lấy URL attachment làm bằng chứng AI đã xem video. |
| `assignments` | Một bài/đoạn đang luyện, `student_id`, tên bài chuẩn hóa, ngày bắt đầu có căn cứ, trạng thái, ngày kết thúc, nguồn. |
| `review_sessions` | Một **lượt trả bài có phản hồi**: `student_id`, `assignment_id`, mốc nộp và phản hồi, `conversation_id`, message IDs, nhận xét gốc của giáo viên, trạng thái xác nhận. Sinh 3 câu gợi ý nhiều lần vẫn là một lượt. |
| `issue_types` + `student_issues` | Tên lỗi chuẩn hóa và một hồ sơ cho **từng lỗi của từng học viên**, có tóm tắt, bài liên quan, trạng thái hiện tại, lần đầu/lần gần nhất, thời điểm giải quyết hoặc tái phát. Một học viên có nhiều `student_issues`. |
| `issue_occurrences` | Một lần lỗi thực sự xuất hiện tại một thời điểm/lần tập: `student_issue_id`, `occurred_at`, `assignment_id`, `review_session_id` nếu có, nguồn báo lỗi (`teacher_confirmed`, `student_reported`, `staff_confirmed`), trạng thái duyệt. Không bắt buộc phải thuộc lượt chấm bài. |
| `issue_evidence` | Một hoặc nhiều `message_id`/`review_id` cho cùng lần xuất hiện, đoạn trích **nguyên văn**, người nói, thời điểm và loại bằng chứng. Tin chỉ nhắc lại lỗi cũ được lưu làm ngữ cảnh, không tự tạo lần mắc lỗi mới. |
| `practice_actions` | “Toa” theo nghĩa bài tập/cách sửa giáo viên dặn; gắn với `student_issue_id` và nguồn tin/lượt chấm bài, ngày và trạng thái. Mỗi lỗi có thể có cách sửa gần nhất riêng. |
| `extraction_proposals` | Đề xuất AI chờ duyệt/từ chối, nguồn, phiên bản prompt/model và thời điểm. |
| `student_summary_snapshots` | Bản tóm tắt ngắn đã tính sẵn, revision/nguồn bao phủ, thời gian cập nhật. |

Chỉ số nên được truy vấn/tính từ `issue_occurrences`, `issue_evidence` và `review_sessions`; snapshot phục vụ đọc nhanh, không là nguồn sự thật duy nhất. Dữ liệu cũ trong `student_contexts` cần migration có thể chạy lại, giữ bản gốc và đánh dấu `legacy/unverified` khi không có nguồn. Không biến note cũ thành một lần lỗi được xác nhận.

## 5. Quy tắc tính tiến độ và lỗi lặp

1. **Xác định bài:** nhân viên chọn bài khi chấm, hoặc xác nhận bài AI nhận diện từ tin nhắn. Không gộp hai bài chỉ vì cùng tiêu đề mơ hồ. Có thể lưu tên gốc và khóa chuẩn hóa.
2. **Mở đợt bị kẹt:** bắt đầu từ mốc đầu tiên có bằng chứng học viên nộp bài/chia sẻ đang vướng hoặc giáo viên giao bài và học viên xác nhận đang tập. Chọn định nghĩa mặc định là **lần đầu có bằng chứng đang vướng**, hiển thị mốc thay vì suy từ tin nhắn bất kỳ.
3. **Số ngày:** `ngày kết thúc hoặc hôm nay - mốc bắt đầu`, theo múi giờ vận hành; nhãn “ít nhất” nếu chưa đồng bộ đủ lịch sử. Hiển thị “chưa rõ” khi không có mốc đáng tin. Nên kèm ngày gửi bài và ngày phản hồi cuối, tránh hiểu số ngày là thời gian nhân viên chưa trả lời.
4. **Số phiên trả bài:** mỗi lần nộp bài có phản hồi giáo viên là một `review_session`; nhiều tin nhắn và nhiều lần tạo câu gợi ý trong cùng phiên tính một. Nếu chỉ nhận clip mà chưa có phản hồi, ghi “đã nộp, chờ nhận xét” riêng.
5. **Đã vượt bài/lỗi:** trạng thái từng lỗi là `đang gặp`, `chưa xác nhận đã sửa`, `đã sửa`, hoặc `tái phát`. Chỉ chuyển sang `đã sửa` khi giáo viên xác nhận hoặc có bằng chứng rõ được người trực duyệt. Nếu sau đó có lần mắc mới, chuyển `tái phát`. Im lặng trong 30 tin gần nhất không chứng minh đã sửa.
6. **Lần xuất hiện:** một lỗi được ghi khi có căn cứ rằng học viên mắc lỗi trong một lần tập/nộp bài hoặc báo rõ “em vẫn mắc lỗi X” ở thời điểm mới. Hai tin nhắn tả cùng một lần tập được nối vào một `issue_occurrence`; lần tập/nộp tiếp theo tạo occurrence mới, kể cả khi không qua màn hình chấm bài. Lưu mọi tin liên quan làm `issue_evidence`. Không tính câu AI gợi ý, lời nhắc về quá khứ hoặc nhiều lần diễn đạt cùng một lỗi thành lần mắc mới. Tin do nhân viên gửi thay lời giáo viên cũng không mặc nhiên là giáo viên đã xác nhận lỗi; cần nguồn nhận xét gốc hoặc người trực xác nhận.
7. **Thống kê riêng:** `occurrence_count` là số lần xuất hiện đã duyệt; `review_session_count` là số lượt trả bài khác nhau có lỗi đó; `message_mention_count` là số tin có dẫn chứng. Ba số này không thay thế cho nhau. Lỗi do học viên tự báo và chưa được giáo viên xác nhận phải có nhãn nguồn; UI có thể hiện riêng tổng có/không gồm loại này.
8. **Ba danh sách:** `tất cả lỗi` gồm mỗi loại lỗi một mục và các lần xuất hiện theo thời gian; `gần đây` sắp theo `last_occurred_at`, nêu lỗi mới nhất và thời điểm; `chưa sửa` gồm lỗi đang gặp và lỗi chưa có xác nhận đã sửa, phân biệt hai trạng thái. Lỗi đã sửa vẫn còn trong lịch sử; tái phát được đưa trở lại danh sách hiện hành.
9. **Tóm tắt và nguyên văn:** mỗi lỗi có tóm tắt ngắn để đọc nhanh, nhưng người trực mở được nguyên văn từng tin/nhận xét, người nói, ngày, bài và link về hội thoại. Tóm tắt AI phải dẫn tới bằng chứng và có thể chỉnh; không thay thế bản gốc. Nếu tin gốc bị xóa hoặc không lưu được, hiện rõ là thiếu nguồn.
10. **Toa gần nhất:** lấy `practice_actions` mới nhất do giáo viên xác nhận cho **từng lỗi**; nếu chưa có thì ghi “chưa có hướng dẫn đã lưu”, không nhờ AI tự đặt bài tập.

Ví dụ: 10/9 giáo viên ghi “sai nhịp” và “cổ tay thấp”; 12/9 học viên nhắn “em vẫn hay sai nhịp”; 13/9 giáo viên nhận xét bài mới “sai nhịp, cổ tay thấp, ngón 2 trượt phím” và dặn cách sửa. Hồ sơ có **ba lỗi riêng**. “Sai nhịp” có các mốc 10, 12, 13/9 (mốc 12/9 ghi là học viên tự báo); “cổ tay thấp” có 10 và 13/9; “ngón 2 trượt phím” có 13/9. Cả ba mục có thể xem nguyên văn. Nếu chưa có xác nhận sửa thì chúng nằm trong danh sách cần theo dõi. Hai lần bấm soạn gợi ý cho ngày 13/9 không tăng số lần mắc hay số phiên trả bài.

Sau khi người trực duyệt các mốc trong ví dụ, mục **Tất cả lỗi** có ba dòng và số lần tương ứng 3, 2, 1 (số 3 của “sai nhịp” bao gồm một lần học viên tự báo, được gắn nhãn riêng); mục **Gần đây** cho thấy cả ba đều xuất hiện lần cuối ngày 13/9, có thể mở mốc 12/9 của “sai nhịp”; mục **Chưa sửa** gồm các lỗi chưa có mốc xác nhận đã sửa, đồng thời ghi rõ lỗi nào đang được xác nhận là vẫn gặp và lỗi nào chỉ thiếu kết luận mới. Bấm vào một dòng sẽ thấy tóm tắt, cách sửa gần nhất và các đoạn nguyên văn theo thứ tự ngày.

## 6. Luồng đồng bộ và sử dụng trong AI

1. Khi mở hội thoại, trả ngay hồ sơ/snapshot đã lưu từ SQLite cùng `last_synced_at`, `history_coverage` và trạng thái danh tính. Không chờ quét toàn bộ Pancake.
2. Đồng bộ tin mới bằng ID và cursor `before`/thời điểm, phân trang có giới hạn, dedupe bằng `(page_id, conversation_id, external_message_id)`. Tác vụ nền làm backfill theo từng hội thoại có ưu tiên; lỗi hoặc thiếu trang thì đánh dấu khoảng chưa bao phủ. Cần kiểm tra thực tế hành vi phân trang của API Pancake trước khi cam kết quét lịch sử đầy đủ.
3. AI trích dữ kiện tăng dần từ tin mới và nhận xét giáo viên mới, tạo đề xuất có căn cứ. Người trực duyệt lỗi, từng lần xuất hiện và trạng thái sửa/tái phát; một đề xuất có thể chứa nhiều lỗi khác nhau. Tin mới có thể bổ sung bằng chứng vào lần xuất hiện cũ hoặc mở lần mới.
4. Khi tạo gợi ý, backend tự xác thực page/hội thoại, tìm học viên đã liên kết, đọc snapshot + dữ kiện đang hiệu lực + lịch sử liên quan rồi tạo một `generation_context` cố định. Client không được tự quyết `studentId` để chọn hồ sơ. Nếu `contextRevision` cũ, trả 409 hoặc tái lập ngữ cảnh và báo bản đã dùng.
5. Prompt chia thành: (a) yêu cầu hiện tại và ghi chú giáo viên, (b) hồ sơ đã xác nhận, (c) lịch sử gần đây, (d) lịch sử bài/lỗi có nguồn. Với chấm bài, chỉ (a) được dùng để khẳng định lỗi của bài hiện tại; (d) dùng để nhắc cách sửa lần trước hoặc hỏi kiểm tra lại. Với chat, ưu tiên sự kiện liên quan, không nhắc biến cố khi không cần.
6. Trả cho UI `used_facts`, nguồn, mốc bao phủ và trạng thái chưa chắc chắn. Ghi audit ID/revision/ngữ cảnh đã dùng; không chỉ lưu `messageCount`.

## 7. API/UI đề xuất

- `GET /api/students/:id/summary`: hồ sơ ngắn, yêu cầu xưng hô, sự kiện liên quan, bài đang tập, lỗi lặp, `history_coverage`, revision.
- `GET/POST/PATCH /api/students/:id/facts`: lưu ý và sự kiện có nguồn, duyệt hoặc lưu thủ công, archive/khôi phục.
- `POST /api/conversations/:id/student-link`: chọn học viên cho hội thoại hoặc khoảng tin; có trạng thái cần chọn khi tài khoản dùng chung.
- `GET/POST/PATCH /api/students/:id/assignments` và `/review-sessions`: nhập/chỉnh bài, lượt trả bài, lỗi và cách sửa. Cần idempotency key để bấm lại không tạo thêm phiên.
- `GET /api/students/:id/issues?view=all|recent|unresolved`: ba danh sách lỗi, tóm tắt, trạng thái, lần đầu/gần nhất, số lần xuất hiện/số lượt trả bài và cách sửa gần nhất của từng lỗi. `GET /api/students/:id/issues/:issueId` trả timeline các lần xuất hiện cùng nguyên văn bằng chứng, có phân trang.
- `POST /api/students/:id/issues/:issueId/occurrences` và `PATCH /api/students/:id/issues/:issueId/occurrences/:occurrenceId`: người trực xác nhận, gộp/tách lần xuất hiện, liên kết tin nhắn; có revision để tránh ghi đè. Trạng thái đã sửa/tái phát là thao tác riêng trên hồ sơ lỗi và có nguồn xác nhận.
- `GET/POST /api/students/:id/proposals`: xem, duyệt, từ chối đề xuất AI.
- `POST /api/suggestions`: thêm `assignmentId`/`reviewSessionId` ở chế độ chấm bài; backend lấy summary, không tin `studentId` từ client. Response có `contextVersion` và nguồn đã dùng.

Web và widget nên dùng chung API. Giao diện chấm bài có “Bài đang tập”, “Lượt trả bài này”, “Nhận xét giáo viên” và ô tham khảo “Tất cả lỗi / Gần đây / Chưa xác nhận đã sửa”, kèm cách sửa gần nhất của từng lỗi; không tự đưa lỗi cũ vào ô nhận xét hiện tại. Mỗi mục mở được tóm tắt hoặc nguyên văn theo dòng thời gian. Thẻ học viên hiển thị yêu cầu gọi tên, lưu ý đang hiệu lực, biến cố liên quan, số ngày/lượt còn kẹt và lỗi lặp có link mở căn cứ. Khi danh tính chưa rõ, hiện thao tác chọn học viên trước khi lưu hoặc áp dụng hồ sơ vào câu gợi ý.

## 8. Hiệu năng, độ chính xác và vận hành

- Giữ SQLite WAL cho giai đoạn một nếu chạy một máy với ổ cục bộ; transaction ngắn, index theo `(page_id, student_id)`, `(student_id, assignment_id, status)`, `(student_id, last_occurred_at)`, `(student_issue_id, occurred_at)` và khóa duy nhất của bằng chứng nguồn. Batch upsert thay vì ghi từng tin. Chuyển PostgreSQL khi nhiều instance cùng ghi hoặc nhu cầu truy vấn/đồng bộ vượt khả năng một máy, sau khi đo tải thực tế.
- Không gọi Pancake để quét lịch sử hay gọi AI trích xuất trên đường trả gợi ý. Đọc snapshot và một tập dữ kiện giới hạn bằng độ liên quan, tính mới và trạng thái. Đặt ngân sách token; không đưa toàn bộ lịch sử vào prompt. Cache theo `student_id + revision`, vô hiệu hóa khi xác nhận/sửa/xóa.
- Ghi `last_synced_at`, cursor và phạm vi lịch sử đã đọc. Nếu API ngoài lỗi, có thể dùng dữ liệu đã lưu kèm nhãn “chưa cập nhật”; không trả số lần lặp như đã bao phủ toàn bộ lịch sử.
- Sự kiện riêng tư có mức cho phép sử dụng riêng; không lộ chi tiết nhạy cảm vào câu gửi học viên khi không liên quan. Tin nhắn nguồn là dữ liệu, không được phép thay đổi quy tắc prompt. Lưu audit ai duyệt/sửa và bảo đảm backup/restore bao gồm các bảng mới.
- Đo p50/p95 thời gian đọc summary và tạo gợi ý, tỷ lệ mapping chưa rõ, tỷ lệ đề xuất bị từ chối, số lượt trùng, độ bao phủ lịch sử và tỷ lệ gợi ý nêu lỗi cũ như lỗi mới. Chỉ đặt mục tiêu latency cụ thể sau khi có baseline.

## 9. Trình tự thực hiện và tiêu chí nghiệm thu

1. **Đặc tả danh tính và lượt trả bài:** áp dụng ba quyết định đã chốt ở mục 10, mô tả chi tiết ranh giới một phiên trả bài. Thêm ID nội bộ và liên kết; migration giữ dữ liệu cũ. Nghiệm thu: hai học viên cùng tài khoản có hồ sơ/lỗi tách biệt.
2. **Lưu lượt chấm bài và hồ sơ lỗi:** tạo `assignments`, `review_sessions`, `student_issues`, occurrences, bằng chứng và cách sửa; web/widget dùng chung. Nghiệm thu: một học viên có nhiều lỗi, mỗi lỗi có nhiều mốc từ tin nhắn hoặc lượt chấm bài; tạo lại gợi ý không làm tăng số lần mắc/số phiên; cách sửa cũ hiển thị có nguồn.
3. **Ghi nhớ và sự kiện:** nhập tay và AI đề xuất có duyệt; vòng đời, xung đột, audit. Nghiệm thu: yêu cầu gọi tên được áp dụng; biến cố hết hiệu lực không còn tác động; dữ kiện mơ hồ không tự lưu.
4. **Đồng bộ lịch sử và thống kê:** phân trang, dedupe, coverage, tính thời gian bị kẹt, số lần mắc theo thời điểm và số lượt trả bài riêng. Nghiệm thu: cả ba danh sách lỗi đúng thứ tự và trạng thái; có tóm tắt/nguyên văn; backfill dở dang ghi “ít nhất/chưa rõ”; 2 người cùng tài khoản không bị cộng lẫn.
5. **Ghép ngữ cảnh tạo gợi ý:** snapshot, giới hạn prompt, nguồn và revision; đánh giá trên hội thoại thực đã ẩn thông tin nhạy cảm. Nghiệm thu: chấm bài chỉ dùng lỗi hiện tại do giáo viên nhập, vẫn tận dụng cách sửa cũ đúng ngữ cảnh; lỗi lấy dữ liệu không tạo câu khẳng định sai.

## 10. Quyết định đã chốt và giả định triển khai

1. Dùng hồ sơ riêng từng học viên. Khi tài khoản/hội thoại Pancake có nhiều người học và chưa rõ ai đang được nói tới, nhân viên chọn học viên trước khi dùng hoặc ghi dữ kiện dài hạn.
2. “Bệnh cũ – toa cũ gần nhất” là lỗi kỹ thuật từng gặp và bài tập/cách sửa giáo viên dặn gần nhất. Nhãn UI nên đổi thành “Lỗi trước đây – cách sửa gần nhất”.
3. AI đọc lịch sử để **đề xuất** ghi chú; nhân viên duyệt trước khi lưu chính thức.
4. Theo dõi đồng thời nhiều lỗi lặp ở các tin nhắn/thời điểm khác nhau; hiển thị toàn bộ lỗi, lỗi gần nhất, lỗi chưa sửa/chưa xác nhận đã sửa và cho xem tóm tắt hoặc nguyên văn có nguồn.

Giả định kỹ thuật: tiếp tục dùng SQLite trên một máy và đồng bộ lịch sử tăng dần; chỉ cân nhắc PostgreSQL khi triển khai nhiều instance cùng ghi hoặc số liệu đo tải chứng minh cần chuyển. Cần xác minh giới hạn phân trang và độ ổn định ID tin nhắn của Pancake trong môi trường thật trước khi triển khai backfill. Các ngưỡng hiệu năng, thời gian lưu tin nguồn và quy tắc kết thúc một bài sẽ được chốt từ dữ liệu vận hành và bài kiểm thử nghiệp vụ.
