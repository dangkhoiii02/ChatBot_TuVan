# Plan luồng trợ lý phản hồi học viên — Mong muốn, AI và BE

- Ngày cập nhật: 16/09/2026.
- Mục đích: theo dõi yêu cầu, luồng nghiệp vụ và hướng giải quyết; chưa phải đặc tả code.
- Phạm vi: AI và BE. FE sẽ có tài liệu UI mock riêng.
- Trạng thái: yêu cầu đã được tích hợp vào kế hoạch kỹ thuật; chưa triển khai các chức năng dưới đây. Các lựa chọn chưa được người dùng xác nhận được ghi rõ là mặc định triển khai đề xuất.
- Không có đăng nhập/đăng ký. Hồ sơ học viên là dữ liệu nghiệp vụ, không phải tài khoản người dùng. Không xây luồng chọn, tải lên hoặc phân tích video; giáo viên nhập nhận xét trực tiếp theo lượt xử lý.
- Quy ước: **Đã xác nhận** = người dùng đã nêu rõ; **Đề xuất** = hướng xử lý cần thống nhất; **Cần chốt** = chưa có quyết định.

## 1. Mục tiêu và mong muốn đã xác nhận

Người thay mặt giáo viên nhắn tin cần biết đang nói chuyện với ai, có điều gì cần lưu ý, cần làm gì tiếp và có thể chọn nhanh cách diễn đạt phù hợp.

| Mã | Mong muốn đã xác nhận | Ví dụ |
| --- | --- | --- |
| UC-01 | AI lấy thông tin cần thiết từ hội thoại để hiện ở sidebar phải | Gọi người nhận: Chị; người gửi xưng: em; lưu ý optional; ghi chú học tập |
| UC-02 | Đổi xưng hô nhanh và áp dụng ngay vào các câu gợi ý | Đổi cặp thầy–em thành em–chị |
| UC-03 | Giáo viên nhập nhận xét trực tiếp bằng văn bản; AI soạn các cách nói để chọn | Nhập “đánh sai nhịp” rồi nhận các gợi ý diễn đạt |
| UC-04 | Có thể chủ động lưu nhận xét; AI phân tích có nên lưu và khi nào nên bỏ | Ghi nhớ lỗi thường gặp, rà lại khi có nhận xét mới |
| UC-05 | Người dùng thêm được field cần theo dõi | Tuổi, tốc độ học |
| UC-06 | Tách plan FE thành tài liệu UI mock riêng | Mô phỏng các luồng bằng dữ liệu mẫu, chốt giao diện riêng |

“Custom” ở đây bao gồm **thêm field mới**, không chỉ sửa nội dung field có sẵn.

## 2. Đối chiếu hiện trạng và đầu vào thiết kế

- Repository hiện có server demo, form ngữ cảnh và gợi ý; chưa có hồ sơ học viên, bộ nhớ học tập hoặc đồng bộ page/hội thoại bền vững.
- Giới hạn 30 tin nhắn gần nhất là mặc định thiết kế cho luồng mới, chưa phải chức năng đã được xác minh trong code hiện tại. API cần công bố phạm vi lịch sử thực sự đã đọc.
- AI chỉ xử lý văn bản và nhận xét giáo viên nhập. Không có chức năng đọc nội dung tệp đính kèm.
- Persona và câu mẫu có xưng hô cố định hoặc khẳng định đã xem bài; cần điều chỉnh khi triển khai UC-02/UC-03.
- Lưu demo không phải gửi tin thật; bản mới dùng chọn/sửa/sao chép.

## 3. UC-01 — Hiểu ngữ cảnh và bàn giao hội thoại

**Luồng đề xuất:** mở hội thoại → lấy thông tin đã lưu cùng các tin nhắn liên quan → AI rút ra thông tin mới → hiển thị thông tin và việc cần làm → người dùng kiểm tra hoặc sửa.

