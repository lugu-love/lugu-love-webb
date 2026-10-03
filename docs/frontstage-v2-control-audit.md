# Frontstage Player V2 — 旧链路控制权审计

审计对象：`release-20260920-nuanshan-bear-r1/index.html`（旧 2c10 基线的实际生产代码，272 KB，单文件内联脚本）
审计时间：2026-10-04
目的：列出所有能修改 `visibility / opacity / currentTime / active / transform / crop / canvas / swap / foreground / return` 的函数与事件源，决定哪些全部废弃、哪些只保留为素材加载。

---

## 0. 结论

旧链路的问题不是"某个补丁没打对"，而是**同一个 canvas 元素被至少 5 类互不感知的控制方同时写**：

| 控制方 | 具体 | 数量 |
| --- | --- | --- |
| 模块级定时器 | `wakeTimer / frameTimer / videoEndTimer / narrativeReturnTimer / largeBottleExitTimer / enlargeBottleTimer / bottleRevealTimer / replayHintTimer` | 8 |
| `requestAnimationFrame` 循环 | `animationFrame` + `paintFrame/drawFrame` | 19 处 RAF 调用 |
| Web Animations | `foregroundEntryAnimation`、`returnAnimation` | 2 |
| 跨作用域方法代理 | `container._releaseRabbit / _replayNarrative / _finishTyping`、`bottle._releaseRabbit / _replayNarrative` | 5 |
| CSS class 开关 | `is-hidden / is-near / is-awakening / is-pre-shake / is-expanded-performance / rabbit-expanded / is-rabbit-releasing …` | 85 处 classList 调用 |

这些控制方通过 **19 个 `setTimeout` / 5 个 `setInterval`** 交错触发，谁先谁后完全取决于视频解码速度、网络、切后台时序 —— 所以现象"时好时坏、完全乱"。

**没有任何一个组件拥有"当前该显示什么"的唯一决定权。这就是必须整体废弃、重建状态机的理由。**

---

## 1. 前场控制相关的模块级可变状态

全部位于 `playFengxinRabbitAngryDemo()` 的闭包里（第 4502 行起），**生命周期与"这一次表演"绑定，但被外部引用泄漏**：

```
4509  const sequence            = pendingBottleSequenceItem || fengxinRabbitSequence[i]
4513  const canvas              = existingCharacter || document.createElement("canvas")
4536  const isNarrativeTest     = Boolean(sequence.narrative)
4558  const videoController     = ...
4562  const sourceVideo         = videoController ? videoController.element : null
4617  const spritesReady        = videoController ? videoController.ready : waitForSprites(sprites)
4620  let animationFrame = 0
4621  let frameTimer = 0
4622  let wakeTimer = 0
4623  let animationStarted = false
4625  let playbackRun = 0
4626  let largeBottleExitTimer = 0
4629  let narrativeReturnTimer = 0
4636  let videoEndTimer = 0
4637  let videoFinishHandler = null
4640  let rabbitStage = "small"      // small | large | expanded | finished | returning | returned | interrupted
```

`rabbitStage` 是**唯一的事实来源**，但它有 **7 个取值、被 9 个函数写**，并且没有任何转移表约束。这是空瓶 / 挡瓶 / 悬浮 / 卡住的直接来源。

---

## 2. 按控制项列出所有写入点

### 2.1 `visibility` / `opacity`

| 行号 | 代码 | 所在函数 |
| --- | --- | --- |
| 4493 | `cover.classList.add("is-hidden")` | `mountBottleVideoCharacter` |
| 4755-4756 | `canvas.style.transform = "none"; canvas.style.zIndex = "60"` | `returnRabbitToBottle` |
| 4793-4801 | `returnAnimation` 关键帧 `opacity: 1` | `returnRabbitToBottle` |
| 4885-4886 | `canvas.classList.remove("is-awakening","is-expanded-performance"); canvas.classList.add("is-near")` | `replayNarrativeFromBottle` |
| 5102-5116 | `canvas.classList.remove("is-awakening")` / `.add("is-expanded-performance")` / `canvas.style.opacity = "1"` / `canvas.style.zIndex = "60"` | `expandRabbitPerformance` |
| 5132-5164 | `canvas.style.transform = "none"` / `"translateX(-50%)"`，`foregroundEntryAnimation` 关键帧 `opacity:1` | `expandRabbitPerformance` |
| 5197-5209 | `is-near` / `is-pre-shake` / `is-awakening` 切换 | `playFengxinRabbitAngryDemo` 尾部 |
| 4834-4837 | `is-rabbit-releasing` / `is-final-bottle-hidden` / `is-rabbit-emerging` / `is-expanded-performance` 移除 | `returnRabbitToBottle` |
| 4712-4713 | `canvas.classList.remove("is-expanded-performance")`, `container.classList.remove("rabbit-expanded")` | `returnRabbitToBottle` |
| 5094-5109 | `is-rabbit-releasing` / `is-rabbit-emerging` / `rabbit-expanded` 添加 | `expandRabbitPerformance` |
| 7431-7432 | `star.element.style.opacity` / `.transform` | `updateVoiceStars`（星空层，非前场角色） |
| 5539 / 5578 | iframe/overlay `style.opacity = "1"` | 心域嵌入层，非前场 |

