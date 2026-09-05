@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
set "PYTHONUTF8=1"

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [失败] 未找到 Python 虚拟环境：.venv\Scripts\python.exe
  echo 请先按 README-WINDOWS.md 完成首次安装。
  pause
  exit /b 1
)

call verify-windows.cmd
if errorlevel 1 (
  echo [失败] 环境预检未通过，请先修复环境后重试。
  pause
  exit /b 1
)

"%PY%" smoke_windows.py
if errorlevel 1 (
  echo [失败] 端到端冒烟测试未通过，请查看上方报告。
  pause
  exit /b 1
)

echo [通过] 端到端冒烟测试全部完成。
pause
exit /b 0
