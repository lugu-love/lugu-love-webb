# 正式站恢复点：bottle-baseline-20260914-r2

> 冻结于 2026-09-16，本目录是**上线前的正式站快照**。任何时候都可以回到这个状态。

## 一、恢复点标识

| 项目 | 值 |
| --- | --- |
| 恢复点名称 | `bottle-baseline-20260914-r2` |
| 对应正式站目录 | `release-20260914-bottle-baseline-r2/`（**仍在站上，没有被覆盖**） |
| Pages 提交 | `0106045`（当时发布） |
| 冻结文件 SHA256 | `root-index.html` = `5924523bebef8b89f38854aa440727b12bd282e999f1a80a39841d98fbd8c7be`<br>`send-test.html` = `876e8e70138c295a80dfe08d9205944d4a5e1368c43764104755e5516c15b084`<br>`build.json` = `152abfb71f4d5670ce6ef71e98547fd9bba8986016f679e55bbdbce2c61cbb1c`<br>`asset-manifest.json` = `cec42de7ca6f29fee2d1de70349f2d347f3301509aa825ceec313df05bab8316` |
| 快照来源 | 公网实时抓取（`https://lugu-love.github.io/lugu-love-webb/` + `release-20260914-bottle-baseline-r2/send-test.html`） |

## 二、这个恢复点里有什么（全部保持原样，未被本次上线修改）

- 地球首页 / 漂流瓶：`index.html`（`release-20260914-bottle-baseline-r2/index.html`）
- 我想表达页：`send-test.html`（**上线前的版本**，含输入框下方那一栏说明文案）
- 正式素材清单：`asset-manifest.json`（19 条素材 × 3 种交付）
- 正式 build 契约：`build.json`
- 音乐库、R2 素材、七星使者头像等：全部在 `release-20260914-bottle-baseline-r2/assets/`

## 三、怎么一键回退

**只看效果（不动任何东西）**：
https://lugu-love.github.io/lugu-love-webb/release-20260914-bottle-baseline-r2/

**一键把正式站指回这个恢复点**（只改根 `index.html` 的跳转目标，其它一律不动）：

```powershell
cd C:\Users\wk\Documents\HeartRealm\hr-candidate-20260915
Copy-Item restore-point\bottle-baseline-20260914-r2\root-index.html restore-point\bottle-baseline-20260914-r2\index-root.html -ErrorAction SilentlyContinue
node restore-production.mjs --release=release-20260914-bottle-baseline-r2          # 干跑
node restore-production.mjs --release=release-20260914-bottle-baseline-r2 --execute # 真正回退
```

回退后根地址立刻跳回上线前的版本；新版本目录仍在站上，可以再切回去。

## 四、注意

- 本次上线**没有改动** R2 原始素材、音乐库、漂流瓶逻辑、地球首页逻辑、Rabbit/Fox 的 11+8 素材契约。
- 上线只是新增了 `release-20260916-send-mobile-r3/` 目录并把根 `index.html` 指过去；
  旧目录 `release-20260914-bottle-baseline-r2/` 完整保留，所以回退是秒级的。
