# Realtime Dialog V1 审计

审计分支：`codex/realtime-dialog-v1`

## 可复用

- `life-space-v1/js/editor.js` 已有 `getUserMedia + MediaRecorder` 录音生命周期，可抽成共享 recorder。
- `send-test.html` 已有：
  - `/tts` 试听接口
  - `/rewrite-dialect` 方言/地方口语转换
  - 原文配方言、地方口语、普通话/其他地区模式
  - 角色/声音选择与 `voiceId`
  - iOS/Android 分享与权限处理经验
- `origin/codex/p3-cloud:scripts/make-send-cloud/server.py` 已有：
  - `/tts`
  - `/rewrite-dialect`
  - Edge TTS、Qwen3-TTS、CosyVoice provider 适配
  - 方言改写与 TTS 统一入口
- `send-test.html` 中已有客户端请求、超时、重试和错误提示逻辑，可直接复用。

## 当前缺口

- 前端没有“录音 → ASR → 对话 → TTS”实时对话控制器。
- 后端源码中没有 `/asr`、`/chat`、`/dialogue`、WebSocket 或实时对话端点。
- `https://api.lugu.love/status` 当前返回 `404 Application not found`，生产 API 未运行。
- 没有可用的 ASR 服务、对话模型服务或对应部署凭证。
- 方言转换和 Qwen/CosyVoice 声音依赖 `DASHSCOPE_API_KEY`；ElevenLabs 依赖 `ELEVENLABS_API_KEY`。

## V1 技术路径

Candidate 不重新发明录制和方言能力，采用以下复用结构：

1. 复用现有录音代码，统一成 `RealtimeDialog` 的录音输入层。
2. `/asr`：上传压缩音频，返回识别文本和置信度。
3. `/dialogue`：提交识别文本、角色、地区、模式和上下文，返回回复文本。
4. `/tts`：复用现有声音和方言 provider 生成回复音频。
5. 前端保留三种模式：
   - 原文 + 方言
   - 地方口语
   - 其他地方
6. iPhone 优先使用 Safari 支持的录制 MIME；Android/华为优先 WebM/Opus，失败自动降级。

## 当前阻塞

B 的实际端到端链路缺少可运行的 ASR/对话服务与部署凭证。继续写前端无法完成真实“说话 → 识别 → 对话 → 语音回复”验收，也不应伪造本地固定回复来冒充完成。

解除阻塞需要以下任一条件：

- 恢复并部署包含 ASR、dialogue、TTS 的后端；
- 提供可访问的 ASR/对话接口及鉴权凭据；
- 提供可部署所用 provider 的账号或密钥。

在阻塞解除前保持 B Candidate 为独立分支，不修改 A Candidate，不切正式站。
