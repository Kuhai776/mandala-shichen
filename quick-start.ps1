<#
.SYNOPSIS
    Mandala Shichen - One-click clone and start
.DESCRIPTION
    Clone repo and start web service with fallback mirrors
.NOTES
    Author: Mandala
    Version: 2.4.1
#>

param(
    [string]$InstallDir = "$env:USERPROFILE\Desktop\mandala-shichen",
    [int]$Port = 8080,
    [switch]$InstallAutoStart,
    [switch]$SkipGit
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$RepoUrl = "https://github.com/Kuhai776/mandala-shichen.git"
$MirrorRepos = @(
    "https://ghproxy.net/https://github.com/Kuhai776/mandala-shichen.git",
    "https://mirror.ghproxy.com/https://github.com/Kuhai776/mandala-shichen.git",
    "https://ghfast.top/https://github.com/Kuhai776/mandala-shichen.git"
)

function W-Step { param([string]$Msg) Write-Host "[1/4] " -ForegroundColor Cyan -NoNewline; Write-Host $Msg }
function W-OK   { param([string]$Msg) Write-Host "[OK]   " -ForegroundColor Green -NoNewline; Write-Host $Msg }
function W-Warn { param([string]$Msg) Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $Msg }
function W-Err  { param([string]$Msg) Write-Host "[ERR]  " -ForegroundColor Red -NoNewline; Write-Host $Msg }
function W-Info { param([string]$Msg) Write-Host "[INFO] " -ForegroundColor Blue -NoNewline; Write-Host $Msg }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   Mandala Shichen - Quick Start v2.4.1            " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# ============== 1. Check git ==============
$gitCmd = $null
if (-not $SkipGit) {
    W-Step "Checking git..."
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        W-Warn "git not found, downloading zip with mirrors..."
        $zipPath = Join-Path $env:TEMP "mandala-shichen.zip"
        $allZipUrls = @(
            "https://ghproxy.net/https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip",
            "https://mirror.ghproxy.com/https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip",
            "https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip"
        )
        $dlOk = $false
        foreach ($zu in $allZipUrls) {
            try {
                W-Info "Downloading: $zu"
                Invoke-WebRequest -Uri $zu -OutFile $zipPath -UseBasicParsing -TimeoutSec 60
                $dlOk = $true; break
            } catch { W-Warn "Failed: $($_.Exception.Message)" }
        }
        if (-not $dlOk) {
            W-Err "All download sources failed"
            Write-Host ""
            Write-Host "  Solutions:" -ForegroundColor Yellow
            Write-Host "  1. Install Git: https://git-scm.com/download/win" -ForegroundColor Yellow
            Write-Host "  2. Or download zip manually: https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip" -ForegroundColor Yellow
            Read-Host "Press Enter to exit"
            exit 1
        }
        try {
            if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
            Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
            $extracted = Join-Path $env:TEMP "mandala-shichen-main"
            if (Test-Path $extracted) { Move-Item $extracted $InstallDir -Force }
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            W-OK "Downloaded and extracted to: $InstallDir"
        } catch {
            W-Err "Extract failed: $($_.Exception.Message)"
            Read-Host "Press Enter to exit"
            exit 1
        }
    } else {
        W-OK "git ready: $($gitCmd.Source)"
    }
}

# ============== 2. Clone or update repo ==============
if (-not $SkipGit -and $gitCmd) {
    W-Step "Checking repo dir: $InstallDir"
    if (Test-Path (Join-Path $InstallDir ".git")) {
        W-Info "Repo exists, pulling latest..."
        Set-Location $InstallDir
        git pull --rebase origin main 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            W-Warn "git pull failed, using local version..."
        } else {
            W-OK "Up to date"
        }
    } else {
        W-Info "Cloning repo to: $InstallDir"
        if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
        $cloneOk = $false
        git clone $RepoUrl $InstallDir 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $InstallDir "www"))) { $cloneOk = $true }
        if (-not $cloneOk) {
            W-Warn "Official source failed, trying mirrors..."
            foreach ($mirror in $MirrorRepos) {
                W-Info "Trying: $mirror"
                if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue }
                git clone $mirror $InstallDir 2>&1 | Out-Host
                if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $InstallDir "www"))) {
                    $cloneOk = $true
                    W-OK "Mirror clone success"
                    break
                }
            }
        }
        if (-not $cloneOk) {
            W-Err "All git sources failed, falling back to zip..."
            $zipUrl = "https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip"
            $zipMirrors = @(
                "https://ghproxy.net/https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip",
                "https://mirror.ghproxy.com/https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip"
            )
            $zipPath = Join-Path $env:TEMP "mandala-shichen.zip"
            $dlOk = $false
            $allZipUrls = @($zipUrl) + $zipMirrors
            foreach ($zu in $allZipUrls) {
                try {
                    W-Info "Downloading: $zu"
                    Invoke-WebRequest -Uri $zu -OutFile $zipPath -UseBasicParsing -TimeoutSec 60
                    $dlOk = $true; break
                } catch { W-Warn "Failed: $($_.Exception.Message)" }
            }
            if (-not $dlOk) {
                W-Err "All download sources failed"
                Read-Host "Press Enter to exit"
                exit 1
            }
            if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
            Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
            $extracted = Join-Path $env:TEMP "mandala-shichen-main"
            if (Test-Path $extracted) { Move-Item $extracted $InstallDir -Force }
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        }
        Set-Location $InstallDir
        W-OK "Repo ready: $InstallDir"
    }
} else {
    Set-Location $InstallDir
}

# ============== 3. Check www dir ==============
$WebRoot = Join-Path $InstallDir "www"
if (-not (Test-Path $WebRoot)) {
    W-Err "www directory not found: $WebRoot"
    Write-Host "  Please verify repo structure" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
W-OK "Web root ready: $WebRoot"

# ============== 4. Start service ==============
Write-Host ""
Write-Host "[4/4] " -ForegroundColor Cyan -NoNewline
Write-Host "Starting service..."

if ($InstallAutoStart) {
    W-Info "Installing autostart..."
    $ps1Path = Join-Path $InstallDir "start-mandala.ps1"
    if (Test-Path $ps1Path) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $ps1Path -InstallAutoStart
        W-OK "Autostart installed, starting service..."
    } else {
        W-Warn "start-mandala.ps1 not found, skipping autostart"
    }
}

$StartScript = Join-Path $InstallDir "start-mandala.ps1"
if (Test-Path $StartScript) {
    Write-Host ""
    & powershell -NoProfile -ExecutionPolicy Bypass -File $StartScript
} else {
    W-Warn "start-mandala.ps1 not found, using built-in simple server..."
    Add-Type -AssemblyName System.Web
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    try {
        $listener.Start()
    } catch {
        W-Err "Start failed: $($_.Exception.Message)"
        Write-Host "  Retry as admin, or run: netsh http add urlacl url=http://localhost:$Port/ user=Everyone" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host ""
    Write-Host "Service started: http://localhost:$Port/" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
    Write-Host ""
    try { Start-Process "http://localhost:$Port/" } catch {}
    $mimeMap = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="application/javascript; charset=utf-8"; ".json"="application/json; charset=utf-8"; ".png"="image/png"; ".svg"="image/svg+xml" }
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $path = $ctx.Request.Url.AbsolutePath
        if ($path -eq "/") { $path = "/index.html" }
        $filePath = Join-Path $WebRoot $path.TrimStart("/")
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $ctx.Response.ContentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else { $ctx.Response.StatusCode = 404 }
        $ctx.Response.Close()
    }
}