### 2.2 `currentTime`

| 行号 | 代码 | 归属 |
| --- | --- | --- |
| 4975 | `sourceVideo.currentTime = 0` | `runVideoCharacterPlayback` — **前场视频，必须由状态机独占** |
| 7222 | `video.currentTime = 0` | `renderPage` — **前场视频，第二个写入者** |
| 6571/6575/6589/6600 | `typingKeyAudio.currentTime` | 打字音效，与画面无关，可保留 |

### 2.3 `transform` / 几何（left / top / width / height）

| 行号 | 代码 | 归属 |
| --- | --- | --- |
| 4755 | `canvas.style.transform = "none"` | `returnRabbitToBottle` |
| 5132/5149/5164 | `canvas.style.transform = "none" / "translateX(-50%)"` | `expandRabbitPerformance` |
| 6805-6838 | `bottle.style.transform = bottleTransform`, `farewellRabbit.style.transform = "none"` | `updateVoiceStars` / 瓶体定位 |
| 7432 | `star.element.style.transform` | 星空 |
| 5136-5138 | `foregroundEntryAnimation` 关键帧几何 | 前场入场 |
| 4799-4804 | `returnAnimation` 关键帧几何 | 前场回瓶 |

同一个 canvas 的 `left/top/width/height` 被 **3 个写入者 + 2 个 Web Animation** 争夺。

### 2.4 `canvas` / `crop`

| 行号 | 代码 | 归属 |
| --- | --- | --- |
| 4917 | `context.drawImage(activeSprites[...], sourceX, sourceY, ...)` | `paintFrame` — 唯一的绘制点，但被 `drawFrame` 的 RAF 循环驱动 |
| 3891 | `bottleCropFor(playback, backend)` | 纯函数，计算裁切，**保留为素材加载** |
| 4307 / 4383 | `bottleVideoFrame` / `bottleVideoSources` | 纯函数，**保留为素材加载** |

### 2.5 `swap` / `foreground` / `return`（状态推进）

| 行号 | 函数 | 作用 | 处置 |
| --- | --- | --- | --- |
| 4657 | `removeDemo` | 移除角色 DOM | **废弃** |
| 4682 | `abortSpritePlayback` | 中止播放 | **废弃** |
| 4707 | `returnRabbitToBottle` | 回瓶 | **废弃，重写** |
| 4870 | `replayNarrativeFromBottle` | 重播 | **废弃，重写** |
| 4892/4911/4920 | `runSpritePlayback` / `paintFrame` / `drawFrame` | 帧循环 | 保留绘制，**收权给状态机** |
| 4965 | `runVideoCharacterPlayback` | 视频播放主循环 | **废弃，重写** |
| 5014 | `startLargeBottlePlayback` | 放大瓶播放 | **废弃** |
| 5035 | `expandRabbitPerformance` | 出瓶进前场 | **废弃，重写** |
| 5172 | `armLargeBottleRelease` | 自动释放定时器 | **废弃** |
| 6711 | `openVoiceBottle` | 开瓶入口（含 450ms/600ms 交接延时） | **废弃，换成状态机事件** |
| 6987 | `enterLargeBottle` | 外层瓶控制器，算 `--bottle-zoom-x/y` | **废弃，几何收进 render()** |

### 2.6 跨作用域方法代理（最危险的一类）

```js
5199  if (container) container._releaseRabbit = expandRabbitPerformance;
5205  container._releaseRabbit = () => { ... returnRabbitToBottle(); };   // ?nojump=1
5218  if (container && isNarrativeTest) container._replayNarrative = replayNarrativeFromBottle;
7005  if (bottle._replayNarrative) { bottle._replayNarrative(); bottle._releaseRabbit?.(); }
7008  bottle._releaseRabbit?.();
7015  bottle._finishTyping?.()
```

外层瓶控制器（`enterLargeBottle` 的 click 处理器）通过 `bottle._xxx` 直接调用内层闭包函数，**绕过任何状态检查**。
`openVoiceBottle` 里还有 `handoffDelay = outgoingExit ? 600 : 450` 的硬编码交接延时。

### 2.7 事件源清单

