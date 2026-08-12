<#
.SYNOPSIS
    曼陀罗时辰 · PowerShell 一键启动 + 开机自启脚本
.DESCRIPTION
    零依赖启动本机 Web 服务（Windows 自带 .NET HttpListener）
    双击或右键 "使用 PowerShell 运行" 即可
    支持参数：-InstallAutoStart 安装开机自启 / -UninstallAutoStart 卸载 / -Help 查看帮助
.NOTES
    Author: Mandala
    Version: 2.4.0
#>

param(
    [switch]$InstallAutoStart,
    [switch]$UninstallAutoStart,
    [switch]$CheckAutoStart,
    [switch]$Help,
    [switch]$Silent
)

# ============== 配置区 ==============
$Port = 8080
$RootSubDir = "www"
$AutoOpenBrowser = $true
$ShowQRCode = $true
$AppVersion = "2.4.0"
$AppName = "MandalaShichen"
# ====================================

# 强制 UTF-8 输出，避免中文乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 切换到脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# 美化输出
function Write-Title {
    param([string]$Text)
    $line = "═" * 56
    Write-Host ""
    Write-Host "╔$line╗" -ForegroundColor Cyan
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

# ============== 帮助 ==============
if ($Help) {
    Write-Title "曼陀罗时辰 · 使用帮助 v$AppVersion"
    Write-Host "用法:" -ForegroundColor Cyan
    Write-Host "  .\start-mandala.ps1                    启动服务（默认）"
    Write-Host "  .\start-mandala.ps1 -InstallAutoStart  安装开机自启动"
    Write-Host "  .\start-mandala.ps1 -UninstallAutoStart 卸载开机自启动"
    Write-Host "  .\start-mandala.ps1 -CheckAutoStart    查看自启状态"
    Write-Host "  .\start-mandala.ps1 -Help              显示此帮助"
    Write-Host ""
    Write-Host "示例:" -ForegroundColor Cyan
    Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File .\start-mandala.ps1 -InstallAutoStart"
    Write-Host ""
    exit 0
}

# ============== 开机自启管理 ==============
$TaskName = "MandalaShichen_AutoStart"
$WscriptPath = Join-Path $ScriptDir "start-mandala-silent.vbs"

function Get-AutoStartStatus {
    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        return $task
    } catch {
        return $null
    }
}

if ($InstallAutoStart) {
    Write-Title "安装开机自启动 · 曼陀罗时辰 v$AppVersion"

    # 1. 创建静默启动 VBS（避免开机时弹出黑窗口）
    $vbsContent = @"
' 曼陀罗时辰静默启动器（开机自启用，不弹窗）
Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = "$ScriptDir"
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$ScriptDir\start-mandala.ps1"" -Silent", 0, False
"@
    Set-Content -Path $WscriptPath -Value $vbsContent -Encoding UTF8
    Write-OK "静默启动器已创建: $WscriptPath"

    # 2. 创建计划任务（开机时触发，无需登录即启动；以当前用户运行，无需管理员）
    $existingTask = Get-AutoStartStatus
    if ($existingTask) {
        Write-Warn "已存在同名计划任务，先卸载旧任务..."
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$WscriptPath`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Hours 0)

    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

    try {
        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -Principal $principal `
            -Description "曼陀罗时辰 v$AppVersion 开机自启动服务" `
            -Force | Out-Null
        Write-OK "计划任务已注册: $TaskName"
    } catch {
        Write-Err "注册计划任务失败: $($_.Exception.Message)"
        Write-Host ""
        Write-Host "    解决方案:" -ForegroundColor Yellow
        Write-Host "    1. 以管理员身份运行 PowerShell" -ForegroundColor Yellow
        Write-Host "    2. 或手动执行: schtasks /Create /TN $TaskName /TR wscript.exe `"$WscriptPath`" /SC ONLOGON" -ForegroundColor Yellow
        Read-Host "按回车键退出"
        exit 1
    }

    Write-Host ""
    Write-Host "┌────────────────────────────────────────────────┐" -ForegroundColor Green
    Write-Host "│  ✅ 开机自启动已安装                            │" -ForegroundColor Green
    Write-Host "│                                                │" -ForegroundColor Green
    Write-Host "│  · 触发时机: 每次登录 Windows 后自动启动        │" -ForegroundColor Green
    Write-Host "│  · 启动方式: 静默后台运行（无黑窗口）           │" -ForegroundColor Green
    Write-Host "│  · 访问地址: http://localhost:$Port/            │" -ForegroundColor Green
    Write-Host "│  · 卸载命令: .\start-mandala.ps1 -UninstallAutoStart" -ForegroundColor Green
    Write-Host "│  · 查看状态: .\start-mandala.ps1 -CheckAutoStart" -ForegroundColor Green
    Write-Host "└────────────────────────────────────────────────┘" -ForegroundColor Green
    Write-Host ""
    Write-Info "是否立即启动一次服务？(Y/N)"
    $yn = Read-Host
    if ($yn -eq "Y" -or $yn -eq "y") {
        Write-Info "立即启动服务..."
    } else {
        Write-OK "完成，下次开机/登录时自动启动"
        exit 0
    }
}

