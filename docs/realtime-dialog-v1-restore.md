# Realtime Dialog V1 恢复记录

## 原后端定位

- 原 B 后端不是 `api.lugu.love`。
- 原 B 后端是 B7.3 / B7.4 Doubao Realtime 服务：
  - 前端与代理源码位于历史分支 `codex/home-rhythm-test`：
    `research/seven-messengers-emotion-system/b74-doubao-bottle-candidate/`
  - 上游：`wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue`
  - 协议：ByteDance/Volc Realtime Dialogue
  - 本地端口历史默认：`8784`
  - 服务环境变量：`DOUBAO_S2S_API_KEY`、`DASHSCOPE_API_KEY`
- `api.lugu.love` 是旧 Railway `/make-send`、`/tts`、`/welcome` 后端，和 B7.4 是两条独立链路。它的 404 不能解释 B7.4 不可用。

## 恢复结果

已从 Git 历史恢复 B7.4 原始代码并部署到候选服务器：

- 服务器：`47.109.185.222`
- 用户：`suomalianjia`
- 目录：`/opt/lugu-b74/app`
- 服务：`lugu-b74.service`
- 端口：`127.0.0.1:8784`
- Nginx 路径：`/lugu-b74/`
- WebSocket 路径：`/lugu-b74/ws/doubao`
- 服务环境文件：
  - `/etc/lugu-b74/doubao-realtime.env`
  - `/etc/lugu-b74/dashscope.env`

公开入口：

```text
https://candidate.suomaanjia.cn:8443/lugu-b74/
https://candidate.suomaanjia.cn:8443/lugu-b74/api/health
```

## 验证

- B74 服务健康：`key_configured=true`，`dashscope_configured=true`。
- WebSocket 握手通过 Nginx：返回 `proxy.character_ready`。
- 真实语音链路测试通过：
  - 输入：普通话测试语音
  - ASR：成功识别
  - 对话：成功返回自然语言回复
  - TTS：返回约 `6.8s` PCM 音频

## 结论

原 B 链路确实存在，且已恢复，不需要重建 mock 或新最小后端。

后续 B 开发可直接复用这条恢复后的 B7.4 链路，再将其整合进最终 A/B/C Release Candidate。
