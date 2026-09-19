# Bảng chi phí vận hành Trợ lý học viên AI

> Cập nhật: 19/09/2026  
> Quy đổi dự toán: **1 USD = 26.210đ**; số tiền thực trả phụ thuộc tỷ giá của ngân hàng tại ngày thanh toán.  
> Chưa gồm phí thuê bao Pancake, thuế, phí thanh toán quốc tế, băng thông vượt quota và phần dung lượng tăng thêm.

## 1. Các phương án chi phí

Giả định **10.000 lượt tạo gợi ý/tháng**, mỗi lượt gồm khoảng 4.000 input token và 600 output token.

**Phương án chốt lâu dài:** Render Starter + Render Postgres + Gemini 3.5 Flash-Lite, khoảng **1.057.000đ/tháng**. FE và widget không phát sinh phí hằng tháng; không bắt buộc mua tên miền.

| Phương án | Hosting | AI | Lượt AI/token dùng để tính | Chi phí/tháng | Chi phí/năm |
| --- | --- | --- | --- | ---: | ---: |
| **A. Miễn phí trên máy hiện có** | Máy tính cá nhân/văn phòng | Gemini Free hoặc Groq Free | Theo quota Free; Groq khoảng **1.300 lượt/tháng** | **0đ** | **0đ** |
| **B. Miễn phí trên cloud** | Google Cloud `e2-micro` Free | Gemini Free | Theo quota Gemini Free của tài khoản | **0đ** | **0đ** |
| **C. Rẻ nhất có AI trả phí** | Google Cloud `e2-micro` Free | Groq GPT-OSS 20B | **10.000 lượt** = 40M input + 6M output token | **126.000đ** | **1.512.000đ** |
| **D. VPS riêng + AI giá rẻ** | DigitalOcean 1 GB | Groq GPT-OSS 20B | **10.000 lượt** = 40M input + 6M output token | **315.000đ** | **3.780.000đ** |
| **E. VPS riêng + OpenAI giá rẻ** | DigitalOcean 1 GB | GPT-5.6 Luna | **10.000 lượt** = 40M input + 6M output token | **587.000đ** | **7.044.000đ** |
| **F. VPS riêng + Gemini** | DigitalOcean 1 GB | Gemini 3.5 Flash-Lite | **10.000 lượt** = 40M input + 6M output token | **897.000đ** | **10.764.000đ** |
| **G. Render Free** | Render Web Service Free | Gemini/Groq Free | Theo quota Free; Groq khoảng **1.300 lượt/tháng** | **0đ** | **0đ** |
| **H. Render + AI giá rẻ** | Render Starter + disk 1 GB | Groq GPT-OSS 20B | **10.000 lượt** = 40M input + 6M output token | **316.000đ** | **3.792.000đ** |
| **I. Render + Gemini** | Render Starter + disk 1 GB | Gemini 3.5 Flash-Lite | **10.000 lượt** = 40M input + 6M output token | **898.000đ** | **10.776.000đ** |
| **J. Lâu dài tiết kiệm** | Render Starter + Render Postgres | Groq GPT-OSS 20B | **10.000 lượt** = 40M input + 6M output token | **475.000đ** | **5.700.000đ** |
| **K. Lâu dài ổn định — đề xuất** | Render Starter + Render Postgres | Gemini 3.5 Flash-Lite | **10.000 lượt** = 40M input + 6M output token | **1.057.000đ** | **12.684.000đ** |

- A và B có thể bằng 0đ nhưng quota miễn phí không được bảo đảm.
- Các phương án D–F đã gồm VPS và weekly snapshot.
- G miễn phí nhưng SQLite sẽ mất khi Render restart/redeploy; chỉ dùng demo nếu không đổi database.
- H và I đã gồm Render Starter $7/tháng và persistent disk 1 GB khoảng $0,25/tháng.
- J và K dùng PostgreSQL riêng: Render Starter $7 + Postgres 256 MB $6 + 1 GB database storage $0,30, tổng hạ tầng khoảng 349.000đ/tháng.
- J và K yêu cầu chuyển phần lưu trữ hiện tại từ SQLite sang PostgreSQL.
- Không bắt buộc mua tên miền. VPS có public IP; Render cấp hostname `onrender.com` và HTTPS. Chỉ mua tên miền nếu cần địa chỉ thương hiệu riêng.
- Mã nguồn Pancake trong `backend/` đã có giao thức cho Gemini, OpenAI và Groq. Riêng backend hàng đợi trong `src/` hiện chỉ hỗ trợ Gemini/mock; cần thống nhất backend triển khai trước khi chọn phương án.

