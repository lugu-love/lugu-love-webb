# iOS Mic + Bottle Exit Fix

## iPhone 麦克风

- iframe 使用 `allow="microphone *; autoplay; fullscreen; camera"`。
- iPhone/Safari 不自动调用 `getUserMedia`。
- 显示“点击开启麦克风并开始对话”，由用户手势触发授权。

## 使者不出瓶

- 新增两段独立回退：
  - 瓶内文案/媒体事件未推进时，9 秒后强制进入大瓶阶段。
  - 大瓶阶段未释放时，6.5 秒后调用现有 release 入口。
- 回退只调用现有播放器入口，不改变素材和业务生成逻辑。
