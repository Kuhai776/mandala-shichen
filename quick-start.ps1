<#
.SYNOPSIS
    曼陀罗时辰 · 一键 clone + 启动（最小依赖）
.DESCRIPTION
    自动 clone 仓库到本机并启动 Web 服务
    适合在新机器上首次使用：只需运行此一行命令
.NOTES
    Author: Mandala
    Version: 2.4.0
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
# GitHub 国内镜像（clone 失败时自动尝试）
$MirrorRepos = @(
  "https://ghproxy.net/https://github.com/Kuhai776/mandala-shichen.git",
  "https://mirror.ghproxy.com/https://github.com/Kuhai776/mandala-shichen.git",
  "https://ghfast.top/https://github.com/Kuhai776/mandala-shichen.git"
)

function Write-Step { param([string]$Msg) Write-Host "[1/4] " -ForegroundColor Cyan -NoNewline; Write-Host $Msg }
function Write-OK   { param([string]$Msg) Write-Host "[OK]   " -ForegroundColor Green -NoNewline; Write-Host $Msg }
function Write-Warn { param([string]$Msg) Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $Msg }
function Write-Err  { param([string]$Msg) Write-Host "[ERR]  " -ForegroundColor Red -NoNewline; Write-Host $Msg }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   曼陀罗时辰 · 一键 Clone + 启动 v2.4.0           " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# ============== 1. 检查 git ==============
if (-not $SkipGit) {
    Write-Step "检查 git..."
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        Write-Warn "未检测到 git，使用 PowerShell 内置下载（zip 包 + 国内镜像）..."
        $zipPath = Join-Path $env:TEMP "mandala-shichen.zip"
        $allZipUrls = @(
            "https://ghproxy.net/https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip",
            "https://mirror.ghproxy.com/https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip",
            "https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip"
        )
        $dlOk = $false
        foreach ($zu in $allZipUrls) {
            try {
                Write-Info "下载: $zu"
                Invoke-WebRequest -Uri $zu -OutFile $zipPath -UseBasicParsing -TimeoutSec 60
                $dlOk = $true; break
            } catch { Write-Warn "失败: $($_.Exception.Message)" }
        }
        if (-not $dlOk) {
            Write-Err "所有下载源失败"
            Write-Host ""
            Write-Host "  解决方案:" -ForegroundColor Yellow
            Write-Host "  1. 安装 Git: https://git-scm.com/download/win" -ForegroundColor Yellow
            Write-Host "  2. 或手动下载 zip: https://github.com/Kuhai776/mandala-shichen/archive/refs/heads/main.zip" -ForegroundColor Yellow
            Read-Host "按回车键退出"
            exit 1
        }
        try {
            if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
            Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
            $extracted = Join-Path $env:TEMP "mandala-shichen-main"
            if (Test-Path $extracted) { Move-Item $extracted $InstallDir -Force }
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            Write-OK "已下载并解压到: $InstallDir"
        } catch {
            Write-Err "解压失败: $($_.Exception.Message)"
            Read-Host "按回车键退出"
            exit 1
        }
    } else {
        Write-OK "git 已就绪: $($gitCmd.Source)"
    }
}

# ============== 2. Clone 或更新仓库 ==============
if (-not $SkipGit -and $gitCmd) {
    Write-Step "检查仓库目录: $InstallDir"
    if (Test-Path (Join-Path $InstallDir ".git")) {
        Write-Info "仓库已存在，拉取最新更新..."
        Set-Location $InstallDir
        git pull --rebase origin main 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "git pull 失败，使用本地版本继续启动..."
        } else {
            Write-OK "已是最新版本"
        }
    } else {
        Write-Info "正在 clone 仓库到: $InstallDir"
        if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
        $cloneOk = $false
        # 先试官方源
        git clone $RepoUrl $InstallDir 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $InstallDir "www"))) { $cloneOk = $true }
        # 失败则尝试镜像源
        if (-not $cloneOk) {
            Write-Warn "官方源 clone 失败，尝试国内镜像..."
            foreach ($mirror in $MirrorRepos) {
                Write-Info "尝试: $mirror"
                if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue }
                git clone $mirror $InstallDir 2>&1 | Out-Host
                if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $InstallDir "www"))) {
                    $cloneOk = $true
                    Write-OK "镜像 clone 成功"
                    break
                }
            }
        }
        if (-not $cloneOk) {
            Write-Err "所有 git 源均失败，回退到 zip 下载..."
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
                    Write-Info "下载: $zu"
                    Invoke-WebRequest -Uri $zu -OutFile $zipPath -UseBasicParsing -TimeoutSec 60
                    $dlOk = $true; break
                } catch { Write-Warn "下载失败: $($_.Exception.Message)" }
            }
            if (-not $dlOk) {
                Write-Err "所有下载源失败，请检查网络"
                Read-Host "按回车键退出"
                exit 1
            }
            if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
            Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
            $extracted = Join-Path $env:TEMP "mandala-shichen-main"
            if (Test-Path $extracted) { Move-Item $extracted $InstallDir -Force }
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        }
        Set-Location $InstallDir
        Write-OK "仓库已就绪: $InstallDir"
    }
} else {
    Set-Location $InstallDir
}

# ============== 3. 检查 www 目录 ==============
$WebRoot = Join-Path $InstallDir "www"
if (-not (Test-Path $WebRoot)) {
    Write-Err "未找到 www 目录: $WebRoot"
    Write-Host "  请确认仓库结构完整" -ForegroundColor Yellow
    Read-Host "按回车键退出"
    exit 1
}
Write-OK "Web 资源就绪: $WebRoot"

# ============== 4. 启动服务 ==============
Write-Host ""
Write-Host "[4/4] " -ForegroundColor Cyan -NoNewline
Write-Host "启动服务..."

# 如果要求安装自启，先调用主脚本安装
if ($InstallAutoStart) {
    Write-Info "安装开机自启动..."
    $ps1Path = Join-Path $InstallDir "start-mandala.ps1"
    if (Test-Path $ps1Path) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File $ps1Path -InstallAutoStart
        Write-OK "开机自启已安装，继续启动服务..."
    } else {
        Write-Warn "未找到 start-mandala.ps1，跳过自启安装"
    }
}

# 调用主脚本启动服务
$StartScript = Join-Path $InstallDir "start-mandala.ps1"
if (Test-Path $StartScript) {
    Write-Host ""
    & powershell -NoProfile -ExecutionPolicy Bypass -File $StartScript
} else {
    # 退化方案：直接用 PowerShell 启动简易服务
    Write-Warn "未找到 start-mandala.ps1，使用内置简易服务..."
    Add-Type -AssemblyName System.Web
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    try {
        $listener.Start()
    } catch {
        Write-Err "启动失败: $($_.Exception.Message)"
        Write-Host "  以管理员身份重试，或执行: netsh http add urlacl url=http://localhost:$Port/ user=Everyone" -ForegroundColor Yellow
        Read-Host "按回车键退出"
        exit 1
    }
    Write-Host ""
    Write-Host "✅ 服务已启动: http://localhost:$Port/" -ForegroundColor Green
    Write-Host "按 Ctrl+C 停止" -ForegroundColor Yellow
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