Thông tin ban đầu gồm:

- Gọi người nhận và người gửi xưng.
- Lưu ý đặc biệt, nếu có.
- Ghi chú học tập, gắn với bài học hoặc ngày nhận xét khi xác định được.
- Việc cần làm tiếp, ví dụ “Chờ giáo viên bổ sung nhận xét”.
- Các field custom đã được thêm.

**AI:** phân biệt thông tin được nói rõ, nhận định suy ra và thông tin chưa biết; đưa căn cứ từ hội thoại; phân biệt nhận xét của bài cũ với bài hiện tại. Nội dung câu AI vừa gợi ý không tự trở thành sự thật về học viên.

**BE:** lấy đúng dữ liệu của học viên/hội thoại, lưu nguồn và thời điểm, cung cấp lịch sử cập nhật. Thể hiện được phạm vi lịch sử AI đã đọc; không coi phần hội thoại chưa tải là không có thông tin.

**Đề xuất khi mâu thuẫn:** giữ giá trị người dùng đã sửa và đưa đề xuất cập nhật riêng. Chưa đủ dữ kiện thì hiển thị “Chưa có thông tin”, không tự điền.

**Tiêu chí đạt:** người trực thấy được thông tin, căn cứ và việc cần làm; mở lại vẫn có dữ liệu đã lưu; chuyển hội thoại không mang nhầm hồ sơ.

## 4. UC-02 — Đổi xưng hô và dùng câu gợi ý

**Luồng đề xuất:** tạo gợi ý → đổi “Gọi người nhận” hoặc “Người gửi xưng” → các gợi ý cập nhật tức thì → chọn câu → chỉnh bản nháp.

Ví dụ: “Thầy gửi em hướng dẫn nhé” → “Em gửi chị hướng dẫn nhé”.

**AI:** dùng cặp xưng hô được chọn thay cho mặc định của persona; phân biệt người nói, người nhận và người thứ ba trong câu.

**BE:** lưu lựa chọn theo hội thoại theo mặc định đề xuất ở mục 9; cung cấp nội dung có thể thay đúng phần xưng hô mà không phải gọi AI lại. Mỗi nhóm gợi ý cần gắn với đúng hội thoại và ngữ cảnh đã dùng để tạo.

**Mặc định triển khai đề xuất:** chỉ tự cập nhật các gợi ý; bản nháp đã sửa tay giữ nguyên. Người dùng chủ động dùng lại gợi ý mới để thay bản nháp và có hoàn tác. Các tin nhắn đã gửi là lịch sử, không thuộc nội dung thay đổi.

**Tiêu chí đạt:** đổi xưng hô cập nhật đúng vai nói/nghe trong các gợi ý, không đổi nhầm lời trích dẫn hoặc người thứ ba.

## 5. UC-03 — Giáo viên cung cấp nhận xét để AI soạn lời

**Luồng đề xuất:** mở đúng hội thoại → nhập nhận xét cho lượt xử lý hiện tại → AI tạo 3 cách diễn đạt → người dùng chọn hoặc sửa → đưa vào bản nháp. Khi chưa có nhận xét, hiển thị “Chờ giáo viên nhận xét”. Không có bước chọn bài/video hoặc yêu cầu tệp đính kèm.

Đầu vào tối thiểu: nhận xét tự do, ví dụ “Sai nhịp”.
Đầu vào bổ sung optional: điểm làm tốt, đoạn cần sửa, hướng dẫn tập hoặc điều cần tránh.

**AI:** diễn đạt đúng ý giáo viên với các giọng văn khác nhau. Nếu chỉ có “Sai nhịp”, không tự thêm sai ngón, mốc thời gian, mức tiến bộ hay khẳng định đã xem clip. Đề xuất ban đầu là 3 phương án cùng dữ kiện.

