#!/usr/bin/env python3
"""七星使者 · 情绪表达 P3 云端版 /make-send

预生成情绪母版 + 动态文字(drawtext) + TTS + FFmpeg mux。
Linux/FFmpeg 兼容，不依赖 macOS。当前仅支持三情绪 MVP。
"""
import http.server
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
from datetime import datetime

from text_layout import layout_lines, has_unsupported
from tts_provider import make_tts_provider

ROOT = os.path.dirname(os.path.abspath(__file__))
MASTERS_DIR = os.path.join(ROOT, "masters")
FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FONT_FILE = os.environ.get("FONT_FILE", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
FONT_INDEX = int(os.environ.get("FONT_INDEX", "2"))
FONT_FC = os.environ.get("FONT_FC", "Noto Sans CJK SC")

# 当前 MVP 三情绪白名单；母版文件名与情绪名称
MASTERS = {
    "rabbit-happy":     ("happy-master.mp4", "开心"),
    "rabbit-aggrieved": ("wronged-master.mp4", "委屈"),
    "rabbit-angry":     ("angry-master.mp4", "生气"),
}

FPS = int(os.environ.get("FPS", "18"))
BITRATE_KBPS = int(os.environ.get("BITRATE_KBPS", "2500"))
W, H = 720, 1280
DURATION = 10
TEXT_MAX = int(os.environ.get("TEXT_MAX", "40"))
SAFE_WIDTH = int(W * 0.90)          # 648px 文本安全区
BASE_FONT_SIZE = 52
LINE_SPACING = 12
COPY_TOP = 140                      # 动态文字区顶端（距底部 px）
BOTTOM_MARGIN = 10
MAX_HEIGHT = COPY_TOP - BOTTOM_MARGIN

MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "2"))
RATE_WINDOW = float(os.environ.get("RATE_WINDOW", "60"))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "6"))
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")

SEM = threading.BoundedSemaphore(MAX_CONCURRENT)
_rates = {}
_rate_lock = threading.Lock()
DEFAULT_TEXT = "今天先开心，其他事情都给我排队。"