| 事件 | 注册处 | 影响的控制项 |
| --- | --- | --- |
| `bottle.addEventListener("click")` | 6989 | zoom / release / replay / 瓶体可见性 |
| `bottle.addEventListener("fengxin-narrative-enlarge")` | 7085 | 进放大瓶 |
| `bottle.addEventListener("fengxin-large-bottle-opened")` | 5219 | 启动放大瓶播放 + 武装释放定时器 |
| `canvas.addEventListener("click", keepExpandedPlayback)` | 4866 | 阻止冒泡 |
| `container.dispatchEvent("rabbit-return-start")` | 4813 | 卡片跟随 |
| `container.dispatchEvent("rabbit-returned-to-bottle")` | 4832 / 4855 | 外部状态复位 |
| `document` 级事件 | 见 `followRabbitCard` (7175) | 卡片位置 |
| `requestAnimationFrame` | 19 处 | 帧循环、几何过渡 |
| `setTimeout` / `setInterval` | 46 / 5 处 | 全部阶段推进 |

**没有 `MutationObserver`**（旧链路里 0 个）—— 所以之前"MutationObserver 各自决定显示状态"的担心在旧链路不成立；真正的问题是**定时器 + RAF + WAAPI 三方混写**。

---

## 3. 处置决定

### 3.1 全部废弃（不再有任何控制权）

```
openVoiceBottle            6711   开瓶入口（含硬编码交接延时）
enterLargeBottle           6987   外层瓶几何控制器
playFengxinRabbitAngryDemo 4502   旧"表演"总函数（巨型闭包）
returnRabbitToBottle       4707   回瓶
replayNarrativeFromBottle  4870   重播
runVideoCharacterPlayback  4965   视频主循环
startLargeBottlePlayback   5014   放大瓶播放
expandRabbitPerformance    5035   出瓶进前场
armLargeBottleRelease      5172   自动释放
removeDemo                 4657
abortSpritePlayback        4682
container._releaseRabbit / _replayNarrative / _finishTyping
bottle._releaseRabbit / _replayNarrative / _finishTyping / _floatingLetter
所有 is-* / rabbit-expanded / zoom-level-2 状态类
所有 wakeTimer / frameTimer / videoEndTimer / narrativeReturnTimer /
largeBottleExitTimer / enlargeBottleTimer / bottleRevealTimer / replayHintTimer
两处 canvas.style.* 直写与两个 Web Animation
```

### 3.2 只保留为素材加载（严禁参与显示决策）

```
loadBottleAssets           3972   读 build.json / asset-manifest.json / 七星 manifest
applyBottleAssetManifest   3906   把 manifest 灌进 sequence 数组
bottleVideoFrame           4307   纯计算
bottleVideoSources         4383   纯计算（选码率/格式）
bottleCropFor              3891   纯计算（裁切窗口）
createBottleVideoController 4389  创建 <video>、返回 ready Promise
mountBottleVideoCharacter  4472   仅把元素挂进 stage，不设可见性
preloadRabbitPosters       4247
preloadFengxinRabbitAngryAssets 4256
waitForSprites             4601
paintFrame / drawFrame     4911/4920 仅"画当前帧"，由状态机调用
registry / config 数据     ——     角色与情绪的声明式配置
```

### 3.3 与 B/C 的边界

- B（实时对话）只允许监听 Player 的 `FOREGROUND` 状态；Player 在 `FOREGROUND` 期间不得进入 `RETURN`。
- C（情绪表达）完全独立，不复用前场播放控制。
- 音效/音乐（`startMusic/stopMusic/playStarClickSound/typingKeyAudio`）不属于前场显示控制，**保留**，但只能由状态机的进入/退出副作用触发，禁止各自 `setTimeout`。

---

## 4. 给新状态机的硬约束

1. **DOM 是状态的纯函数**：只允许 `render(state)` 一处写 DOM；其它任何地方不得出现 `style.*` / `classList.*`。
2. **单一句柄**：`rabbitStage` 这类多值变量替换为 `state`，转移必须经过 `transition(next)`，非法转移直接抛错并记 anomaly。
3. **零 `setTimeout` 同步补偿**：只允许"超时看门狗"，不允许用它对齐画面。
4. **零跨作用域代理**：外部只能通过 `player.start() / player.confirmForeground() / player.requestReturn()` 事件交互。
5. **早期事件必须提前挂**：媒体监听在元素创建后立刻挂（见 trace-harness 的 `observerAttachedAt`），不得等 DOM 挂载后再补。

---

## 5. 复现证据（原始行号，可直接核对）

```
4707  function returnRabbitToBottle(...)
4870  function replayNarrativeFromBottle()
4965  function runVideoCharacterPlayback(mode)
5014  function startLargeBottlePlayback()
5035  function expandRabbitPerformance()
5172  function armLargeBottleRelease()
6711  function openVoiceBottle(star)
6987  function enterLargeBottle()
5199  container._releaseRabbit = expandRabbitPerformance;
5205  container._releaseRabbit = () => { ... }
5218  container._replayNarrative = replayNarrativeFromBottle;
7005  bottle._replayNarrative(); bottle._releaseRabbit?.();
```
