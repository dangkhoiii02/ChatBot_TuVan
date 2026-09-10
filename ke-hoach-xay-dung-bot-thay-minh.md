# Kế hoạch xây dựng Bot Trợ Lý "Thầy Minh Piano" (chạy trên Gemini API)

> Mục tiêu: AI học phong cách nói chuyện của Thầy Minh, nhận tin nhắn học viên, sinh ra 5 phương án trả lời tối ưu để thầy/nhân viên chọn — có cơ chế tự động chặn các ca nhạy cảm (tâm lý, bệnh nặng, hoàn cảnh khó khăn) để chuyển cho người thật xử lý.

---

## 0. Nguyên tắc bắt buộc (đọc trước khi code)

- AI **không tự động gửi** tin nhắn cho học viên trong giai đoạn đầu. Luôn có bước người duyệt.
- AI **không được dùng kỹ thuật thuyết phục/tâm lý để níu kéo** học viên đang gặp khủng hoảng (bệnh nặng, tài chính kiệt quệ, sức khỏe tâm thần...). Với các ca này, chỉ an ủi + tôn trọng quyết định + để ngỏ cửa quay lại.
- Số liệu cứng (giá, số ngày bảo lưu, chính sách hoàn tiền) phải lấy từ **file tra cứu (Policy file)**, không để AI tự "sáng tác" theo văn phong.
- Mọi tin nhắn có từ khóa nhạy cảm → tự động gắn cờ "đỏ", không sinh gợi ý tự nhiên mà ưu tiên chuyển người thật.

---

## 1. Kiến trúc tổng quan

```
Tin nhắn học viên
      │
      ▼
[1] Bộ lọc phân loại mức độ nhạy cảm (Sensitivity Classifier)
      │
      ├── ĐỎ (bệnh nặng, tâm lý, xin nghỉ vì hoàn cảnh bi kịch)
      │     → Không sinh gợi ý thuyết phục, chỉ gợi ý câu an ủi tôn trọng quyết định
      │     → Bắt buộc người thật duyệt trước khi gửi
      │
      ├── VÀNG (hỏi bài, thắc mắc chính sách thông thường, xin bảo lưu thường)
      │     → AI sinh 5 gợi ý, người duyệt chọn/sửa rồi gửi
      │
      └── XANH (chào hỏi, cảm ơn, câu hỏi đơn giản có sẵn FAQ)
            → AI có thể tự gửi (tuỳ mức độ tin tưởng bạn thiết lập)
      │
      ▼
[2] Truy xuất ngữ cảnh (RAG)
      - Persona file (văn phong thầy Minh)
      - Policy file (số liệu cứng: học phí, bảo lưu, hoàn tiền...)
      - Few-shot examples (các đoạn hội thoại thật đã được duyệt)
      │
      ▼
[3] Gọi Gemini API → sinh 5 phương án trả lời (JSON)
      │
      ▼
[4] Giao diện cho thầy/nhân viên xem & chọn
      │
      ▼
[5] Gửi tin nhắn + Lưu lại lựa chọn để cải thiện dần
```

---

## 2. Chuẩn bị dữ liệu

### 2.1 Persona file (`persona.md`)
Trích xuất từ các đoạn chat thật, mô tả:
- Cách xưng hô (thầy - em / thầy - chị tuỳ tuổi học viên)
- Giọng điệu: gần gũi, hay dùng "nè", "ha", "nhen", emoji nhẹ
- Cách phản hồi bài tập: chỉ mốc thời gian cụ thể, gọi tên kỹ thuật, luôn kết bằng gợi ý tập luyện
- Cách xử lý quy định (rõ ràng nhưng mềm mỏng) — **chỉ áp dụng cho ca thông thường, không áp dụng khi học viên đang khủng hoảng**

### 2.2 Policy file (`policy.md` hoặc `policy.json`)
Số liệu cứng, cập nhật riêng, KHÔNG để model tự bịa:
- Học phí, số buổi/khóa
- Quy định bảo lưu (90 ngày / khóa 20 tuần...)
- Chính sách hoàn tiền
- Các trường hợp ngoại lệ đã từng duyệt (để tham khảo, không phải tiền lệ bắt buộc)

### 2.3 Few-shot examples (`examples.jsonl`)
Mỗi dòng 1 cặp:
```json
{"context": "Học viên hỏi về chuyển ngón trong bài Für Elise", "sensitivity": "xanh", "reply": "..."}
{"context": "Học viên xin hoàn tiền vì lý do cá nhân thông thường", "sensitivity": "vang", "reply": "..."}
{"context": "Học viên chia sẻ bệnh nặng, xin rời khóa", "sensitivity": "do", "reply": "..."}
```
Càng nhiều ví dụ đã được người thật duyệt, chất lượng gợi ý càng sát giọng thầy Minh.

