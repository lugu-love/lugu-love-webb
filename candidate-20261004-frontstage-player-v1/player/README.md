# Frontstage Player V1

单一所有者状态机。第一阶段只接：一个漂流瓶 + 风信兔·开心 一个素材 + 第一次播放 + 回瓶 + 第二次连续播放。

## 状态机

`INIT → PRELOAD → BOTTLE_ENTER → CHARACTER_IN_BOTTLE → READY → FOREGROUND → RETURN → DONE`（DONE 可再进 BOTTLE_ENTER 完成第二次播放）

| 状态 | 唯一进入条件 | 唯一退出条件 | 允许修改的 DOM/video | 超时/失败处理 |
| --- | --- | --- | --- | --- |
| INIT | 页面创建，未 start | 调用 `start()` | 无 | 无 |
| PRELOAD | 收到 `start()` | 全部 sheet+poster 解码完成 | `root.dataset` | 12s → 记 `STATE_TIMEOUT`，前进到 BOTTLE_ENTER |
| BOTTLE_ENTER | 素材 ready | 下一帧（瓶体几何落定） | `bottle.visible` `bottle.transform` | 2.5s → 前进到 CHARACTER_IN_BOTTLE |
| CHARACTER_IN_BOTTLE | 瓶体落定 | canvas 挂载 + 首帧绘制后下一帧 | `character.mount` `character.transform` `character.opacity` | 4s → 前进到 READY |
| READY | 角色已挂载 | 停留 1200ms（rAF 计时）或用户 advance | `bottle.visible` | 无 |
| FOREGROUND | READY 停留结束 | 帧序列播完 / `requestReturn()` | `character.transform` `character.opacity` `video.currentTime` `video.play` `video.pause` | 素材时长+3s → 记超时并回瓶 |
| RETURN | 播放结束或外部请求 | 回瓶飞行完成（1 帧） | `character.transform` `bottle.visible` | 6s → 记超时并前进 DONE |
| DONE | 回瓶完成 | `secondPlay()`（第二次播放） | `bottle.visible` | 无 |

## 铁律

1. **DOM 是状态的纯函数**：只有 `render(state)` 写 DOM；`player.css` 用 `[data-player-state]` 驱动所有可见性与几何。
2. **单一句柄**：`state` 只能经 `transition()`；非法转移抛错 + `ILLEGAL_TRANSITION` anomaly。
3. **零 setTimeout 同步补偿**：`setTimeout` 只用于超时看门狗；READY 停留用 rAF。
4. **零跨作用域代理**：外部只有 `start() / advance() / confirmForeground() / requestReturn() / secondPlay()`。
5. **早期事件提前挂**：`attachVideoEarly()` 在元素创建后立刻挂 `loadedmetadata/loadeddata/canplay/...`，并记录 `media.attachedAt` 与 `readyStateAtAttach`。
6. **禁止角色专属 if**：角色/情绪全部走 `registry.js`。

## B 的接入点

- B 只监听 `player.on('foreground', ...)`。
- `player.confirmForeground()` 表示"对话进行中"，此时 Player 不得进入 RETURN。
- 对话结束 → `player.requestReturn('dialog-ended')`。

## 自检

`index.html` 提供 `window.__playerSelfCheck()`：跑满两轮并输出
`stateSequence / anomalies / mediaEvents / observerAttachedAt / timeline`。
