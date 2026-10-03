# Hotfix A — 恢复漂流瓶放大与使者出瓶

**范围**：仅恢复原设计能力。不新增行为、不叠加 2c 补丁、不与 Hotfix C 互相引用。

## 根因

正式站入口 `release-20260920-nuanshan-bear-r1/index.html` 第 3757 行：

```js
const disableFrontStagePerformance = true;
```

而"瓶子放大 + 使者出瓶"的唯一入口函数第 6987 行：

```js
function enterLargeBottle() {
  if (disableFrontStagePerformance) return;   // <-- 直接 return
```

`enterLargeBottle()` 是**手点瓶子与自动放大定时器（`enlargeBottleTimer`）共用的唯一入口**，
所以开关为 `true` 时两条路径同时失效：瓶子永不变大、使者永不出现。

该开关是 9/18 `candidate-20260918-no-frontstage-r1`（"无前场"实验）遗留，
被复制进 `release-20260919` → `release-20260920` → `release-20260930-final-v1-r2`，全是 `true`。
`candidate-20260927-frontstage-2c*` 在"阶段2A"把门禁从主流程解绑（变量保留、`return` 去掉），
所以 2c 系能出瓶、基线不能 —— 这就是"同功能不同版本表现相反"的原因。

**不是**状态泄漏、**不是**设备差异。所以 iPhone/华为表现一致、重启手机无效。

## 改动

```diff
-const disableFrontStagePerformance = true;
+const disableFrontStagePerformance = false; // Hotfix A: 恢复原设计出瓶能力（此前被误关）
```

一个文件、一行。其余全部保持 `release-20260920-nuanshan-bear-r1` 原样。

## 验收

- 点瓶子 → 瓶子放大 → 使者出瓶 → 前场 → 回瓶 → 第二次播放
- 无空瓶 / 挡瓶 / 悬浮 / 绿底 / 黑底 / 白闪

## 回滚

还原该行即可回到当前正式站行为；或不切入口，线上不受影响。
