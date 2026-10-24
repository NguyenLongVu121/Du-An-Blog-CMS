SET NAMES utf8mb4;
CREATE TABLE users (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(255) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('admin','reader') NOT NULL DEFAULT 'reader',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE categories (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL UNIQUE,
 description TEXT NOT NULL
) ENGINE=InnoDB;
CREATE TABLE posts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(200) NOT NULL,
 body MEDIUMTEXT NOT NULL,
 status ENUM('draft','published') NOT NULL DEFAULT 'draft',
 category_id INT UNSIGNED NOT NULL,
 author_id INT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
 FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
 INDEX idx_posts_status_created (status,created_at)
) ENGINE=InnoDB;
CREATE TABLE sessions (
 session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
 expires INT UNSIGNED NOT NULL,
 data MEDIUMTEXT COLLATE utf8mb4_bin NOT NULL,
 INDEX idx_sessions_expires (expires)
) ENGINE=InnoDB;
-- Random unusable password: seed author cannot authenticate until an admin sets a password.
INSERT INTO users(name,email,password_hash,role) VALUES ('Ban biên tập','editor@example.com','!disabled-until-password-set','reader');
-- Demo CMS administrator: bcrypt cost 12, password 123456.
INSERT INTO users(name,email,password_hash,role) VALUES ('Quản trị viên','admin@email.com','$2b$12$kKx/mRzInszjG3e4yOwkius5.tAmj3dy6/A1peat4P3HJlt0CNTtW','admin');
INSERT INTO categories(name,description) VALUES
 ('DevOps','Triển khai, vận hành và tự động hóa hệ thống.'),
 ('Lập trình','Ghi chép về phát triển ứng dụng web.'),
 ('Quan sát hệ thống','Metrics, logs và vận hành tin cậy.');
INSERT INTO posts(title,body,status,category_id,author_id) VALUES
 ('Từ mã nguồn đến hệ thống chạy bằng Docker Compose','Docker Compose mô tả ứng dụng bằng các dịch vụ, mạng và volume.\n\nTrong dự án này, Nginx nhận request HTTPS và chuyển tiếp tới Express. Express truy cập MySQL qua mạng backend riêng.\n\nDữ liệu MySQL được lưu bằng named volume để tồn tại khi tạo lại container.','published',1,1),
 ('Viết một CMS nhỏ, hiểu một hệ thống lớn','Một CMS bắt đầu với bài viết, danh mục và người dùng.\n\nPrepared statements bảo vệ truy vấn SQL. EJS escape nội dung khi hiển thị. Mọi thao tác thay đổi dữ liệu đều cần phiên đăng nhập quản trị và CSRF token.\n\nHãy thử tạo một danh mục, thêm bài viết, lưu nháp rồi xuất bản.','published',2,1),
 ('Metrics cho biết điều gì, logs giải thích vì sao','Prometheus thu thập metrics theo chu kỳ từ các exporter. Grafana hiển thị tình trạng ứng dụng, Nginx, MySQL và container.\n\nPromtail chuyển log tới Loki. Dùng Explore trong Grafana để lọc lỗi và đối chiếu thời điểm với đồ thị metrics.','published',3,1),
 ('Checklist trước buổi demo','Kiểm tra HTTPS, CRUD, Prometheus Targets, dashboard Grafana và ba câu truy vấn LogQL.','draft',1,1);
