<#
.SYNOPSIS
    Mandala Shichen - One-click local deployment
.DESCRIPTION
    Downloads the latest release (web assets + APK) from GitHub and starts a local web service.
    Zero dependencies - uses only Windows built-in .NET HttpListener.
    Suitable for users who want to deploy the latest version on their Windows machine.
.NOTES
    Author: Mandala
    Version: 2.4.0
#>

param(
    [string]$InstallDir = "$env:USERPROFILE\Desktop\mandala-shichen",
    [int]$Port = 8080,
    [switch]$DownloadApk,
    [switch]$InstallAutoStart,
    [switch]$SkipDownload,
    [switch]$Help
)

# Force UTF-8 output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ============== Config ==============
$Repo = "Kuhai776/mandala-shichen"
$ApiBase = "https://api.github.com/repos/$Repo"
$AppVersion = "2.4.0"
$WebSubDir = "www"
# ====================================

function W-Title { param([string]$t)
    $line = "═" * 56
    Write-Host ""; Write-Host "╔$line╗" -ForegroundColor Cyan
    $tb = [System.Text.Encoding]::UTF8.GetByteCount($t)
    $lp = [math]::Floor((56 - $tb) / 2); $rp = 56 - $tb - $lp
    Write-Host "║$(' ' * $lp)$t$(' ' * $rp)║" -ForegroundColor Cyan
    Write-Host "╚$line╝" -ForegroundColor Cyan; Write-Host ""
}
function W-Step { param([string]$m) Write-Host "[1/4] " -ForegroundColor Cyan -NoNewline; Write-Host $m }
function W-OK   { param([string]$m) Write-Host "[OK]   " -ForegroundColor Green -NoNewline; Write-Host $m }
function W-Warn { param([string]$m) Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $m }
function W-Err  { param([string]$m) Write-Host "[ERR]  " -ForegroundColor Red -NoNewline; Write-Host $m }
function W-Info { param([string]$m) Write-Host "[INFO] " -ForegroundColor Blue -NoNewline; Write-Host $m }

if ($Help) {
    W-Title "Mandala Shichen - Local Deploy v$AppVersion"
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\deploy-mandala.ps1                    Download latest + start service"
    Write-Host "  .\deploy-mandala.ps1 -DownloadApk       Also download APK to install dir"
    Write-Host "  .\deploy-mandala.ps1 -InstallAutoStart  Install auto-start after deploy"
    Write-Host "  .\deploy-mandala.ps1 -SkipDownload      Skip download, start existing only"
    Write-Host "  .\deploy-mandala.ps1 -InstallDir 'D:\m' Custom install directory"
    Write-Host "  .\deploy-mandala.ps1 -Port 9000         Custom port"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-mandala.ps1"
    Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-mandala.ps1 -DownloadApk -InstallAutoStart"
    Write-Host ""
    exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PWD.Path }

W-Title "Mandala Shichen - One-Click Deploy v$AppVersion"

