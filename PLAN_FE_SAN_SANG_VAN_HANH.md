# Kế hoạch FE sẵn sàng vận hành thực tế

- Cập nhật: 19/09/2026.
- Phạm vi: `frontend`, `widget`, extension bridge và phần mã dùng chung phía client.
- Mục tiêu: hoàn thiện đúng nghiệp vụ UC-01 đến UC-05 để nhân sự có thể xử lý hội thoại thật hằng ngày.
- Tài liệu này không tính chi phí và không thay thế đặc tả API backend.

## Trạng thái triển khai hiện tại

Phần source cần cho bản vận hành đầu tiên đã được triển khai: production không tự rơi về demo, hồ sơ/ghi nhớ/custom field được lưu ở backend theo revision, chấm bài dùng API thật, session hết hạn đưa người dùng về đăng nhập mà giữ draft, FE web có thể dùng cấu hình hệ thống hoặc key/model riêng, còn widget luôn dùng cấu hình AI của backend. URL backend của widget được đóng vào lúc build và bridge kiểm tra origin. Widget production đã được build và đồng bộ vào `extension/widget`.

Các kiểm tra tự động hiện tại: backend, frontend và widget build thành công; 29 test tích hợp provider/backend và 21 test hệ thống cũ đều đạt. Việc còn lại trước khi mở cho người dùng thật không phải viết thêm mock: cần điền biến môi trường triển khai và chạy UAT bằng chính tenant Pancake thật vì selector DOM, quyền page, access token, URL backend và ID extension phụ thuộc môi trường bên ngoài source.

## 1. Kết luận hiện trạng trước khi triển khai

FE hiện tại **đã có khung giao diện và một phần luồng thật, nhưng chưa đủ để vận hành production**.

| Phần | Hiện trạng trong source | Kết luận |
| --- | --- | --- |
| Đăng nhập, session | Đã có đăng nhập bằng Pancake access token và Bearer session | Có nền tảng, cần hoàn thiện hết hạn session và lỗi quyền truy cập |
| Page, hội thoại, tin nhắn | FE web đã gọi API; khi lỗi có thể tự chuyển sang dữ liệu demo | Chưa được phép dùng fallback demo trong production |
| Tạo gợi ý | FE web và widget đã gọi `/api/suggestions` | Dùng được ở mức thử nghiệm; cần chống kết quả trễ, chuẩn hóa lỗi và ca đỏ |
| Dùng câu | FE web đưa câu vào draft; widget đổ câu vào composer qua extension | Giữ mô hình người dùng kiểm tra rồi tự gửi; chưa tự động gửi tin |
| Chấm bài UC-03 | FE web đã gọi backend; widget vẫn dùng `mockGradePhrases` | Không làm lại từ đầu; chuyển widget sang cùng API thật và bỏ fallback bịa dữ kiện |
| Hồ sơ UC-01 | Có UI/type nhưng phần lớn là dữ liệu mẫu hoặc state React | Chưa lưu và tải lại được |
| Xưng hô UC-02 | Có đổi nhanh nhưng đang thay chữ trên chuỗi | Chưa an toàn với trích dẫn, người thứ ba và draft đã sửa tay |
| Ghi nhớ UC-04 | Có giao diện thêm/xóa nhưng chỉ nằm trong state | Chưa có vòng đời, revision và lưu bền vững |
| Custom field UC-05 | Có form tạo field nhưng chỉ nằm trong state | Chưa có định nghĩa, validation và lưu giá trị theo học viên |
| Chọn provider/key/model | Chỉ có ở FE web; widget luôn dùng cấu hình backend | Không lưu hoặc truyền key/model từ widget |
| Cấu hình production | URL backend của widget được đặt bằng `VITE_API_BASE_URL` khi build | Production phải build bằng endpoint HTTPS thật và khai báo đúng host permission |
| Kiểm thử FE | Build chạy được nhưng chưa có bộ unit/integration/E2E riêng cho FE/widget | Chưa đủ chốt release |

## 2. Phạm vi sản phẩm FE cần vận hành

### 2.1 Ba bề mặt sử dụng

