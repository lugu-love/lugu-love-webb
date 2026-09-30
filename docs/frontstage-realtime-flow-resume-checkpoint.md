# Frontstage Realtime Flow Resume Checkpoint

日期：2026-10-01
状态：安全暂停，等待继续。

## 当前 Git 状态

- 工作树：`/Users/liangminghua/.codex/worktrees/frontstage-realtime-flow/github-lugu-love-web`
- 当前分支：`codex/frontstage-realtime-flow-v1-thin`
- 当前 HEAD：`e242445db32263583558e4ce5e2ac344c2a9a651`
- origin/main：`e242445db32263583558e4ce5e2ac344c2a9a651`
- Candidate 名称：`candidate-20260930-frontstage-realtime-flow-v1`
- Candidate commit：`e242445db32263583558e4ce5e2ac344c2a9a651`
- Candidate 公网路径：
  `https://lugu-love.github.io/lugu-love-webb/candidate-20260930-frontstage-realtime-flow-v1/`
- Hotfix rollback tag：
  `production-rollback-before-frontstage-realtime-flow-v1`
- Hotfix rollback commit：
  `daec0f239ad910e70fc6ddd054be95bb3c16c4cc`

## 正式站状态

- 正式 Release：`release-20260930-final-v1-r2`
- 正式入口 commit：`a568ec3e2abfe55a489a57db2e353508fb45806c`
- 正式入口未切换，仍指向 `release-20260930-final-v1-r2`。

## Huawei 下载热修复状态

- 分支：`codex/huawei-download-hotfix-v1`
- Candidate：`candidate-20260930-huawei-download-hotfix-v1`
- Candidate commit：`daec0f239ad910e70fc6ddd054be95bb3c16c4cc`
- Huawei rollback tag：`production-rollback-final-v1-r2-hotfix-v1`
- Huawei rollback commit：`a568ec3e2abfe55a489a57db2e353508fb45806c`
- 本次暂停不继续 Huawei 下载热修复。

## 已完成本地联动结论

已修复并本地验证：

- 首页使者能从瓶中出来，不再停留在瓶内。
- 出瓶后出现：
  - `面对面聊聊`
  - `先回瓶`
- 点击“面对面聊聊”打开全屏 B iframe：
  `https://candidate.suomaanjia.cn:8443/lugu-b74/?from=frontstage-entry`
- B iframe 存在期间，首页 A 保持出瓶状态，`returnRabbitToBottle()` 被 gate。
- 点击“结束对话并回瓶”后，对话层关闭，角色执行回瓶流程。
- 点击“先回瓶”也是显式结束/跳过。

本地三端结果：

- Desktop Chrome：通过。
  - 出瓶、入口、B iframe、保持出瓶、结束回瓶全部通过。
- Android Chromium：通过。
  - 出瓶、入口、B iframe、保持出瓶、结束回瓶全部通过。
- iPhone WebKit：功能通过。
  - 出瓶、入口、B iframe、保持出瓶、结束回瓶均通过。
  - 唯一日志是 B iframe 仍访问旧 `https://api.lugu.love/welcome` 产生 CORS；非本次新增阻断。

## 公网 Candidate 发布状态

- 轻量 Candidate commit 已推送到 `origin/main`：`e242445db32263583558e4ce5e2ac344c2a9a651`
- 暂停时公网路径检查仍返回 404，GitHub Pages 尚未完成该 commit 的发布。
- 不能把 404 当成 Candidate 代码失败；明天先检查 Pages build。
- 本地测试已经通过，不重复做本地定位。

## 明天第一条续接命令

```sh
cd /Users/liangminghua/.codex/worktrees/frontstage-realtime-flow/github-lugu-love-web
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
git ls-remote origin refs/heads/main
curl -sS -I https://lugu-love.github.io/lugu-love-webb/candidate-20260930-frontstage-realtime-flow-v1/index.html
curl -sS "https://api.github.com/repos/lugu-love/lugu-love-webb/actions/runs?head_sha=e242445db32263583558e4ce5e2ac344c2a9a651&per_page=5" | jq '[.workflow_runs[] | {name,status,conclusion,head_sha,updated_at}]'
```

如果 Pages 已完成：

1. 用公网 Candidate 跑 Desktop Chrome / iPhone WebKit / Android Chromium 的出瓶、B iframe、保持出瓶、结束回瓶 smoke。
2. 公网通过后，再决定是否准备正式切换；本次暂停不切正式站。
3. 不继续 Huawei 下载热修复，除非用户明确恢复该任务。

## 暂停动作

- 本地 HTTP 服务已停止。
- 没有继续运行长时间测试。
- 当前工作树状态在暂停时干净。
