# iPhone Mic Fix V1

## 根因

- iOS Safari 不把父页面点击视为 iframe 内麦克风授权的用户手势。
- 旧嵌入页自动调用 `getUserMedia`，在 iPhone 上会一直停在“正在获取麦克风…”。
- iframe `allow` 未显式使用 `microphone *`。

## 修复

- iframe 改为 `allow="microphone *; autoplay; fullscreen; camera"`。
- iOS/Safari 不自动启动对话。
- 显示明确的“点击开启麦克风并开始对话”按钮。
- 用户点击后再调用 `getUserMedia` 和建立实时对话。
