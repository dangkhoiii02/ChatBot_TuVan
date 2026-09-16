# Plan UI mock trợ lý học viên

Cập nhật 16/09/2026. Tài liệu thiết kế để Gemini dựng mock và ghép API; chưa có mock hay tính năng mới được triển khai. Tham chiếu [UC-01–UC-06](PLAN_LUONG_TRO_LY_HOC_VIEN_AI_BE.md) và [kế hoạch backend](ke-hoach-xay-dung-bot-thay-minh.md).

## 1. Phạm vi

Widget nội bộ, không đăng nhập/đăng ký. Có hồ sơ học viên, ghi chú và field nghiệp vụ; không có quản lý tài khoản. Không có nút chọn/tải video, video player, danh sách video hoặc bước chọn bài bắt buộc. Giáo viên nhập nhận xét ngay trong hội thoại đang xử lý.

Bản đầu dùng web widget và trang host minh họa; tích hợp extension hoặc kênh chat thật làm sau khi chốt nền tảng. Dữ liệu mock giả được gắn nhãn, không giả đã đồng bộ từ kênh thật.

## 2. Bố cục đề xuất

- Header: page/hội thoại/học viên đang xử lý, trạng thái lưu/AI; trường hợp phụ huynh có nhiều con cần chọn đúng hồ sơ học viên.
- Sidebar trái: hội thoại trong phạm vi page, trạng thái đang xử lý. Trên widget nhỏ chuyển thành danh sách dạng drawer.
- Vùng chính: lịch sử văn bản được cung cấp, số tin AI đã đọc, ô nhập nhận xét, gợi ý và bản nháp. Hai chế độ “Trả lời tin nhắn” và “Diễn đạt nhận xét”.
- Sidebar phải: gọi người nhận/người gửi xưng, thông tin đã xác nhận và nguồn, lưu ý, việc tiếp theo, ghi chú học tập, field custom.
- Thao tác: tạo gợi ý, dùng câu, sửa, sao chép, lưu phản hồi; không có nút khẳng định gửi tin thật.

Trong bản nhúng chưa có host adapter, cho tạo/mở mã hội thoại thủ công và dán đoạn chat; không tự quét các trang khác.

## 3. Luồng và trạng thái mock bắt buộc

| Luồng | Trạng thái cần dựng | Kết quả mong muốn |
|---|---|---|
| UC-01 ngữ cảnh | Có/chưa có hồ sơ, loading, unknown, thiếu lịch sử, mâu thuẫn, lỗi tải | Căn cứ và phạm vi đã đọc nhìn thấy được; chưa rõ học viên thì không lấy nhầm dữ liệu |
| UC-02 xưng hô | Đổi thầy–em sang em–chị, trích dẫn, người thứ ba, draft sửa tay | Gợi ý cập nhật ngay; draft giữ nguyên; dùng câu thay draft có undo |
| UC-03 nhận xét | Trống, “Sai nhịp”, bổ sung ý, đang tạo, tạo lại, lỗi AI | 3 cách nói cùng dữ kiện; không cần chọn video; thiếu nhận xét thì chờ giáo viên |
| UC-04 ghi chú | Lưu tay, đề xuất pending, apply/reject, stale, review_due, expired, archived | AI không tự ghi/xóa; lưu lỗi không báo thành công; hết hiệu lực không dùng như lưu ý hiện tại |
| UC-05 custom | Tạo text/number/select, nhập tay, thiếu tiêu chí, đề xuất AI, lỗi kiểu, sửa | Giá trị theo đúng học viên; có nguồn; use_in_generation là lựa chọn rõ ràng |
| Xóa dữ liệu | Xóa giá trị, ẩn field, xóa định nghĩa, xóa hẳn note | Nêu đúng phạm vi ảnh hưởng; thao tác xóa hẳn cần xác nhận |
| Đồng thời | Đổi A sang B khi AI A đang chạy, hai tab sửa, publish tri thức mới | Kết quả A không xuất hiện như dữ liệu B; revision conflict giữ phần nhập tay |

Ca đỏ hiển thị cảnh báo và mẫu an toàn, không 3/5 giọng thuyết phục. Trạng thái “Đã lưu” chỉ xuất hiện sau phản hồi thành công từ server. Nếu mất kết nối giữ nội dung đang nhập, cho retry; không tự lặp thao tác tạo hai bản ghi.

## 4. Hợp đồng UI–BE

Mọi context/job/proposal mang conversation_id, student_id, revision và phạm vi nguồn. Kết quả muộn được cất đúng hội thoại; UI kiểm tra ID/request sequence trước khi cập nhật màn hình. AI đề xuất và dữ liệu đã xác nhận có nhãn khác nhau. Không hiển thị mức độ tin cậy như một khẳng định đúng nếu chưa có căn cứ.

Dùng segment sender/recipient/literal để render xưng hô; không replace toàn chuỗi. Bản nháp là văn bản người dùng có thể sửa độc lập. Mở lại hội thoại lấy hồ sơ/ghi chú từ API, không cần khôi phục job token cũ mới đọc được hồ sơ nội bộ. Không hứa đồng bộ draft giữa thiết bị.

## 5. Responsive và nghiệm thu

Kiểm tra desktop 1366/1440/1536/1920/2560px; tablet 768/1024px; mobile 320/360/390/430px, dọc/ngang. Trong iframe kiểm tra cả chiều rộng thực của vùng nhúng. Ở màn hình nhỏ, chuyển sidebar thành tab/drawer thay vì giữ ba cột chật. Không che ô nhập, cảnh báo ca đỏ hoặc nút lưu/sao chép; không tràn ngang nội dung chính. Có focus bàn phím, label và thông báo lỗi dễ nhận biết.

Mock dùng fixture độc lập, sau đó thay adapter bằng API thật mà giữ cùng cấu trúc dữ liệu. Chụp/kiểm tra các trạng thái chính nếu có browser tool; báo rõ viewport đã kiểm tra và những phần chưa kiểm thử. Không coi tài liệu này là bằng chứng UI đã chạy.