| Bề mặt | Vai trò |
| --- | --- |
| FE web | Màn hình vận hành đầy đủ: chọn page, hội thoại, đọc lịch sử, xem hồ sơ và dùng trợ lý |
| Widget | Trợ lý nhỏ gọn ngay trong Pancake: xem đúng hội thoại hiện tại, tạo gợi ý, chấm bài, hồ sơ và ghi nhớ |
| Extension bridge | Lấy context hội thoại từ host khi cần và đổ bản nháp vào composer; không tự bấm gửi |

FE web và widget phải dùng **chung type, API client, quy tắc xưng hô, validation và mô hình trạng thái**. Không duy trì hai bản nghiệp vụ độc lập như hiện nay.

### 2.2 Không nằm trong bản vận hành đầu tiên

- AI tự xem hoặc chấm nội dung video.
- Tự động gửi tin nhắn thay người dùng.
- AI tự lưu, tự xóa hồ sơ hoặc ghi nhớ mà không có người xác nhận.
- Đồng bộ bản nháp giữa nhiều thiết bị.
- Quản trị thanh toán hoặc gói cước.

Các giới hạn này phải hiện rõ trên UI, không được tạo cảm giác hệ thống đã xem video hoặc đã gửi tin.

## 3. Các quyết định nghiệp vụ chốt cho FE

| Chủ đề | Quyết định dùng để triển khai |
| --- | --- |
| Phạm vi dữ liệu | Hồ sơ thuộc `tenant/page + studentId`; hội thoại chỉ liên kết tới hồ sơ, không dùng tên để nhận diện |
| Phụ huynh có nhiều học viên | Hiện bộ chọn học viên; chưa chọn thì không tự ghép ghi chú vào bất kỳ hồ sơ nào |
| Người trùng tên | Không gộp; chỉ dùng ID ổn định từ backend |
| Xưng hô | Có mặc định theo page/người trực và override theo hội thoại; cặp đang chọn luôn được gửi trong mỗi request AI |
| Draft đã sửa tay | Đổi xưng hô không âm thầm ghi đè; UI hỏi áp dụng, hiển thị phần thay đổi và có Undo |
| Trích dẫn/người thứ ba | Không replace toàn chuỗi; chỉ đổi segment có vai `sender` hoặc `recipient` |
| Ghi nhớ AI đề xuất | Trạng thái `pending`; chỉ thành `active` sau khi người dùng xác nhận |
| Ghi nhớ do người dùng tạo | AI được đề xuất sửa/archive, không được tự xóa |
| Xóa | Phân biệt archive, xóa giá trị và xóa hẳn; xóa hẳn phải xác nhận |
| Custom field | Định nghĩa có thể là mẫu theo tenant/page; giá trị luôn lưu riêng theo `studentId` |
| Field dùng cho AI | Chỉ field bật `useInSuggestions` và còn hiệu lực mới được đưa vào ngữ cảnh |
| Ca đỏ | Hiện cảnh báo ưu tiên, lý do và mẫu phản hồi an toàn; không tạo nhiều câu thuyết phục như ca thường |
| Gửi tin | Bản đầu chỉ copy hoặc đổ vào composer; người dùng đọc lại và tự bấm gửi |
| Chế độ demo | Chỉ bật bằng cấu hình build/dev riêng và luôn có nhãn; production không tự rơi về demo khi lỗi |

## 4. Chọn provider, API key và model

Đây là tùy chọn chỉ dành cho **FE web**. Widget không hiển thị, lưu hoặc gửi provider, API key và model; mọi request từ widget dùng cấu hình trong `backend/.env`.

### 4.1 Hai chế độ rõ ràng

1. **Dùng cấu hình hệ thống** — mặc định; FE không gửi provider, key hoặc model override.
2. **Dùng cấu hình riêng** — người dùng chọn provider, nhập API key và model cho request của họ.

Quy tắc:

