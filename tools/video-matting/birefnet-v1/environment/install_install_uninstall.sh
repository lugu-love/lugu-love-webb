#!/bin/zsh
# ============ 七星使者自动抠像标准 V1：安装 / 卸载 ============
# 安装：约 5–15 分钟（视网速），新增磁盘 ≈2 GB；不使用 sudo、不改系统 Python
# 卸载：必须显式传入 --uninstall，并二次确认；仅删除本脚本列出的明确路径
set -euo pipefail

VENV_DIR="${BIREFNET_VENV:-$HOME/venvs/birefnet-matte}"
WEIGHTS_DIR="${BIREFNET_WEIGHTS:-$HOME/models/birefnet-weights}"
UV_BIN="$HOME/.local/bin/uv"
UV_CACHE="$HOME/.cache/uv"
HF_CACHE="$HOME/.cache/huggingface"

install_all() {
  echo "== 1/5 安装 uv（不使用 sudo） =="
  if [ ! -x "$UV_BIN" ]; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
  fi
  export PATH="$HOME/.local/bin:$PATH"

  echo "== 2/5 创建独立 Python 3.12 虚拟环境：$VENV_DIR =="
  uv venv --python 3.12 "$VENV_DIR"
  local VP="$VENV_DIR/bin/python"

  echo "== 3/5 安装最小依赖（含 BiRefNet 必需的 kornia） =="
  uv pip install --python "$VP" \
    torch torchvision timm einops transformers safetensors huggingface_hub \
    pillow numpy opencv-python-headless kornia

  echo "== 4/5 下载官方主版权重（MIT，约 423.9 MB）到：$WEIGHTS_DIR =="
  mkdir -p "$WEIGHTS_DIR"
  "$VP" - "$WEIGHTS_DIR" <<'PY'
import os, sys
from huggingface_hub import snapshot_download
snapshot_download(repo_id="ZhengPeng7/BiRefNet", local_dir=sys.argv[1],
                  allow_patterns=["*.safetensors", "*.py", "*.json", "*.txt", "*.md"])
PY

  echo "== 5/5 自检 =="
  "$VP" -c "import torch;print('MPS available:',torch.backends.mps.is_available())"
  echo "完成。运行示例见 scripts/run_example.sh"
}

uninstall_all() {
  local targets=("$VENV_DIR" "$WEIGHTS_DIR" "$UV_CACHE" "$HF_CACHE" "$UV_BIN")
  echo "即将删除以下路径（不可恢复）："
  local t
  for t in "${targets[@]}"; do
    # 安全校验：必须是非空、位于 $HOME 之下、且不是 $HOME 本身
    if [ -z "$t" ] || [ "$t" = "/" ] || [ "$t" = "$HOME" ] || [[ "$t" != "$HOME/"* ]]; then
      echo "拒绝危险路径：'$t'" >&2
      return 1
    fi
    printf '  %s\n' "$t"
  done
  printf '请输入 yes 以确认删除：'
  local ans=""
  read -r ans || true
  if [ "$ans" != "yes" ]; then
    echo "已取消，未删除任何内容。"
    return 0
  fi
  for t in "${targets[@]}"; do
    if [ -e "$t" ]; then
      rm -rf -- "$t"
      echo "已删除：$t"
    fi
  done
  echo "卸载完成（系统 Python 未受影响）。"
}

case "${1:-}" in
  --uninstall) uninstall_all ;;
  "" )         install_all ;;
  * )          echo "用法: $0 [--uninstall]" ;;
esac