**BE:** gắn nhận xét với đúng học viên, hội thoại và lượt nhận xét (review_context_id); truyền riêng ý kiến giáo viên và ngữ cảnh hội thoại; giữ được đầu vào để sửa hoặc tạo lại. Không tái dùng nhận xét bài cũ như kết quả chấm bài mới.

**Khi thiếu đầu vào:** chỉ gợi ý lời tiếp nhận bài hoặc chờ giáo viên, chưa đưa nhận xét chuyên môn về bài học. Quy tắc này áp dụng cả khi AI lỗi và hệ thống dùng câu mẫu thay thế.

**Tiêu chí đạt:** người dùng nhập ngắn vẫn nhận được các cách nói phù hợp, thống nhất nội dung chuyên môn và đúng xưng hô.

## 6. UC-04 — Lưu, cập nhật và bỏ ghi chú

**Đã xác nhận:** người dùng có thể chủ động bấm lưu; AI phân tích giá trị ghi nhớ và thời điểm nên bỏ.

**Luồng đề xuất:** có nhận xét/thông tin mới → AI đề xuất lưu, chỉ dùng lần này, cập nhật hoặc bỏ → hiển thị lý do → áp dụng theo quyền đã thống nhất → rà lại khi có dữ kiện mới hoặc đến hạn.

| Loại thông tin | Hướng xử lý đề xuất |
| --- | --- |
| Tạm thời, có thời hạn | Ghi mốc hết hiệu lực nếu biết; rà lại khi đến hạn |
| Tình trạng học tập | Cập nhật khi có căn cứ mới; không coi việc ít nhắc lại lỗi là đã khắc phục |
| Nhận xét một bài | Giữ bài/ngày đi kèm để tránh dùng sai ngữ cảnh |
| Lỗi đã khắc phục | Chuyển khỏi lưu ý hiện tại; đề xuất giữ lịch sử để thấy tiến bộ |

**AI:** đưa hành động đề xuất, lý do, căn cứ và điều kiện hoặc thời điểm rà lại. Không tự đặt thời hạn nếu chưa có cơ sở.

**BE:** lưu nhận xét gốc, nguồn, lịch sử thay đổi, trạng thái còn áp dụng và mốc rà lại; phân biệt hết hiệu lực, lưu lịch sử và xoá hẳn. Sau khi bỏ khỏi ngữ cảnh hiện tại, thông tin không tiếp tục được dùng như một lưu ý đang có hiệu lực.

**Mặc định triển khai đề xuất:** AI chỉ đề xuất; người dùng xác nhận lưu/cập nhật/bỏ. Ghi chú người dùng đã lưu không bị AI tự ghi đè hoặc xóa. Đến review_at chỉ nhắc rà soát; chỉ ngừng dùng tự động khi có expires_at do người dùng xác nhận. Xóa hẳn là thao tác riêng cần xác nhận rõ, không phải kết quả tự động của AI.

**Tiêu chí đạt:** chủ động lưu và mở lại được; AI giải thích đề xuất; ghi chú hết hiệu lực không làm sai câu trả lời mới.

## 7. UC-05 — Field custom: tuổi, tốc độ học và các thông tin khác

**Luồng đề xuất:** “Thêm thông tin” → đặt tên field → chọn dạng giá trị và cách điền → chọn phạm vi → lưu → nhập hoặc để AI đề xuất giá trị.

Các lựa chọn thiết kế đề xuất:

- Dạng giá trị: số, văn bản hoặc danh sách lựa chọn.
- Cách điền: nhập tay, lấy dữ kiện rõ từ hội thoại hoặc AI đánh giá theo tiêu chí.
- Phạm vi mặc định đề xuất: riêng học viên này; mẫu dùng chung để giai đoạn sau.
- Có dùng khi soạn gợi ý hay chỉ tham khảo: mặc định chỉ tham khảo (use_in_generation=false), người dùng có thể bật.