- Không trộn một phần cấu hình riêng với cấu hình server. Nếu chọn cấu hình riêng nhưng thiếu trường bắt buộc, chặn request và chỉ rõ trường thiếu.
- Có nút “Kiểm tra kết nối” trước khi lưu/áp dụng.
- Hiện provider/model thực tế đã dùng trong kết quả; không hiển thị key.
- API key dùng input `password`, không đưa vào URL, log, analytics, thông báo lỗi hoặc cơ sở dữ liệu nghiệp vụ.
- Mặc định chỉ giữ key trong phiên hiện tại. Chỉ lưu trên thiết bị khi người dùng chủ động bật “Ghi nhớ trên thiết bị này”.
- Có nút xóa cấu hình riêng; logout phải xóa key trong bộ nhớ phiên.
- Nếu cho nhập `baseUrl` tùy chỉnh, FE chỉ chấp nhận HTTPS; backend vẫn phải kiểm tra allowlist để chống SSRF.
- FE web đọc/ghi schema cấu hình tùy chọn. Widget không sử dụng schema cấu hình AI phía client.

### 4.2 Trạng thái giao diện

| Trạng thái | Hành vi |
| --- | --- |
| Server mặc định | Hiện “Đang dùng cấu hình hệ thống”; các trường key/model riêng được ẩn |
| Cấu hình riêng hợp lệ | Cho tạo gợi ý; hiện tên provider và model |
| Thiếu key/model/base URL | Không gọi API; focus vào trường lỗi |
| Key sai/không đủ quota | Giữ nguyên input và draft; cho sửa hoặc chuyển về cấu hình hệ thống |
| Model không tồn tại | Không tự đổi model im lặng; yêu cầu người dùng chọn lại |
| Kiểm tra kết nối thành công | Chỉ xác nhận kết nối, không tạo gợi ý hoặc lưu dữ liệu học viên |

## 5. Kiến trúc FE mục tiêu

### 5.1 Tách lớp

```text
frontend / widget UI
        ↓
feature hooks + state machine
        ↓
shared domain + validation + API client
        ↓
backend HTTPS / extension bridge
```

Mỗi lớp chịu trách nhiệm:

- **UI:** render trạng thái và nhận thao tác; không tự tạo dữ liệu nghiệp vụ giả.
- **Feature hooks/state machine:** quản lý loading, retry, request hiện hành, draft bẩn và optimistic update có kiểm soát.
- **Shared domain:** type, schema validation, xưng hô, mapping API, error code và AI settings.
- **API client:** auth header, timeout, `AbortController`, request ID, parse lỗi và refresh/logout khi session hết hạn.
- **Extension bridge:** xác thực message source, gắn request ID, trả kết quả fill composer và không tự gửi.

### 5.2 Cấu trúc thư mục đề xuất

```text
shared/
  domain/                 # profile, memory, custom field, suggestion, error
  api-client/             # client dùng chung cho FE và widget
  ai-settings/            # schema hai chế độ cấu hình AI
  pronouns/               # segment và phép đổi xưng hô an toàn

frontend/src/
  app/                    # AppShell, router, error boundary, providers
  features/auth/
  features/conversations/
  features/assistant/
  features/student-profile/
  features/memories/
  features/custom-fields/
  features/ai-settings/

widget/src/
  app/
  features/               # UI compact, dùng shared domain/API
  bridge/
```

`frontend/src/App.tsx` và `widget/src/App.tsx` chỉ điều phối layout. Logic request và nghiệp vụ không tiếp tục dồn vào hai file này.

### 5.3 Phân loại state

| Loại state | Nơi giữ |
| --- | --- |
| Page, hội thoại, message, profile, memory, custom field | Server state có cache và invalidation |
| Tab đang mở, drawer, menu, filter | Local UI state |
| Draft đang sửa | Local state theo `conversationId`; cảnh báo trước khi bỏ draft bẩn |
| Session | Bộ nhớ phù hợp hiện trạng, có thời hạn và logout rõ ràng |
| API key tùy chọn | Memory/session mặc định; persistent storage chỉ khi opt-in |
| Dữ liệu demo | Fixture riêng, chỉ import trong dev/test |

Mọi mutation lưu dữ liệu phải nhận response thành công mới hiện “Đã lưu”. Không dùng state local để giả lập thành công.

## 6. Luồng chức năng chi tiết

### 6.1 Khởi động, đăng nhập và session

