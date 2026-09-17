# Giao diện web

React + TypeScript + Vite. Chạy `npm install` rồi `npm run dev` tại thư mục này; địa chỉ mặc định `http://localhost:5180`. API được proxy tới `http://127.0.0.1:4000` khi dev.

Cấu hình AI có ở màn hình đăng nhập và nút **Nhập Key & Chọn Model** trong ứng dụng. Hỗ trợ nhiều nhà cung cấp và model tùy nhập. Nhấn **Lưu cấu hình** trong hộp thoại để áp dụng; **Hủy** bỏ các thay đổi chưa lưu. Cấu hình tại màn hình đăng nhập được lưu khi nhập.

`npm run build` kiểm tra TypeScript và tạo `dist/`. Với bản production, đặt `VITE_API_BASE_URL` hoặc cấu hình reverse proxy `/api` tới backend; dev proxy không có trong bản build.

Xem [README gốc](../README.md) để cấu hình AI, Pancake, extension và chạy kiểm thử.
