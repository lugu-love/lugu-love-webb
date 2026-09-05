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

ffmpeg -version >nul 2>&1
if errorlevel 1 (
  set "PATH=%LOCALAPPDATA%\Programs\FFmpeg\bin;%PATH%"
)
ffmpeg -version >nul 2>&1
if errorlevel 1 (
  echo [失败] 在 PATH 中未找到 ffmpeg。
  echo 请安装 FFmpeg 后重新打开终端，或确认 FFmpeg\bin 已加入 PATH。
  pause
  exit /b 1
)

set "FONT_FILE="
for %%F in ("%WINDIR%\Fonts\msyh.ttc" "%WINDIR%\Fonts\msyh.ttf" "%WINDIR%\Fonts\simhei.ttf" "%WINDIR%\Fonts\simsun.ttc" "%WINDIR%\Fonts\Deng.ttf") do (
  if not defined FONT_FILE if exist "%%~F" set "FONT_FILE=%%~F"
)
if not defined FONT_FILE (
  echo [失败] 未找到可用的 Windows 中文字体。
  pause
  exit /b 1
)
set "FONT_FILE=%FONT_FILE:\=/%"

if not defined PORT set "PORT=8000"
set "FFMPEG_BIN=ffmpeg"
set "FONT_INDEX=0"
set "FONT_FC="
set "SITE_STATE_FILE="
set "PUBLIC_BASE_URL=http://127.0.0.1:%PORT%"
set "APP_VIDEO_DIR=%~dp0tmp\app-video-cache"
set "TTS_CACHE_DIR=%~dp0tmp\tts-cache"

echo [信息] 启动本地媒体引擎，仅监听 127.0.0.1:%PORT%
echo [信息] 中文字体：%FONT_FILE%
echo [信息] 按 Ctrl+C 停止服务。

"%PY%" -c "import os, http.server, server; port=int(os.environ.get('PORT','8000')); httpd=http.server.ThreadingHTTPServer(('127.0.0.1', port), server.Handler); print('[OK] 服务已启动: http://127.0.0.1:' + str(port), flush=True); httpd.serve_forever()"
if errorlevel 1 (
  echo [失败] 服务启动异常，请查看上方错误信息。
  pause
  exit /b 1
)

echo [信息] 服务已停止。
endlocal