1. Kiểm tra cấu hình API production và trạng thái session.
2. Chưa đăng nhập: hiện một màn hình đăng nhập, không render dữ liệu mock phía sau.
3. Đăng nhập thành công: tải user, page được phép truy cập và cấu hình mặc định.
4. Session hết hạn: giữ draft hiện tại, mở lại màn hình đăng nhập; đăng nhập lại xong tiếp tục ở hội thoại cũ nếu vẫn còn quyền.
5. User bị khóa hoặc mất quyền page: xóa dữ liệu cache của phạm vi đó và thông báo đúng nguyên nhân.

Tiêu chí đạt: không có request nghiệp vụ nào chạy bằng dev header trong production.

### 6.2 Chọn page và hội thoại

- Tải danh sách page theo quyền; nhớ page gần nhất nếu user vẫn có quyền.
- Danh sách hội thoại có loading skeleton, empty state, lỗi + retry, phân trang và tải thêm.
- Có tìm kiếm, trạng thái chưa đọc và thời điểm cập nhật; không lọc chỉ bằng dữ liệu của trang đầu đã tải.
- Khi chọn hội thoại B lúc request A đang chạy, hủy request A hoặc cất kết quả đúng cache A; tuyệt đối không render A vào B.
- Tin nhắn tải theo trang, có chỉ báo số lượng/phạm vi AI sẽ đọc.
- Lỗi Pancake không được biến thành hội thoại demo.

### 6.3 Tạo gợi ý trả lời

1. Kiểm tra đã có hội thoại và ít nhất một tin hợp lệ.
2. Ghép context: message, profile đã xác nhận, memory còn hiệu lực, custom field được phép dùng, cặp xưng hô và chế độ AI.
3. Gửi request có `conversationId`, `studentId`, `contextRevision`, `requestId`.
4. Trong khi chạy: cho hủy; không cho double-click tạo request trùng.
5. Nhận kết quả: kiểm tra lại ID/revision trước khi render.
6. Hiện intent, mức nhạy cảm, nguồn/căn cứ và provider/model thực tế.
7. Người dùng chọn câu, sửa draft, copy hoặc đổ vào composer.

Nếu AI lỗi, UI giữ nguyên draft và context, cho Retry. Không tự chèn câu fallback có dữ kiện chuyên môn chưa được người dùng cung cấp.

### 6.4 Ca đỏ

- Cảnh báo nằm trước danh sách gợi ý, có `role="alert"` và không chỉ phân biệt bằng màu.
- Hiện lý do ngắn gọn, thao tác tiếp theo và mẫu trả lời an toàn nếu backend cung cấp.
- Không gọi lại liên tục để tìm câu “mạnh” hơn.
- Người dùng vẫn là người quyết định nội dung và tự gửi.

### 6.5 Hồ sơ học viên — UC-01

- Header luôn nêu rõ page, người đang nhắn và học viên đang được áp hồ sơ.
- Nếu phụ huynh có nhiều học viên: bắt buộc chọn hoặc tạo liên kết học viên trước khi lưu.
- Mỗi field hiển thị giá trị, trạng thái, nguồn, thời điểm và trích dẫn căn cứ nếu có.
- AI đề xuất không ghi đè giá trị đã xác nhận; hiện so sánh cũ/mới và các nút Chấp nhận, Từ chối, Sửa.
- Mâu thuẫn phải là một trạng thái riêng, không tự chọn giá trị mới nhất.
- “Việc tiếp theo” có thể hoàn thành/sửa, không chỉ là text AI tạm thời.
- Mở lại hội thoại phải tải lại được hồ sơ đã lưu từ API.

### 6.6 Xưng hô — UC-02

- Có preset và nhập tùy chỉnh cho “người gửi xưng” và “gọi người nhận”.
- Cặp xưng hô được truyền vào request tạo gợi ý/chấm bài.
- Kết quả nên trả dạng segment hoặc template có role; FE không replace mù toàn câu.
- Khi đổi cặp:
  - card gợi ý chưa sửa được cập nhật ngay;
  - draft chưa sửa được cập nhật và có Undo;
  - draft đã sửa tay hiện lựa chọn “Giữ bản đang sửa” hoặc “Áp dụng thay đổi xưng hô”.
- Không đổi nội dung trong dấu trích dẫn, tên riêng hoặc lời của người thứ ba.

### 6.7 Chấm bài — UC-03

FE web đã có luồng gọi backend; công việc còn lại là hoàn thiện và dùng chung cho widget:

