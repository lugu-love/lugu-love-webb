#!/bin/zsh
# 七星使者自动抠像标准 V1 —— 单条视频执行示例（可移植：全部使用 $HOME / 参数）
set -euo pipefail

VENV_PY="${BIREFNET_PYTHON:-$HOME/venvs/birefnet-matte/bin/python}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

INPUT="${1:?用法: run_example.sh <原始绿幕视频> [输出前缀] [输出目录]}"
PREFIX="${2:-$(basename "${INPUT%.*}")_birefnet}"
OUTDIR="${3:-$(dirname "$INPUT")}"

# 模型权重目录通过 BIREFNET_WEIGHTS 指定（默认 ~/models/birefnet-weights）
export BIREFNET_WEIGHTS="${BIREFNET_WEIGHTS:-$HOME/models/birefnet-weights}"

# 注意：请在普通终端（非受限沙箱）中运行，MPS 才能访问 Metal 设备
"$VENV_PY" "$SCRIPT_DIR/birefnet_matte_v1.py" \
  --input "$INPUT" \
  --prefix "$PREFIX" \
  --outdir "$OUTDIR"
