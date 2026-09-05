@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
set "PYTHONUTF8=1"

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" goto :fail
echo [通过] Python 虚拟环境存在

"%PY%" -c "import sys; print('[通过] Python', sys.version.split()[0])"
if errorlevel 1 goto :fail

"%PY%" -c "import PIL, edge_tts, psycopg; print('[通过] 依赖: Pillow', PIL.__version__, '/ edge-tts', getattr(edge_tts,'__version__','ok'), '/ psycopg', psycopg.__version__)"
if errorlevel 1 goto :fail

ffmpeg -version >nul 2>&1
if errorlevel 1 (
  set "PATH=%LOCALAPPDATA%\Programs\FFmpeg\bin;%PATH%"
)
ffmpeg -version >nul 2>&1
if errorlevel 1 goto :fail
ffprobe -version >nul 2>&1
if errorlevel 1 goto :fail
echo [通过] ffmpeg 与 ffprobe 可用

set "FONT_FILE="
for %%F in ("%WINDIR%\Fonts\msyh.ttc" "%WINDIR%\Fonts\msyh.ttf" "%WINDIR%\Fonts\simhei.ttf" "%WINDIR%\Fonts\simsun.ttc" "%WINDIR%\Fonts\Deng.ttf") do (
  if not defined FONT_FILE if exist "%%~F" set "FONT_FILE=%%~F"
)
if not defined FONT_FILE goto :fail
"%PY%" -c "from PIL import ImageFont; ImageFont.truetype(r'%FONT_FILE%', 40); print('[通过] 中文字体:', r'%FONT_FILE%')"
if errorlevel 1 goto :fail

set "FFMPEG_BIN=ffmpeg"
set "FONT_INDEX=0"
set "FONT_FC="
set "SITE_STATE_FILE="
"%PY%" -c "import server; print('[通过] server 导入，母版数 =', len(server.MASTERS))"
if errorlevel 1 goto :fail

"%PY%" -c "import json, os; m=json.load(open('emotion-manifest.json', encoding='utf-8')); n=len(m.get('emotions', {})); assert n >= 15; assert os.path.isdir('masters') and len(os.listdir('masters')) >= 19; print('[通过] manifest emotions =', n, ', masters 文件存在')"
if errorlevel 1 goto :fail

echo.
echo [通过] Windows 本地环境验证全部通过。
exit /b 0

:fail
echo.
echo [失败] Windows 本地环境验证未通过，请检查上方输出。
exit /b 1
