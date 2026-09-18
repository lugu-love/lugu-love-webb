#!/bin/zsh
# 正式生产模板：Apple 原生 HEVC Alpha 转码
# 输入必须是带 alpha 的 ProRes 4444 母版；输出使用 Apple WithAlpha 预设。
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <input-alpha-master.mov> <output-hevc.mov>" >&2
  exit 2
fi

SOURCE="$1"
OUTPUT="$2"

/usr/bin/avconvert \
  --source "$SOURCE" \
  --preset PresetHEVCHighestQualityWithAlpha \
  --output "$OUTPUT" \
  --replace \
  --progress
