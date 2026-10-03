# Frontstage Player V2 Architecture Reset

状态：旧首页瓶体补丁路线停止。

## 原则

- 不再在旧 `openVoiceBottle` / `fengxin-rabbit-demo` 播放链路上叠加行为补丁。
- 使者、瓶子、视频层、visibility、opacity、active、currentTime、swap、回瓶和重播只由 Frontstage Player 状态机控制。
- B 实时对话只监听 Player 的 FOREGROUND 状态接入。
- C 情绪表达保持独立，不复用旧前场播放控制。
- 所有角色通过 registry/config 接入，不增加角色专属播放逻辑。

## 目标状态机

`INIT -> PRELOAD -> BOTTLE_ENTER -> CHARACTER_IN_BOTTLE -> READY -> FOREGROUND -> RETURN -> DONE`

## 接入规则

- 首页只负责产生入口和传递 item/character 数据。
- Frontstage Player 页面负责完整出瓶、前场、B 对话保持、回瓶和第二次播放。
- B 只通过 Player 的 FOREGROUND 事件启动，对话未结束前 Player 不得进入 RETURN。
- B 页面不得重新加载完整地球首页，只加载对话层。
