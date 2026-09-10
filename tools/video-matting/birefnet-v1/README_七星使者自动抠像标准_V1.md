# 七星使者自动抠像标准 V1（已锁定）

状态：**正式锁定**（基于狐狸使者 `fox_white_hurt_sad` 121 帧整片人工验收通过）
锁定日期：2026-09-10 ｜ 模型授权：**MIT**（`ZhengPeng7/BiRefNet`）

## 一、锁定参数（不得随意更改）
| 项目 | 值 |
|---|---|
| 模型 | 主版 `ZhengPeng7/BiRefNet`（MIT） |
| 推理分辨率 | **1024 × 1024** |
| 设备 / 精度 | **Apple MPS + fp16**（权重为 fp16，输入必须同为 fp16） |
| RGB 来源 | **原始视频帧**（禁止用蒙版充当 RGB、禁止灰度化） |
| Alpha 来源 | **BiRefNet 软蒙版**（0–255，含软边） |
| 时序平滑 | **相邻前/中/后 3 帧滑动中值**（逐像素） |
| 边界帧 | **首帧 / 末帧边界复制**（不丢帧） |
| 去绿溢色 | **仅软边 `0.02 < α < 0.98`**：当 `G > max(R,B)+2` 时 `G := max(R,B)` |
| 内部保护 | `α ≥ 0.98` 的主体内部 **RGB 零改动** |
| 母版输出 | **ProRes 4444（`yuva444p12le`）真实 Alpha** `.mov` |
| 验收输出 | **#3C3C3C 深灰背景** H.264 `.mp4` |

## 二、目录结构
```
tools/video-matting/birefnet-v1/
├── README_七星使者自动抠像标准_V1.md   ← 本文件
├── .gitignore                          ← 排除模型/venv/缓存/帧/视频/密钥
├── scripts/
│   ├── birefnet_matte_v1.py             ← 通用处理脚本（锁定参数，可移植）
│   └── run_example.sh                   ← 单条执行示例
├── environment/
│   ├── 环境与依赖说明.md
│   ├── requirements.freeze.txt          ← 依赖版本锁定（41 项）
│   └── install_install_uninstall.sh     ← 安装 / 安全卸载
└── records/
    ├── 正式素材登记.md
    └── 素材清单.json
```

## 三、模型权重（⚠️ 不入库，需在新设备单独下载）
本仓库**不包含**任何模型权重；`.gitignore` 已排除 `*.safetensors` / `*.pth` / `*.ckpt` / `*.bin`。

```zsh
# 指定权重目录（默认 $HOME/models/birefnet-weights）
export BIREFNET_WEIGHTS="$HOME/models/birefnet-weights"
mkdir -p "$BIREFNET_WEIGHTS"
"$HOME/venvs/birefnet-matte/bin/python" - <<'PY'
import os, sys
from huggingface_hub import snapshot_download
snapshot_download(repo_id="ZhengPeng7/BiRefNet",
                  local_dir=os.environ["BIREFNET_WEIGHTS"],
                  allow_patterns=["*.safetensors","*.py","*.json","*.txt","*.md"])
PY
```
- 官方仓库：`https://huggingface.co/ZhengPeng7/BiRefNet`（MIT）
- 本机已下载权重校验值：`model.safetensors` SHA-256 = `9ab37426bf4de0567af6b5d21b16151357149139362e6e8992021b8ce356a154`（423.9 MB）

## 四、执行命令
```zsh
# 方式一：示例脚本（参数：输入视频 [输出前缀] [输出目录]）
zsh scripts/run_example.sh "/path/to/original_green_screen.mp4" "fox_xxx_birefnet" "/path/to/outdir"

# 方式二：直接调用（可用环境变量 BIREFNET_WEIGHTS / FFMPEG 覆盖默认值）
"$HOME/venvs/birefnet-matte/bin/python" scripts/birefnet_matte_v1.py \
  --input  "/path/to/original_green_screen.mp4" \
  --prefix "fox_xxx_birefnet" \
  --outdir "/path/to/outdir"
```
> **必须在普通终端（非受限沙箱）中运行**：MPS 需要访问 Metal 设备。

## 五、输出与命名
- 透明母版：`<前缀>_alpha_v1.mov`（ProRes 4444，真实 Alpha）
- 深灰验收：`<前缀>_gray_preview_v1.mp4`（#3C3C3C）

## 六、验收门槛（每条素材必查）
1. 帧数 / 时长 / 帧率与源片一致，尺寸不变
2. Alpha 同时存在 0 与 255，且软边像素 > 0（真实软边）
3. 无空蒙版帧（每帧 α 均值 > 0.02）
4. 角色边距在首 / 中 / 末帧基本一致（尺寸位置不变）
5. 相邻帧抖动：平均 ≤ 0.002（标准样片实测 0.00170）
6. 最下 14% α ≈ 0 → 绿幕、地面、阴影已移除
7. 角色内部平均饱和度与原片一致（橙白毛色 / 白裙 / 金蓝装饰保持）
8. 人工看片：耳毛、泪水、衣裙、双脚鞋带、两腿间、尾巴落地无破损与绿边

## 七、性能参考（本机 Apple M4 / 16 GB）
| 项目 | 实测 |
|---|---|
| 单条 121 帧 834×1112 推理 | 73.1 s（0.60 s/帧） |
| 全流程（含中值 / PNG / 编码） | ≈ 7 分钟 |
| 峰值 MPS 显存 / 进程 RSS | 4.65 GB / 0.94 GB |

## 八、已知边界
- BiRefNet 为**逐帧**模型，**必须**保留 3 帧中值时序平滑，否则边缘抖动
- 主体内部不做任何颜色处理；软边去溢色仅压制绿幕反射
- 素材若本身存在**构图裁切**（如 reference_image 模式的放大裁切样片），抠像无法修复，需重新生成后再处理
