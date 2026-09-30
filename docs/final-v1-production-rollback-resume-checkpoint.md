# Final V1 Production Rollback Resume Checkpoint

日期：2026-09-30
状态：安全暂停，等待网络恢复后继续。

## 当前 Git 状态

- 工作树：`/Users/liangminghua/.codex/worktrees/emotion-send-v1/github-lugu-love-web`
- 当前分支：`main`
- HEAD：`8f5ec686ddd3df69bf29d5e275c61f5c6b19b958`
- `origin/main`：`8f5ec686ddd3df69bf29d5e275c61f5c6b19b958`
- Final RC 分支：`codex/final-v1-rc`
- Final RC commit：`72ab38746b99fdd3fc8b7b2c426501cc0e9becc0`
- 正式 Release commit：`2a16e753abf96ca69562e359ed50c4baeebed5c5`
- Rollback 目标：`e086a35d88e0ecbf0a0f7042ce360e35b91224c0`
- Rollback release dir：`release-20260920-nuanshan-bear-r1/`
- Rollback commit：`8f5ec686ddd3df69bf29d5e275c61f5c6b19b958`
- Rollback commit message：`rollback: restore production entry to e086a35`

## 已完成验收

### A / Frontstage Player V1

公网页面：

`https://lugu-love.github.io/lugu-love-webb/release-20260930-final-v1/frontstage/?item=rabbit-happy&auto=1&cycles=2`

已通过：

- Desktop Chrome：连续 2 轮完整状态序列，`DONE`，无 error。
- iPhone WebKit：连续 2 轮完整状态序列，`DONE`，无 error。
- Android Chromium：连续 2 轮完整状态序列，`DONE`，无 error。
- 状态序列均为：
  `PRELOAD > BOTTLE_ENTER > CHARACTER_IN_BOTTLE > READY > FOREGROUND > RETURN > DONE`，重复两轮。
- 无空瓶、挡瓶、悬浮、绿底、黑底、白闪阻断。

### B / Realtime Dialog

公网页面：

`https://candidate.suomaanjia.cn:8443/lugu-b74/`

已通过：

- Desktop Chrome：页面 200，麦克风初始化，WebSocket 连接，豆包 session 创建，服务端 `proxy.character_ready / language_ready / voice_ready / voice_channel`，音频 delta 返回。
- Android Chromium：同上，WebSocket + 豆包音频返回通过。
- iPhone WebKit：页面 200，麦克风初始化，WebSocket + 豆包 session + 音频返回通过。
- 三种表达模式切换可见且可切换：`原文 + 方言`、`地方口语`、`其他地方`。
- 四川话切换已执行。
- 已知非阻断日志：B 页面会尝试访问旧 `https://api.lugu.love/welcome` 并产生 CORS/404；不影响当前 B 对话主链路。

### C / Emotion Send

公网页面：

`https://lugu-love.github.io/lugu-love-webb/release-20260930-final-v1/send-test.html?mode=emotion`

结果：**阻断，已触发生产 rollback。**

阻断原因：

- `send-test.html` 的生产契约仍校验：
  `release-20260912-03 / release-20260912-03 / 20260912-03-c1`
- 但 final release 的 `build.json` 被写成：
  `release-20260930-final-v1 / release-20260930-final-v1 / 20260930-final-v1`
- 浏览器报错：`[production-contract] Error: build contract mismatch`
- 结果：`#expressionSwitch` 隐藏，`#btnGenerate` 不可用，C 主链路无法生成。
- 页面还会后台请求旧 `https://api.lugu.love/status`，产生 CORS 日志；这不是主要阻断，但应在修复时一并清理或改走 runtime base。

## Rollback 状态

已执行并推送：

- `git push origin main`
- `2a16e75..8f5ec68  main -> main`

暂停时 GitHub Pages 构建：

- Run：`36693214689`
- Commit：`8f5ec686ddd3df69bf29d5e275c61f5c6b19b958`
- 上次检查：`in_progress`
- 公网首页当时仍返回旧 final release 重定向，需要网络恢复后继续确认。

## 待办

1. 检查 GitHub Pages run `36693214689` 是否成功。
2. 复查 `https://lugu-love.github.io/lugu-love-webb/` 是否重定向到 `./release-20260920-nuanshan-bear-r1/`。
3. 公网 smoke 验证 rollback 后的旧生产入口。
4. 在下一版 RC 修正 C 的 build contract 配置，不直接修改正式站。
5. 华为下载/保存继续作为已知热修复项，不阻塞本次 rollback。
6. 网络恢复后从本 checkpoint 继续，不重复 A/B 已通过的公网验收，除非需要回归确认。

## 安全暂停动作

- 没有正在运行的本地发布、测试或热修复任务。
- 没有本机监听端口需要停止（`8770/8772/8784/8443/8931` 均无本地监听）。
- 当前 release 工作树在暂停时干净。
- 当前任务改动已提交到 `main` 的 rollback commit；本 checkpoint 若尚未推送，网络恢复后立即补推。