def log(msg):
    print("[%s] %s" % (datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def rate_ok(ip):
    now = time.time()
    with _rate_lock:
        ts = [t for t in _rates.get(ip, []) if now - t < RATE_WINDOW]
        if len(ts) >= RATE_LIMIT:
            return False
        ts.append(now)
        _rates[ip] = ts
    return True


def _font_selector():
    fc = os.environ.get("FONT_FC", "")
    if fc:
        return "font='%s'" % fc
    return "fontfile='%s'" % FONT_FILE


def _build_filter(line_files, font_size, y_top):
    parts = []
    n = len(line_files)
    sel = _font_selector()
    for i, lf in enumerate(line_files):
        y = y_top + i * (font_size + LINE_SPACING)
        in_label = "[0:v]" if i == 0 else "[v%d]" % (i - 1)
        out_label = "[v%d]" % i
        parts.append(
            "%sdrawtext=%s:textfile='%s':fontcolor=0xFFF2DB:fontsize=%d:"
            "x=(w-text_w)/2:y=%d:bordercolor=0x2A1608@0.7:borderw=2%s"
            % (in_label, sel, lf, font_size, y, out_label)
        )
    return ";".join(parts), "[v%d]" % (n - 1)


def generate(item, text, workdir, tts=None):
    master_rel, _emotion = MASTERS[item]
    master = os.path.join(MASTERS_DIR, master_rel)
    final = os.path.join(workdir, "final.mp4")
    tts_path = os.path.join(workdir, "tts.mp3")
    meta = {}

    # 1) 真实字体测量 + 自动换行 + 自动缩号
    t0 = time.time()
    lines, font_size, block_h = layout_lines(
        text, FONT_FILE, BASE_FONT_SIZE, SAFE_WIDTH, MAX_HEIGHT, LINE_SPACING,
        font_index=FONT_INDEX
    )
    y_top = H - COPY_TOP
    line_files = []
    for i, line in enumerate(lines):
        lf = os.path.join(workdir, "line%d.txt" % i)
        with open(lf, "w", encoding="utf-8") as f:
            f.write(line)
        line_files.append(lf)
    filtergraph, vlabel = _build_filter(line_files, font_size, y_top)
    meta["layout"] = time.time() - t0
    meta["lines"] = len(lines)
    meta["font_size"] = font_size

    # 2) TTS（provider 抽象，当前 edge-tts）
    t0 = time.time()
    (tts or make_tts_provider()).synthesize(text, tts_path)
    meta["tts"] = time.time() - t0

    # 3) FFmpeg drawtext + 音视频 mux
    t0 = time.time()
    cmd = [
        FFMPEG, "-y", "-i", master, "-i", tts_path,
        "-filter_complex", filtergraph,
        "-map", vlabel, "-map", "1:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-r", str(FPS), "-b:v", "%dk" % BITRATE_KBPS,
        "-c:a", "aac", "-ar", "44100", "-b:a", "96k",
        "-t", str(DURATION), final,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    meta["ffmpeg"] = time.time() - t0
    if r.returncode != 0:
        raise RuntimeError("ffmpeg rc=%d stderr=%s" % (r.returncode, r.stderr[-2000:]))
    meta["size"] = os.path.getsize(final)
    return final, meta


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "make-send-cloud/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _not_found(self):
        self._send_json(404, {"error": "not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/make-send":
            return self._not_found()
        qs = urllib.parse.parse_qs(parsed.query)
        self._serve(qs.get("text", [""])[0], qs.get("item", ["rabbit-happy"])[0])

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/make-send":
            return self._not_found()
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length else b""
        ctype = self.headers.get("Content-Type", "")
        text, item = "", "rabbit-happy"
        try:
            if "application/json" in ctype:
                data = json.loads(body.decode("utf-8")) if body else {}
                text = data.get("text", "") or ""
                item = data.get("item", "rabbit-happy") or "rabbit-happy"
            else:
                form = urllib.parse.parse_qs(body.decode("utf-8"))
                text = form.get("text", [""])[0]
                item = form.get("item", ["rabbit-happy"])[0]
        except Exception:
            return self._send_json(400, {"error": "bad request"})
        self._serve(text, item)

    def _serve(self, text, item):
        start = time.time()
        text = (text or DEFAULT_TEXT)[:TEXT_MAX]
        if item not in MASTERS:
            item = "rabbit-happy"
        if has_unsupported(text):
            return self._send_json(400, {"error": "暂不支持 emoji / 特殊符号，请使用文字、数字、标点"})
        if not rate_ok(self.client_address[0]):
            return self._send_json(429, {"error": "too many requests"})
        if not SEM.acquire(blocking=False):
            return self._send_json(429, {"error": "server busy"})

        workdir = None
        try:
            workdir = tempfile.mkdtemp(prefix="make-send-")
            final, meta = generate(item, text, workdir)
            with open(final, "rb") as f:
                data = f.read()
            log("SUCCESS item=%s text_len=%d lines=%d font=%d tts=%.2fs ffmpeg=%.2fs total=%.2fs size=%d"
                % (item, len(text), meta["lines"], meta["font_size"], meta["tts"], meta["ffmpeg"],
                   time.time() - start, len(data)))
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition", 'attachment; filename="%s.mp4"' % item)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            log("ERROR item=%s %s: %s total=%.2fs" % (item, type(e).__name__, e, time.time() - start))
            self._send_json(500, {"error": str(e)})
        finally:
            if workdir and os.path.isdir(workdir):
                shutil.rmtree(workdir, ignore_errors=True)
            SEM.release()


def main():
    port = int(os.environ.get("PORT", "8000"))
    log("start port=%d concurrent=%d masters=%s font=%s ffmpeg=%s"
        % (port, MAX_CONCURRENT, MASTERS_DIR, FONT_FILE, FFMPEG))
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
