# Lugu Love Final V1 Release Candidate

## A

- Candidate：`candidate-20260930-frontstage-player-v1-r1`
- 自动验收：桌面 Chrome、iPhone WebKit、华为 Android/Chromium 各 20 次，每次连续两轮，PASS。
- 物理真机：PENDING，留到最终总验收。

## B

- Candidate：`candidate-20260930-realtime-dialog-v1-r1`
- 原后端：B7.4 Doubao Realtime，恢复后公开入口：
  `https://candidate.suomaanjia.cn:8443/lugu-b74/`
- 三种模式：原文 + 方言、地方口语、其他地方。
- 自动验收：连续 20 轮、语言/模式切换、ASR、对话、TTS PASS。
- 物理真机：PENDING，留到最终总验收。

## C

- Candidate：`candidate-20260930-emotion-send-v1-r1`
- 后端：历史 `make-send-cloud` 恢复服务：
  `https://candidate.suomaanjia.cn:8443/lugu-send`
- 自动验收：
  - 60 个 production items 已加载。
  - `/rewrite-dialect` PASS。
  - `/tts` PASS，返回 MP3。
  - `/make-send` PASS，风信兔、暖山熊、云栖考拉均生成有效 MP4。
  - UI 自动冒烟：使者、情绪、文案、三模式、声音控件全部存在，且运行时 API 指向候选后端。
- 系统分享/微信分享：留到物理真机总验收。

## Final gate

物理真机总验收一次覆盖：

1. A：iPhone Safari / 华为 Android。
2. B：麦克风授权、连续对话、三模式、方言切换、语音回复。
3. C：完整生成、保存、发给TA、系统分享、微信分享。

通过前不修改正式站入口。

## Rollback

正式生产回滚点：`e086a35`（`release-20260920-nuanshan-bear-r1`）。
