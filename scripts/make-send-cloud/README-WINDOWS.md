# Windows 本地媒体引擎运行说明

本目录是从 p3-cloud 提取的跨平台 Python＋FFmpeg 媒体引擎基线，Windows 仅用于本地开发、验证与素材测试，正式运行仍以云端 Linux/Railway 为准。

## 一、首次安装（已完成则跳过）

1. 安装 Python 3.11、FFmpeg（含 ffprobe）并加入 PATH。
2. 在项目根目录执行环境准备后，本目录已包含虚拟环境 `.venv\`。
3. 如虚拟环境不存在，在本目录执行：

   ```bat
   python -m venv .venv
   .venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

> 请确认 `python` 指向正式版 Python 3.11，而不是 Windows 商店占位程序。虚拟环境和依赖不得全局安装。

## 二、启动服务

双击 `start-windows.cmd`，或在命令行进入本目录后执行：

```bat
start-windows.cmd
```

服务只会监听 `127.0.0.1:8000`（可用环境变量 `PORT` 修改端口），不会开放局域网或公网。启动成功后访问：

```text
http://127.0.0.1:8000/status
```

## 三、停止服务

- 在运行窗口按 `Ctrl+C`；
- 或直接关闭该命令窗口。

脚本不创建后台常驻进程，正常停止后没有残留服务。

## 四、环境验证

双击 `verify-windows.cmd`，脚本会自动检查：

- Python 虚拟环境与依赖（Pillow、edge-tts、psycopg）
- ffmpeg、ffprobe 是否可用
- Windows 系统自带中文字体
- `server.py` 能否导入
- `emotion-manifest.json` 与 `masters/` 母版文件是否存在

最后输出“通过”或“失败”及原因。

## 五、本地测试输出位置

运行中产生的测试音频、视频与缓存默认写入本目录的 `tmp\`：

```text
scripts\make-send-cloud\tmp\
```

`tmp\`、`.venv\`、`__pycache__\`、`.env` 均已被 `.gitignore` 忽略，不会进入 Git。

## 六、常见错误

- **未找到 .venv**：先执行首次安装命令。
- **未找到 ffmpeg**：安装 FFmpeg 后重新打开终端；脚本也会自动尝试 `%LOCALAPPDATA%\Programs\FFmpeg\bin`。
- **中文字体加载失败**：确认系统存在微软雅黑（msyh.ttc）或黑体（simhei.ttf）；脚本会自动检测。
- **服务端口被占用**：设置 `PORT` 为其他端口后再运行 `start-windows.cmd`。
- **TTS 需要联网**：edge-tts 不需要 API Key，但需要网络；失败时脚本会显示网络错误，不会反复请求，也不会改用付费服务。

## 七、无需复杂命令

日常使用只需双击两个入口：

```text
start-windows.cmd     启动本地服务
verify-windows.cmd    一键验证环境
smoke-windows.cmd     一键端到端验收
```

## 八、正式输出标准（手机与微信）

引擎默认按以下标准输出 MP4，参数均可通过环境变量调整：

- 分辨率：720 × 1280（手机竖屏）
- 视频编码：H.264，yuv420p，18 fps
- 音频编码：AAC，44,100 Hz
- faststart：开启，moov 位于 mdat 之前
- 响度：Integrated Loudness ≈ −16 LUFS
- 安全裕度：True Peak 不高于约 −1.5 dBTP（滤波器按 −2.0 dBTP 留余量）
- 视频/音频时长保持一致，不做截断处理

相关环境变量见 `.env.example`：

```text
AUDIO_NORMALIZE
AUDIO_LOUDNESS_I
AUDIO_LOUDNESS_TP
AUDIO_LOUDNESS_LRA
```
