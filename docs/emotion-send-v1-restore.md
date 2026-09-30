# Emotion Send V1 恢复与自动验收

## 后端

- 源码：`origin/codex/p3-cloud:scripts/make-send-cloud`
- 候选服务：`lugu-send.service`
- 服务器：`47.109.185.222`
- 目录：`/opt/lugu-send/app`
- 本机端口：`127.0.0.1:8785`
- 公网路径：`https://candidate.suomaanjia.cn:8443/lugu-send/`
- 依赖：已安装 FFmpeg、Noto CJK、Python venv、edge-tts、DashScope

## 已通过接口

- `/status`：生产条目 60，祝福条目 7。
- `/rewrite-dialect`：四川话转换成功。
- `/tts`：返回 MP3，提供试听 token。
- `/make-send`：已生成有效 MP4。
  - 风信兔 `rabbit-happy`
  - 暖山熊 `nuanshan-bear-01-kaixin`
  - 云栖考拉 `yunqi-koala-01-kaixin`

## Candidate

- Candidate：`candidate-20260930-emotion-send-v1-r1`
- 复用正式 `send-test.html` 的选择使者、选择情绪、文案、原文配方言、地方口语、其他地方、TTS、生成、保存和分享链路。
- 运行时 API 指向恢复后的 `/lugu-send/`。

## 剩余

- 真机总验收阶段统一验证系统分享/微信分享。
- 最终 A+B+C 合并后再做一次完整的保存、下载和分享回归。
