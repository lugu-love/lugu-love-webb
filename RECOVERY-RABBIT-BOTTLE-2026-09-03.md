# RECOVERY — Rabbit Bottle Stable 2026-09-03

> 2026-09-03：兔子标准化 + 漂流瓶结构 + 大表演布局 + 地球开场节奏 —— 稳定可恢复测试基线。

## 1. 对应 commit SHA

- 收口 commit：`cd2e4cb`（message: `test: stabilize rabbit bottle flow and earth intro timing`）
- 分支：`codex/home-rhythm-test`（已推送 origin）
- 更早结构基线：`codex/bottle-rabbit-slot-baseline`（`cf4cc6f`，含 f537c81 / 663ea35）

## 2. 对应 tag

- `rabbit-bottle-stable-2026-09-03`（已推送 origin，指向 cd2e4cb）
- 未移动/覆盖任何既有 baseline tag。

## 3. 当前测试入口

- 仓库内：`tests/bottle-standard/index.html`（相对本仓库根）
- 真机（同一 Wi-Fi）：`http://192.168.1.12:8765/tests/bottle-standard/index.html`
  （本机需运行：`python3 -m http.server 8765 --bind 0.0.0.0`，目录为本仓库根；macOS 防火墙需放行 Python）
- 自动化快速验证：URL 加 `?auto=1`（自动点击首星）

## 4. 已确认的关键参数（以代码为准）

- 兔子固定挂载 `.voice-bottle-rabbit-slot`（与瓶子同一坐标系，放大/移动自动同步）
- `--rabbit-slot-top: -34px`（瓶内唯一锚点）
- `--rabbit-pre-shake-lift: 13px`（仅“到达后未抖”静止段下移）
- `CARD_TEXT_BOTTLE_GAP = 17.5`（浮动卡片首行文字距瓶底）
- 大表演组合布局：顶部真实 UI 下沿 +12 为上界；底部入口上界 −12；卡片预留 `fitCardReserve=190`；短屏自动缩 6%（0.94）；`BIG_RABBIT_DOWN_PX=18`（实际由 `textOffsetInCard+5` 与 8px 间距下限截断）
- 地球 approach 3.4s；标题 1.7s 缓入（~2.4s）→ 全亮停留 → ~9s 起 3.6s 慢退（~12.6s 消失）
- 心星：首星生成 4.0s（可见/可点 ~6.1–6.4s）；前 15s 稀疏（1–2 颗），之后加密
- “轻抚一颗心，遇见一个世界”：13.0s 淡入（2s）→ 17.0s 自动慢退（2s）；点星立即慢退
- 点击链：瓶子 0.45s 出现；到达 `random(1.5, 2.1)s`；兔子内容 ~1s 内开始
- 文案：欢迎语“欢迎来到这里，听见自己，也看见彼此”

## 5. E04 / E13 验证结论

- 两只（撒娇/躺平）共用同一套逻辑与场景参数（`bottleNarrativeScene`），无逐情绪 top/left 补丁
- headless 390×844 与 390×780：点击→瓶子→1→2→3→4→返航全流程跑通
- 3→4 脱离帧、返航落座帧像素级连续；glow 4→18→4 平滑（最大 60ms 步进 ≤1.2）
- 控制台零 error、零 404

## 6. 390×844 / 390×780 验证结论

- 844：E04 释放/落座 rect `(7.3,233.9,374.9)` / `(83.4,226.2,187.4)` 两侧一致；E13 同
- 780：E04/E13 同；短屏大表演缩至 439.9 后释放/落座同样连续
- 首星可见即点（mark starVisible≈starClickable）；点击后反馈 +0.01–0.03s、瓶 +0.48s、兔 +0.57s、正式内容 +2.5s

## 7. 华为真机验证方式

1. 手机与本机同一 Wi-Fi，打开 `http://192.168.1.12:8765/tests/bottle-standard/index.html`
2. 左上角“节奏时间表”自动记录：地球可见/转动、首星可见/可点、点击、反馈、瓶出现、兔可见、正式内容
3. 真实点第一颗星，完整看 E04；关瓶后点下一颗星看 E13
4. 重点确认：无跳变/漂移/不同步、卡片与文字不重叠、整体重心合适、开场节奏舒服

## 8. 地球 / 标题 / 心星当前时间节奏

| 项 | 时间 |
|---|---|
| 地球出现/转动/稳定 | 0–3.4s |
| 标题缓入 | 1.7s 起 ~2.4s（~4.1s 全亮） |
| 标题全亮停留 | ~4.1–9.0s |
| 标题慢退 | ~9.0–12.6s |
| 首星可见/可点 | ~6.1–6.4s |
| “轻抚…”淡入/淡出 | 13.0s 淡入(2s) / 17.0s 慢退(2s)，点星即隐 |
| 点击→瓶/兔/正式 | +0.45s / +0.6s / +2.5s 左右 |

## 9. 尚未正式上线内容

- 本版为“稳定测试基线”，**不是**正式线上替换
- 正式首页（仓库根 `index.html`）未改动
- 正式 `assets/`、manifest、后端 make-send 未改动
- E01–E15 批量、逐情绪母版/预览/文案/映射未铺开
- 华为真机“最终完整验收”仍需在设备上按第 7 节过一遍后由你确认

## 10. 如何恢复到本检查点（不要现在执行）

```bash
# 拉取并切到稳定 tag（只读恢复代码状态）
git fetch origin
git checkout rabbit-bottle-stable-2026-09-03

# 或切到最新测试分支
git checkout codex/home-rhythm-test
```

恢复后本地起服务验证：
```bash
python3 -m http.server 8765 --bind 0.0.0.0
# 手机/浏览器打开 http://<本机局域网IP>:8765/tests/bottle-standard/index.html
```

说明：本文件本身位于收口之后的 docs commit 中；如从 tag 检出看不到本文件，可用
`git show codex/home-rhythm-test:RECOVERY-RABBIT-BOTTLE-2026-09-03.md` 查看。
