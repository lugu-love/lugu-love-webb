# make-send 成品视频合成系统

## 1. 这套系统做什么
把「原使者情绪视频 + 用户自定义文字 + TTS 配音」合成为一条可分享的成品 MP4。

## 2. 核心接口
`GET /make-send?text=...&item=...`

返回：`Content-Type: video/mp4`

- `text`：用户文字（最长 40 字）
- `item`：使者情绪 ID，例如 `rabbit-happy`、`rabbit-aggrieved`、`rabbit-angry`、`rabbit-shy` 等

## 3. 当前技术链
浏览器
→ `send_server.py`（HTTP 服务）
→ Swift 视频逐帧处理（AVFoundation）
→ 蓝幕抠像（CIColorKernel）
→ CoreText 烧入用户文字
→ H.264 MP4
→ macOS `say`（TTS 配音）
→ `afconvert`（转 AAC）
→ `mux-audio`（Swift 视频+音频混流）
→ 最终 MP4

## 4. 编译命令
```bash
cd scripts/make-send
swiftc -O make-send-mp4.swift -o /tmp/make-send-mp4
swiftc -O mux-audio.swift -o /tmp/mux-audio
```

注：`send_server.py` 默认从以下路径调用编译产物：
- `/tmp/make-send-mp4`
- `/tmp/mux-audio`

## 5. 当前依赖
- macOS
- Swift / AVFoundation
- CoreImage
- CoreText
- `/usr/bin/say`
- `/usr/bin/afconvert`

## 6. 已知限制
- 当前 TTS 使用 `Tingting`，情绪起伏不足（后续需情绪化 TTS）。
- 当前服务本质依赖 macOS 系统能力（`say`、`afconvert`、AVFoundation）。
- 目前还没有公网生产环境。
- 手机分享兼容性仍需真机验证（尤其 iOS）。
- 部分 master MP4 仍只在本地，线上未上传。
