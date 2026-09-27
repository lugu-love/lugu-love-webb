# 阶段 2A 候选回滚说明（candidate-20260927-frontstage-2a-r1）

## 这个候选做了什么

只做**结构收口**，节奏数值、尺寸、素材、UI 全部未动：

1. **4 个出瓶入口 → 1 个**：自动定时器 / 点击瓶子 / 自定义事件 / 外部 `_releaseRabbit` 全部汇入 `FRONTSTAGE.release()`。
2. **散状态 → 单一状态机**：`IDLE/IN_BOTTLE/TYPING/ZOOM/HANDOFF/FOREGROUND/RETURN/DONE`，只在 `FRONTSTAGE.setState()` 里迁移。
3. **唯一控制路径**：`currentTime` 归零统一走 `FRONTSTAGE.prepareFrame()`；换层提交统一走 `FRONTSTAGE.commit()`。
4. **统一时间轴**：放大 4000ms、出瓶 3000ms、回瓶 3000ms、视频结束兜底 (duration+2.5)s 全部走 `FRONTSTAGE.schedule()`，数值不变。
5. **历史实验开关解绑**：新增总闸 `__LUGU_LEGACY_EXPERIMENTS__ = false`；`nojump` / `feet` / `rise` / `disableFrontStagePerformance` 只在总闸打开时才生效。**代码全部保留，未物理删除。**

## 回滚方法（三选一）

1. **整目录回滚**：删除 `candidate-20260927-frontstage-2a-r1/` 目录（该目录对正式站无任何引用）。
2. **单文件回滚**：把该目录的 `index.html` 换回正式版 `release-20260920-nuanshan-bear-r1/index.html`。
3. **恢复旧实验行为**：把 `index.html` 里 `const __LUGU_LEGACY_EXPERIMENTS__ = false;` 改为 `true`，即可让 `nojump` / `feet` / `rise` / `disableFrontStagePerformance` 恢复旧行为。

## 提交记录

| commit | 内容 |
|---|---|
| `ce5e9a4` | 2A 之前的 main（最外层回滚点） |
| `104ef91` | 首次发布 2A 候选（含作用域缺陷，未通过验证） |
| `5f83dc8` | 修复作用域：状态机移入漂流瓶闭包，候选可用（本次验证版本） |

## 验证（阶段 0 同一测量仪）

| 版本 | 条件 | 严格过渡窗口异常帧 | 窗口外 |
|---|---|---|---|
| release-20260917（原版） | 1× | 0 | 0 |
| release-20260917（原版） | CPU 4× | 0 | 0 |
| candidate-20260920-frontstage-preload-r1 | 1× | 1 | 0 |
| candidate-20260920-frontstage-preload-r1 | CPU 4× | 2 | 0 |
| **本候选 2A** | 1× | **0** | 0 |
| **本候选 2A** | CPU 4× | **0** | 1（#379 @7093ms，位于前场表演阶段而非过渡窗口） |

结论：过渡窗口异常帧 = 0 达标；窗口外那 1 处属于前场表演内的画面切换（回放起点），留给阶段 2B 统一首帧显示条件处理。

## 正式站影响

**无。** 根 `index.html` 的跳转目标仍指向 `release-20260920-nuanshan-bear-r1`，本次只新增一个候选目录。