## 2. Chi phí hosting

| Dịch vụ | Chi phí/tháng | Chi phí/năm |
| --- | ---: | ---: |
| Máy tính đang có | **0đ** | **0đ** |
| Google Cloud `e2-micro` Free | **0đ** | **0đ** |
| Render Web Service Free | **0đ** | **0đ** |
| Render Starter 512 MB | **183.000đ** | **2.196.000đ** |
| Render persistent disk 1 GB | **7.000đ** | **84.000đ** |
| **Render Starter + disk 1 GB** | **190.000đ** | **2.280.000đ** |
| Render Postgres 256 MB | **157.000đ** | **1.884.000đ** |
| Render Postgres storage 1 GB | **8.000đ** | **96.000đ** |
| **Render Starter + Postgres** | **349.000đ** | **4.188.000đ** |
| DigitalOcean 1 GB | **157.000đ** | **1.884.000đ** |
| Weekly snapshot DigitalOcean | **32.000đ** | **384.000đ** |
| Tên miền | **0đ** | **0đ** |
| FE phục vụ từ cùng VPS | **0đ** | **0đ** |
| FE trên Cloudflare Pages Free | **0đ** | **0đ** |
| Widget đóng gói trong extension | **0đ** | **0đ** |
| Cloudflare SSL/DNS | **0đ** | **0đ** |
| Cloudflare R2 backup dưới 10 GB | **0đ** | **0đ** |
| **DigitalOcean + snapshot** | **189.000đ** | **2.268.000đ** |

Google Cloud Free chỉ áp dụng cho một `e2-micro` tại các vùng miễn phí ở Mỹ và 1 GB outbound/tháng.

### Chi phí FE và widget

| Thành phần | Cách triển khai | Chi phí |
| --- | --- | ---: |
| FE React | Build thành file tĩnh và phục vụ từ cùng backend/VPS | **0đ** |
| FE React | Cloudflare Pages Free | **0đ** |
| Widget | Build và đóng gói sẵn trong Chrome extension | **0đ** |
| Cài extension nội bộ bằng `Load unpacked` | Cài trực tiếp trên từng máy | **0đ** |
| Phát hành trên Chrome Web Store | Phí tài khoản developer một lần | **$5 ≈ 131.000đ/lần** |

FE và widget không làm tăng chi phí hằng tháng. Phí Chrome Web Store chỉ phát sinh nếu muốn phát hành/cập nhật extension qua cửa hàng.

## 3. Chi phí API AI

### Đơn giá

| API/model | Input / 1M token | Output / 1M token | Trạng thái chi phí |
| --- | ---: | ---: | --- |
| Gemini Free Tier | $0 | $0 | Miễn phí trong quota của tài khoản |
| Groq Developer Free | $0 | $0 | Miễn phí; giới hạn khoảng 200.000 token/ngày với GPT-OSS 20B |
| OpenRouter Free | $0 | $0 | Miễn phí; model có thể thay đổi |
| Groq GPT-OSS 20B | $0,075 | $0,30 | Rẻ nhất trong các API trả phí được chọn |
| GPT-5.6 Luna | $0,20 | $1,20 | OpenAI tối ưu chi phí; cần kiểm thử chất lượng tiếng Việt thực tế |
| Gemini 3.5 Flash-Lite | $0,30 | $2,50 | Phương án Gemini stable |

### Chi phí theo số lượt

