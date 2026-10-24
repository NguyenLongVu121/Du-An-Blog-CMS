'use strict';
// Render every page and CRUD form without needing a database or Docker daemon.
const path = require('node:path');
const assert = require('node:assert/strict');
const ejs = require('../app/node_modules/ejs');
const base = { csrf: 'test-token', user: { id: 2, name: 'Admin', role: 'admin' } };
const categories = [{ id: 1, name: 'DevOps', description: 'Infrastructure' }];
const users = [{ id: 1, name: 'Author', email: 'author@example.com', role: 'reader' }];
const post = { id: 1, title: '<script>alert(1)</script>', body: 'Hello <script>unsafe</script>', category: 'DevOps', author: 'Author', category_id: 1, author_id: 1, status: 'published', created_at: new Date() };
const configs = {
  posts: { label: 'Bài viết', columns: ['title','category_id','author_id','status','body'] },
  categories: { label: 'Danh mục', columns: ['name','description'] },
  users: { label: 'Người dùng', columns: ['name','email','role'] }
};
async function render(name, data) { const html = await ejs.renderFile(path.join(__dirname, '../app/views', `${name}.ejs`), { ...base, ...data }); assert(html.includes('</html>')); assert(!html.includes('<script>')); return html; }
(async () => {
  let count = 0;
  const home = await render('home', { posts: [post], categories }); count++;
  assert(home.includes('&lt;script&gt;'));
  await render('home', { posts: [], categories, user: null }); count++;
  await render('post', { post }); count++;
  await render('login', { user: null, error: null }); count++;
  await render('login', { user: null, error: 'Incorrect credentials' }); count++;
  await render('message', { user: null, title: '404', message: 'Not found' }); count++;
  for (const [entity, config] of Object.entries(configs)) {
    const row = entity === 'posts' ? post : entity === 'users' ? users[0] : categories[0];
    await render('list', { entity, config, rows: [row] }); count++;
    await render('list', { entity, config, rows: [] }); count++;
    for (const item of [{}, row]) { const html = await render('form', { entity, config, row: item, categories, users }); assert(html.includes('name="_csrf"')); count++; }
  }
  console.log(`PASS: ${count} rendered page/form scenarios; EJS escapes stored script content.`);
})().catch(err => { console.error(err); process.exitCode = 1; });
