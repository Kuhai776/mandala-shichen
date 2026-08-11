<#
.SYNOPSIS
    曼陀罗时辰 · PowerShell 一键部署脚本
.DESCRIPTION
    零依赖启动本机 Web 服务（Windows 自带 .NET HttpListener）
    双击或右键 "使用 PowerShell 运行" 即可
.NOTES
    Author: Mandala
    Version: 2.3.10
#>

# ============== 配置区 ==============
$Port = 8080
$RootSubDir = "www"   # web 资源目录（相对脚本所在位置）
$AutoOpenBrowser = $true
$ShowQRCode = $true   # 是否显示二维码方便手机访问
# ====================================

# 强制 UTF-8 输出，避免中文乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$Host.UI.RawUI.WindowTitle = "曼陀罗时辰 · 本机预览服务器 v2.3.10"

# 切换到脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# 美化输出
function Write-Title {
    param([string]$Text)
    $line = "═" * 56
    Write-Host ""
    Write-Host "╔$line╗" -ForegroundColor Cyan
    $padLen = 56 - $Text.Length * 2 + ([System.Text.Encoding]::Default.GetByteCount($Text))
    $leftPad = [math]::Floor((56 - [System.Text.Encoding]::UTF8.GetByteCount($Text)) / 2)
    $rightPad = 56 - [System.Text.Encoding]::UTF8.GetByteCount($Text) - $leftPad
    Write-Host "║$(' ' * $leftPad)$Text$(' ' * $rightPad)║" -ForegroundColor Cyan
    Write-Host "╚$line╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Info  { param([string]$Msg) Write-Host "[INFO] " -ForegroundColor Blue -NoNewline;   Write-Host $Msg }
function Write-OK    { param([string]$Msg) Write-Host "[OK]   " -ForegroundColor Green -NoNewline;  Write-Host $Msg }
function Write-Warn  { param([string]$Msg) Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $Msg }
function Write-Err   { param([string]$Msg) Write-Host "[ERR]  " -ForegroundColor Red -NoNewline;    Write-Host $Msg }

Write-Title "曼陀罗时辰 · 一键启动 v2.3.10"

# ============== 1. 检查 www 目录 ==============
$WebRoot = Join-Path $ScriptDir $RootSubDir
if (-not (Test-Path $WebRoot)) {
    Write-Err "未找到 www 目录: $WebRoot"
    Write-Host ""
    Write-Host "    请确认:" -ForegroundColor Yellow
    Write-Host "    1. 脚本是否在仓库根目录（与 www 文件夹同级）" -ForegroundColor Yellow
    Write-Host "    2. 或从 Release 下载完整 zip 包:" -ForegroundColor Yellow
    Write-Host "       https://github.com/Kuhai776/mandala-shichen/releases" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "按回车键退出"
    exit 1
}

$IndexFile = Join-Path $WebRoot "index.html"
if (-not (Test-Path $IndexFile)) {
    Write-Err "www 目录中未找到 index.html"
    Read-Host "按回车键退出"
    exit 1
}

Write-OK "Web 资源目录: $WebRoot"

# ============== 2. 检查端口是否被占用 ==============
$portInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Warn "端口 $Port 已被占用，尝试自动切换..."
    for ($p = $Port + 1; $p -le 8090; $p++) {
        $test = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if (-not $test) {
            $Port = $p
            Write-OK "已切换到可用端口: $Port"
            break
        }
    }
    if ($portInUse -and (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
        Write-Err "8080-8090 端口均被占用，请手动修改脚本顶部 `$Port 变量"
        Read-Host "按回车键退出"
        exit 1
    }
}

# ============== 3. 获取本机局域网 IP（供手机访问） ==============
$localIP = $null
try {
    $ipEntries = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -eq "Dhcp" } |
        Sort-Object InterfaceIndex
    if ($ipEntries) {
        $localIP = $ipEntries[0].IPAddress
    }
} catch {
    # 兼容老版本 Windows
    try {
        $localIP = (Test-Connection -ComputerName $env:COMPUTERNAME -Count 1 -ErrorAction SilentlyContinue).IPv4Address.IPAddressToString
    } catch { $localIP = $null }
}

# ============== 4. 启动 HTTP 服务 ==============
Add-Type -AssemblyName System.Web

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
if ($localIP) {
    try {
        $listener.Prefixes.Add("http://${localIP}:$Port/")
    } catch {
        # 没有管理员权限时无法绑定 0.0.0.0，忽略错误
    }
}

try {
    $listener.Start()
} catch {
    Write-Err "启动服务失败: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "    解决方案:" -ForegroundColor Yellow
    Write-Host "    1. 右键此 .ps1 → 用 PowerShell 管理员身份运行" -ForegroundColor Yellow
    Write-Host "    2. 或执行: netsh http add urlacl url=http://localhost:$Port/ user=Everyone" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "按回车键退出"
    exit 1
}

