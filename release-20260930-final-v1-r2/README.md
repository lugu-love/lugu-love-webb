# Emotion Send V1 Candidate

独立 C Candidate，复用正式 `send-test.html` 的使者/情绪选择、文案、方言模式、TTS、视频生成、保存和分享链路。

## 后端

- 历史后端：`origin/codex/p3-cloud:scripts/make-send-cloud`
- 候选服务：`lugu-send.service`
- 候选地址：`https://candidate.suomaanjia.cn:8443/lugu-send`
- 接口：`/make-send`、`/make-send/result`、`/tts`、`/rewrite-dialect`

## 表达模式

沿用正式 Emotion/Send 页面：

- 原文 + 方言
- 地方口语
- 其他地方

## 约束

- 不修改 A/B Candidate。
- 不修改正式站入口。
- 最终 A+B+C 合并后统一做物理真机总验收。
