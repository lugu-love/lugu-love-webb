# make-send-cloud（P3 云端版 /make-send）

Linux / FFmpeg 兼容的云端生成链，不依赖 macOS。

## 链路
预生成情绪母版 MP4（含背景、角色、情绪名，不含动态文字/TTS）
→ 按真实字体宽度自动换行
→ edge-tts 生成配音
→ ffmpeg drawtext 烧字 + 音视频 mux
→ 最终 MP4

## 三情绪
- rabbit-happy / happy-master.mp4 / 开心
- rabbit-aggrieved / wronged-master.mp4 / 委屈
- rabbit-angry / angry-master.mp4 / 生气

## 接口（兼容 MVP V1 前端）
- GET  /make-send?text=...&item=rabbit-happy
- POST /make-send  (JSON: {"text":"...", "item":"rabbit-happy"})

返回 `video/mp4`。

## 参数
- 720×1280 / 18fps / 2500kbps / 10s
- 文字安全区 648px（0.90×720）
- 40 字限制
- TTS provider 抽象，当前 edge-tts（zh-CN-XiaoxiaoNeural）
- 中文字体：Docker 内 fontconfig 明确指定 Noto Sans CJK SC（FONT_FC）

## 本地运行（Mac 验证）
```bash
pip install -r requirements.txt
TEST_FONT=/path/to/NotoSansCJKsc-Regular.otf python test_local.py
PORT=8000 FFMPEG_BIN=$(python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())") \
FONT_FILE=/path/to/NotoSansCJKsc-Regular.otf FONT_INDEX=0 python server.py
```

## Docker
```bash
docker build -t make-send-cloud .
docker run --rm -p 8000:8000 make-send-cloud
```