1. Giáo viên nhập nhận xét text; không bắt chọn video.
2. Input trống: không sinh nhận xét chuyên môn, chỉ nhắc nhập nhận xét.
3. Gọi chế độ `teacher_review` cùng hội thoại, học viên và cặp xưng hô hiện hành.
4. Trả đúng 3 cách nói cùng dữ kiện, khác giọng văn.
5. Hiện các dữ kiện AI đã dùng để người dùng kiểm tra.
6. Cho sửa input, tạo lại, chọn câu và đưa vào draft.
7. Khi lỗi: giữ nguyên input; không dùng `mockGradePhrases` trong production và không tự thêm lỗi, mốc thời gian hay tiến bộ.

### 6.8 Ghi nhớ — UC-04

Vòng đời chuẩn:

```text
pending → active → review_due → archived
                ↘ expired
```

- Người dùng tạo mới: nhập nội dung, lý do, phạm vi bài/ngày và ngày rà lại nếu có.
- AI đề xuất: hiện hành động đề xuất, căn cứ và lý do; người dùng Apply/Reject.
- Edit/archive/restore dùng revision để phát hiện hai tab sửa cùng lúc.
- `expired` và `archived` không được dùng làm context hiện tại.
- Xóa hẳn có dialog xác nhận nêu đúng ảnh hưởng; sau xóa hiển thị kết quả thật từ server.
- Lịch sử thay đổi đọc được nhưng không trộn với danh sách đang áp dụng.

### 6.9 Custom field — UC-05

- Tạo định nghĩa: tên, mô tả, kiểu `text/number/select`, option nếu là select, cách điền, phạm vi và `useInSuggestions`.
- Kiểm tra tên trùng, option trống, number sai kiểu và tiêu chí AI chưa được định nghĩa.
- Giá trị AI đề xuất luôn có căn cứ và cần xác nhận.
- Phân biệt:
  - xóa giá trị của một học viên;
  - ẩn field khỏi giao diện;
  - ngừng dùng field trong AI;
  - xóa định nghĩa cho cả phạm vi.
- Mọi danh sách và mutation dùng ID ổn định, không dùng index làm React key.

### 6.10 Draft, copy và extension composer

- Draft tách riêng theo hội thoại; chuyển hội thoại khi draft bẩn phải cảnh báo hoặc giữ draft trong session.
- Nút “Dùng câu” thay nội dung draft phải có Undo.
- Copy có fallback và thông báo bằng `aria-live`.
- Fill composer gửi `requestId`; extension trả `ok/error`; UI chỉ báo thành công sau ACK.
- Extension phải kiểm tra origin/source của `postMessage`, không nhận message tùy ý từ page khác.
- Nếu selector composer thay đổi, báo lỗi có hướng dẫn copy thủ công; không tự gửi.

## 7. Ma trận trạng thái bắt buộc

Mỗi feature tải/lưu dữ liệu phải có đủ các trạng thái sau:

| Trạng thái | UI cần làm |
| --- | --- |
| Initial | Chỉ dẫn hành động đầu tiên, không hiện dữ liệu giả |
| Loading | Skeleton/spinner tại đúng vùng; khóa thao tác trùng |
| Empty | Nêu rõ chưa có dữ liệu và cách tạo |
| Success | Hiện dữ liệu và thời điểm/căn cứ cần thiết |
| Stale | Cho đọc dữ liệu cũ nhưng gắn nhãn và nút tải lại |
| Partial | Nêu rõ phần nào tải được, phần nào lỗi |
| Validation error | Lỗi cạnh field, focus vào lỗi đầu tiên |
| Network/offline | Giữ input/draft, Retry có kiểm soát |
| Unauthorized | Yêu cầu đăng nhập lại, không xóa draft |
| Forbidden | Báo thiếu quyền, không retry vô hạn |
| Rate limited | Hiện thời điểm có thể thử lại nếu server trả về |
| Conflict `409` | So sánh bản server và bản đang sửa, cho tải lại hoặc hợp nhất |
| AI failed | Giữ context/input, cho đổi cấu hình hoặc retry |
| Pancake failed | Không thay bằng demo; cho dùng DOM fallback chỉ khi người dùng biết rõ nguồn |

