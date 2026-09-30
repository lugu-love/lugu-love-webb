# Frontstage Player A/B/C Resume Checkpoint

## 分支与提交

- 当前分支：`codex/frontstage-player-v1`
- 当前 HEAD：`0c64510cf4c2bf26abea098ada102921baaea029`
- Candidate commit：`ca4ed1046de1649e6537506dbeb686f33a118c66`
- rollback：`b8308838b961ace9d281fd78c542ccfa496b5cdf`
- 工作树：暂停时干净，无未提交改动

## 已完成

- 冻结旧架构 Candidate：`candidate-20260927-frontstage-2c10-r1`
- 建立独立 Candidate：`candidate-20260930-frontstage-player-v1-r1`
- 完成旧链路控制权审计。
- 建立单 Player 状态机：
  `INIT → PRELOAD → BOTTLE_ENTER → CHARACTER_IN_BOTTLE → READY → FOREGROUND → RETURN → DONE`
- 建立 registry-driven 批量配置，共 60 个现有条目。
- 修复 Safari 绿幕：优先使用 verified avconvert HEVC alpha；无 alpha 候选被禁止。
- 增加视频复用、播放进度 stall 检测和失败回收。

## 已完成自动验收

A 代表项：

- 风信兔：`rabbit-happy`
- 光尾狐：`fox-pink-coquettish`
- 凌遥猴：`monkey-wronged`

自动环境结果：

- Desktop Chrome：3/3 项，每项 20 次，每次连续两轮，全部 PASS。
- iPhone WebKit：3/3 项，每项 20 次，每次连续两轮，全部 PASS。
- Huawei Android/Chromium：3/3 项，每项 20 次，每次连续两轮，全部 PASS。

所有播放状态序列一致，未触发空瓶、挡瓶、悬浮、绿底、黑底或白闪断言。

## 剩余阻塞

- 当前主机未连接 iPhone 或华为物理设备，也没有云真机账号。
- 因此 A 阶段尚缺物理真机门禁；这不改变自动验收已通过的结论。
- B/C 尚未开始改装，当前只完成正式站目标收口和 A 内核。

## 恢复后的第一条命令

```bash
cd /Users/liangminghua/.codex/worktrees/frontstage-player-v1/github-lugu-love-web
git status --short --branch
git log -3 --oneline --decorate
```

然后按顺序继续：

1. 在物理 iPhone/华为上打开 `candidate-20260930-frontstage-player-v1-r1` 做 A 真机门禁。
2. A 通过后进入 B：实时面对面对话、语音、方言和地方口语复用与端到端收口。
3. B 通过后进入 C：情绪表达生成、保存/下载、发给 TA、系统分享/微信分享收口。

## 当前不启动的长期任务

- 不重新跑已通过的 20 次自动验收，除非代码再次变化。
- 不在网络恢复前启动新的长时间测试。