if ($UninstallAutoStart) {
    Write-Title "卸载开机自启动 · 曼陀罗时辰"

    $existingTask = Get-AutoStartStatus
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-OK "计划任务已卸载: $TaskName"
    } else {
        Write-Warn "未找到计划任务 $TaskName，可能未安装或已卸载"
    }

    if (Test-Path $WscriptPath) {
        Remove-Item $WscriptPath -Force
        Write-OK "静默启动器已删除: $WscriptPath"
    }

    # 同时停止当前运行的服务进程
    $running = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowTitle -like "*曼陀罗*" -or $_.CommandLine -like "*start-mandala*"
    }
    if ($running) {
        Write-Warn "检测到正在运行的服务进程，是否停止？(Y/N)"
        $yn = Read-Host
        if ($yn -eq "Y" -or $yn -eq "y") {
            $running | Stop-Process -Force -ErrorAction SilentlyContinue
            Write-OK "服务进程已停止"
        }
    }

    Write-Host ""
    Write-OK "开机自启动已完全卸载"
    Write-Host ""
    exit 0
}

if ($CheckAutoStart) {
    Write-Title "开机自启状态 · 曼陀罗时辰"
    $existingTask = Get-AutoStartStatus
    if ($existingTask) {
        Write-OK "状态: 已安装"
        Write-Host "  任务名:   $($existingTask.TaskName)" -ForegroundColor Cyan
        Write-Host "  状态:     $($existingTask.State)" -ForegroundColor Cyan
        Write-Host "  触发器:   $($existingTask.Triggers[0].CimClass.CimClassName)" -ForegroundColor Cyan
        Write-Host "  上次运行: $($existingTask.LastRunTime)" -ForegroundColor DarkGray
        Write-Host "  上次结果: $($existingTask.LastTaskResult)" -ForegroundColor DarkGray
    } else {
        Write-Warn "状态: 未安装"
        Write-Host "  安装命令: .\start-mandala.ps1 -InstallAutoStart" -ForegroundColor Cyan
    }
    if (Test-Path $WscriptPath) {
        Write-Host "  VBS文件:  存在" -ForegroundColor Green
    } else {
        Write-Host "  VBS文件:  不存在" -ForegroundColor DarkGray
    }
    Write-Host ""
    exit 0
}

# ============== 启动服务（默认流程）=============
$Host.UI.RawUI.WindowTitle = "曼陀罗时辰 · 本机预览服务器 v$AppVersion"

if (-not $Silent) {
    Write-Title "曼陀罗时辰 · 一键启动 v$AppVersion"
}

# 1. 检查 www 目录
$WebRoot = Join-Path $ScriptDir $RootSubDir
if (-not (Test-Path $WebRoot)) {
    Write-Err "未找到 www 目录: $WebRoot"
    Write-Host ""
    Write-Host "    请确认:" -ForegroundColor Yellow
    Write-Host "    1. 脚本是否在仓库根目录（与 www 文件夹同级）" -ForegroundColor Yellow
    Write-Host "    2. 或从 Release 下载完整 zip 包:" -ForegroundColor Yellow
    Write-Host "       https://github.com/Kuhai776/mandala-shichen/releases" -ForegroundColor Cyan
    Write-Host ""
    if (-not $Silent) { Read-Host "按回车键退出" }
    exit 1
}

$IndexFile = Join-Path $WebRoot "index.html"
if (-not (Test-Path $IndexFile)) {
    Write-Err "www 目录中未找到 index.html"
    if (-not $Silent) { Read-Host "按回车键退出" }
    exit 1
}

if (-not $Silent) { Write-OK "Web 资源目录: $WebRoot" }

