# Frontstage Player V1 旧链路控制权审计

审计对象：`candidate-20260927-frontstage-2c10-r1`  
审计锚点：`b8308838b961ace9d281fd78c542ccfa496b5cdf`  
结论：2c10 冻结为旧架构基线。新 Player 不复用其前场状态控制、可见性控制、currentTime 控制、双缓冲交换、回瓶动画或角色专属路径。

## 1. 当前能修改前场状态的来源

| 控制域 | 函数 / 事件源 | 当前会修改什么 | V1 决策 |
|---|---|---|---|
| 媒体选源 | `bottleVideoSources()` | 根据设备/能力选择 VP9、HEVC、H.264 候选 | 只保留“素材候选解析”，不做显示决策 |
| 视频创建 | `createBottleVideoController()` | 创建 `<video>`、`src/load/play`、`loadeddata`、`error`、9 秒 watchdog | 只保留加载素材的能力；`play`、ready 放行和超时控制全部废弃 |
| 视频挂载 | `mountBottleVideoCharacter()` | append crop/video/cover，设置 crop、display、visibility、opacity、class、poster 回退 | 全部废弃，DOM 只在 Player `INIT` 构造一次 |
| 瓶体放行 | `revealWhenBottleReady()` | 等待 `whenInBottleReady()` 后显示角色 | 全部废弃 |
| 瓶体视觉判定 | `FRONTSTAGE.bottleVisuallyReady()` | 读取瓶体 opacity、运行中 CSS animations、crop 连续两帧几何 | 全部废弃；瓶体动画完成由 Player 的动画 `finished` 决定 |
| currentTime 拦截 | `HTMLMediaElement.prototype.currentTime` 全局 setter / `__queueReset()` / `__flushResets()` | 拦截所有归零、排队、rAF 延迟写入、写 dataset | 全部废弃；只有 Player 可写 currentTime |
| 双缓冲准备 | `prepareVideoBuffer()` | 创建隐藏 buffer、绑定 `seeked/loadeddata/error/rVFC`、rAF 校验 | 全部废弃；V1 只有一个视频层 |
| 双缓冲切换 | `swapVideoBuffer()` | 改 incoming/outgoing 的 visibility、opacity、play、pause、currentTime、active 语义 | 全部废弃 |
| 相位对齐 | `alignBufferPhase()` | seek buffer 到目标相位并等待 `seeked` | 全部废弃 |
| 交换闸门 | `requireBufferSwap()` | 最长等待 60 秒，按 readyState 和 rAF 反复重试 | 全部废弃 |
| 旧状态机 | `FRONTSTAGE` / `setState()` | `IDLE/IN_BOTTLE/.../DONE`，由多个入口写状态 | 全部废弃，由 V1 七状态 Player 替换 |
| 旧调度器 | `FRONTSTAGE.schedule()` / `cancel()` / `cancelAll()` | Map 保存多个 setTimeout | 全部废弃；Player 只允许一个 watchdog/自动推进计时器 |
| 首帧准备 | `FRONTSTAGE.prepareFrame()` | currentTime=0、可见性判断 | 全部废弃，归入 `PRELOAD` / `FOREGROUND` entry |
| 就绪判定 | `FRONTSTAGE.readiness()` / `waitReadyThenExpand()` | readyState、videoWidth/Height、assetItem、rAF 轮询、1500ms 超时 | 全部废弃；只在 `PRELOAD` 判断一次素材是否可播 |
| 出瓶入口 | `FRONTSTAGE.release()` | timer、点击、CustomEvent、外部代理均可进入 | 全部废弃；只允许 Player `open()` |
| 视频播放 | `runVideoCharacterPlayback()` | loop、prepareFrame、pause、ended、duration+2.5s 兜底、回瓶调度 | 全部废弃；播放与结束只由 Player `FOREGROUND` 管理 |
| 前场几何 | `expandRabbitPerformance()` | 改 fixed left/top/width/height/transform、class、Web Animation、卡片位置 | 全部废弃；由 Player `FOREGROUND` 唯一计算和设置 |
| 放大瓶入口 | `startLargeBottlePlayback()` | `rabbitStage` 值、wake/frame timer、rAF、sprite/video 分支 | 全部废弃 |
| 自动放大 | `armLargeBottleRelease()` / `enlargeBottleTimer` | 4 秒或 5 秒 `setTimeout` 进入大瓶，点击也可提前 | 全部废弃；`READY` 只能由 Player `open()`/受控 auto 退出 |
| 点击交互 | `enterLargeBottle()` | 改 `zoom-level-2`、class、dataset、卡片/瓶体布局，再等待 release | 全部废弃；容器点击只调用 `player.open()` |
| 回瓶 | `returnRabbitToBottle()` | fixed 几何、z-index、pointer-events、canvas.animate()、display、class、bottle opacity、star 生成 | 全部废弃；由 Player `RETURN` 管理 |
| 回瓶完成 | Web Animation finished 回调 / `rabbit-return-start` CustomEvent | 另一条事件链决定角色与瓶体恢复 | 全部废弃 |
| 重播 | `keepExpandedPlayback()` / `replayNarrativeFromBottle()` | 点击后再次进入播放/队列回瓶 | 全部废弃；由 Player `replay()` 从 DONE 重入 PRELOAD |
| 结束兜底 | `videoEndTimer` | `(duration + 2.5s)` 后强制结束 | 全部废弃；只保留 Player 的单一失败 watchdog |
| 关闭体验 | `closeCard()` | bottle animation、rabbit fixed 几何、opacity、remove、6.5 秒退出 | V1 无关闭/卡片链路；Player `destroy()` 只做资源释放 |
| Canvas | `runSpritePlayback()` / `paintFrame()` / `drawFrame()` / `canvas.animate()` | 绘制和动画 | 全部废弃；V1 只使用一个 `<video>` |
| CSS 动画 | `.voice-bottle*`、`.fengxin-rabbit-*` 的 animation/transition | 自行改变 opacity、transform、visibility、尺寸和可见窗口 | 全部废弃；V1 CSS 不控制状态，视觉效果只接受 Player 调用 Web Animations |
| 角色分支 | `isVideoCharacter` / `isNarrativeTest` 等路径 | 不同角色走不同控制逻辑 | 全部废弃；V1 配置只提供素材列表，播放路径完全相同 |

