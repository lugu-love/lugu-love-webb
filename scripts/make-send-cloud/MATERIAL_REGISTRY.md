# 素材登记簿（本轮只登记，不物理删除）

状态日期：2026-08-28
统一后，开心/委屈/生气的唯一 `officialSource` 为 sequence/1、sequence/2、sequence/3；
`previewProxy` 为 mobile/1、mobile/2、mobile/3（同动作 270px 低清预览）。

## 已标记 archive / deprecated
| 素材 | 路径 | 说明 | 处置 |
|---|---|---|---|
| 旧 V1 母版 | `masters/happy-master.mp4`、`masters/wronged-master.mp4`、`masters/angry-master.mp4` | 原片抠像 + 情绪大标题的旧式母版，不再作为正式源 | archive |
| 旧 V2 母版（生气） | 历史 `masters/angry-master-v2.mp4` | 由 `angry-sprites-hd` 重建，动作与 sequence/3 不一致（错源） | deprecated（已被新 V2 替换） |
| 旧 V2 母版（开心/委屈） | 历史 `masters/happy-master-v2.mp4`、`masters/wronged-master-v2.mp4` | 与 previewProxy 非同一处理管线 | deprecated（已被新 V2 替换） |
| angry-sprites | `assets/video/fengxin-rabbit-angry-sprites/` | 旧生气精灵图（360px） | archive |
| angry-sprites-hd | `assets/video/fengxin-rabbit-angry-sprites-hd/` | 旧生气 HD 精灵图，曾是旧 V2 生气母版错源 | deprecated |
| v2/processed/aggrieved | `assets/video/fengxin-rabbit-v2/processed/aggrieved/` | V2 原始处理帧（10s 长版，历史实验） | archive |
| v2/processed/angry | `assets/video/fengxin-rabbit-v2/processed/angry/` | V2 原始处理帧（历史实验） | archive |
| v2/processed/shy | `assets/video/fengxin-rabbit-v2/processed/shy/` | V2 原始处理帧（害羞，历史实验） | archive |
| 旧 macOS 后端 | `scripts/make-send/`（send_server.py 等） | 依赖 macOS/Swift，已被 Railway 云版替代 | legacy / deprecated |

## 可删除候选（本轮仍不删除，待二次确认）
| 素材 | 路径 | 说明 |
|---|---|---|
| 委屈变体 | `assets/video/fengxin-rabbit-sequence/2-b/`、`2-c/`、`2-cq/` | 历史变体，无代码引用 |
| 生气 demo | `assets/video/fengxin-rabbit-angry-demo.mp4`、`fengxin-rabbit-angry-poster.png` | 无代码引用 |
| 半身段 | `assets/video/fengxin-rabbit-sequence/4/` | PROJECT_CONTEXT 明确“第 4 段半身素材暂不使用” |

## 正式源（保留并作为唯一事实源）
| itemId | officialSource | previewProxy | renderMaster |
|---|---|---|---|
| rabbit-happy | sequence/1 | mobile/1 | happy-master-v2.mp4 |
| rabbit-aggrieved | sequence/2 | mobile/2 | wronged-master-v2.mp4 |
| rabbit-angry | sequence/3 | mobile/3 | angry-master-v2.mp4 |
