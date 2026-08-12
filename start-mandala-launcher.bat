@echo off
chcp 65001 >nul
title 曼陀罗时辰 · PowerShell 启动器 v2.4.0

:: 检查 PowerShell
where powershell >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 PowerShell，请确认 Windows 7 SP1 及以上版本
    pause
    exit /b 1
)

echo ╔══════════════════════════════════════════════════╗
echo ║                                                  ║
echo ║       曼陀罗时辰 · 一键启动 v2.4.0               ║
echo ║                                                  ║
echo ╚══════════════════════════════════════════════════╝
echo.
echo [信息] 功能菜单:
echo   [1] 启动服务（默认）
echo   [2] 安装开机自启动
echo   [3] 卸载开机自启动
echo   [4] 查看自启状态
echo   [0] 退出
echo.
set /p choice=请选择 [1/2/3/4/0]:

if "%choice%"=="1" goto start
if "%choice%"=="2" goto install
if "%choice%"=="3" goto uninstall
if "%choice%"=="4" goto check
if "%choice%"=="0" exit /b 0
goto start

:start
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mandala.ps1"
if errorlevel 1 (
    echo.
    echo [错误] PowerShell 脚本执行失败
    pause
)
exit /b

:install
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mandala.ps1" -InstallAutoStart
pause
exit /b

:uninstall
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mandala.ps1" -UninstallAutoStart
pause
exit /b

:check
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mandala.ps1" -CheckAutoStart
pause
exit /b
