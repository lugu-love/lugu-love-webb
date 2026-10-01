# iPhone Mic Fix V1 Candidate

修复 iPhone Safari 在面对面 iframe 中一直等待麦克风的问题。

- iframe 显式放开 `microphone *`。
- iPhone/Safari 不自动调用 `getUserMedia`。
- 显示“点击开启麦克风并开始对话”，由用户手势触发麦克风授权。
- 非 iPhone 仍保持自动进入对话。
- 不修改 A 出瓶、C 生成和 Huawei 下载链路。