Thông báo lỗi phải có bước khôi phục, dùng `role="alert"`/`aria-live`, không chỉ đổi viền sang màu đỏ.

## 8. Responsive và accessibility

### 8.1 Responsive

| Kích thước | Bố cục |
| --- | --- |
| Desktop từ 1280px | Ba vùng: hội thoại, chat, trợ lý |
| Tablet 768–1279px | Hai vùng; danh sách hoặc trợ lý mở bằng drawer |
| Mobile 320–767px | Một vùng tại một thời điểm; điều hướng drill-down và nút quay lại rõ ràng |
| Widget hẹp | Tab/drawer, footer không che input hoặc cảnh báo |

Viewport nghiệm thu: desktop 1366/1440/1536/1920/2560; tablet 768/1024; mobile 320/360/390/430; cả dọc và ngang khi phù hợp.

### 8.2 Accessibility tối thiểu

- Dùng semantic button/input/tab/dialog; tab có keyboard navigation và quan hệ `aria-controls`.
- Tất cả control có label và focus ring nhìn thấy được.
- Dialog giữ focus bên trong và trả focus về nút mở khi đóng.
- Sticky header/footer không che phần tử đang focus; có `scroll-padding` phù hợp.
- Màu trạng thái luôn kèm text/icon; độ tương phản đạt WCAG 2.2 AA.
- Vùng bấm tối thiểu khoảng 44×44px trên màn hình cảm ứng.
- Loading, save success, error và ca đỏ được screen reader thông báo.
- Tôn trọng `prefers-reduced-motion`.

## 9. Hợp đồng API FE cần backend cung cấp

Tên endpoint có thể điều chỉnh, nhưng dữ liệu và hành vi sau là bắt buộc:

| Nhóm | API cần có | Dữ liệu tối thiểu |
| --- | --- | --- |
| Auth | login, current user, logout/expire | user, role, page permissions, expiry |
| Conversation | pages, conversations, messages | stable ID, cursor, updatedAt, customer/student link |
| Context | `GET /conversations/:id/context` | profile, active memories, fields, pronouns, revision, sources |
| Suggestions | `POST /suggestions` | request/context IDs, sensitivity, analysis, provider/model, suggestions, used facts |
| Profile | get/patch/confirm/reject proposal | field source, evidence, revision |
| Student link | resolve/link/unlink contact và student | contact ID, student ID, relationship |
| Memories | list/create/update/archive/restore/delete | status, reason, scope, reviewAt, revision, history |
| Custom definitions | list/create/update/hide/delete | type, options, fill mode, scope, useInSuggestions, revision |
| Custom values | get/upsert/clear/confirm proposal | student ID, value, source, evidence, revision |
| AI check | validate provider/key/model | kết quả sanitized; không trả key |

Quy ước chung:

- Response mutation trả object mới và revision mới.
- Lỗi có `code`, message an toàn, field errors, `requestId`; rate limit có `retryAfter`.
- Request AI nhận một object cấu hình rõ ràng: `system` hoặc `user_override`.
- Không trả raw stack, secret hoặc nội dung nhạy cảm không cần thiết cho UI.
- Context và mọi job AI mang `conversationId`, `studentId`, `contextRevision`, `requestId`.

## 10. Kế hoạch thực hiện theo mốc

### M0 — Chốt hợp đồng và fixture

- Chốt quyết định ở mục 3 và schema API ở mục 9.
- Viết fixture chuẩn cho đủ UC-01 đến UC-05, ca đỏ, phụ huynh nhiều con, conflict và lỗi.
- Gắn nhãn rõ fixture mock; không dùng chung với production adapter.

**Gate:** FE và BE cùng dùng một schema; không còn field chỉ tồn tại trong UI.

### M1 — Nền tảng production

- Tách API client, error model, session guard và request cancellation dùng chung.
- Tắt mặc định `isMockMode`; bỏ auto-fallback demo trong production.
- Tách logic khỏi hai `App.tsx`; thêm Error Boundary và thông báo toàn cục.
- Cấu hình URL backend HTTPS qua environment; bổ sung exact host permission cho extension.
- Hoàn thiện hai chế độ AI settings và nút test connection trên FE web; widget chỉ dùng server default.
- Thêm build variant dev/staging/production.

