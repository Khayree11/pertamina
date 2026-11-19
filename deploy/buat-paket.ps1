<#
  Membuat paket upload untuk VPS: hbac-deploy.tar.gz di folder proyek.
  TIDAK menyertakan: rahasia (.env, .env.prod), data lokal (backend\data: unggahan MCU & backup),
  node_modules, .venv, .next, cache. Image Docker dibangun nanti di VPS oleh deploy/install.sh.

  Jalankan dari folder proyek:
    powershell -ExecutionPolicy Bypass -File .\deploy\buat-paket.ps1 -Server 103.247.10.222
#>
param([string]$Server = "IP_VPS")
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "hbac-deploy.tar.gz"
$skipDirs = @("node_modules", ".next", ".venv", "__pycache__", ".pytest_cache", ".git", ".claude", ".vscode", ".caddy")
$skipPaths = @("backend/data")
$skipNames = @(".env", ".env.prod", "hbac-deploy.tar.gz")
$skipExt = @(".pyc", ".tsbuildinfo", ".db", ".db-wal", ".db-shm", ".dump", ".log")

function Get-PackageFiles([string]$dir) {
  foreach ($item in Get-ChildItem -LiteralPath $dir -Force) {
    $rel = $item.FullName.Substring($root.Length + 1).Replace("\", "/")
    if ($item.PSIsContainer) {
      if ($skipDirs -contains $item.Name -or $skipPaths -contains $rel) { continue }
      Get-PackageFiles $item.FullName
    } else {
      if ($skipNames -contains $item.Name -or $skipExt -contains $item.Extension) { continue }
      $rel
    }
  }
}

# Skrip shell wajib berakhiran baris LF (Linux); ubah otomatis bila tersimpan sebagai CRLF.
foreach ($sh in Get-ChildItem (Join-Path $root "deploy") -Filter *.sh) {
  $text = [IO.File]::ReadAllText($sh.FullName)
  if ($text.Contains("`r")) {
    [IO.File]::WriteAllText($sh.FullName, $text.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))
    Write-Host "  (akhiran baris $($sh.Name) diubah ke LF)"
  }
}

$files = @(Get-PackageFiles $root)
$list = Join-Path $env:TEMP "hbac-paket-files.txt"
[IO.File]::WriteAllLines($list, [string[]]$files, (New-Object Text.UTF8Encoding($false)))
if (Test-Path $out) { Remove-Item $out }
& tar.exe -czf $out -C $root -T $list
if ($LASTEXITCODE -ne 0) { throw "tar gagal (kode $LASTEXITCODE)" }
Remove-Item $list

# Periksa ulang isi paket: tidak boleh ada rahasia / data lokal.
$entries = & tar.exe -tzf $out
$bad = $entries | Where-Object { $_ -match '(^|/)\.env$' -or $_ -match '(^|/)\.env\.prod$' -or $_ -like 'backend/data/*' -or $_ -match '(^|/)node_modules/' -or $_ -match '(^|/)\.venv/' }
if ($bad) { Remove-Item $out; throw "Paket dibatalkan, berisi berkas terlarang: $($bad -join ', ')" }
foreach ($must in @("docker-compose.prod.yml", "Caddyfile", "deploy/install.sh", "backend/Dockerfile", "frontend/Dockerfile", "frontend/package-lock.json")) {
  if ($entries -notcontains $must) { throw "Berkas wajib tidak ada di paket: $must" }
}

$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host ""
Write-Host "Paket siap: $out ($($files.Count) berkas, $sizeMb MB)" -ForegroundColor Green
Write-Host "Tidak berisi .env, data lokal, node_modules, maupun .venv."
Write-Host ""
Write-Host "Langkah berikutnya:" -ForegroundColor Cyan
Write-Host "  1) Upload paket (di PowerShell ini):"
Write-Host "       scp `"$out`" root@${Server}:/root/"
Write-Host "  2) Masuk ke VPS:"
Write-Host "       ssh root@$Server"
Write-Host "  3) Di VPS - ekstrak & pasang (pertama kali maupun update):"
Write-Host "       mkdir -p /root/hbac && tar -xzf /root/hbac-deploy.tar.gz -C /root/hbac && bash /root/hbac/deploy/install.sh"
