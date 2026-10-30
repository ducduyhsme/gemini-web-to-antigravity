# 🍪 GEMINI COOKIE SYNC - CHROME EXTENSION

> Extension chuyên dụng cho trình duyệt Chrome / Edge / Brave giúp tự động trích xuất và đồng bộ Cookie từ Google Gemini Web sang **Gemini Web To API** chỉ với **1 cú click chuột**, hoàn toàn không cần mở F12 hay copy thủ công!

---

## 🌟 1. Cơ chế hoạt động (1 Profile Chrome = 1 Account trên 1 Port)

Hệ thống `gemini-web-to-api` quản lý nhiều tài khoản Google, mỗi tài khoản chạy độc lập trên một Port riêng:
- **Tài khoản 1 (Pro 1)**: Chạy trên cổng `http://localhost:4981`
- **Tài khoản 2 (Pro 2)**: Chạy trên cổng `http://localhost:4982`
- **Tài khoản 3 (Pro 3)**: Chạy trên cổng `http://localhost:4983`

**Chrome Extension này hoạt động theo từng Profile riêng biệt:**
- Trong Chrome Profile 1 (đăng nhập tài khoản Google 1): Bạn cài extension và đặt Port là **`4981`**.
- Trong Chrome Profile 2 (đăng nhập tài khoản Google 2): Bạn cài extension và đặt Port là **`4982`**.
- Cấu hình của mỗi Profile được lưu riêng biệt trong `chrome.storage.local`, không bao giờ bị lẫn lộn giữa các tài khoản!

---

## 🚀 2. Hướng dẫn cài đặt Extension vào Chrome / Edge / Brave

1. Mở trình duyệt Chrome trên Profile bạn muốn đồng bộ.
2. Truy cập vào trang quản lý Extension:
   - Trên **Chrome**: Nhập `chrome://extensions/` vào thanh địa chỉ rồi nhấn Enter.
   - Trên **Edge**: Nhập `edge://extensions/`.
3. Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.
4. Nhấn nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
5. Chọn thư mục:
   👉 `gemini-web-to-api\chrome-extension`
6. Extension **Gemini Web to API - Cookie Sync** sẽ xuất hiện ngay lập tức!
7. *(Khuyên dùng)*: Nhấn vào biểu tượng mảnh ghép Extension trên thanh công cụ của Chrome và bấm ghim (Pin) biểu tượng Gemini để tiện sử dụng.

---

## ⚙️ 3. Thiết lập lần đầu cho từng Profile

1. Nhấp chuột vào biểu tượng Extension **Gemini Cookie Sync**.
2. Tại mục **Tên tài khoản / Ghi chú Profile**: Nhập tên gợi nhớ (VD: `Pro 1 (Brandie Linden)`).
3. Tại mục **Port của Account này**: Nhập đúng Port của tài khoản đó trong `gemini-web-to-api` (mặc định là `4981`, tài khoản thứ 2 là `4982`...).
   - *Mẹo:* Bạn có thể bấm nút **`🔍 Dò Port`** để extension tự động quét và liệt kê các Port server đang chạy trên máy!
4. Extension sẽ tự động lưu lại cấu hình cho riêng Profile đó.

---

## ⚡ 4. Cách sử dụng khi Cookie hết hạn

Khi các ứng dụng AI (NextChat, Cherry Studio, Chatbox, Antigravity...) báo lỗi Cookie hết hạn:

### 👉 Cách 1: Đồng bộ tức thì chỉ bằng 1 Click (Khuyên dùng)
1. Đảm bảo server tài khoản đó đang chạy (kiểm tra thấy đèn xanh `🟢 Online`).
2. Mở Extension trên Profile tương ứng.
3. Nhấn nút **`⚡ ĐỒNG BỘ COOKIE NGAY`**.
4. Extension sẽ tự động:
   - Đọc toàn bộ cookie Gemini từ Profile này (bao gồm `__Secure-1PSID` và `__Secure-1PSIDTS`).
   - Gửi yêu cầu cập nhật trực tiếp lên server `http://localhost:<PORT>/admin/cookies`.
   - Server lập tức chuyển sang phiên làm việc mới **mà KHÔNG CẦN khởi động lại server**!

### 👉 Cách 2: Tự động đồng bộ ngầm (Auto-Sync)
1. Trong giao diện Extension, mở mục **⚙️ Cấu hình nâng cao & Tự động đồng bộ**.
2. Bật công tắc: **`Tự động đồng bộ ngầm khi Google cấp Cookie mới (Auto-Sync)`**.
3. Từ bây giờ, mỗi khi bạn mở `https://gemini.google.com` và Google cấp cookie phiên mới, extension sẽ tự động đẩy sang server ngầm mà bạn không cần phải làm gì cả!

### 👉 Cách 3: Sao chép Cookie Header (Nếu server đang tắt)
- Nếu server của bạn đang tắt và bạn muốn cập nhật cookie thủ công qua `manager.ps1` (mục [4]) hoặc file `.env`:
- Chỉ cần bấm nút **`📋 Sao chép Header`**, toàn bộ chuỗi Cookie hợp lệ sẽ được copy vào bộ nhớ tạm!

---

## ❓ 5. Xử lý các thông báo thường gặp

- **`🔴 Offline trên cổng XXXX`**: Server của tài khoản đó chưa được bật. Bạn hãy mở file `start.bat` và chọn mục `[1]` hoặc `[2]` để khởi động server trước.
- **`⚠️ Chưa phát hiện Cookie Gemini`**: Profile Chrome này chưa đăng nhập Google Gemini. Hãy bấm nút **Mở Gemini Web** để truy cập https://gemini.google.com và đăng nhập tài khoản Google của bạn.
- **`🔒 Lỗi 401: Sai Cookie API Key`**: API Key không trùng với `GEMINI_COOKIE_API_KEY` trong file cấu hình. Mặc định là `gemini-cookie-sync`.
- **`⚡ Cookie trên Port XXXX đã là mới nhất`**: Phiên làm việc trên server đã trùng khớp với cookie hiện tại trên trình duyệt, không cần cập nhật thêm.