## 2. 当前媒体事件与竞争源

| 事件 / 计时器 | 当前作用 | V1 处理 |
|---|---|---|
| `loadeddata`（主视频） | 将 controller.mode 置为 video 并 resolve ready | 只在 `PRELOAD` 等待素材 |
| `error`（主视频） | 切换到下一媒体候选 | 只在 `PRELOAD` 处理候选降级 |
| `sourceWatchdog` | 9 秒后改用封面 | 改为 Player 单次 PRELOAD 失败处理 |
| `loadeddata/seeked/error`（buffer） | buffer ready / swap / failed | 删除 |
| `requestVideoFrameCallback` + 双 rAF | 判断首帧 decoded | 删除 |
| `ended`（buffer） | 触发 videoFinishHandler | 删除 |
| `ended`（可见视频） | 完成表演并进入回瓶 | 唯一由 Player `FOREGROUND` 监听 |
| `duration + 2.5s` timer | ended 丢失时强制结束 | 删除；Player 使用声明时长 + 固定容差的一次 watchdog |
| `FRONTSTAGE` Map 内多个 timer | 自动放大、回瓶、重播提示 | 删除 |
| CSS animation/transition 完成 | 让瓶体或角色自行进入下一视觉状态 | 删除；WAAPI `finished` 只回报给 Player |

## 3. V1 唯一控制面

`FrontstagePlayer` 是唯一可修改以下内容的对象：

- 瓶体：`visibility`、`opacity`、`transform`、动画。
- 角色层：`visibility`、`opacity`、`z-index`、`active`、几何、crop/clip。
- 视频：`src` 选择仅发生在 PRELOAD；`load`、`play`、`pause`、`currentTime`、`loop` 只由 Player 写。
- 状态：严格为 `INIT → PRELOAD → BOTTLE_ENTER → CHARACTER_IN_BOTTLE → READY → FOREGROUND → RETURN → DONE`。
- 重播：只能从 `DONE` 调 `replay()` 重入 `PRELOAD`；V1 不使用 swap。
- 日志：每次状态进入、退出、失败、动画完成、媒体事件均写入同一条时间线。

## 4. 只保留的旧能力

- 媒体 URL、VP9/HEVC/H.264 候选和 poster 配置。
- 素材的 `duration`、宽高、锚点/裁切元数据。
- 用户“打开瓶子”的交互意图。

这些能力只能通过 registry/config 注入 Player，不得直接修改 DOM、可见性或播放状态。

## 5. 废弃规则

1. 不再读取或兼容 2c10 的 `FRONTSTAGE`、`rabbitStage`、buffer dataset 或 CSS 状态 class。
2. 不再为任何单一症状增加 timer、rAF、MutationObserver 或事件监听补丁。
3. 不再在多个 DOM/video 层之间 swap；V1 初始只有一个角色 video 层。
4. 不再允许 CSS animation/transition 决定进入下一状态。
5. 不再出现角色 ID 条件分支；角色差异只存在于 registry/config 数据。
