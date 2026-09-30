# B7.4 泸沽湖地球首页 → 云栖考拉面对面对话 Candidate

独立 Candidate，复制正式 release 首页，不修改正式站、不发布 release、不接 Runway。

完整链路：

```text
地球首页
→ 漂流瓶中的云栖考拉
→ 点击“和我说说话”
→ 出瓶/放大转场
→ 豆包端到端实时语音面对面对话
→ 结束/返回地球
```

## 运行

```sh
cd /Users/liangminghua/Desktop/2026.7.1/github-lugu-love-web/research/seven-messengers-emotion-system/b74-doubao-bottle-candidate
npm install --no-audit --no-fund
node server.mjs
```

默认端口：`8784`

本机地址：`http://127.0.0.1:8784/`

## 配置

豆包 Key 只从服务端读取：

`~/.config/lugu-love/doubao-realtime.env`

变量：

```text
DOUBAO_S2S_API_KEY=...
```

## World Knowledge V0.1

独立数据层：

`world-knowledge.v0.1.json`

字段包括：

- `content`
- `status`
- `updated_at`
- `visibility`
- `valid_until`

服务端在每次创建豆包 Session 时重新读取该文件。以后更新这个文件即可同步新的世界知识，不需要分别修改七套角色 Prompt。

查看当前知识层：

```sh
curl -sS http://127.0.0.1:8784/api/world
```

查看服务状态和音频估算：

```sh
curl -sS http://127.0.0.1:8784/api/health
curl -sS http://127.0.0.1:8784/api/usage
```

## 语言

当前支持：普通话、四川话、陕西话、粤语、东北话、上海话、英语。

## 音色试听 V1

固定 Candidate 已增加内部“音色试听”入口。它只用于候选音色 A/B，不自动决定正式声音。

- Registry：`characters.v1.json`
- 实际验证音色目录：`voice-system.v1.json`
- 试听音频：`audition/`
- 模型：`1.2.6.1`
- 端点：`wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue`
- 语言/方言与 speaker 独立：切换语言时保留同一 speaker ID，通过 `tts_prompt` 控制表达方式。
- 页面只播放本地缓存样本；点击“设为测试音色”才会对当前 Candidate 的实时 Session 发送 `switch_voice`。

试听音色首次上线前均由当前 B74 实际使用的豆包端到端实时语音服务生成过样本，不能用其他豆包产品的音色列表代替。

## 默认测试音色 V1

默认音色由 `characters.v1.json` 中每位使者的 `voice.speaker` 决定，preset id 为 `seven-messenger-default-voice-v1`。

本轮设置：

- 风信兔：`zh_female_vv_jupiter_bigtts`
- 光尾狐：`saturn_zh_female_tiexinnvyou_tob`
- 星语鹿：`saturn_zh_male_fengfashaonian_tob`
- 暖山熊：`zh_male_xiaotian_jupiter_bigtts`
- 云栖考拉：`saturn_zh_female_nuanxinxuejie_tob`
- 凌遥猴：`saturn_zh_male_bujiqingnian_tob`
- 玄星猫：`saturn_zh_female_wenrouwenya_tob`

试听页中的“设为测试音色”仍可覆盖默认声音，并使用独立缓存键 `b74_voice_selections_v2`。

## 方言原生 voice channel

B74 现在区分：

- `language_mode`：普通话、四川话、陕西话、粤语、东北话、上海话、英语
- `voice_channel`：普通话/英语使用使者自己的 Doubao speaker；方言在存在历史性别声道时使用 Qwen3-TTS/CosyVoice

历史原生方言声道：

- 四川话：女声 `Sunny`，男声 `Eric`
- 粤语：女声 `Kiki`，男声 `Rocky`
- 上海话：女声 `Jada`，男声为空
- 陕西话：女声为空，男声 `Marcus`
- 东北话：女声为空，男声 `longlaotie_v3`

Qwen3-TTS 通过 DashScope HTTP API 合成；东北话 CosyVoice 通过 `cosyvoice_tts.py` sidecar 输出 24 kHz mono s16le PCM。

服务端环境文件：

```text
/opt/lugu-b74/home/.config/lugu-love/dashscope.env
```

只允许服务进程读取，不进入浏览器 JS、HTML 或日志。

## 方言触发方式

用户可以通过面对面对话页顶部的“当前语言”下拉切换：

- `普通话` / `mandarin`
- `四川话` / `sichuan`
- `陕西话` / `shaanxi`
- `粤语` / `cantonese`
- `东北话` / `northeast`
- `上海话` / `shanghainese`
- `英语` / `english`

也可以通过明确语音指令触发系统级切换，例如：

- `说四川话` / `换成四川话` / `你会不会说四川话`
- `说粤语` / `换成粤语`
- `换东北话`
- `还是普通话吧`
- `说英语` / `Can we speak English?`

语音识别只匹配明确的切换表达；单纯讨论“四川话为什么……”不会自动切换。

运行时证据可从：

`/api/metrics`

查看：

- `current_character`
- `language_mode`
- `voice_provider`
- `active_speaker`
- `language_switch_source`
- `language_switch_history`

## 面对面 Life Loop V1

面对面页面现在从 Character Registry 的 `video_states.life_loop` 读取当前角色动画，不再把云栖考拉视频用于全部角色。

- 云栖考拉：继续使用既有稳定 `life_loop`
- 其余六位：使用 `assets/life-loops/` 中的 480×640 H.264 微动循环
- 仅保留单一 Life Loop，不启用 idle/listening/thinking/speaking 四状态

视频资源在部署时进入 release 的 `formal-release/video/life-loops/`，浏览器路径由 Registry 提供，不在页面代码中硬编码。
