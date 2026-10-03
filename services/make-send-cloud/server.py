"""lugu make-send-cloud / 1.0

浏览器无关的唯一视频生产链路：
  前端只提交参数并轮询，所有生成都在这里完成，返回稳定 HTTPS MP4 URL。

管线：文字排版 -> TTS(mp3) -> FFmpeg(drawtext + 混音) -> final.mp4
依赖：Python 标准库 + edge-tts + ffmpeg。无任何付费 API key。

接口：
  GET /status                     健康检查
  GET /make-send?...&async=1      创建任务 -> 202 {"job": "..."}
  GET /make-send?...              （不带 async）同步生成 -> video/mp4
  GET /make-send/result?job=...    查询任务 -> {"status": "running|done|error", "videoPath": "..."}
  GET /video/<job>.mp4            稳定 MP4 直链（视频页/分享用）
  GET /tts?text=...               仅语音
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from text_layout import layout_lines
from tts_provider import make_tts_provider

VERSION = "make-send-cloud/1.0"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MASTERS_DIR = os.environ.get("MASTERS_DIR", os.path.join(BASE_DIR, "masters"))
OUT_DIR = os.environ.get("OUT_DIR", os.path.join(BASE_DIR, "out"))
FFMPEG = os.environ.get("FFMPEG_BIN") or os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = os.environ.get("FFPROBE_BIN") or shutil.which("ffprobe") or "ffprobe"
FONT = os.environ.get("SEND_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
FONT_SIZE = int(os.environ.get("SEND_FONT_SIZE", "46"))
FONT_Y_BOTTOM = int(os.environ.get("SEND_FONT_Y_BOTTOM", "120"))
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
JOB_TTL = int(os.environ.get("JOB_TTL_SECONDS", "3600"))
PUBLIC_BASE = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

# 情绪 -> master 模板（与前端 emotion-manifest 对齐）
EMOTION_MASTERS = {
    "happy": "happy-master-v2.mp4",
    "angry": "angry-master-v2.mp4",
    "wronged": "wronged-master-v2.mp4",
    "_default": "happy-master-v2.mp4",
}
# v1 兜底，便于在只有旧素材的环境自检
MASTER_FALLBACKS = {
    "happy-master-v2.mp4": ["happy-master.mp4"],
    "angry-master-v2.mp4": ["angry-master.mp4"],
    "wronged-master-v2.mp4": ["wronged-master.mp4"],
}

_jobs = {}
_jobs_lock = threading.Lock()
_provider = None


def provider():
    global _provider
    if _provider is None:
        _provider = make_tts_provider()
    return _provider


def _resolve_master(item, character_id, emotion_id):
    key = (emotion_id or "").strip().lower()
    name = EMOTION_MASTERS.get(key) or EMOTION_MASTERS["_default"]
    candidates = [name] + MASTER_FALLBACKS.get(name, [])
    # item 形如 rabbit-happy / fox-angry，末段常是情绪
    if item and "-" in item:
        tail = item.rsplit("-", 1)[-1].lower()
        if tail in EMOTION_MASTERS:
            alt = EMOTION_MASTERS[tail]
            candidates = [alt] + MASTER_FALLBACKS.get(alt, []) + candidates
    for c in candidates:
        p = os.path.join(MASTERS_DIR, c)
        if os.path.exists(p):
            return p
    return None


def _probe_size(path, subprocess_run=subprocess.run):
    """取 master 尺寸；失败则回退 720x1560。"""
    try:
        out = subprocess_run([FFPROBE, "-v", "error", "-select_streams", "v:0",
                              "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
                             capture_output=True)
        if out.returncode == 0:
            parts = (out.stdout or b"").decode().strip().split(",")
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                return int(parts[0]), int(parts[1])
    except Exception:
        pass
    return 720, 1560


def _text_overlay_png(lines, width, height, out_path):
    """把字幕画成透明 PNG。用 overlay 叠加，不依赖 ffmpeg 的 drawtext/freetype。"""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = None
    for cand in (FONT, "/System/Library/Fonts/PingFang.ttc",
                 "/System/Library/Fonts/Supplemental/Songti.ttc",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        try:
            if cand and os.path.exists(cand):
                font = ImageFont.truetype(cand, FONT_SIZE)
                break
        except Exception:
            font = None
    if font is None:
        font = ImageFont.load_default()

    line_h = int(FONT_SIZE * 1.45)
    total_h = line_h * len(lines)
    y = max(0, height - total_h - FONT_Y_BOTTOM)
    for line in lines:
        try:
            box = draw.textbbox((0, 0), line, font=font)
            tw = box[2] - box[0]
        except Exception:
            tw = len(line) * FONT_SIZE
        x = max(0, (width - tw) // 2)
        draw.text((x, y), line, font=font, fill=(255, 242, 219, 255),
                  stroke_width=2, stroke_fill=(42, 22, 8, 178))
        y += line_h
    img.save(out_path)
    return out_path


def render(text, out_path, emotion_id="happy", item="", voice=None, subprocess_run=subprocess.run):
    """唯一的生产函数：文字 -> 带字幕与配音的 MP4。返回 stats。"""
    t0 = time.time()
    master = _resolve_master(item, None, emotion_id)
    if not master:
        raise RuntimeError("master template not found for emotion=%s" % emotion_id)

    work = tempfile.mkdtemp(prefix="make-send-")
    try:
        lines = layout_lines(text)

        t_tts = time.time()
        tts_path = os.path.join(work, "tts.mp3")
        provider().synthesize(text, tts_path, voice=voice)
        tts_seconds = time.time() - t_tts

        width, height = _probe_size(master, subprocess_run=subprocess_run)
        overlay = _text_overlay_png(lines, width, height, os.path.join(work, "subtitle.png"))

        cmd = [
            FFMPEG, "-y",
            "-i", master,
            "-i", tts_path,
            "-i", overlay,
            "-filter_complex", "[0:v][2:v]overlay=0:0:format=auto[v]",
            "-map", "[v]", "-map", "1:a",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest", "-movflags", "+faststart",
            out_path,
        ]
        t_ff = time.time()
        proc = subprocess_run(cmd, capture_output=True)
        if proc.returncode != 0:
            raise RuntimeError("ffmpeg rc=%d stderr=%s" % (proc.returncode, (proc.stderr or b"")[-400:]))
        ff_seconds = time.time() - t_ff
        size = os.path.getsize(out_path)
        return {"lines": len(lines), "tts": tts_seconds, "ffmpeg": ff_seconds,
                "total": time.time() - t0, "size": size,
                "master": os.path.basename(master), "size_px": "%dx%d" % (width, height)}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _prune_jobs():
    now = time.time()
    with _jobs_lock:
        for jid in [k for k, v in _jobs.items() if now - v.get("created", now) > JOB_TTL]:
            _jobs.pop(jid, None)


class Handler(BaseHTTPRequestHandler):
    server_version = VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---------- 基础设施 ----------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        q = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        try:
            if route == "/status":
                return self._json(200, {"status": "ok", "version": VERSION,
                                        "provider": provider().name, "ffmpeg": FFMPEG,
                                        "masters": sorted(os.listdir(MASTERS_DIR)) if os.path.isdir(MASTERS_DIR) else []})
            if route == "/make-send/result":
                return self._result(q)
            if route == "/make-send":
                return self._make_send(q)
            if route == "/tts":
                return self._tts(q)
            if route.startswith("/video/"):
                return self._serve_video(route[len("/video/"):])
            return self._json(404, {"status": "error", "error": "not found", "path": route})
        except Exception as exc:  # 任何异常都返回结构化错误，绝不静默
            return self._json(500, {"status": "error", "error": str(exc)})

    # ---------- 业务 ----------
    def _tts(self, q):
        text = q.get("text", "")
        if not text:
            return self._json(400, {"status": "error", "error": "text required"})
        _prune_jobs()
        os.makedirs(OUT_DIR, exist_ok=True)
        out = os.path.join(OUT_DIR, "tts-%s.mp3" % uuid.uuid4().hex[:16])
        provider().synthesize(text, out, voice=q.get("voiceId"))
        return self._file(out, "audio/mpeg", inline=True)

    def _result(self, q):
        job = q.get("job", "")
        with _jobs_lock:
            rec = _jobs.get(job)
        if not rec:
            return self._json(404, {"status": "error", "error": "unknown job"})
        if rec["state"] == "done":
            return self._json(200, {"status": "done", "videoPath": rec["videoPath"],
                                    "url": (PUBLIC_BASE + rec["videoPath"]) if PUBLIC_BASE else rec["videoPath"]})
        if rec["state"] == "error":
            return self._json(200, {"status": "error", "error": rec.get("error", "generation failed")})
        return self._json(200, {"status": "running"})

    def _make_send(self, q):
        text = q.get("text", "").strip()
        if not text:
            return self._json(400, {"status": "error", "error": "text required"})
        emotion = q.get("emotionId") or q.get("emotion") or ""
        item = q.get("item", "")
        voice = q.get("voiceId") or None
        if q.get("async") in ("1", "true", "yes"):
            return self._make_send_async(text, emotion, item, voice)
        return self._make_send_sync(text, emotion, item, voice)

    def _make_send_async(self, text, emotion, item, voice):
        _prune_jobs()
        job = uuid.uuid4().hex
        with _jobs_lock:
            _jobs[job] = {"state": "running", "created": time.time()}
        threading.Thread(target=self._run_job, args=(job, text, emotion, item, voice), daemon=True).start()
        return self._json(202, {"job": job, "status": "running"})

    def _run_job(self, job, text, emotion, item, voice):
        try:
            os.makedirs(OUT_DIR, exist_ok=True)
            out = os.path.join(OUT_DIR, "make-send-%s.mp4" % job)
            stats = render(text, out, emotion_id=emotion, item=item, voice=voice)
            with _jobs_lock:
                _jobs[job] = {"state": "done", "created": time.time(),
                              "videoPath": "/video/make-send-%s.mp4" % job, "stats": stats}
            self.log_message("SUCCESS item=%s text_len=%d lines=%d tts=%.2fs ffmpeg=%.2fs total=%.2fs size=%d",
                             item or "-", len(text), stats["lines"], stats["tts"],
                             stats["ffmpeg"], stats["total"], stats["size"])
        except Exception as exc:
            with _jobs_lock:
                _jobs[job] = {"state": "error", "created": time.time(), "error": str(exc)}
            self.log_message("ERROR job=%s %s", job, exc)

    def _make_send_sync(self, text, emotion, item, voice):
        os.makedirs(OUT_DIR, exist_ok=True)
        out = os.path.join(OUT_DIR, "make-send-%s.mp4" % uuid.uuid4().hex[:16])
        render(text, out, emotion_id=emotion, item=item, voice=voice)
        return self._file(out, "video/mp4", inline=False)

    # ---------- 文件 ----------
    def _file(self, path, content_type, inline):
        size = os.path.getsize(path)
        name = os.path.basename(path)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "none")
        self.send_header("Content-Disposition",
                         ('inline; filename="%s"' if inline else 'attachment; filename="%s"') % name)
        self._cors()
        self.end_headers()
        with open(path, "rb") as fh:
            shutil.copyfileobj(fh, self.wfile, 64 * 1024)

    def _serve_video(self, name):
        name = os.path.basename(name)          # 防目录穿越
        if not re.fullmatch(r"[A-Za-z0-9._-]{4,128}", name):
            return self._json(400, {"status": "error", "error": "bad name"})
        path = os.path.join(OUT_DIR, name)
        if not os.path.exists(path):
            return self._json(404, {"status": "error", "error": "video not found"})
        return self._file(path, "video/mp4", inline=True)


def main():
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    os.makedirs(OUT_DIR, exist_ok=True)
    masters = sorted(os.listdir(MASTERS_DIR)) if os.path.isdir(MASTERS_DIR) else []
    sys.stderr.write("make-send-cloud %s start port=%d masters=%s ffmpeg=%s\n"
                     % (VERSION, port, masters, FFMPEG))
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
