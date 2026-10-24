-- Local lab credentials explicitly requested for phpMyAdmin administration.
-- The CMS continues to use the restricted blogapp account.
CREATE USER IF NOT EXISTS 'admin'@'%' IDENTIFIED BY '123456';
ALTER USER 'admin'@'%' IDENTIFIED BY '123456';
GRANT ALL PRIVILEGES ON *.* TO 'admin'@'%' WITH GRANT OPTION;
