# make-send-cloud

浏览器无关的**唯一**视频生产链路。前端只提交参数并轮询结果，生成全部在这里完成。

## 为什么存在

旧 `api.lugu.love`（Railway）已不存在（`Application not found`）。
本服务按旧服务契约重建（契约从遗留 `.pyc` 反解）：

| 旧契约 | 说明 |
| --- | --- |
| `ThreadingHTTPServer` / `make-send-cloud/1.0` | 纯标准库 HTTP 服务 |
| `TTS_PROVIDER` / `TTS_VOICE` / `CORS_ORIGIN` / `FFMPEG_BIN` | 环境变量名保持一致 |
| `happy-master.mp4` / `angry-master.mp4` / `wronged-master.mp4` | master 模板 |
| `edge-tts`（`zh-CN-XiaoxiaoNeural`） | TTS，**免费、无需 API key** |
| `drawtext` + FFmpeg mux | 字幕 + 混音 |
| `attachment; filename="%s.mp4"` / `video/mp4` | 下载头 |

**唯一有意偏离**：字幕不再用 `drawtext`（依赖 libfreetype，很多 ffmpeg 构建没有），
改为 Pillow 生成透明 PNG + `overlay` 滤镜。**跨平台一致，Linux/macOS 都能出字幕。**

## 接口

```
GET  /status                      -> {status:"ok", version, provider, masters}
GET  /make-send?text=&item=&emotionId=&voiceId=&async=1
                                  -> 202 {"job": "<id>", "status": "running"}
GET  /make-send/result?job=<id>   -> {"status":"running"}
                                     {"status":"done","videoPath":"/video/<f>.mp4"}
                                     {"status":"error","error":"..."}
GET  /video/<file>.mp4            稳定 MP4 直链（video/mp4，支持 Range 头）
GET  /tts?text=&voiceId=          -> audio/mpeg
```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `CORS_ORIGIN` | `*` | 生产建议设为 `https://lugu-love.github.io` 或正式域名 |
| `PUBLIC_BASE_URL` | 空 | 设为公网根（如 `https://api.lugu.love`），`/make-send/result` 会直接返回绝对 HTTPS URL |
| `FFMPEG_BIN` / `FFPROBE_BIN` | 自动查找 | 二进制路径 |
| `MASTERS_DIR` | `./masters` | master 模板目录 |
| `OUT_DIR` | `./out` | 产物目录（建议挂载持久卷） |
| `TTS_PROVIDER` | `edge-tts` | TTS 提供方 |
| `TTS_VOICE` | `zh-CN-XiaoxiaoNeural` | 默认音色 |
| `SEND_FONT` | 系统字体 | 字幕字体（中文必须给 CJK 字体） |

## 本地跑

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp /path/to/{happy,angry,wronged}-master.mp4 masters/
PORT=8000 .venv/bin/python server.py
```

## 部署

```
docker build -t make-send-cloud .
docker run -p 8000:8000 -v /host/masters:/data/masters -v /host/out:/data/out \
  -e PUBLIC_BASE_URL=https://api.lugu.love make-send-cloud
```

Railway：根目录设为 `services/make-send-cloud`，会自动识别 `Dockerfile` / `Procfile`。
需要挂载持久卷到 `OUT_DIR`，否则重启后 `/video/*.mp4` 会丢。
