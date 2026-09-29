# Frontstage Player V1 阶段 1

## 已完成

- 冻结 `candidate-20260927-frontstage-2c10-r1` 为旧架构基线。
- 完成旧链路控制权审计：`docs/frontstage-player-v1-audit.md`。
- 建立独立 Candidate：`candidate-20260930-frontstage-player-v1-r1`。
- 建立单 Player 状态机：
  `INIT → PRELOAD → BOTTLE_ENTER → CHARACTER_IN_BOTTLE → READY → FOREGROUND → RETURN → DONE`。
- 只接入一个漂流瓶、风信兔 `rabbit-happy`、第一次播放、回瓶、第二次连续播放。
- V1 不使用旧 `FRONTSTAGE`、buffer swap、全局 currentTime setter、MutationObserver、角色专属播放分支或 CSS 状态动画。
- 桌面 Chrome 验收脚本：`tests/frontstage-player-v1/desktop-acceptance.mjs`。

## 桌面验收结果

执行：

```bash
RUNS=20 CYCLES=2 node tests/frontstage-player-v1/desktop-acceptance.mjs
```

结果：20/20 PASS。

每次包含两轮连续播放，每轮状态序列均为：

```text
PRELOAD → BOTTLE_ENTER → CHARACTER_IN_BOTTLE → READY → FOREGROUND → RETURN → DONE
```

同时检查：

- 入瓶状态有角色、不是空瓶；
- 出瓶前瓶体退场、角色进入前场；
- 回瓶后角色重新位于瓶内且视频停在 0；
- 两轮都触发完整 `ended`；
- 白闪比例始终低于 0.0035；
- 绿底比例为 0；
- 黑闪比例始终低于 0.0017。

## 待完成

- iPhone Safari 真机连续 20 次；
- 华为真机连续 20 次；
- 三端全部通过后才接第二位角色。
