# B74 方言声音审计与恢复

日期：2026-09-28

## 审计结论

B74 在本轮之前只有“语言 instructions”：

- 说话人始终是当前使者的 Doubao `speaker`
- `四川话/陕西话/粤语/东北话/上海话` 只改变系统 instructions
- 因此模型可能使用方言词或模仿口音，但没有独立的历史原生方言 voice channel

B73 同样是 `zh_female_vv_jupiter_bigtts` + 方言 instructions，没有 speaker 映射。

历史原生方言声道来自更早的 `scripts/make-send-cloud` Voice V1.1：

| 方言 | 女声 | 男声 | Provider |
|---|---|---|---|
| 四川话 | Sunny | Eric | Qwen3-TTS |
| 粤语 | Kiki | Rocky | Qwen3-TTS |
| 上海话 | Jada | 空 | Qwen3-TTS |
| 陕西话 | 空 | Marcus | Qwen3-TTS |
| 东北话 | 空 | longlaotie_v3 | CosyVoice |

旧的改写 Prompt 原则是“地方口语表达”，不是只给普通话逐字加口音；旧 TTS 则由原生方言 voice ID 负责地方语音。

## 后来变成普通话味的原因

B74 重建实时对话链路时，保留了 `LANGUAGE_STYLES` instructions，但没有把旧的 `Qwen3-TTS / CosyVoice` 原生方言 voice ID 通道带进来。结果是：

```text
Doubao 同一 speaker
+ 方言 instructions
```

而不是：

```text
方言口语文本
+ 原生方言 voice channel
```

## 本轮恢复

恢复后分为两条通道：

```text
普通话 / 英语
= 当前使者自己的 Doubao speaker

方言
= Doubao 继续负责对话、事实与上下文
+ 对有性别槽位的方言，使用历史原生 Qwen3-TTS / CosyVoice voice channel
```

方言切换不会改变：

- `character_id`
- `formal_name`
- Character Registry 身份
- World Knowledge
- 对话上下文

普通话切回时仍然恢复当前使者自己的默认 speaker。

## 当前映射

| 方言 | 女声 | 男声 |
|---|---|---|
| 四川话 | Sunny | Eric |
| 粤语 | Kiki | Rocky |
| 上海话 | Jada | 空 |
| 陕西话 | 空 | Marcus |
| 东北话 | 空 | longlaotie_v3 |

没有对应性别的槽位暂不伪造，运行时回退到当前使者自己的 Doubao speaker，并保留方言口语 instructions。