### 2.4 Bộ từ khóa cờ đỏ (`red_flags.json`)
Danh sách từ khóa để tự động phát hiện ca nhạy cảm, ví dụ nhóm chủ đề: sức khỏe tâm thần, bệnh hiểm nghèo, khó khăn tài chính nghiêm trọng, tang sự... (bạn tự bổ sung/tinh chỉnh danh sách theo thực tế vận hành, nên có người có chuyên môn tâm lý rà lại danh sách này).

---

## 3. Vì sao vẫn dùng tốt với Gemini API (không lệ thuộc Claude)

Toàn bộ kiến trúc trên là **provider-agnostic** — phần persona/policy/RAG/logic phân loại không phụ thuộc model nào. Điểm cần lưu ý khi chuyển sang Gemini:

| Thành phần | Với Claude | Với Gemini | Ghi chú |
|---|---|---|---|
| Endpoint | `api.anthropic.com/v1/messages` | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | Khác format request/response |
| System prompt | field `system` riêng | field `systemInstruction` | Vẫn nhét được persona + policy vào đây |
| Ép JSON output | prompt yêu cầu JSON thuần | Gemini hỗ trợ `responseMimeType: "application/json"` + `responseSchema` — **nên dùng vì ép schema chặt hơn** | Ưu điểm của Gemini cho use case sinh 5 câu trả lời có cấu trúc |
| Few-shot | đưa vào `messages` | đưa vào `contents` dạng nhiều turn user/model | Giữ nguyên logic, đổi format |
| Retrieval (RAG) | tự làm bằng vector DB bất kỳ | tự làm bằng vector DB bất kỳ | Không phụ thuộc model, dùng chung được |

→ Kết luận: bạn chỉ cần viết 1 lớp "adapter" gọi API (Gemini hoặc đổi provider khác sau này), còn toàn bộ phần cốt lõi (persona, policy, phân loại, RAG, giao diện duyệt) giữ nguyên.

---

## 4. Ví dụ gọi Gemini API để sinh 5 phương án (ép JSON schema)

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: personaFileContent + "\n\n" + policyFileContent }]
      },
      contents: [
        // few-shot examples đã duyệt (tuỳ chọn, nếu dùng RAG thì chỉ nhét vài ví dụ liên quan nhất)
        ...fewShotTurns,
        { role: "user", parts: [{ text: studentMessage }] }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            sensitivity: { type: "STRING", enum: ["xanh", "vang", "do"] },
            replies: {
              type: "ARRAY",
              minItems: 5,
              maxItems: 5,
              items: { type: "STRING" }
            }
          },
          required: ["sensitivity", "replies"]
        }
      }
    })
  }
);
const data = await response.json();
const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
```

Lưu ý: dù model tự chấm `sensitivity`, vẫn nên **chạy song song bộ lọc từ khóa cờ đỏ ở bước [1]** làm lớp bảo vệ độc lập — không hoàn toàn tin vào phán đoán của model cho các ca nhạy cảm.

---

## 5. Lộ trình triển khai (gợi ý theo giai đoạn)

**Giai đoạn 1 — Nền tảng (1-2 tuần)**
- Viết persona.md + policy.md từ dữ liệu chat thật
- Gom 30-50 ví dụ few-shot đã phân loại xanh/vàng/đỏ
- Viết bộ từ khóa cờ đỏ, nhờ người có chuyên môn rà soát

**Giai đoạn 2 — Core engine (1-2 tuần)**
- Viết adapter gọi Gemini API + ép schema JSON
- Viết logic phân loại 2 lớp (từ khóa + model)
- Test với dữ liệu chat cũ, so sánh output AI vs câu trả lời thật của thầy

**Giai đoạn 3 — Giao diện duyệt (1 tuần)**
- Dashboard đơn giản: hiện tin nhắn đến + 5 gợi ý + nút chọn/sửa/gửi
- Ca "đỏ": hiện cảnh báo nổi bật, không hiện nút "gửi nhanh"

**Giai đoạn 4 — Vòng lặp cải thiện (liên tục)**
- Lưu lại mọi lựa chọn/chỉnh sửa của thầy → bổ sung vào few-shot examples
- Định kỳ (2-4 tuần) rà soát lại persona.md và red_flags.json

**Giai đoạn 5 — Mở rộng kết nối (tuỳ nhu cầu)**
- Webhook Zalo/Messenger để nhận – gửi tin tự động (vẫn qua bước duyệt người ở ca vàng/đỏ)

---

## 6. Việc nên làm song song, ngoài phạm vi kỹ thuật

- Nhờ người có chuyên môn (tâm lý/CSKH) duyệt lại bộ quy tắc phân loại đỏ/vàng/xanh và các mẫu câu an ủi, đảm bảo không vô tình gây áp lực lên học viên đang khó khăn.
- Có quy trình rõ ràng: khi hệ thống gắn cờ đỏ, ai là người thật sẽ nhận và xử lý trong bao lâu.
