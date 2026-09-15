# 正式站恢复点：fox-blessing-20260915-v1

> 冻结于 2026-09-16，是「祝福页上线」这一版的**上线前完整快照**。任何时候都能回到这个状态。

## 一、恢复点标识

| 项目 | 值 |
| --- | --- |
| 恢复点名称 | `fox-blessing-20260915-v1` |
| 对应正式站目录 | `release-20260915-fox-blessing-v1/`（**仍在站上，不会被覆盖**） |
| 冻结文件 SHA256 | `root-index.html` = `8f1bda9d03ece2124f05ef596709bfe710474a482f1937c43ea42b2daf2ab6a3`<br>`send-test.html` = `a4c1cecdb52801c0cfda66676e3a6c7edd65a032587182544c3659040fe46ada`<br>`blessing.html` = `fe8c4534e9705a37fd957ba50b7e1bf93af5887acbccc9a64b56f93ebf1f6fd1`<br>`blessing-manifest.json` = `ca37ea14f3c89fc36be9aadda072f1a9ba3414b6bbac6949c80e9737ce62120a`<br>`build.json` = `2f304d240963c673c462834b8d1cdf56123db2939b7204e77eceb7928f3da54d`<br>`asset-manifest.json` = `cec42de7ca6f29fee2d1de70349f2d347f3301509aa825ceec313df05bab8316` |
| 快照来源 | 公网实时抓取（根 index.html + `release-20260915-fox-blessing-v1/` 下的页面与清单） |

## 二、这个恢复点里的状态

- 地球首页 / 漂流瓶：`index.html`
- 我想表达（情绪页）：`send-test.html`（含说明栏删除、素材准入、手机首屏提速、一行横滑选择器、底部选择面板、字号优化、原子淡入 等已验收改动）
- 祝福页：`blessing.html` + `blessing-manifest.json`（**这一版仍是原生下拉 + 旧字号 + 绿幕 HEVC 优先**）
- 正式素材清单：`asset-manifest.json`（19 条情绪素材 × 3 种交付）

## 三、怎么一键回退

**只看效果（不动任何东西）**：
https://lugu-love.github.io/lugu-love-webb/release-20260915-fox-blessing-v1/

**一键把正式站指回这个恢复点**（只改根 `index.html` 的跳转目标）：

```powershell
cd C:\Users\wk\Documents\HeartRealm\hr-candidate-20260915
node restore-production.mjs --release=release-20260915-fox-blessing-v1            # 干跑
node restore-production.mjs --release=release-20260915-fox-blessing-v1 --execute # 真正回退
```

回退后根地址立刻跳回这一版；新版本目录仍留在站上，可以再切回去。

## 四、注意

- 本次上线**没有**改动 R2 原始素材、音乐库、漂流瓶逻辑、地球首页逻辑、情绪页 11+8 素材契约。
- 本次上线新增了 `release-20260916-blessing-r8/` 目录（含 7 个祝福“黑底展示版”MP4）并把根 `index.html` 指过去；
  旧目录 `release-20260915-fox-blessing-v1/` 完整保留，回退是秒级的。
