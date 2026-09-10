#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
七星使者自动抠像标准 V1 —— BiRefNet 主版通用处理脚本（可移植版）

锁定参数：主版 ZhengPeng7/BiRefNet · 1024x1024 推理 · MPS fp16 · RGB 取原始帧 ·
          Alpha = BiRefNet 软蒙版 · 相邻 3 帧滑动中值（首末边界复制）·
          去绿溢色仅软边(0.02<α<0.98) · 输出 ProRes 4444 真实 Alpha 母版 + #3C3C3C 深灰验收 MP4

模型权重不入库：请通过环境变量 BIREFNET_WEIGHTS 指定本地权重目录（默认 ~/models/birefnet-weights）。
ffmpeg 通过环境变量 FFMPEG 指定，或使用 PATH 中的 ffmpeg。

用法：
  python birefnet_matte_v1.py --input <原始视频> --prefix <输出前缀> [--outdir <目录>] [--tmp <临时目录>]
"""
import argparse, glob, os, resource, shutil, subprocess, time
import numpy as np
import torch
from PIL import Image
from transformers import AutoModelForImageSegmentation

MODEL_DIR = os.environ.get("BIREFNET_WEIGHTS", os.path.expanduser("~/models/birefnet-weights"))
FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"

INFER = 1024                     # 锁定：1024x1024 推理
BAND_LO, BAND_HI = 0.02, 0.98    # 锁定：去绿溢色软边区间
DESPILL_MIN_EXCESS = 2.0         # 锁定：G 超出 max(R,B) 超过该值才压制
BG_GRAY = (60, 60, 60)           # 锁定：#3C3C3C


def parse_args():
    p = argparse.ArgumentParser(description="七星使者自动抠像标准 V1（BiRefNet）")
    p.add_argument("--input", required=True, help="原始绿幕视频路径")
    p.add_argument("--prefix", required=True, help="输出文件名前缀，如 fox_white_hurt_sad_birefnet")
    p.add_argument("--outdir", default=None, help="输出目录（默认与输入同目录）")
    p.add_argument("--tmp", default=None, help="临时工作目录（默认 $TMPDIR 下）")
    p.add_argument("--fps", type=int, default=24)
    p.add_argument("--crf", type=int, default=16, help="深灰验收 MP4 的 H.264 CRF")
    return p.parse_args()


def main():
    a = parse_args()
    outdir = a.outdir or os.path.dirname(os.path.abspath(a.input))
    os.makedirs(outdir, exist_ok=True)
    tmp = a.tmp or os.path.join(os.environ.get("TMPDIR", "/tmp"), f"birefnet_matte_{a.prefix}")
    IN, RGBA, GRAY = f"{tmp}/in", f"{tmp}/rgba", f"{tmp}/gray"
    for d in (IN, RGBA, GRAY):
        os.makedirs(d, exist_ok=True)
    for f in glob.glob(f"{tmp}/**/*.png", recursive=True):
        os.remove(f)
    t_all = time.time()

    print("[1/5] 抽帧")
    subprocess.run([FFMPEG, "-y", "-v", "error", "-i", a.input, "-start_number", "0", f"{IN}/%04d.png"], check=True)
    frames = sorted(glob.glob(f"{IN}/*.png"))
    N = len(frames)
    if N == 0:
        raise SystemExit("未抽到任何帧，请检查输入视频路径")
    BW, BH = Image.open(frames[0]).size
    print(f"      {N} 帧 · {BW}x{BH}")

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"[2/5] 载入模型：{MODEL_DIR}（device={dev}）")
    model = AutoModelForImageSegmentation.from_pretrained(MODEL_DIR, trust_remote_code=True).eval()
    DT = next(model.parameters()).dtype
    model.to(dev)
    MEAN = np.array([0.485, 0.456, 0.406], np.float32)
    STD = np.array([0.229, 0.224, 0.225], np.float32)

    print(f"[3/5] BiRefNet 推理（{INFER}px, {dev}, {DT}）")
    alphas = np.zeros((N, BH, BW), np.float16)
    times = []
    for i, fp in enumerate(frames):
        img = Image.open(fp).convert("RGB")
        x = img.resize((INFER, INFER), Image.BILINEAR)
        arr = (np.asarray(x, np.float32) / 255.0 - MEAN) / STD
        t = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(device=dev, dtype=DT)
        t0 = time.time()
        with torch.no_grad():
            out = model(t)
        times.append(time.time() - t0)
        if isinstance(out, (list, tuple)):
            cand = [o for o in out if torch.is_tensor(o) and o.dim() == 4]
            logits = cand[-1]
        elif torch.is_tensor(out):
            logits = out
        else:
            logits = out.logits
        if isinstance(logits, (list, tuple)):
            logits = logits[-1]
        m = torch.sigmoid(logits.float())[0, 0].cpu().numpy()
        alphas[i] = np.asarray(
            Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8), "L").resize((BW, BH), Image.BILINEAR),
            np.float32).astype(np.float16) / np.float16(255.0)
        if (i + 1) % 20 == 0:
            print(f"      {i+1}/{N} · {np.mean(times):.2f}s/帧")
    print(f"      推理合计 {sum(times):.1f}s（{np.mean(times):.2f}s/帧）")

    print("[4/5] 相邻 3 帧滑动中值（首末边界复制）")
    med = np.zeros_like(alphas)
    for i in range(N):
        p = alphas[max(0, i - 1)].astype(np.float32)
        c = alphas[i].astype(np.float32)
        n = alphas[min(N - 1, i + 1)].astype(np.float32)
        med[i] = np.clip(p + c + n - np.minimum(np.minimum(p, c), n) - np.maximum(np.maximum(p, c), n),
                         0, 1).astype(np.float16)

    print("[5/5] 软边去绿溢色 + 输出 RGBA/深灰")
    stats = []
    for i, fp in enumerate(frames):
        rgb = np.asarray(Image.open(fp).convert("RGB"), np.float32)
        al = med[i].astype(np.float32)
        band = (al > BAND_LO) & (al < BAND_HI)
        mx = np.maximum(rgb[..., 0], rgb[..., 2])
        excess = rgb[..., 1] - mx
        m = band & (excess > DESPILL_MIN_EXCESS)
        out = rgb.copy()
        out[..., 1] = np.where(m, mx, out[..., 1])
        ai = Image.fromarray((np.clip(al, 0, 1) * 255).astype(np.uint8), "L")
        rgb8 = np.clip(out, 0, 255).astype(np.uint8)
        rgba = Image.fromarray(rgb8, "RGB").convert("RGBA")
        rgba.putalpha(ai)
        rgba.save(f"{RGBA}/{i:04d}.png")
        bg = Image.new("RGB", (BW, BH), BG_GRAY)
        bg.paste(Image.fromarray(rgb8, "RGB"), (0, 0), ai)
        bg.save(f"{GRAY}/{i:04d}.png")
        stats.append(float(al.mean()))

    mov = f"{outdir}/{a.prefix}_alpha_v1.mov"
    mp4 = f"{outdir}/{a.prefix}_gray_preview_v1.mp4"
    subprocess.run([FFMPEG, "-y", "-v", "error", "-framerate", str(a.fps), "-start_number", "0",
                    "-i", f"{RGBA}/%04d.png", "-c:v", "prores_ks", "-profile:v", "4444",
                    "-pix_fmt", "yuva444p10le", mov], check=True)
    subprocess.run([FFMPEG, "-y", "-v", "error", "-framerate", str(a.fps), "-start_number", "0",
                    "-i", f"{GRAY}/%04d.png", "-c:v", "libx264", "-crf", str(a.crf),
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], check=True)

    flick = [float(np.abs(med[i].astype(np.float32) - med[i - 1].astype(np.float32)).mean()) for i in range(1, N)]

    def margins(i):
        m = med[i] > 0.5
        ys, xs = np.where(m)
        return (int(ys.min()), int(BH - 1 - ys.max()), int(xs.min()), int(BW - 1 - xs.max()))

    print("── 核验 ──")
    print(f"  帧数={N} | α均值 {min(stats):.3f}~{max(stats):.3f} | 空蒙版帧={[i for i, v in enumerate(stats) if v < 0.02]}")
    print(f"  边距 首/中/末 = {margins(0)} / {margins(N//2)} / {margins(N-1)}")
    print(f"  相邻帧抖动 平均={np.mean(flick):.5f} 最大={max(flick):.5f}")
    print(f"  最下14%α={np.mean([float(med[i][int(0.86*BH):].mean()) for i in range(N)]):.4f}（≈0 表示无地面/阴影）")
    print(f"  峰值 MPS {torch.mps.driver_allocated_memory()/1e9:.2f} GB | RSS {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1e9:.2f} GB")
    print(f"  输出 {mov} ({os.path.getsize(mov)} B)")
    print(f"  输出 {mp4} ({os.path.getsize(mp4)} B)")
    print(f"  全流程 {time.time()-t_all:.1f}s")


if __name__ == "__main__":
    main()