# ============== 5. 输出访问信息 ==============
Write-Host ""
Write-Host "┌────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "│                                                │" -ForegroundColor Green
Write-Host "│   ✅ 服务已启动，访问地址:                      │" -ForegroundColor Green
Write-Host "│                                                │" -ForegroundColor Green
Write-Host "│   本机:   http://localhost:$Port/                ".PadRight(50) -ForegroundColor White
Write-Host "│                                                │" -ForegroundColor Green
if ($localIP) {
    $ipLine = "│   手机:   http://${localIP}:$Port/  (同 WiFi 下)  "
    Write-Host $ipLine.PadRight(50) -ForegroundColor Yellow
    Write-Host "│                                                │" -ForegroundColor Green
}
Write-Host "│   停止:   按 Ctrl+C 或关闭此窗口                │" -ForegroundColor Green
Write-Host "│                                                │" -ForegroundColor Green
Write-Host "└────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""

# ============== 6. 生成二维码（方便手机扫码） ==============
if ($ShowQRCode -and $localIP) {
    $qrUrl = "http://${localIP}:$Port/"
    Write-Info "手机扫码访问（同 WiFi 下）:"
    Write-Host ""

    # 用 Unicode 字符画二维码（纯前端 API 生成）
    $qrApi = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=$([uri]::EscapeDataString($qrUrl))"

    # 尝试调用系统 QR 生成（Win10+ 自带）
    try {
        Add-Type -AssemblyName System.Drawing
        $qrFullApi = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=$([uri]::EscapeDataString($qrUrl))"
        $wc = New-Object System.Net.WebClient
        $qrBytes = $wc.DownloadData($qrFullApi)
        $ms = New-Object System.IO.MemoryStream(,$qrBytes)
        $qrImg = [System.Drawing.Image]::FromStream($ms)

        # 转成 ASCII art
        $bmp = New-Object System.Drawing.Bitmap($qrImg, 50, 50)
        for ($y = 0; $y -lt $bmp.Height; $y += 2) {
            $line = ""
            for ($x = 0; $x -lt $bmp.Width; $x++) {
                $pixel = $bmp.GetPixel($x, $y)
                if ($pixel.R -lt 128) {
                    $line += "██"
                } else {
                    $line += "  "
                }
            }
            Write-Host $line -ForegroundColor White -NoNewline
            Write-Host ""
        }
        $bmp.Dispose()
        $qrImg.Dispose()
        $ms.Dispose()
    } catch {
        # 网络不通或没 System.Drawing，退化显示 URL
        Write-Host "    $qrUrl" -ForegroundColor Yellow
        Write-Host "    (如需二维码，可联网后再次运行)" -ForegroundColor DarkGray
    }
    Write-Host ""
}

# ============== 7. 自动打开浏览器 ==============
if ($AutoOpenBrowser) {
    try {
        Start-Process "http://localhost:$Port/"
        Write-OK "浏览器已打开"
    } catch {
        Write-Warn "无法自动打开浏览器，请手动访问 http://localhost:$Port/"
    }
}

Write-Host ""
Write-Info "服务运行中... 按 Ctrl+C 停止"
Write-Host ""

# ============== 8. MIME 类型映射 ==============
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
    ".eot"  = "application/vnd.ms-fontobject"
    ".txt"  = "text/plain; charset=utf-8"
    ".xml"  = "application/xml; charset=utf-8"
    ".wasm" = "application/wasm"
}

# ============== 9. 请求处理循环 ==============
$requestCount = 0
try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $path = $req.Url.AbsolutePath
        if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }

        # 安全检查：禁止路径穿越
        $safePath = $path -replace "^/", ""
        $filePath = Join-Path $WebRoot $safePath
        $resolvedPath = [System.IO.Path]::GetFullPath($filePath)
        $resolvedRoot = [System.IO.Path]::GetFullPath($WebRoot)
        if (-not $resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            $res.StatusCode = 403
            $res.Close()
            Write-Err "[403] $path (路径越权)"
            continue
        }

        $requestCount++

        if (Test-Path $resolvedPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($resolvedPath).ToLower()
            $contentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
            $res.ContentType = $contentType

            # 禁用缓存，避免调试时看到旧版本
            $res.Headers.Set("Cache-Control", "no-cache, no-store, must-revalidate")
            $res.Headers.Set("Pragma", "no-cache")

            $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()

            $status = "[$($res.StatusCode)]"
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $status $path" -ForegroundColor DarkGray
        } else {
            $res.StatusCode = 404
            $errorMsg = "404 Not Found: $path"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
            $res.ContentType = "text/plain; charset=utf-8"
            $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $res.Close()
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [404] $path" -ForegroundColor Red
        }
    }
} catch [System.Threading.ThreadAbortException] {
    # Ctrl+C 触发，正常退出
} catch {
    if ($listener.IsListening) {
        Write-Err "服务异常: $($_.Exception.Message)"
    }
} finally {
    if ($listener) {
        try { $listener.Stop() } catch {}
        try { $listener.Close() } catch {}
    }
    Write-Host ""
    Write-Host "服务已停止，共处理 $requestCount 个请求" -ForegroundColor Yellow
    Write-Host ""
}
