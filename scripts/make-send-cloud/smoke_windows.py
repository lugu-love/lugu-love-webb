#!/usr/bin/env python3
"""Windows 端到端冒烟测试编排器（仅供本地使用）。

启动真实 HTTP 服务并调用 /make-send，不允许绕过接口直接调用生成函数。
测试数据均为无隐私示例文本；不连接数据库，不使用 API Key。
"""

import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

PORT = int(os.environ.get("PORT", "8000"))
HOST = "127.0.0.1"
TEXT = "今天有一件开心的事，想第一时间告诉你。"
ITEM = "rabbit-happy"


def log(msg):
    print(msg, flush=True)


def detect_ffmpeg():
    if shutil.which("ffmpeg") and shutil.which("ffprobe"):
        return
    local_bin = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "FFmpeg", "bin")
    if local_bin and os.path.isdir(local_bin):
        os.environ["PATH"] = local_bin + os.pathsep + os.environ.get("PATH", "")
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        raise RuntimeError("ffmpeg/ffprobe 不可用，请先安装并加入 PATH")


def detect_font():
    windir = os.environ.get("WINDIR", r"C:\Windows")
    candidates = [
        "msyh.ttc", "msyh.ttf", "simhei.ttf", "simsun.ttc", "Deng.ttf",
    ]
    for name in candidates:
        p = os.path.join(windir, "Fonts", name)
        if os.path.isfile(p):
            return p.replace("\\", "/")
    raise RuntimeError("未找到 Windows 中文字体")