**Gate:** lỗi backend/Pancake không bao giờ biến thành dữ liệu mẫu; widget gọi được API staging/production bằng HTTPS.

### M2 — Luồng hội thoại và gợi ý lõi

- Hoàn thiện login/session expiry, page, phân trang hội thoại/message và trạng thái lỗi.
- Chống request trễ khi đổi hội thoại; giữ draft theo conversation.
- Chuẩn hóa tạo gợi ý, ca đỏ, dùng câu, Undo, copy và fill composer ACK.
- Hiện phạm vi context, nguồn và provider/model đã dùng.

**Gate:** nhân sự có thể mở đúng hội thoại, tạo/chỉnh/đổ gợi ý mà không gửi nhầm người.

### M3 — Hồ sơ và xưng hô

- Triển khai liên kết contact–student và bộ chọn học viên.
- Load/save/confirm/reject profile bằng API và revision.
- Triển khai source/evidence/conflict UI.
- Thay string replacement bằng segment-aware pronoun adapter; xử lý draft bẩn và Undo.

**Gate:** mở lại vẫn có hồ sơ; đổi hội thoại không lẫn dữ liệu; trích dẫn/người thứ ba không bị đổi sai.

### M4 — Chấm bài dùng chung

- Tách feature `teacher_review` dùng chung FE/widget.
- Chuyển widget khỏi `mockGradePhrases` sang API thật.
- Loại bỏ fallback tạo dữ kiện; giữ input khi lỗi và cho tạo lại.
- Hiện used facts và ba cách nói thống nhất dữ kiện.

**Gate:** cùng một input cho FE/widget tuân thủ cùng hợp đồng, không khẳng định đã xem video.

### M5 — Ghi nhớ và custom field

- Hoàn thiện vòng đời memory, proposal, revision conflict, archive/restore/delete.
- Hoàn thiện definition/value của custom field, validation và source/evidence.
- Chỉ đưa dữ liệu active/confirmed/allowed vào request AI.

**Gate:** reload hoặc đổi thiết bị vẫn đọc đúng dữ liệu server; không có giá trị lẫn học viên.

### M6 — Hardening và phát hành

- Accessibility, responsive và keyboard pass.
- Unit, integration, E2E, extension smoke test trên Pancake staging.
- Thêm telemetry lỗi không chứa secret/PII; request correlation và release version.
- Kiểm tra CSP, origin của bridge, logout cleanup và không log API key.
- Chạy UAT theo checklist mục 12, sửa toàn bộ blocker trước production.

**Gate:** đạt Definition of Done ở mục 13.

## 11. Kế hoạch kiểm thử

### 11.1 Unit test

- Pronoun adapter: vai nói/nghe, trích dẫn, người thứ ba, hoa/thường, Unicode, Undo.
- Validation: AI settings, teacher input, number/select field và memory scope.
- Reducer/state machine: đổi hội thoại khi request đang chạy, retry, conflict và draft bẩn.
- Mapping API: không đưa archived/expired memory hoặc field bị tắt vào context.

### 11.2 Integration test

- API client: auth, timeout, abort, lỗi chuẩn, 401/403/409/429.
- Profile/memory/custom field mutation chỉ báo đã lưu sau response thành công.
- FE web có hai chế độ AI: server default và user override; widget chỉ có server default.
- Widget bridge: request/response ID, sai origin, composer không tìm thấy và copy fallback.

### 11.3 E2E bắt buộc

1. Login → chọn page → mở hội thoại → tạo gợi ý → sửa → fill composer.
2. Chuyển A sang B khi AI A đang chạy; B không nhận kết quả A.
3. Session hết hạn khi đang sửa draft; login lại không mất draft.
4. Phụ huynh nhiều học viên; lưu đúng hồ sơ đã chọn.
5. Profile proposal conflict; xác nhận và reload vẫn đúng.
6. Đổi xưng hô không sửa lời trích dẫn/người thứ ba.
7. Chấm bài với “Sai nhịp”; không phát sinh dữ kiện khác.
8. AI lỗi khi chấm bài; input còn nguyên và không có câu giả.
9. Tạo memory, archive, restore, conflict hai tab.
10. Tạo text/number/select field, nhập sai kiểu, sửa và reload.
11. Trên FE web: dùng cấu hình server; sau đó dùng key/model riêng; xóa key và trở lại server. Trên widget: xác nhận request luôn dùng cấu hình server.
12. Ca đỏ có cảnh báo đọc được bằng screen reader và không bị footer che.
13. Backend/Pancake mất kết nối; không hiện dữ liệu demo.
14. Extension không tìm thấy composer; người dùng vẫn copy được và không tự gửi.

