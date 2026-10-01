# iOS Mic + Bottle Exit Resume Checkpoint

日期：2026-10-01
状态：断网前安全暂停。

## 当前 Git 状态

- 工作树：`/Users/liangminghua/.codex/worktrees/frontstage-realtime-flow/github-lugu-love-web`
- 当前分支：`codex/ios-mic-fix-v1`
- Candidate：`candidate-20261001-ios-mic-fix-v1`
- Candidate commit：`199bcd8ccd1ab429fb6652e019af217b88b9280f`
- Candidate 公网路径：
  `https://lugu-love.github.io/lugu-love-webb/candidate-20261001-ios-mic-fix-v1/`
- Pages 状态：暂停时 commit `199bcd8ccd1ab429fb6652e019af217b88b9280f` 的构建仍在进行；Candidate 路径可能已返回 200，但不能视为该 commit 已完成发布。

## 正式站状态

- 正式 Release：`release-20261001-realtime-embed-v1`
- 正式入口 commit：`5b640e5c3a31b4e6fb1dc42c5468187467eed4c6`
- 正式入口未切换到本次 iOS 麦克风/出瓶修复 Candidate。

## Rollback

- tag：`production-rollback-before-ios-mic-bottle-fix-v1`
- commit：`5b640e5c3a31b4e6fb1dc42c5468187467eed4c6`

## 已完成修复与本地验证

### iPhone 麦克风

- iframe 使用 `allow="microphone *; autoplay; fullscreen; camera"`。
- iPhone/Safari 不再自动调用 `getUserMedia`。
- 显示“点击开启麦克风并开始对话”。
- 本地 iPhone WebKit 验证：
  - 点击前按钮可见。
  - 点击后 `getUserMedia` 被调用。
  - 点击后面对面对话层出现。
- 旧 `api.lugu.love/welcome` 404/CORS 仍为非阻断日志。

### 使者不出瓶

- 新增：
  - 进入大瓶阶段回退定时器。
  - 大瓶释放回退定时器。
- 作用域错误已修复：移除了回瓶事件里对不可见变量的引用。
- 本地正常出瓶路径仍通过。

## 尚未完成

- commit `199bcd8ccd1ab429fb6652e019af217b88b9280f` 的公网三端最终 smoke 尚未完成。
- 尚未生成正式 Release，也尚未切换正式入口。

## 明天第一条续接命令

```sh
cd /Users/liangminghua/.codex/worktrees/frontstage-realtime-flow/github-lugu-love-web
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
curl -sS "https://api.github.com/repos/lugu-love/lugu-love-webb/actions/runs?head_sha=199bcd8ccd1ab429fb6652e019af217b88b9280f&per_page=5" | jq '[.workflow_runs[] | {name,status,conclusion,head_sha,updated_at}]'
curl -sS -I https://lugu-love.github.io/lugu-love-webb/candidate-20261001-ios-mic-fix-v1/b74-embed.html
```

若 Pages 已成功：

1. 运行公网 Candidate 三端 smoke：
   - Desktop Chrome
   - Android Chromium
   - iPhone WebKit
2. 验证：
   - 使者正常出瓶；
   - iPhone 点击按钮后才调用麦克风；
   - 对话期间父页面音频停止；
   - 对话结束正常回瓶；
   - 无新增阻断错误。
3. 通过后再准备正式 Release 和入口切换；当前暂停期间不切正式站。
4. 不继续 Huawei 下载热修复。

## 暂停动作

- 本地 HTTP 服务已停止。
- 没有继续运行长时间测试。
- 工作树状态以提交后的本次 checkpoint 为准。
