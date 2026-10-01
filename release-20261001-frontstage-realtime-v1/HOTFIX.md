# Frontstage + Realtime Flow V1 Candidate

轻量独立 Candidate，仅覆盖修改后的首页；资源使用冻结的 r2 Release。

修复：

- 首页使者停滞在瓶内、不出瓶。
- 首页缺少面对面实时对话入口。
- 使者出瓶后立即回瓶、无法衔接实时对话。

边界：

- 不改 A/B 服务端协议。
- 不改 C 视频生成、方言、TTS、角色逻辑。
- 不切换正式入口。

父 Release：`release-20260930-final-v1-r2`
父 commit：`daec0f239ad910e70fc6ddd054be95bb3c16c4cc`
