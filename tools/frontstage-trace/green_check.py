"""绿底检测（只读现有采集帧）：逐帧统计“明显绿色”像素占比。
判定：g > r*1.15 且 g > b*1.15 且 g > 90 视为绿色像素（绿幕/绿底特征）。
输出：每位代表角色的绿色占比峰值 + 峰值时间戳 + 是否存在明显绿底（峰值 > 10%）。
用法：python green_check.py <label> [<label> ...]
"""
import json
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
THRESHOLD = 0.10


def green_fraction(path):
    img = Image.open(path).convert("RGB").resize((195, 422))  # 下采样加速，占比统计足够
    px = list(img.getdata())
    total = len(px)
    green = 0
    for r, g, b in px:
        if g > r * 1.15 and g > b * 1.15 and g > 90:
            green += 1
    return green / total


for label in sys.argv[1:]:
    d = os.path.join(HERE, "flash-frames", label)
    if not os.path.isdir(d):
        print(f"{label}: 目录不存在")
        continue
    frames = sorted(f for f in os.listdir(d) if f.startswith("frame-") and f.endswith(".jpg"))
    tl_path = os.path.join(d, "timeline.json")
    ms = []
    if os.path.exists(tl_path):
        ms = [f.get("ms") for f in json.load(open(tl_path, encoding="utf-8")).get("frames", [])]
    peak, peak_i, over = -1.0, -1, 0
    for i, fn in enumerate(frames):
        frac = green_fraction(os.path.join(d, fn))
        if frac > THRESHOLD:
            over += 1
        if frac > peak:
            peak, peak_i = frac, i
    t = ms[peak_i] if 0 <= peak_i < len(ms) else None
    print(f"{label}: 峰值绿色占比={peak * 100:.2f}%  @frame#{peak_i} ({t}ms)  "
          f"超过10%的帧数={over}  总帧={len(frames)}  "
          f"判定={'明显绿底' if peak > THRESHOLD else '无绿底'}")
