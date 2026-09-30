# Frontstage Player V1

这是与 2c10 旧链路隔离的最小播放内核 Candidate。

## 状态机

`INIT → PRELOAD → BOTTLE_ENTER → CHARACTER_IN_BOTTLE → READY → FOREGROUND → RETURN → DONE`

| 状态 | 唯一进入条件 | 唯一退出条件 | 允许控制 |
|---|---|---|---|
| INIT | 构造函数完成，DOM 和视频元素建立 | `start()` | 无播放控制 |
| PRELOAD | `start()` | 一个媒体候选 `loadeddata` 且 `readyState >= 2`，或所有候选失败 | 仅 video `src/load/currentTime` |
| BOTTLE_ENTER | PRELOAD 成功 | 瓶体入场动画 `finished` | bottle opacity/transform |
| CHARACTER_IN_BOTTLE | 瓶体到位 | 角色进入瓶内且视频已回到起点 | character rect/clip/opacity/visibility，video pause/loop/currentTime |
| READY | 瓶内角色可播放 | `open()` | 仅确认态，不修改播放层 |
| FOREGROUND | `open()` | video `ended`，或 Player 单次失败 watchdog | character rect/clip/z，video currentTime/play/loop |
| RETURN | FOREGROUND 完成 | 回瓶动画 `finished` | character rect/clip/opacity，bottle opacity，video pause/loop/currentTime |
| DONE | RETURN 完成并恢复首帧 | `replay()`，或 Player 受控 auto cycle | 无额外控制 |

## 硬约束

- 只有一个 `FrontstagePlayer` 实例控制瓶体、角色、视频与状态。
- 不使用 CSS animation/transition 决定显示状态。
- 不使用 MutationObserver。
- 不劫持 `HTMLMediaElement.prototype.currentTime`。
- 不使用双缓冲 swap。
- 不使用角色专属播放分支。
- 所有计时器都归 Player 所有；同一时刻最多一个 watchdog。
- 角色接入只通过 `frontstage-registry.js`。

## 测试 URL

单次流程：

```text
?item=rabbit-happy
```

自动连续两次：

```text
?item=rabbit-happy&auto=1&cycles=2
```

自动连续 20 次：

```text
?item=rabbit-happy&auto=1&cycles=20
```