| Field | Cách xử lý AI | Dữ liệu BE cần giữ |
| --- | --- | --- |
| Tuổi | Lấy khi người học cung cấp hoặc người dùng nhập; không suy từ cách xưng hô | Giá trị, nguồn, thời điểm cung cấp; tuổi cũ cần được rà lại |
| Tốc độ học | Đánh giá theo tiêu chí đã định, ví dụ tiến độ so với lịch giao bài; thiếu dữ kiện thì báo chưa đủ căn cứ | Tiêu chí, giai đoạn đánh giá, căn cứ và giá trị đã xác nhận |

“Tốc độ học” cần được định nghĩa trước khi AI đánh giá; không suy từ tốc độ nhắn tin hoặc số lượng tin nhắn.

**AI:** đọc ý nghĩa field và tiêu chí của người tạo; trả giá trị đề xuất cùng căn cứ hoặc báo thiếu thông tin.

**BE:** quản lý riêng định nghĩa field và giá trị của từng học viên; kiểm tra giá trị phù hợp dạng đã chọn; lưu nguồn, thời điểm và lịch sử sửa. Phân biệt xoá giá trị, ẩn field và xoá định nghĩa field.

**Tiêu chí đạt:** thêm được field tuổi/tốc độ học, nhập hoặc nhận đề xuất AI, sửa và mở lại được; giá trị không lẫn giữa học viên.

## 8. Bảng theo dõi hướng giải quyết

Các ô dưới đây là công việc lập plan; chưa đánh dấu triển khai hoàn tất.

| Mã | AI cần thống nhất | BE cần thống nhất | Trạng thái |
| --- | --- | --- | --- |
| UC-01 | Quy tắc trích xuất, căn cứ, việc cần làm | Phạm vi hồ sơ, lịch sử, nguồn dữ liệu | Đang lập plan |
| UC-02 | Xưng hô ưu tiên và phân biệt vai trong câu | Lưu lựa chọn, dữ liệu cho đổi tức thì | Đang lập plan |
| UC-03 | Dùng ý giáo viên, đa dạng lời nói, xử lý thiếu input | Gắn hội thoại, lượt nhận xét và lượt gợi ý | Đang lập plan |
| UC-04 | Đề xuất lưu/cập nhật/bỏ có lý do | Vòng đời ghi chú và quyền áp dụng | Mặc định AI đề xuất, người dùng xác nhận |
| UC-05 | Dữ kiện so với đánh giá theo tiêu chí | Định nghĩa field, giá trị, phạm vi | Mặc định field riêng từng học viên |
| UC-06 | Cung cấp ví dụ đầu ra thành công/thiếu dữ kiện/lỗi | Cung cấp trạng thái lưu/cập nhật/xung đột | Chuyển sang plan UI mock riêng |

### Trách nhiệm chung đề xuất cho BE

- Lưu để người trực sau có thể tiếp tục công việc; phân định đúng học viên, người đang nhắn, page và hội thoại. Không gộp hồ sơ chỉ vì trùng tên.
- Phát hiện chỉnh sửa chồng nhau; kết quả AI trả muộn không ghi đè thay đổi mới hoặc áp vào hội thoại khác.
- Ghép ngữ cảnh gồm thông tin còn hiệu lực, field được phép dùng, hội thoại liên quan, ý giáo viên và xưng hô đang chọn.
- Khi lỗi lấy dữ liệu, gọi AI hoặc lưu: giữ đầu vào người dùng, báo đúng phần thất bại và cho thử lại; không báo đã lưu khi chưa lưu được.
- Trả thông tin nghiệp vụ đủ cho UI mock; lựa chọn công nghệ lưu trữ và đặc tả API để ở bước kỹ thuật sau.

## 9. Mặc định triển khai đề xuất cho các điểm còn mở

Các lựa chọn dưới đây giúp triển khai thống nhất, không được ghi là người dùng đã xác nhận từng chi tiết:

- Hồ sơ học viên giới hạn trong workspace/page; conversation có người đang nhắn và quan hệ với học viên riêng. Không gộp theo tên. Nếu phụ huynh có nhiều con, người dùng chỉ định học viên đang xử lý; chưa rõ thì không đọc/ghi ghi chú của một em bất kỳ.
- Bản đầu tạo field riêng từng học viên; mẫu dùng chung để giai đoạn sau. Kiểu text/number/select; use_in_generation mặc định false, người dùng bật khi cần.
- Người dùng chọn xưng hô; lưu theo hội thoại, hiển thị để kiểm tra khi đổi người đại diện trả lời. Không tự suy tuổi từ “chị/em”.
- Đổi xưng hô cập nhật các gợi ý bằng token vai nói/nghe, không gọi AI lại. Bản nháp đã sửa tay giữ nguyên; thay bằng gợi ý mới phải do người dùng bấm và có hoàn tác. Không sửa tin lịch sử.
- AI chỉ đề xuất cập nhật hồ sơ/ghi chú/field. Áp dụng cần xác nhận và kiểm tra revision; giữ nội dung người dùng đã sửa khi có mâu thuẫn.
- review_at là mốc nhắc xem lại; expires_at là mốc hết hiệu lực đã xác nhận. Không suy “đã sửa lỗi” chỉ vì lỗi không được nhắc gần đây. Archive, expire và xóa hẳn là các trạng thái/thao tác khác nhau.
- Field suy luận như tốc độ học cần tiêu chí, khoảng đánh giá và căn cứ trước khi AI đề xuất; thiếu thì hiển thị chưa đủ dữ kiện.

## 10. Đầu vào cho plan FE/UI mock riêng

Tài liệu riêng: [PLAN_UI_MOCK_TRO_LY_HOC_VIEN.md](PLAN_UI_MOCK_TRO_LY_HOC_VIEN.md). Đây là kế hoạch/mock states, chưa phải UI đã triển khai.

Plan UI mock sẽ tham chiếu UC-01 đến UC-05 và mô phỏng:

- Có hồ sơ, chưa có thông tin, AI đang phân tích, thông tin mâu thuẫn.
- Đổi xưng hô, sửa gợi ý, dùng câu và xử lý bản nháp.
- Chờ giáo viên, nhập nhận xét, tạo lại và chọn cách diễn đạt.
- Chủ động lưu, AI đề xuất cập nhật/bỏ, ghi chú hết hiệu lực.
- Thêm field tuổi và tốc độ học; nhập tay, AI đề xuất hoặc thiếu căn cứ.
- Lỗi tải/lưu/tạo gợi ý; chuyển hội thoại khi tác vụ chưa xong.

Bố cục, thành phần giao diện và tương tác chi tiết sẽ chốt trong plan UI mock, dùng dữ liệu mẫu độc lập với AI/BE.

Yêu cầu responsive chuyển sang plan UI: kiểm tra desktop 1366/1440/1536/1920/2560px, tablet 768/1024px, mobile 320/360/390/430px, cả dọc và ngang. Header, hai sidebar và vùng chat phải tiếp cận được, không che hoặc tràn nội dung quan trọng.

## 11. Thứ tự chốt plan đề xuất

1. Chốt phạm vi hồ sơ và các quyết định về lưu/xoá, custom, xưng hô.
2. Duyệt bộ ví dụ đầu vào/đầu ra cho từng UC, gồm cả tình huống thiếu dữ kiện và lỗi.
3. Hoàn thiện trách nhiệm AI và BE theo các quyết định đã chốt.
4. Lập tài liệu UI mock riêng để duyệt luồng trên màn hình.
5. Triển khai theo [kế hoạch server](ke-hoach-xay-dung-bot-thay-minh.md) và [prompt Gemini](docs/PROMPT-GEMINI-TRIEN-KHAI.md) khi bắt đầu bước viết code. Lần cập nhật tài liệu này không thay đổi code chạy.
