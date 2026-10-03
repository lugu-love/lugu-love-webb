# Hotfix C — 华为/Android 视频生成与发送

**范围**：只改 C 情绪表达的视频生成与分享链路。不碰 A、不碰 B 后端、不碰 V2 架构。

## 根因（与浏览器无关）

```
$ curl https://api.lugu.love/status
{"status":"error","code":404,"message":"Application not found"}
$ curl https://lnnwiev5.up.railway.app/status     # 后端 Railway 原始域名
{"status":"error","code":404,"message":"Application not found"}
```

**后端整台服务已经不存在**（Railway `Application not found`，不是路由 404）。
GitHub 组织 `lugu-love` 下只有 `lugu-love-webb` 一个仓库，没有后端仓库。
所以：**任何浏览器都生成不了视频**，华为只是最先被注意到。
"必须先下载才能发送"同样源于此 —— 生成不出来时只剩本地兜底路径。

后端源码已被删除，但 `scripts/make-send-cloud/__pycache__/*.pyc` 还在，
据此反解出完整契约（见下表），并按契约重建。

| 旧契约（从 .pyc 反解） | 重建实现 |
| --- | --- |
| `ThreadingHTTPServer`，`make-send-cloud/1.0`，端口 `PORT` | 一致 |
| `TTS_PROVIDER` / `TTS_VOICE` / `CORS_ORIGIN` / `FFMPEG_BIN` | 一致 |
| `edge-tts`，音色 `zh-CN-XiaoxiaoNeural` | 一致（免费、无 API key） |
| `happy/angry/wronged-master.mp4` 模板 | 一致（支持 `-v2` 优先、v1 兜底） |
| `drawtext` 叠字幕 + FFmpeg 混音 | **改为 Pillow PNG + `overlay`**（见下） |
| `video/mp4` + `Content-Disposition: attachment` | 一致 |

**唯一有意偏离**：字幕不再用 `drawtext`。`drawtext` 依赖 libfreetype，
本机三个 ffmpeg 构建都没有该滤镜（`No such filter: 'drawtext'`），
依赖它会让部署环境极其脆弱。改为 Pillow 生成透明 PNG + `overlay` 滤镜，
macOS/Linux 行为一致，中文用系统 CJK 字体。

## 交付物

### 1. 后端 `services/make-send-cloud/`

浏览器无关的唯一生产链路：**前端只提交参数并轮询，生成全部在后端**。

```
GET /status
GET /make-send?text=&item=&emotionId=&voiceId=&async=1   -> 202 {"job": "..."}
GET /make-send/result?job=...                            -> {"status":"running|done|error","videoPath":"/video/<f>.mp4"}
GET /video/<f>.mp4                                       稳定 HTTPS MP4 直链（video/mp4）
GET /tts?text=&voiceId=
```

- 不依赖 MediaRecorder / canvas 导出；`/make-send` 是唯一生产链路
- 设 `PUBLIC_BASE_URL` 时 `/make-send/result` 直接返回绝对 HTTPS URL
- `Dockerfile` / `Procfile` / `requirements.txt` 齐备

### 2. 前端 `candidate-20261004-hotfix-ac-v1/send-test.html`

新增 `lastVideoPath` / `lastVideoUrl` 作为**分享的唯一可信来源**（Blob/ObjectURL 仅用于本地预览）。

`sendVideo()` 重写为三级降级：

1. `navigator.canShare({files})` → 用后端 HTTPS MP4 构造 File，直接调系统分享面板
2. 不支持文件分享但 `navigator.share` 存在 → 分享**视频 URL**
3. 微信/QQ 内置浏览器 → 复制视频链接 + 页面上显示可长按复制的链接

一级失败会自动降级到二/三级。**任何一层都不要求用户先手工下载。**
平台确实不支持文件附件直发微信时，不伪造成功，明确记录为平台限制。

## 本地验证（已完成）

```
GET /status -> {"status":"ok","provider":"edge-tts","masters":[...]}
/make-send?async=1 -> 202 {"job":"48f775bd..."}
轮询 2 次 -> {"status":"done","videoPath":"/video/make-send-48f775bd....mp4"}
GET /video/... -> http:200 type:video/mp4 size:427689
ffprobe -> h264 720x1280 + aac, duration 3.312s
字幕校验 -> 底部亮像素 8646（字幕已烧录）
```

## 未完成 / 阻塞

- **稳定 HTTPS URL 需要部署**。本机只能跑本地实例（`127.0.0.1:8788`），
  公网稳定入口需要托管账号（Railway / 云服务器）。前端默认指向 `https://api.lugu.love`，
  只要新后端部署回该域名，前端无需再改。
- manifest 引用的是 `*-master-v2.mp4`，本机只有 v1 三件套（后端已支持 v1 兜底）。
  v2 模板若仍在别处，放进 `masters/` 即自动优先使用。
- 华为系统浏览器 / QQ 浏览器 / 微信内置 / Chrome Android 四端真机验收待后端上线后进行。

## 回滚

后端是新增独立目录，不部署即无影响；前端改动集中在 `sendVideo()` 与两个新变量。
