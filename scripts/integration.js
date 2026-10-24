'use strict';
// End-to-end lab check. Creates temporary records and deletes them on success.
// Run after docker compose up: node scripts/integration.js
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => { const p = l.indexOf('='); return [l.slice(0,p),l.slice(p+1)]; }));
function client() {
  let cookie = '';
  return function request(route, fields) {
    const body = fields ? new URLSearchParams(fields).toString() : null;
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: 'localhost', port: 8443, path: route, method: body === null ? 'GET' : 'POST', rejectUnauthorized: false, headers: { Cookie: cookie, ...(body === null ? {} : { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }) } }, res => {
        if (res.headers['set-cookie']) cookie = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        let data = ''; res.setEncoding('utf8'); res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.setTimeout(10000, () => req.destroy(new Error('Request timeout')));
      req.on('error', reject); req.end(body);
    });
  };
}
function csrf(page) { const m = page.body.match(/name="_csrf" value="([a-f0-9]+)"/); assert(m, 'CSRF input exists'); return m[1]; }
function recordId(page, marker) {
  const row = page.body.match(/<tr><td>\d+<\/td>[\s\S]*?<\/tr>/g)?.find(row => row.includes(marker));
  assert(row, `Created record ${marker} is listed`); return row.match(/<tr><td>(\d+)<\/td>/)[1];
}
async function login(request, email, password) {
  const page = await request('/login'); assert.equal(page.status, 200);
  const result = await request('/login', { _csrf: csrf(page), email, password }); assert.equal(result.status, 302, 'Login succeeds');
  return result;
}
(async () => {
  const request = client(), reader = client();
  assert.equal((await request('/healthz')).status, 200);
  const blocked = await request('/admin/posts'); assert.equal(blocked.status, 302); assert.equal(blocked.headers.location, '/login');
  const page = await request('/login');
  assert.equal((await request('/login', { _csrf: csrf(page), email: env.ADMIN_EMAIL, password: 'invalid-password' })).status, 401);
  await login(request, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  const tag = `e2e-${crypto.randomBytes(6).toString('hex')}`;
  const email = `${tag}@example.com`, password = crypto.randomBytes(24).toString('hex');
  const categoryPage = await request('/admin/categories/new');
  assert.equal((await request('/admin/categories/new', { name: tag, description: 'CSRF test' })).status, 403);
  assert.equal((await request('/admin/categories/new', { _csrf: csrf(categoryPage), name: tag, description: 'Integration test' })).status, 302);
  const categoryId = recordId(await request('/admin/categories'), tag);
  assert.equal((await request(`/admin/categories/${categoryId}`, { _csrf: csrf(await request(`/admin/categories/${categoryId}`)), name: tag, description: 'Updated integration category' })).status, 302);
  assert((await request(`/admin/categories/${categoryId}`)).body.includes('Updated integration category'));
  const userPage = await request('/admin/users/new');
  assert.equal((await request('/admin/users/new', { _csrf: csrf(userPage), name: tag, email, role: 'reader', password })).status, 302);
  const userId = recordId(await request('/admin/users'), email);
  assert.equal((await request(`/admin/users/${userId}`, { _csrf: csrf(await request(`/admin/users/${userId}`)), name: `${tag} updated`, email, role: 'reader', password: '' })).status, 302);
  assert((await request(`/admin/users/${userId}`)).body.includes(`${tag} updated`));
  await login(reader, email, password);
  assert.equal((await reader('/admin/users')).status, 403, 'Reader cannot enter admin');
  const postFields = { title: tag, body: '<script>alert(1)</script>\nIntegration test', category_id: categoryId, author_id: userId, status: 'draft' };
  assert.equal((await request('/admin/posts/new', { _csrf: csrf(await request('/admin/posts/new')), ...postFields })).status, 302);
  const postId = recordId(await request('/admin/posts'), tag);
  assert.equal((await request(`/posts/${postId}`)).status, 404, 'Draft is private');
  assert.equal((await request(`/admin/posts/${postId}`, { _csrf: csrf(await request(`/admin/posts/${postId}`)), ...postFields, status: 'published' })).status, 302);
  const published = await request(`/posts/${postId}`); assert.equal(published.status, 200); assert(published.body.includes('&lt;script&gt;')); assert(!published.body.includes('<script>'));
  assert((await request('/')).body.includes(tag));
  assert.equal((await request(`/admin/categories/${categoryId}/delete`, { _csrf: csrf(await request('/admin/categories')) })).status, 409, 'Referenced category is protected');
  assert.equal((await request(`/admin/users/${userId}/delete`, { _csrf: csrf(await request('/admin/users')) })).status, 409, 'Referenced author is protected');
  for (const [entity, record] of [['posts',postId],['categories',categoryId],['users',userId]]) {
    const list = await request(`/admin/${entity}`);
    assert.equal((await request(`/admin/${entity}/${record}/delete`, { _csrf: csrf(list) })).status, 302);
    assert.equal((await request(`/admin/${entity}/${record}`)).status, 404);
  }
  assert.equal((await request('/logout', { _csrf: csrf(await request('/admin/posts')) })).status, 302);
  assert.equal((await request('/admin/posts')).headers.location, '/login');
  console.log('PASS: HTTPS/DB, admin login/logout, invalid login, CSRF rejection, reader authorization, full posts/categories/users CRUD, draft privacy, XSS escaping and foreign key protection. Temporary records removed.');
})().catch(err => { console.error(err); console.error('Integration check failed. Inspect CMS for e2e-* records and remove after diagnosis.'); process.exitCode = 1; });
