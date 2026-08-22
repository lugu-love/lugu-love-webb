# 七星使者 · 情绪表达 MVP V1 基线

> 本文件用于记录可随时回滚的 MVP V1 稳定基线。后续扩展 15 情绪、固定公网服务、迁移后端时，以此版本为回退点。

## 1. 产品定位
「七星使者 · 情绪表达」第一版：用户选择一个情绪，写/选一句话，生成一条带 TTS 配音的成品 MP4，并分享给想分享的人。

## 2. 三情绪范围
- 开心（rabbit-happy）
- 委屈（rabbit-aggrieved）
- 生气（rabbit-angry）

## 3. 前端关键 commit
- 正式测试页：`send-test.html`
- 前端关键 commit：`8c40b3f`（Pages 仓库 `lugu-love-webb`，main 分支）

## 4. 视频参数
- FPS：18
- BITRATE：2500 kbps
- 输出：720×1280
- 视频：H.264
- 音频：AAC
- 时长：约 10 秒
- 单条：约 2.7～3MB

## 5. sprite 规格
- sheet：1080×810
- 单帧：270×270
- WebP quality：80
- 目录：`assets/video/fengxin-rabbit-sequence/mobile/`
- 原高清素材保留，不覆盖

## 6. 分享能力边界
- **Android Chrome**：网页生成 → 系统分享 → 微信 → 好友收到 MP4 → 正常播放，**正式支持**。
- **华为微信内置浏览器**：可进入并生成，但不能依赖 Web Share 文件分享，**不作为直接发送 MP4 的正式支持环境**。
- **iPhone**：网页生成 / 预览 / 保存成功；网页直接 Web Share → 微信**不稳定**；下载到「文件」App 后再分享到微信**成功**。正式记录：**iPhone 网页端不承诺直接分享 MP4 到微信好友**。

## 7. 当前已知限制
- TTS 使用 macOS `Tingting`，情绪起伏不足。
- 服务端依赖 macOS（Swift / AVFoundation / CoreImage / CoreText / say / afconvert）。
- 移动端 sprite 三情绪已有，其余情绪未接入。
- iOS 网页直接分享 MP4 到微信不稳定。

## 8. Quick Tunnel 仍属于临时方案
当前公网 `/make-send` 通过 Cloudflare Quick Tunnel 暴露，地址随机、非固定、不适合生产。

## 9. 固定公网 `/make-send` 尚未完成
正式 API 域名（如 `api.lugu.love`）与固定后端仍未建立。下一阶段 P3 处理。

## 10. 回滚方式
- 前端 Pages 仓库：`lugu-love-webb`，tag `emotion-mvp-v1`（对应 commit `8c40b3f`）。
- 后端/脚本仓库：同一仓库 `lugu-love-webb`，tag `emotion-mvp-v1-backend`（含 `scripts/make-send` 与本文档）。
- 回滚命令示例：
  - Pages：`git checkout emotion-mvp-v1`
  - 后端：`git checkout emotion-mvp-v1-backend`
