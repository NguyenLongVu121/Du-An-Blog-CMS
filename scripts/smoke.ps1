$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Assert-Exit([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "Failed: $Step" } }
docker compose config --quiet
Assert-Exit 'Compose syntax'
docker compose exec -T nginx nginx -t
Assert-Exit 'Nginx config'
$uid = docker compose exec -T app id -u
Assert-Exit 'App UID'
if ($uid.Trim() -ne '10001') { throw "Expected app UID 10001, got $uid" }
$health = curl.exe --silent --show-error --fail --insecure https://localhost:8443/healthz
Assert-Exit 'HTTPS health'
if (($health | ConvertFrom-Json).status -ne 'ok') { throw 'Database health failed' }
$headers = curl.exe --silent --show-error --insecure --head https://localhost:8443
Assert-Exit 'HTTPS headers'
foreach ($header in @('X-Frame-Options', 'X-Content-Type-Options', 'X-XSS-Protection', 'Strict-Transport-Security')) {
    if (-not ($headers -match "(?i)^${header}:")) { throw "Missing header: $header" }
}
$targets = Invoke-RestMethod 'http://localhost:9090/api/v1/targets'
$bad = @($targets.data.activeTargets | Where-Object health -ne 'up')
if ($targets.data.activeTargets.Count -lt 6 -or $bad.Count) { throw 'Prometheus targets not all UP; wait 30 seconds and inspect target errors.' }
foreach ($metric in @('mysql_up', 'nginx_up')) {
    $result = Invoke-RestMethod ("http://localhost:9090/api/v1/query?query=" + $metric)
    if (-not $result.data.result.Count -or $result.data.result[0].value[1] -ne '1') { throw "$metric must be 1" }
}
$null = Invoke-RestMethod 'http://localhost:3001/api/health'
$dbTool = Invoke-WebRequest -UseBasicParsing 'http://localhost:8081'
if ($dbTool.StatusCode -ne 200) { throw 'phpMyAdmin is not reachable' }
docker compose exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
Assert-Exit 'Prometheus config'
Write-Host 'PASS: Compose, Nginx, non-root app, HTTPS headers, DB health, six scrape targets, nginx_up/mysql_up, Grafana and phpMyAdmin.'
Write-Host 'Finish manual CRUD, authorization and LogQL checks in README sections 6-7.'
