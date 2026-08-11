@echo off
chcp 65001 >nul
title 曼陀罗时辰 · PowerShell 启动器

:: 检查 PowerShell
where powershell >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 PowerShell，请确认 Windows 7 SP1 及以上版本
    pause
    exit /b 1
)

:: 以管理员身份请求 urlacl（仅首次需要，避免 0.0.0.0 绑定失败）
:: 如不想每次弹 UAC，可手动执行一次:
:: netsh http add urlacl url=http://+:8080/ user=Everyone listen=yes

:: 用 PowerShell 执行 .ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mandala.ps1"

:: 如果 PowerShell 异常退出，暂停查看错误
if errorlevel 1 (
    echo.
    echo [错误] PowerShell 脚本执行失败
    pause
)