# ============== Step 1: Download latest release ==============
if (-not $SkipDownload) {
    W-Step "Fetching latest release from GitHub..."

    # Try to get latest release zip (source code) with mirror fallback
    $zipMirrors = @(
        "https://github.com/$Repo/archive/refs/heads/main.zip",
        "https://ghproxy.net/https://github.com/$Repo/archive/refs/heads/main.zip",
        "https://mirror.ghproxy.com/https://github.com/$Repo/archive/refs/heads/main.zip",
        "https://ghfast.top/https://github.com/$Repo/archive/refs/heads/main.zip"
    )

    $zipPath = Join-Path $env:TEMP "mandala-shichen-latest.zip"
    $dlOk = $false
    foreach ($zu in $zipMirrors) {
        try {
            W-Info "Downloading: $zu"
            Invoke-WebRequest -Uri $zu -OutFile $zipPath -UseBasicParsing -TimeoutSec 90
            $dlOk = $true; break
        } catch { W-Warn "Failed: $($_.Exception.Message)" }
    }

    if (-not $dlOk) {
        W-Err "All download sources failed"
        Write-Host ""
        Write-Host "  Solutions:" -ForegroundColor Yellow
        Write-Host "  1. Check network connection" -ForegroundColor Yellow
        Write-Host "  2. Download manually: https://github.com/$Repo/releases" -ForegroundColor Yellow
        Write-Host "  3. Run with -SkipDownload to use existing files" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }

    # Extract
    try {
        if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
        Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
        $extracted = Join-Path $env:TEMP "mandala-shichen-main"
        if (Test-Path $extracted) { Move-Item $extracted $InstallDir -Force }
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        W-OK "Extracted to: $InstallDir"
    } catch {
        W-Err "Extract failed: $($_.Exception.Message)"
        Read-Host "Press Enter to exit"
        exit 1
    }

    # Optional: Download APK
    if ($DownloadApk) {
        Write-Host ""
        W-Info "Fetching latest APK download URL..."
        try {
            $release = Invoke-RestMethod -Uri "$ApiBase/releases/latest" -UseBasicParsing -TimeoutSec 30
            $apkAsset = $release.assets | Where-Object { $_.name -like "*.apk" } | Select-Object -First 1
            if ($apkAsset) {
                $apkPath = Join-Path $InstallDir $apkAsset.name
                W-Info "Downloading APK: $($apkAsset.name) ($([math]::Round($apkAsset.size / 1MB, 2)) MB)"
                $apkMirrors = @(
                    $apkAsset.browser_download_url,
                    "https://ghproxy.net/$($apkAsset.browser_download_url)",
                    "https://mirror.ghproxy.com/$($apkAsset.browser_download_url)"
                )
                $apkOk = $false
                foreach ($au in $apkMirrors) {
                    try {
                        Invoke-WebRequest -Uri $au -OutFile $apkPath -UseBasicParsing -TimeoutSec 120
                        $apkOk = $true; break
                    } catch { W-Warn "APK mirror failed: $($_.Exception.Message)" }
                }
                if ($apkOk) {
                    W-OK "APK saved: $apkPath"
                } else {
                    W-Warn "APK download failed, you can download manually from release page"
                }
            } else {
                W-Warn "No APK asset found in latest release"
            }
        } catch {
            W-Warn "Cannot fetch release info: $($_.Exception.Message)"
        }
    }
} else {
    W-Step "Skip download, using existing files"
    if (-not (Test-Path $InstallDir)) {
        W-Err "Install directory not found: $InstallDir"
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ============== Step 2: Verify web assets ==============
Write-Host ""
Write-Host "[2/4] " -ForegroundColor Cyan -NoNewline
Write-Host "Verifying web assets..."

$WebRoot = Join-Path $InstallDir $WebSubDir
if (-not (Test-Path $WebRoot)) {
    W-Err "www directory not found: $WebRoot"
    Write-Host "  Please verify the extraction completed successfully" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
$IndexFile = Join-Path $WebRoot "index.html"
if (-not (Test-Path $IndexFile)) {
    W-Err "index.html not found in www directory"
    Read-Host "Press Enter to exit"
    exit 1
}
W-OK "Web root ready: $WebRoot"

# ============== Step 3: Install auto-start (optional) ==============
if ($InstallAutoStart) {
    Write-Host ""
    Write-Host "[3/4] " -ForegroundColor Cyan -NoNewline
    Write-Host "Installing auto-start..."

    $TaskName = "MandalaShichen_AutoStart"
    $Ps1Path = Join-Path $InstallDir "start-mandala.ps1"
    $VbsPath = Join-Path $InstallDir "start-mandala-silent.vbs"

    # Create silent VBS launcher
    $vbsContent = @"
' Mandala Shichen silent launcher (for auto-start, no window)
Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "$InstallDir"
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$Ps1Path"" -Silent", 0, False
"@
    Set-Content -Path $VbsPath -Value $vbsContent -Encoding UTF8

    # Remove existing task if any
    try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}

    try {
        $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$VbsPath`""
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 0)
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Mandala Shichen v$AppVersion AutoStart" -Force | Out-Null
        W-OK "Auto-start registered: $TaskName"
    } catch {
        W-Warn "Auto-start install failed: $($_.Exception.Message)"
        W-Info "Try running as administrator, or use: schtasks /Create /TN $TaskName /TR wscript.exe `"$VbsPath`" /SC ONLOGON"
    }
} else {
    Write-Host ""
    Write-Host "[3/4] " -ForegroundColor Cyan -NoNewline
    Write-Host "Skipping auto-start (use -InstallAutoStart to enable)"
}

# ============== Step 4: Start service ==============
Write-Host ""
Write-Host "[4/4] " -ForegroundColor Cyan -NoNewline
Write-Host "Starting service..."

# Check port
$portInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    W-Warn "Port $Port is in use, trying alternative ports..."
    for ($p = $Port + 1; $p -le 8090; $p++) {
        $test = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if (-not $test) { $Port = $p; W-OK "Switched to port: $Port"; break }
    }
}

# Get local IP for LAN access
$localIP = $null
try {
    $ipEntries = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -eq "Dhcp" } |
        Sort-Object InterfaceIndex
    if ($ipEntries) { $localIP = $ipEntries[0].IPAddress }
} catch {}

