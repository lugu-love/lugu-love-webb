# make-send-cloud（P3 云端版 /make-send）

Linux / FFmpeg 兼容的云端生成链，不依赖 macOS。

## 链路
预生成情绪母版 MP4（含背景、角色，不含动态文字/TTS）
→ 按真实字体宽度自动换行
→ TTS 生成配音
→ ffmpeg drawtext 烧字 + 音视频 mux
→ 最终 MP4

## 统一映射（单一事实源）
情绪 → 视频 的映射统一放在 `emotion-manifest.json`，后端 `server.py` 启动时读取并派生
`MASTERS` / `JOURNEY_META`。前端预览也按同一张表读取 `previewProxy`。**不要再在
前端/后端各自硬编码“情绪→视频”逻辑。**

| itemId | 情绪 | officialSource | previewProxy | renderMaster | status |
|---|---|---|---|---|---|
| rabbit-happy | 开心 | sequence/1 | mobile/1 | happy-master-v2.mp4 | official |
| rabbit-aggrieved | 委屈 | sequence/2 | mobile/2 | wronged-master-v2.mp4 | official |
| rabbit-angry | 生气 | sequence/3 | mobile/3 | angry-master-v2.mp4 | official |

- `officialSource`：540px 高清正式源（渲染/share 的动作基准）。
- `previewProxy`：270px 同动作低清预览源（手机端预览用，避免加载 540px 高清导致卡顿）。
- `renderMaster`：后端 /make-send 使用的预生成母版 MP4。
- V2 母版必须由 `officialSource`（sequence/1/2/3）重建，保证「预览 = 生成」同一动作。

## 接口（兼容 MVP V1 前端）
- GET  /make-send?text=...&item=rabbit-happy
- POST /make-send  (JSON: {"text":"...", "item":"rabbit-happy"})

返回 `video/mp4`。

## 参数
- 720×1280 / 18fps / 2500kbps / 10s
- 文字安全区 648px（0.90×720）
- 40 字限制
- TTS provider 抽象，当前 edge-tts（zh-CN-XiaoxiaoNeural），支持 ElevenLabs 角色候选
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
