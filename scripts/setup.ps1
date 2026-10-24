$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (Test-Path -LiteralPath '.env') { throw '.env already exists. Keep your existing secrets or move it manually before setup.' }
function New-Secret([int]$Bytes = 24) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}
$content = Get-Content -Raw '.env.example'
$replacements = @{
    MYSQL_PASSWORD = (New-Secret)
    MYSQL_ROOT_PASSWORD = (New-Secret)
    MYSQL_EXPORTER_PASSWORD = (New-Secret)
    SESSION_SECRET = (New-Secret 32)
}
foreach ($key in $replacements.Keys) { $content = [regex]::Replace($content, "(?m)^$key=.*$", "$key=$($replacements[$key])") }
[System.IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $content.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding $false))
Write-Host 'Created .env with cryptographically random passwords. Read .env locally; never commit it.'