## 12. Checklist UAT vận hành

- [ ] Nhân sự luôn biết đang ở page, hội thoại và hồ sơ học viên nào.
- [ ] Không thể lưu profile/memory/field khi chưa xác định đúng học viên.
- [ ] Gợi ý nêu rõ nguồn context và không biến AI proposal thành dữ liệu đã xác nhận.
- [ ] Ca đỏ được ưu tiên và có hành động an toàn.
- [ ] Chấm bài không yêu cầu video, không khẳng định đã xem video và không bịa thêm nhận xét.
- [ ] Đổi xưng hô đúng vai; giữ được phần người dùng sửa.
- [ ] “Đã lưu” chỉ xuất hiện sau thành công từ server.
- [ ] Reload vẫn còn profile/memory/custom field đã lưu.
- [ ] Lỗi mạng/AI/Pancake giữ input và có đường retry.
- [ ] Production không tự chuyển sang mock/demo.
- [ ] FE web cho dùng server default hoặc provider/key/model riêng; widget luôn dùng server default.
- [ ] API key không xuất hiện trong URL, log, analytics hoặc error UI.
- [ ] Widget dùng endpoint HTTPS thật; extension chỉ cấp đúng quyền cần thiết.
- [ ] Người dùng tự xác nhận trước khi gửi tin.
- [ ] Desktop, tablet, mobile và widget hẹp không che chức năng chính.
- [ ] Toàn bộ luồng chính dùng được bằng bàn phím và có thông báo cho screen reader.

## 13. Definition of Done

Một hạng mục chỉ được coi là hoàn tất khi:

1. Dùng API thật ở staging, không dựa vào state/mock để giả lập lưu thành công.
2. Có đầy đủ loading, empty, success, error, retry và conflict nếu có mutation.
3. Không rò dữ liệu giữa page, hội thoại hoặc học viên.
4. Không nhận kết quả AI trễ vào context mới.
5. Có unit/integration test phù hợp và E2E cho luồng nghiệp vụ chính.
6. Đạt responsive và accessibility ở mục 8.
7. Không log secret/PII ngoài chính sách; logout dọn dữ liệu nhạy cảm.
8. Có tiêu chí UAT đã được người vận hành xác nhận.
9. Build FE, widget và extension thành công bằng cấu hình production.
10. Có cách rollback release FE/extension nếu lỗi nghiêm trọng.

## 14. Thứ tự ưu tiên chốt

| Ưu tiên | Việc phải xong | Lý do |
| --- | --- | --- |
| P0 | Tắt mock fallback production, endpoint HTTPS, session/error model, chống request trễ | Ngăn dùng nhầm dữ liệu và gửi nhầm context |
| P0 | Hợp đồng profile/student ID/revision và API lưu thật | Nền tảng cho UC-01, UC-04, UC-05 |
| P0 | Hai chế độ AI settings an toàn trên FE web; widget dùng cấu hình backend | Giữ key/model ra khỏi extension và không trộn cấu hình |
| P0 | Chấm bài widget gọi backend, bỏ câu mẫu production | Source hiện tại chưa đồng nhất với FE web |
| P1 | Hồ sơ, nguồn/căn cứ, conflict và phụ huynh nhiều học viên | Hoàn thiện UC-01 |
| P1 | Xưng hô segment-aware và bảo vệ draft | Hoàn thiện UC-02 |
| P1 | Memory lifecycle và custom field persistence | Hoàn thiện UC-04, UC-05 |
| P1 | E2E toàn luồng và extension smoke test | Điều kiện phát hành |
| P2 | Tối ưu danh sách lớn, telemetry, polish responsive/a11y nâng cao | Ổn định vận hành dài hạn |

Không nên mở production trước khi toàn bộ P0 và P1 đạt gate tương ứng.
