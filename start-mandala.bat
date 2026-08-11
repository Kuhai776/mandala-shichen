@echo off
chcp 65001 >nul
title 曼陀罗时辰 · 本机预览服务器
color 0B

cd /d "%~dp0"

echo ╔══════════════════════════════════════════════════╗
echo ║                                                  ║
echo ║          曼陀罗时辰 · 一键启动                    ║
echo ║                                                  ║
echo ╚══════════════════════════════════════════════════╝
echo.
echo [信息] 启动中... 浏览器将自动打开
echo [信息] 关闭此窗口即可停止服务
echo.

:: 用 PowerShell 启动 HttpListener（Windows 自带，零依赖）
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = Join-Path $PSScriptRoot 'www';" ^
  "if (-not (Test-Path $root)) { Write-Host '[错误] 未找到 www 目录，请确认在仓库根目录运行' -ForegroundColor Red; pause; exit };" ^
  "$port = 8080;" ^
  "Add-Type -AssemblyName System.Web;" ^
  "$listener = New-Object System.Net.HttpListener;" ^
  "$listener.Prefixes.Add(\"http://localhost:$port/\");" ^
  "$listener.Start();" ^
  "Write-Host \"[成功] 服务已启动: http://localhost:$port/\" -ForegroundColor Green;" ^
  "Write-Host \"[提示] 按 Ctrl+C 或关闭窗口停止服务\" -ForegroundColor Yellow;" ^
  "Write-Host \"\";" ^
  "Start-Process \"http://localhost:$port/\";" ^
  "while ($listener.IsListening) {" ^
  "  try {" ^
  "    $ctx = $listener.GetContext();" ^
  "    $path = $ctx.Request.Url.AbsolutePath;" ^
  "    if ($path -eq '/') { $path = '/index.html' };" ^
  "    $filePath = Join-Path $root ($path.TrimStart('/'));" ^
  "    if (Test-Path $filePath -PathType Leaf) {" ^
  "      $bytes = [System.IO.File]::ReadAllBytes($filePath);" ^
  "      $ext = [System.IO.Path]::GetExtension($filePath).ToLower();" ^
  "      switch ($ext) {" ^
  "        '.html' { $ctx.Response.ContentType = 'text/html; charset=utf-8' };" ^
  "        '.css'  { $ctx.Response.ContentType = 'text/css; charset=utf-8' };" ^
  "        '.js'   { $ctx.Response.ContentType = 'application/javascript; charset=utf-8' };" ^
  "        '.json' { $ctx.Response.ContentType = 'application/json; charset=utf-8' };" ^
  "        '.png'  { $ctx.Response.ContentType = 'image/png' };" ^
  "        '.jpg'  { $ctx.Response.ContentType = 'image/jpeg' };" ^
  "        '.svg'  { $ctx.Response.ContentType = 'image/svg+xml' };" ^
  "        default { $ctx.Response.ContentType = 'application/octet-stream' };" ^
  "      };" ^
  "      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length);" ^
  "      Write-Host \"[200] $path\" -ForegroundColor DarkGray;" ^
  "    } else {" ^
  "      $ctx.Response.StatusCode = 404;" ^
  "      Write-Host \"[404] $path\" -ForegroundColor Red;" ^
  "    };" ^
  "    $ctx.Response.Close();" ^
  "  } catch {" ^
  "    if ($listener.IsListening) { Write-Host \"[错误] $_\" -ForegroundColor Red };" ^
  "  };" ^
  "}"

pause