# Start HTTP listener
Add-Type -AssemblyName System.Web
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
if ($localIP) {
    try { $listener.Prefixes.Add("http://${localIP}:$Port/") } catch {}
}

try {
    $listener.Start()
} catch {
    W-Err "Failed to start service: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "  Solutions:" -ForegroundColor Yellow
    Write-Host "  1. Run PowerShell as Administrator" -ForegroundColor Yellow
    Write-Host "  2. Or execute: netsh http add urlacl url=http://localhost:$Port/ user=Everyone" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Output access info
Write-Host ""
Write-Host "┌────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "│                                                │" -ForegroundColor Green
Write-Host "│   ✅ Service started successfully               │" -ForegroundColor Green
Write-Host "│                                                │" -ForegroundColor Green
$line1 = "│   Local:  http://localhost:$Port/                "
Write-Host $line1.PadRight(50) -ForegroundColor White
if ($localIP) {
    $line2 = "│   Phone:  http://${localIP}:$Port/  (same WiFi)  "
    Write-Host $line2.PadRight(50) -ForegroundColor Yellow
}
Write-Host "│                                                │" -ForegroundColor Green
Write-Host "│   Stop:   Press Ctrl+C or close this window    │" -ForegroundColor Green
Write-Host "│                                                │" -ForegroundColor Green
Write-Host "└────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""

# Auto open browser
try {
    Start-Process "http://localhost:$Port/"
    W-OK "Browser opened"
} catch {
    W-Warn "Cannot open browser, please visit http://localhost:$Port/ manually"
}

W-Info "Service running... Press Ctrl+C to stop"
Write-Host ""

# MIME map
$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".webp" = "image/webp"
    ".woff" = "font/woff"
    ".woff2" = "font/woff2"
    ".ttf"  = "font/ttf"
    ".txt"  = "text/plain; charset=utf-8"
    ".xml"  = "application/xml; charset=utf-8"
    ".wasm" = "application/wasm"
}

# Request loop
$requestCount = 0
try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $path = $req.Url.AbsolutePath
        if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }

        $safePath = $path -replace "^/", ""
        $filePath = Join-Path $WebRoot $safePath
        $resolvedPath = [System.IO.Path]::GetFullPath($filePath)
        $resolvedRoot = [System.IO.Path]::GetFullPath($WebRoot)
        if (-not $resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            $res.StatusCode = 403
            $res.Close()
            continue
        }

        $requestCount++

        if (Test-Path $resolvedPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($resolvedPath).ToLower()
            $contentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
            $res.ContentType = $contentType
            $res.Headers.Set("Cache-Control", "no-cache, no-store, must-revalidate")

            $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()

            $status = "[$($res.StatusCode)]"
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $status $path" -ForegroundColor DarkGray
        } else {
            $res.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
            $res.ContentType = "text/plain; charset=utf-8"
            $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $res.Close()
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [404] $path" -ForegroundColor Red
        }
    }
} catch [System.Threading.ThreadAbortException] {
    # Ctrl+C normal exit
} catch {
    if ($listener.IsListening) { W-Err "Service error: $($_.Exception.Message)" }
} finally {
    if ($listener) {
        try { $listener.Stop() } catch {}
        try { $listener.Close() } catch {}
    }
    Write-Host ""
    Write-Host "Service stopped. Total requests: $requestCount" -ForegroundColor Yellow
    Write-Host ""
}
