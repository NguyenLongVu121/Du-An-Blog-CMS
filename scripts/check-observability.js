'use strict';
// Queries provisioned Grafana datasources; no extra host ports required for Loki.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => { const p = l.indexOf('='); return [l.slice(0,p),l.slice(p+1)]; }));
const headers = { Authorization: 'Basic ' + Buffer.from(`${env.GRAFANA_ADMIN_USER}:${env.GRAFANA_ADMIN_PASSWORD}`).toString('base64') };
async function json(url, options) { const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); assert(response.ok, `${url.split('?')[0]}: ${response.status}`); return response.json(); }
(async () => {
  const targets = await json('http://localhost:9090/api/v1/targets');
  assert.equal(targets.data.activeTargets.length, 6);
  for (const target of targets.data.activeTargets) assert.equal(target.health, 'up', `${target.labels.job}: ${target.lastError}`);
  for (const query of ['mysql_up','nginx_up','count(container_memory_working_set_bytes{image!=""})']) {
    const result = await json('http://localhost:9090/api/v1/query?query=' + encodeURIComponent(query));
    assert(result.data.result.length, `Metric available: ${query}`);
    assert(Number(result.data.result[0].value[1]) >= 1, `Metric positive: ${query}`);
  }
  const datasources = await json('http://localhost:3001/api/datasources', { headers });
  assert(datasources.some(d => d.uid === 'loki')); assert(datasources.some(d => d.uid === 'prometheus'));
  for (const uid of ['blog-cms-overview','blog-cms-logs']) await json(`http://localhost:3001/api/dashboards/uid/${uid}`, { headers });
  const queries = [
    '{job="docker", service=~"app|mysql"} |~ "(?i)(error|exception|fatal|critical)"',
    '{job="nginx-files", stream="access"} | json | __error__="" | status >= 400',
    'sum by (container) (count_over_time({job="docker", container=~".+"}[5m]))'
  ];
  for (let i = 0; i < queries.length; i++) {
    const params = new URLSearchParams({ query: queries[i], since: '15m', limit: '50' });
    const result = await json(`http://localhost:3001/api/datasources/proxy/uid/loki/loki/api/v1/query_range?${params}`, { headers });
    assert.equal(result.status, 'success'); assert(result.data.result.length, `LogQL ${i+1} has real results; run integration.js first and allow 30 seconds for collection`);
    console.log(`PASS: LogQL ${i+1}, ${result.data.result.length} result series/streams.`);
  }
  console.log('PASS: six Prometheus targets, MySQL/Nginx/container metrics, Grafana datasources, two dashboards and all three LogQL queries.');
})().catch(err => { console.error(err); process.exitCode = 1; });
