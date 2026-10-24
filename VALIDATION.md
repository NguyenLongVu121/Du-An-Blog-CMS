# Kết quả kiểm chứng

## Refactor HTTPS, giao diện và admin CMS

Ngày 22/10/2026: HTTPS đã chuyển sang `https://localhost:8443`, HTTP redirect đúng cổng mới. Đã kiểm tra phản hồi thực tế có title “Hệ thống Blog / CMS”, meta UTF-8, Google Fonts Be Vietnam Pro, CSP cho fonts.googleapis.com/fonts.gstatic.com; stylesheet Google Fonts tải thành công. Template chuẩn hóa NFC, CSS dùng font hỗ trợ tiếng Việt cho cả heading/body. Chưa xác minh hình ảnh bằng screenshot trình duyệt sau thay đổi này.

Admin CMS đã cập nhật trực tiếp thành `admin@email.com` / `123456` bằng `src/reset-admin.js`, giữ nguyên ID và dữ liệu bài viết. Hash bcrypt cost 12 trong init.sql đã được kiểm tra khớp mật khẩu. Cập nhật environment không tự ghi đè tài khoản mỗi lần startup. Integration CRUD/login/phân quyền/CSRF/XSS và smoke tests đều thành công trên cổng 8443. MySQL admin và Grafana admin vẫn giữ các tài khoản ở mục bên dưới.

## Cập nhật tài khoản demo theo yêu cầu

Ngày 22/10/2026: đã tạo/reset MySQL `admin`@`%` với mật khẩu `123456`, xác nhận kết nối thành công và `SHOW GRANTS` có quyền toàn cục cùng `WITH GRANT OPTION`. App tiếp tục dùng blogapp hạn chế quyền. Đã cập nhật `.env`, cấu hình Grafana và reset mật khẩu bằng `grafana cli admin reset-admin-password admin`; HTTP POST `/login` với admin/admin trả `Logged in`. Áp dụng trên volume hiện có, không chạy `down -v`. Mật khẩu demo đơn giản là ngoại lệ được người dùng yêu cầu so với cấu hình mật khẩu mạnh ban đầu.

Ngày kiểm tra: **22/10/2026**, trên Windows + Docker Desktop Linux Engine **29.7.2**, Compose **5.3.1**.

## Đã chạy thành công

- Build image ứng dụng bằng `npm ci --omit=dev` từ lockfile và khởi động toàn bộ Compose.
- 11 dịch vụ dài hạn ở trạng thái running; ssl-init hoàn thành exit 0. Các healthcheck app, MySQL, Nginx và cAdvisor đều healthy.
- `docker compose config --quiet`, cả hai snapshot mốc commit cũng hợp lệ. Đường dẫn snapshot tương đối, không phụ thuộc máy tác giả.
- `node --check app/src/server.js`, kiểm tra cú pháp các script JS và PowerShell.
- `node scripts/check-views.js`: **18 trường hợp render** thành công, kiểm tra EJS escape nội dung script.
- `npm audit --omit=dev`: **0 vulnerabilities** tại thời điểm kiểm tra. Đây là kết quả audit dependency Node, không phải chứng nhận an toàn cho toàn bộ images/hệ thống.
- `nginx -t` thành công; `promtool check config` thành công.
- HTTPS `/healthz` trả trạng thái ok, kiểm tra kết nối DB thực tế.
- `scripts/smoke.ps1`: xác nhận app UID **10001**, HTTPS/security headers, sáu targets Prometheus UP, `mysql_up=1`, `nginx_up=1`, Grafana health.
- `node scripts/integration.js`: login đúng/sai, logout, chặn truy cập admin chưa đăng nhập, reader bị từ chối, chặn POST thiếu CSRF, CRUD đầy đủ posts/categories/users, bản nháp trả 404 ở trang công khai, xuất bản hiển thị đúng, escape script và chặn xóa bản ghi còn liên kết. Dữ liệu thử đã được dọn.
- `node scripts/check-observability.js`: đủ 6 targets, metrics RAM container thực tế, hai datasource và hai dashboard được provision, cả ba LogQL có kết quả thực tế. Lần kiểm tra thành công ghi nhận 2 streams cho query lỗi, 9 streams cho HTTP lỗi và 15 series cho số log/container; số lượng sẽ thay đổi theo hoạt động và thời gian truy vấn.
- phpMyAdmin tại `http://localhost:8081` trả HTTP **200**.
- `SHOW GRANTS` của blogapp chỉ có `USAGE` và `SELECT, INSERT, UPDATE, DELETE ON blogcms.*`; không có DDL hoặc quyền quản trị.
- MySQL không publish cổng host. Chỉ Nginx 80/443, phpMyAdmin 8081, Prometheus 9090 và Grafana 3001 bind loopback.
- Quét file nguồn/cấu hình/tài liệu không tìm thấy các secret ngẫu nhiên đã tạo trong `.env`.

## Điều chỉnh sau kiểm thử thực tế

- cAdvisor được nâng lên `ghcr.io/google/cadvisor:v0.57.0` để đọc được containerd image store của Docker Desktop. Bản cũ có endpoint scrape nhưng thiếu metrics container do không tìm được layerdb.
- phpMyAdmin tham gia thêm frontend, cho phép publish UI trong khi MySQL vẫn chỉ nằm trên backend internal.
- Xử lý lỗi khóa ngoại theo errno 1451/1452 và cả các alias error code của mysql2 để trả 409 thay vì 500.
- Nginx dùng Docker DNS và upstream `resolve` để theo dõi thay đổi IP khi recreate app.
- Tạo file Nginx access/error thật trong volume, tránh symlink stdout/stderr từ official image.
- Promtail đọc json-file log trực tiếp, không phụ thuộc Docker API và không mount Docker socket.

## Giới hạn xác minh

- Trình duyệt tự động chặn certificate tự ký bằng `ERR_CERT_AUTHORITY_INVALID`; chưa xác minh giao diện bằng screenshot. Không cài CA hoặc bỏ qua cảnh báo trong trình duyệt. Người demo cần tự chấp nhận chứng chỉ lab để xem trang. Render EJS và các luồng HTTP đã được kiểm thử riêng.
- Chưa kiểm thử backup/restore trên bộ dữ liệu mới hoặc mô phỏng mất điện/HA, tải lớn và retention đủ 7 ngày.
- Hai snapshot commit đã kiểm tra cấu hình; chưa dựng hai bản clone tại các mốc lịch sử vì dự án chưa được tạo Git commits/push GitHub. README có quy trình ba commit; không tạo repository tài khoản người dùng hoặc push tự động.
- Promtail đã hết hỗ trợ; dự án giữ công cụ này theo yêu cầu thực hành. Cấu hình host mounts của cAdvisor/Promtail được kiểm chứng trên Docker Desktop máy này; máy dùng rootless Docker/data root khác cần điều chỉnh.

## Chạy lại

```powershell
docker compose up -d --build
powershell -ExecutionPolicy Bypass -File ./scripts/smoke.ps1
node scripts/integration.js
# Đợi Promtail/Prometheus thu dữ liệu mới rồi:
node scripts/check-observability.js
```

Mật khẩu đọc từ `.env`. Nếu đã đổi mật khẩu admin CMS hoặc Grafana qua UI, đồng bộ giá trị dùng cho script trước khi chạy. Không đưa `.env`, private key SSL hoặc output chứa secrets vào báo cáo/GitHub.
