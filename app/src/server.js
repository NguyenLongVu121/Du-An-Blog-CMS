'use strict';
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const app = express();
const required = ['MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'SESSION_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
if (process.env.SESSION_SECRET.length < 32 || process.env.ADMIN_PASSWORD.length < 6 || Buffer.byteLength(process.env.ADMIN_PASSWORD, 'utf8') > 72) throw new Error('SESSION_SECRET >=32; bootstrap ADMIN_PASSWORD >=6 characters and <=72 UTF-8 bytes required');
const pool = mysql.createPool({ host: 'mysql', user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, connectionLimit: 10, charset: 'utf8mb4' });
app.set('view engine', 'ejs');
app.set('views', require('node:path').join(__dirname, '../views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ strictTransportSecurity: false }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => console.log(JSON.stringify({ level: res.statusCode >= 500 ? 'error' : 'info', method: req.method, path: req.path, status: res.statusCode, duration_ms: Date.now() - start })));
  next();
});
app.get('/healthz', async (req, res, next) => { try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); } catch (e) { next(e); } });
app.use(express.static(require('node:path').join(__dirname, '../public')));
app.use(express.urlencoded({ extended: false, limit: '128kb' }));
const store = new MySQLStore({ createDatabaseTable: false, schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } } }, pool);
store.on('error', err => console.error(JSON.stringify({ level: 'error', event: 'session_store', code: err.code })));
app.use(session({ name: 'cms.sid', secret: process.env.SESSION_SECRET, store, resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2 * 60 * 60 * 1000 } }));
app.use(async (req, res, next) => {
  try {
    req.session.csrf ||= crypto.randomBytes(32).toString('hex');
    res.locals.csrf = req.session.csrf;
    res.locals.user = null;
    if (req.session.userId) {
      const [users] = await pool.execute('SELECT id,name,email,role FROM users WHERE id=?', [req.session.userId]);
      res.locals.user = users[0] || null;
    }
    if (req.method === 'POST' && (typeof req.body._csrf !== 'string' || req.body._csrf !== req.session.csrf)) return res.status(403).render('message', { title: 'Yêu cầu bị từ chối', message: 'CSRF token không hợp lệ. Tải lại trang rồi thử lại.' });
    next();
  } catch (e) { next(e); }
});
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function text(value, name, max = 255, normalize = true) { if (typeof value !== 'string') fail(`${name}: dữ liệu không hợp lệ.`); const normalized = normalize ? value.trim().normalize('NFC') : value.trim(); if (!normalized || normalized.length > max) fail(`${name}: cần từ 1 đến ${max} ký tự.`); return normalized; }
function id(value) { if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('ID không hợp lệ.'); return Number(value); }
function admin(req, res, next) { if (!res.locals.user) return res.redirect('/login'); if (res.locals.user.role !== 'admin') return res.status(403).render('message', { title: 'Không có quyền', message: 'Chỉ quản trị viên được quản lý CMS.' }); next(); }
app.get('/', async (req, res, next) => {
  try {
    const category = req.query.category ? id(req.query.category) : null;
    const [posts] = await pool.execute("SELECT p.*,c.name category,u.name author FROM posts p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.author_id WHERE p.status='published' AND (? IS NULL OR c.id=?) ORDER BY p.created_at DESC", [category, category]);
    const [categories] = await pool.query('SELECT * FROM categories ORDER BY name');
    res.render('home', { posts, categories });
  } catch (e) { next(e); }
});
app.get('/posts/:id', async (req, res, next) => {
  try { const [rows] = await pool.execute("SELECT p.*,c.name category,u.name author FROM posts p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.author_id WHERE p.id=? AND p.status='published'", [id(req.params.id)]); if (!rows.length) fail('Không tìm thấy bài viết.', 404); res.render('post', { post: rows[0] }); } catch (e) { next(e); }
});
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res, next) => {
  try {
    const email = text(req.body.email, 'Email').toLowerCase();
    const password = text(req.body.password, 'Mật khẩu', 128, false);
    const [rows] = await pool.execute('SELECT * FROM users WHERE email=?', [email]);
    if (!rows.length || !await bcrypt.compare(password, rows[0].password_hash)) return res.status(401).render('login', { error: 'Email hoặc mật khẩu không đúng.' });
    req.session.regenerate(err => { if (err) return next(err); req.session.userId = rows[0].id; req.session.save(err => err ? next(err) : res.redirect('/admin/posts')); });
  } catch (e) { next(e); }
});
app.post('/logout', (req, res, next) => req.session.destroy(err => { if (err) return next(err); res.clearCookie('cms.sid'); res.redirect('/'); }));
const entities = {
  posts: { label: 'Bài viết', columns: ['title', 'category_id', 'author_id', 'status', 'body'] },
  categories: { label: 'Danh mục', columns: ['name', 'description'] },
  users: { label: 'Người dùng', columns: ['name', 'email', 'role'] }
};
app.use('/admin', admin);
app.get('/admin', (req, res) => res.redirect('/admin/posts'));
app.param('entity', (req, res, next, entity) => { if (!Object.hasOwn(entities, entity)) return next(Object.assign(new Error('Không tìm thấy trang.'), { status: 404 })); next(); });
app.get('/admin/:entity', async (req, res, next) => {
  try {
    const entity = req.params.entity;
    const columns = entity === 'users' ? 'id,name,email,role,created_at' : '*';
    const [rows] = await pool.query(`SELECT ${columns} FROM ${entity} ORDER BY id DESC`);
    res.render('list', { entity, config: entities[entity], rows });
  } catch (e) { next(e); }
});
app.get('/admin/:entity/:id', async (req, res, next) => {
  try {
    const entity = req.params.entity;
    let row = {};
    if (req.params.id !== 'new') {
      const columns = entity === 'users' ? 'id,name,email,role' : '*';
      const [rows] = await pool.execute(`SELECT ${columns} FROM ${entity} WHERE id=?`, [id(req.params.id)]);
      if (!rows.length) fail('Không tìm thấy dữ liệu.', 404); row = rows[0];
    }
    const [categories] = await pool.query('SELECT id,name FROM categories ORDER BY name');
    const [users] = await pool.query('SELECT id,name FROM users ORDER BY name');
    res.render('form', { entity, config: entities[entity], row, categories, users });
  } catch (e) { next(e); }
});
// Serialize all user mutations through the actor row to protect the last administrator.
app.post('/admin/:entity/:id', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const entity = req.params.entity, isNew = req.params.id === 'new';
    const rowId = isNew ? null : id(req.params.id);
    await connection.beginTransaction();
    if (entity === 'users') {
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id FOR UPDATE");
      const [target] = rowId ? await connection.execute('SELECT role FROM users WHERE id=?', [rowId]) : [[]];
      if (target[0]?.role === 'admin' && req.body.role !== 'admin' && admins.length <= 1) fail('Phải giữ ít nhất một quản trị viên.');
    }
    let values;
    if (entity === 'posts') {
      if (!['draft', 'published'].includes(req.body.status)) fail('Trạng thái không hợp lệ.');
      values = [text(req.body.title, 'Tiêu đề', 200), id(req.body.category_id), id(req.body.author_id), req.body.status, text(req.body.body, 'Nội dung', 50000)];
    } else if (entity === 'categories') values = [text(req.body.name, 'Tên danh mục', 100), text(req.body.description, 'Mô tả', 1000)];
    else {
      const email = text(req.body.email, 'Email').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Email không hợp lệ.');
      if (!['admin', 'reader'].includes(req.body.role)) fail('Vai trò không hợp lệ.');
      values = [text(req.body.name, 'Tên', 100), email, req.body.role];
    }
    const columns = [...entities[entity].columns];
    if (entity === 'users' && (isNew || req.body.password)) {
      const password = text(req.body.password, 'Mật khẩu', 72, false);
      if (password.length < 16 || Buffer.byteLength(password, 'utf8') > 72) fail('Mật khẩu cần ít nhất 16 ký tự và tối đa 72 byte UTF-8.');
      columns.push('password_hash'); values.push(await bcrypt.hash(password, 12));
    }
    if (isNew) await connection.execute(`INSERT INTO ${entity} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
    else {
      const [result] = await connection.execute(`UPDATE ${entity} SET ${columns.map(c => `${c}=?`).join(',')} WHERE id=?`, [...values, rowId]);
      if (!result.affectedRows) fail('Không tìm thấy dữ liệu.', 404);
    }
    await connection.commit(); res.redirect(`/admin/${entity}`);
  } catch (e) { await connection.rollback(); next(e); } finally { connection.release(); }
});
app.post('/admin/:entity/:id/delete', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const entity = req.params.entity, rowId = id(req.params.id);
    await connection.beginTransaction();
    if (entity === 'users') {
      if (rowId === res.locals.user.id) fail('Không thể xóa tài khoản đang đăng nhập.');
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id FOR UPDATE");
      if (admins.length <= 1 && admins.some(u => u.id === rowId)) fail('Phải giữ ít nhất một quản trị viên.');
    }
    const [result] = await connection.execute(`DELETE FROM ${entity} WHERE id=?`, [rowId]);
    if (!result.affectedRows) fail('Không tìm thấy dữ liệu.', 404);
    await connection.commit(); res.redirect(`/admin/${entity}`);
  } catch (e) { await connection.rollback(); next(e); } finally { connection.release(); }
});
app.use((req, res) => res.status(404).render('message', { title: '404', message: 'Không tìm thấy trang.' }));
app.use((err, req, res, next) => {
  console.error(JSON.stringify({ level: 'error', event: 'request_error', code: err.code, message: err.status ? err.message : 'Internal error' }));
  let status = err.status || 500, message = err.status ? err.message : 'Có lỗi hệ thống. Vui lòng thử lại.';
  if (err.code === 'ER_DUP_ENTRY') { status = 409; message = 'Email hoặc tên danh mục đã tồn tại.'; }
  if ([1451,1452].includes(err.errno) || ['ER_ROW_IS_REFERENCED', 'ER_ROW_IS_REFERENCED_2', 'ER_NO_REFERENCED_ROW', 'ER_NO_REFERENCED_ROW_2'].includes(err.code)) { status = 409; message = 'Dữ liệu đang được bài viết sử dụng hoặc liên kết không tồn tại. Hãy cập nhật bài viết trước.'; }
  res.status(status).render('message', { title: `Lỗi ${status}`, message });
});
async function start() {
  const [admins] = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (!admins.length) await pool.execute("INSERT INTO users(name,email,role,password_hash) VALUES (?,?,'admin',?)", ['Quản trị viên', process.env.ADMIN_EMAIL.toLowerCase(), await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)]);
  const server = app.listen(3000, '0.0.0.0', () => console.log(JSON.stringify({ level: 'info', event: 'listening', port: 3000 })));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(async () => { await store.close(); await pool.end(); process.exit(0); }); setTimeout(() => process.exit(1), 10000).unref(); });
}
start().catch(err => { console.error(JSON.stringify({ level: 'error', event: 'startup', code: err.code, message: err.message })); process.exit(1); });
