# BM_examer: shu kompyuterdan internetga VAQTINCHALIK link beradi (Cloudflare Tunnel, akkauntsiz).
# Ishlatish:  powershell -ExecutionPolicy Bypass -File deploy\run-public.ps1          (yoqish / qayta yoqish)
#             powershell -ExecutionPolicy Bypass -File deploy\run-public.ps1 -Stop    (to'xtatish)
# Kompyuter yoniq turgandagina ishlaydi; link har safar yangi bo'ladi. Ma'lumotlar backend\public_data\ da saqlanadi.
param([switch]$Stop)

$ErrorActionPreference = 'Continue'
$root    = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$data    = Join-Path $backend 'public_data'
$py      = Join-Path $backend 'venv\Scripts\python.exe'
$cf      = 'C:\Users\User\Desktop\BM_examer_tools\cloudflared\cloudflared.exe'
$port    = 8100
$pidFile = Join-Path $data 'pids.txt'

New-Item -ItemType Directory -Force $data, (Join-Path $data 'media') | Out-Null

function Stop-Old {
    if (Test-Path $pidFile) {
        foreach ($p in (Get-Content $pidFile)) { if ($p) { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue } }
        Remove-Item $pidFile -ErrorAction SilentlyContinue
    }
}
Stop-Old
if ($Stop) { "To'xtatildi."; return }

if (-not (Test-Path $cf)) { throw "cloudflared topilmadi: $cf" }
if (-not (Test-Path (Join-Path $root 'frontend\dist-http\index.html'))) { throw "Frontend yig'ilmagan: frontend ichida 'npm run build:http' bajaring." }

function New-Secret($bytesCount) {
    $b = New-Object byte[] $bytesCount
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    return ([Convert]::ToBase64String($b) -replace '[+/=]', '')
}

# maxfiy kalit: bir marta yaratiladi
$keyFile = Join-Path $data 'secret_key.txt'
if (-not (Test-Path $keyFile)) { New-Secret 48 | Set-Content $keyFile -Encoding ascii }

$env:DJANGO_DEBUG         = '0'
$env:DJANGO_SECRET_KEY    = (Get-Content $keyFile -Raw).Trim()
$env:DJANGO_ALLOWED_HOSTS = '.trycloudflare.com,localhost,127.0.0.1'
$env:DJANGO_BEHIND_PROXY  = '1'
$env:DJANGO_SSL_REDIRECT  = '0'      # tunnel o'zi HTTPS beradi; lokal HTTP orqali boshqa hech kim kira olmaydi
$env:DJANGO_HSTS_SECONDS  = '0'      # link har safar o'zgaradi
$env:SQLITE_PATH          = Join-Path $data 'db.sqlite3'
$env:MEDIA_ROOT           = Join-Path $data 'media'
$env:STATIC_ROOT          = Join-Path $data 'static'
$env:SERVE_MEDIA          = '1'
$env:FRONTEND_INDEX       = Join-Path $root 'frontend\dist-http\index.html'
# Bitta sinfdagi o'quvchilar bitta Wi-Fi (bitta IP) dan kiradi: standart 20/min ularni to'sib qo'yardi.
$env:THROTTLE_LOGIN       = '120/min'
$env:THROTTLE_REGISTER    = '200/hour'

Push-Location $backend
& $py manage.py migrate --noinput | Out-Null
& $py manage.py collectstatic --noinput | Out-Null

# admin: birinchi marta tasodifiy parol bilan yaratiladi, parol faqat ADMIN_LOGIN.txt ga yoziladi
$adminFile = Join-Path $data 'ADMIN_LOGIN.txt'
if (-not (Test-Path $adminFile)) {
    $adminPass = (New-Secret 12).Substring(0, 14)
    $env:DJANGO_SUPERUSER_USERNAME = 'admin'
    $env:DJANGO_SUPERUSER_PASSWORD = $adminPass
    & $py manage.py createsuperuser --noinput --email 'admin@example.com' | Out-Null
    Remove-Item Env:DJANGO_SUPERUSER_USERNAME, Env:DJANGO_SUPERUSER_PASSWORD
    "login: admin`r`nparol: $adminPass`r`n(Kirgach Profil sahifasida parolni o'zgartiring.)" | Set-Content $adminFile -Encoding ascii
}
Pop-Location

# Waitress sukut bo'yicha X-Forwarded-For ni o'chirib tashlaydi: hamma foydalanuvchi 127.0.0.1 bo'lib ko'rinib, cheklovlar
# (login/register) hammaga umumiy bo'lib qolardi. Tunnel (127.0.0.1) ga ishonamiz va oxirgi (haqiqiy) IP olinadi.
$srv = Start-Process -FilePath $py -ArgumentList '-m', 'waitress', "--listen=127.0.0.1:$port", '--threads=8', '--trusted-proxy=127.0.0.1', `
    '--trusted-proxy-count=1', '"--trusted-proxy-headers=x-forwarded-for x-forwarded-proto"', 'config.wsgi:application' `
    -WorkingDirectory $backend -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $data 'server.log') -RedirectStandardError (Join-Path $data 'server.err.log')

$tunLog = Join-Path $data 'tunnel.log'
Remove-Item $tunLog -ErrorAction SilentlyContinue
$tun = Start-Process -FilePath $cf -ArgumentList 'tunnel', '--url', "http://127.0.0.1:$port", '--no-autoupdate' `
    -WindowStyle Hidden -PassThru -RedirectStandardError $tunLog -RedirectStandardOutput (Join-Path $data 'tunnel.out.log')

"$($srv.Id)`r`n$($tun.Id)" | Set-Content $pidFile -Encoding ascii

$url = $null
for ($i = 0; $i -lt 45 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $tunLog) {
        $m = [regex]::Match((Get-Content $tunLog -Raw -ErrorAction SilentlyContinue), 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($m.Success) { $url = $m.Value }
    }
}
if (-not $url) { throw "Link olinmadi. Log: $tunLog" }
$url | Set-Content (Join-Path $data 'URL.txt') -Encoding ascii
"LINK: $url"