def port_busy(port):
    s = socket.socket()
    try:
        s.settimeout(0.5)
        s.connect((HOST, port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def http_json(path, timeout=10):
    url = "http://%s:%d%s" % (HOST, PORT, path)
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def post_make_send(out_path):
    url = "http://%s:%d/make-send" % (HOST, PORT)
    payload = {
        "text": TEXT,
        "item": ITEM,
        "voice": "zh-CN-XiaoxiaoNeural",
        "speechText": TEXT,
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            body = r.read()
            ctype = r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:2000]
        raise RuntimeError("/make-send HTTP %s: %s" % (e.code, detail))
    if "video/mp4" not in ctype:
        raise RuntimeError("/make-send 未返回 video/mp4，Content-Type=%s" % ctype)
    if len(body) < 12 or body[4:8] != b"ftyp":
        raise RuntimeError("/make-send 返回内容不是有效 MP4")
    with open(out_path, "wb") as f:
        f.write(body)
    return len(body)


def run_ffprobe(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if r.returncode != 0:
        raise RuntimeError("ffprobe 失败: " + r.stderr[-800:])
    return json.loads(r.stdout)


def volumedetect(path):
    r = subprocess.run(
        ["ffmpeg", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=180,
    )
    err = r.stderr
    mean = None
    peak = None
    for line in err.splitlines():
        if "mean_volume:" in line:
            mean = line.split("mean_volume:")[-1].strip().split(" ")[0]
        if "max_volume:" in line:
            peak = line.split("max_volume:")[-1].strip().split(" ")[0]
    return mean, peak


def loudnorm_stats(path):
    r = subprocess.run(
        ["ffmpeg", "-i", path,
         "-af", "loudnorm=I=-16:TP=-2:LRA=11:print_format=json",
         "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=180,
    )
    m = re.search(r"\{.*\}", r.stderr, re.S)
    if not m:
        return None
    data = json.loads(m.group(0))
    return {
        "i": float(data.get("input_i") or 0),
        "tp": float(data.get("input_tp") or 0),
        "lra": float(data.get("input_lra") or 0),
    }


def faststart(path):
    with open(path, "rb") as f:
        data = f.read()
    moov = data.find(b"moov")
    mdat = data.find(b"mdat")
    if moov < 0 or mdat < 0:
        return None
    return moov < mdat


class LocalServer(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        import server
        self._server = server
        self.httpd = http.server.ThreadingHTTPServer((HOST, PORT), self._server.Handler)

    def run(self):
        self.httpd.serve_forever(poll_interval=0.2)

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def main():
    detect_ffmpeg()
    font = detect_font()
    os.environ["FFMPEG_BIN"] = "ffmpeg"
    os.environ["FONT_FILE"] = font
    os.environ["FONT_INDEX"] = "0"
    os.environ["FONT_FC"] = ""
    os.environ["SITE_STATE_FILE"] = ""
    os.environ["TTS_PROVIDER"] = "edge-tts"
    os.environ["TTS_VOICE"] = "zh-CN-XiaoxiaoNeural"

    if port_busy(PORT):
        raise RuntimeError("端口 %d 已被占用，请先关闭占用进程" % PORT)

    out_root = os.path.join(HERE, "tmp", "smoke-" + time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out_root, exist_ok=True)
    report_lines = []

    def report(msg):
        log(msg)
        report_lines.append(msg)

    final_path = os.path.join(out_root, "final.mp4")
    server_thread = None
    try:
        server_thread = LocalServer()
        server_thread.start()
        log("[1/6] 本地服务已启动: %s:%d" % (HOST, PORT))

        status = None
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                _, status = http_json("/status")
                break
            except Exception:
                time.sleep(0.5)
        if not status:
            raise RuntimeError("/status 等待超时")
        report("[2/6] /status 正常: %s" % json.dumps(status, ensure_ascii=False))

        size = post_make_send(final_path)
        report("[3/6] /make-send 成功，MP4 大小 %d 字节" % size)

        info = run_ffprobe(final_path)
        streams = info.get("streams", [])
        fmt = info.get("format", {})
        video = next((s for s in streams if s.get("codec_type") == "video"), None)
        audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
        if not video or not audio:
            raise RuntimeError("成片缺少视频或音频流")
        report("[4/6] 视频编码=%s 分辨率=%sx%s 帧率=%s 像素格式=%s" % (
            video.get("codec_name"), video.get("width"), video.get("height"),
            video.get("r_frame_rate"), video.get("pix_fmt")))
        report("音频编码=%s 采样率=%s" % (audio.get("codec_name"), audio.get("sample_rate")))
        report("容器=%s 总时长=%s 视频流时长=%s 音频流时长=%s 文件大小=%s" % (
            fmt.get("format_name"), fmt.get("duration"),
            video.get("duration"), audio.get("duration"), os.path.getsize(final_path)))

        fs = faststart(final_path)
        report("faststart=%s" % ("是" if fs is True else ("否" if fs is False else "无法判断")))
        if fs is not True:
            raise RuntimeError("faststart 未开启：moov 不在 mdat 之前")

        dec = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", final_path, "-f", "null", "-"],
            capture_output=True,
            text=True,
            timeout=180,
        )
        report("完整解码=%s" % ("通过" if dec.returncode == 0 else "失败: " + dec.stderr[-500:]))

        black = subprocess.run(
            ["ffmpeg", "-i", final_path, "-vf", "blackdetect=d=0.2:pix_th=0.10", "-an", "-f", "null", "-"],
            capture_output=True,
            text=True,
            timeout=180,
        )
        black_hits = [ln for ln in black.stderr.splitlines() if "black_start" in ln]
        report("黑帧检测=%s" % ("无整段黑帧" if not black_hits else "; ".join(black_hits[-3:])))

        silent = subprocess.run(
            ["ffmpeg", "-i", final_path, "-af", "silencedetect=noise=-45dB:d=0.5", "-f", "null", "-"],
            capture_output=True,
            text=True,
            timeout=180,
        )
        silent_hits = [ln for ln in silent.stderr.splitlines() if "silence_start" in ln]
        report("静音检测=%s" % ("未检测到 0.5s 以上静音" if not silent_hits else "; ".join(silent_hits[-3:])))

        v_dur = float(video.get("duration") or 0)
        a_dur = float(audio.get("duration") or 0)
        report("音画时长差=%.3fs" % abs(v_dur - a_dur))

        frame_path = os.path.join(out_root, "frame-3s.png")
        subprocess.run(
            ["ffmpeg", "-y", "-ss", "3", "-i", final_path, "-frames:v", "1", frame_path],
            capture_output=True,
            text=True,
            timeout=60,
            check=True,
        )
        report("抽帧成功（用于人工检查中文文字是否渲染与安全区）: %s" % frame_path)

        loud = loudnorm_stats(final_path)
        mean0, peak0 = volumedetect(final_path)
        report("[5/6] Integrated Loudness=%.2f LUFS True Peak=%.2f dBTP LRA=%.2f" % (
            loud["i"], loud["tp"], loud["lra"]))
        report("mean_volume=%s dB max_volume=%s dB" % (mean0, peak0))
        if not (-18.0 <= loud["i"] <= -14.0):
            raise RuntimeError("Integrated Loudness 不在目标范围（-18~-14 LUFS）")
        if loud["tp"] > -1.5:
            raise RuntimeError("True Peak 高于 -1.5 dBTP，存在不安全风险")
        if float(peak0) >= 0:
            raise RuntimeError("max_volume 达到或超过 0 dB，疑似削波")
        report("[6/6] 响度标准通过，无削波")
    finally:
        if server_thread is not None:
            server_thread.stop()
        log("本地服务已关闭")

    report_path = os.path.join(out_root, "smoke-report.txt")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines) + "\n")
    log("报告文件: %s" % report_path)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("[失败] %s" % e, flush=True)
        sys.exit(1)