| Lượt/tháng | Groq GPT-OSS 20B | GPT-5.6 Luna | Gemini 3.5 Flash-Lite |
| ---: | ---: | ---: | ---: |
| 1.000 | **13.000đ** | **40.000đ** | **71.000đ** |
| 10.000 | **126.000đ** | **398.000đ** | **708.000đ** |
| 50.000 | **629.000đ** | **1.992.000đ** | **3.538.000đ** |

```text
Chi phí = số lượt × ((4.000 × giá input) + (600 × giá output)) / 1.000.000
```

## 4. Bảng chốt ngắn gọn

| Nhu cầu | Phương án | Chi phí/tháng |
| --- | --- | ---: |
| Chạy thử miễn phí | Máy hiện có + Gemini/Groq Free | **0đ** |
| Cloud miễn phí | Google Cloud Free + Gemini Free | **0đ** |
| Render miễn phí để demo | Render Free + Gemini/Groq Free | **0đ** |
| Rẻ nhất có trả phí | Google Cloud Free + Groq trả phí | **126.000đ** |
| VPS riêng tiết kiệm | DigitalOcean + Groq trả phí | **315.000đ** |
| Render giữ được SQLite | Render Starter + disk + Groq | **316.000đ** |
| VPS riêng dùng Gemini | DigitalOcean + Gemini 3.5 Flash-Lite | **897.000đ** |
| Render dùng Gemini | Render Starter + disk + Gemini 3.5 Flash-Lite | **898.000đ** |
| Lâu dài tiết kiệm | Render Starter + Postgres + Groq | **475.000đ** |
| **Lâu dài ổn định — đề xuất** | **Render Starter + Postgres + Gemini 3.5 Flash-Lite** | **1.057.000đ** |

## 5. Giá nên báo khách hàng với 2 nhân sự

Giả định 2 người cùng thực hiện trong **5–7 tuần**, tổng khoảng **50–70 ngày công**, bàn giao mã nguồn và phiên bản có thể vận hành thực tế.

| Mức giá | Số tiền | Khi sử dụng |
| --- | ---: | --- |
| Giá mở đầu để thương lượng | **130.000.000đ** | Giá gửi báo giá ban đầu |
| **Giá nên chốt** | **110.000.000–120.000.000đ** | Phù hợp nhất với phạm vi hiện tại |
| Giá sàn | **95.000.000đ** | Không nên thấp hơn nếu vẫn bàn giao đầy đủ mã nguồn |

**Mức đề xuất ghi trên báo giá: 120.000.000đ, chưa gồm VAT.** Có thể thương lượng xuống khoảng **110.000.000đ**; không nên nhận dưới **95.000.000đ**.

Chi phí Render, API AI, Pancake và các dịch vụ bên thứ ba không nằm trong giá phát triển một lần. Khách hàng nên tự đứng tên tài khoản và thanh toán theo thực tế; với phương án K, dự toán hiện tại là **1.057.000đ/tháng** cho 10.000 lượt AI.

Tiến độ thanh toán đề xuất:

| Đợt | Tỷ lệ | Số tiền nếu hợp đồng 120 triệu |
| --- | ---: | ---: |
| Khi ký hợp đồng | 40% | **48.000.000đ** |
| Khi có bản chạy thử đầy đủ | 40% | **48.000.000đ** |
| Khi bàn giao | 20% | **24.000.000đ** |

## 6. Nguồn giá

- [Google Cloud Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Groq models and pricing](https://console.groq.com/docs/models)
- [Groq free rate limits](https://console.groq.com/docs/rate-limits)
- [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean Backups](https://www.digitalocean.com/pricing/backups)
- [Render pricing](https://render.com/pricing)
- [Render persistent disks](https://render.com/docs/disks)
- [Render Free limitations](https://render.com/docs/free)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Chrome Web Store developer registration](https://developer.chrome.com/docs/webstore/register)
- [OpenRouter Free models](https://openrouter.ai/collections/free-models)
- [Vietcombank – tỷ giá ngoại tệ](https://vietcombank.com.vn/vi-VN/To-chuc/Trang-chu-DCTC/KHTC---Ti-gia---DCTC)
- [TopDev – Báo cáo thị trường IT Việt Nam](https://topdev.vn/page/bao-cao-it-viet-nam)