# 2. 检查端口是否被占用
$portInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    # 检查是否已是本服务在运行
    $existingProc = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*start-mandala*" }
    if ($existingProc -and -not $Silent) {
        Write-Warn "检测到服务可能已在运行，端口 $Port 已被占用"
        Write-Host "    如需重启，请先关闭旧窗口或执行: Stop-Process -Id $($existingProc.ProcessId) -Force" -ForegroundColor Yellow
        Write-Host ""
        $choice = Read-Host "是否直接打开浏览器？(Y/N)"
        if ($choice -eq "Y" -or $choice -eq "y") {
            Start-Process "http://localhost:$Port/"
        }
        exit 0
    }
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
        if (-not $Silent) { Read-Host "按回车键退出" }
        exit 1
    }
}

# 3. 获取本机局域网 IP
$localIP = $null
try {
    $ipEntries = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -eq "Dhcp" } |
        Sort-Object InterfaceIndex
    if ($ipEntries) { $localIP = $ipEntries[0].IPAddress }
} catch {
    try { $localIP = (Test-Connection -ComputerName $env:COMPUTERNAME -Count 1 -ErrorAction SilentlyContinue).IPv4Address.IPAddressToString } catch { $localIP = $null }
}

# 4. 启动 HTTP 服务
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
    Write-Err "启动服务失败: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "    解决方案:" -ForegroundColor Yellow
    Write-Host "    1. 右键此 .ps1 → 用 PowerShell 管理员身份运行" -ForegroundColor Yellow
    Write-Host "    2. 或执行: netsh http add urlacl url=http://localhost:$Port/ user=Everyone" -ForegroundColor Yellow
    Write-Host ""
    if (-not $Silent) { Read-Host "按回车键退出" }
    exit 1
}

# 5. 输出访问信息
if (-not $Silent) {
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

    # 6. 二维码
    if ($ShowQRCode -and $localIP) {
        $qrUrl = "http://${localIP}:$Port/"
        Write-Info "手机扫码访问（同 WiFi 下）:"
        Write-Host ""
        try {
            Add-Type -AssemblyName System.Drawing
            $qrFullApi = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=$([uri]::EscapeDataString($qrUrl))"
            $wc = New-Object System.Net.WebClient
            $qrBytes = $wc.DownloadData($qrFullApi)
            $ms = New-Object System.IO.MemoryStream(,$qrBytes)
            $qrImg = [System.Drawing.Image]::FromStream($ms)
            $bmp = New-Object System.Drawing.Bitmap($qrImg, 50, 50)
            for ($y = 0; $y -lt $bmp.Height; $y += 2) {
                $line = ""
                for ($x = 0; $x -lt $bmp.Width; $x++) {
                    $pixel = $bmp.GetPixel($x, $y)
                    if ($pixel.R -lt 128) { $line += "██" } else { $line += "  " }
                }
                Write-Host $line -ForegroundColor White -NoNewline
                Write-Host ""
            }
            $bmp.Dispose(); $qrImg.Dispose(); $ms.Dispose()
        } catch {
            Write-Host "    $qrUrl" -ForegroundColor Yellow
            Write-Host "    (如需二维码，可联网后再次运行)" -ForegroundColor DarkGray
        }
        Write-Host ""
    }

    # 7. 自动打开浏览器
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
    Write-Info "💡 如需开机自启: .\start-mandala.ps1 -InstallAutoStart"
    Write-Host ""
}

# 8. MIME 类型映射
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

# 9. 请求处理循环
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
            if (-not $Silent) { Write-Err "[403] $path (路径越权)" }
            continue
        }

        $requestCount++

        if (Test-Path $resolvedPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($resolvedPath).ToLower()
            $contentType = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
            $res.ContentType = $contentType
            $res.Headers.Set("Cache-Control", "no-cache, no-store, must-revalidate")
            $res.Headers.Set("Pragma", "no-cache")

            $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()

            if (-not $Silent) {
                $status = "[$($res.StatusCode)]"
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $status $path" -ForegroundColor DarkGray
            }
        } else {
            $res.StatusCode = 404
            $errorMsg = "404 Not Found: $path"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errorMsg)
            $res.ContentType = "text/plain; charset=utf-8"
            $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $res.Close()
            if (-not $Silent) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [404] $path" -ForegroundColor Red }
        }
    }
} catch [System.Threading.ThreadAbortException] {
    # Ctrl+C 正常退出
} catch {
    if ($listener.IsListening -and -not $Silent) {
        Write-Err "服务异常: $($_.Exception.Message)"
    }
} finally {
    if ($listener) {
        try { $listener.Stop() } catch {}
        try { $listener.Close() } catch {}
    }
    if (-not $Silent) {
        Write-Host ""
        Write-Host "服务已停止，共处理 $requestCount 个请求" -ForegroundColor Yellow
        Write-Host ""
    }
}
