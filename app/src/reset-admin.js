'use strict';
// Run explicitly to update existing volumes; never resets credentials on startup.
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Configure ADMIN_EMAIL and ADMIN_PASSWORD (6-72 UTF-8 bytes) first.');
  const connection = await mysql.createConnection({ host: 'mysql', user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
  try {
    await connection.beginTransaction();
    // Keep the existing ID so author foreign keys continue to reference it.
    const [rows] = await connection.execute("SELECT id FROM users WHERE email=? OR email='admin@example.com' OR role='admin' ORDER BY (email=?) DESC, (email='admin@example.com') DESC, id LIMIT 1 FOR UPDATE", [email, email]);
    const hash = await bcrypt.hash(password, 12);
    if (rows.length) await connection.execute("UPDATE users SET name=?,email=?,password_hash=?,role='admin' WHERE id=?", ['Quản trị viên', email, hash, rows[0].id]);
    else await connection.execute("INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,'admin')", ['Quản trị viên', email, hash]);
    // Revoke sessions authenticated before the administrator password reset.
    await connection.execute('DELETE FROM sessions');
    await connection.commit();
    console.log(`CMS administrator updated: ${email}. Existing posts/users preserved; sessions revoked.`);
  } catch (error) { await connection.rollback(); throw error; }
  finally { await connection.end(); }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
