import http.server, ssl, os, subprocess, urllib.parse, tempfile, time, threading

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(ROOT, "..", ".."))
BIN_DIR = os.path.join(ROOT, "bin")

# 素材根目录：默认使用项目内 assets/seven-stars-library，可用 MASTER_ROOT 覆盖
BASE = os.path.abspath(os.environ.get("MASTER_ROOT", os.path.join(PROJECT_ROOT, "assets", "seven-stars-library")))
BIN_VIDEO = os.environ.get("MAKE_SEND_MP4_BIN", os.path.join(BIN_DIR, "make-send-mp4"))
BIN_MUX = os.environ.get("MUX_AUDIO_BIN", os.path.join(BIN_DIR, "mux-audio"))

# item -> (master 相对路径, TTS 语音, 情绪名)
MASTERS = {
    "rabbit-happy":     ("fengxin-rabbit/master/happy.mp4", "Tingting", "开心"),
    "rabbit-aggrieved": ("fengxin-rabbit/master/aggrieved.mp4", "Tingting", "委屈"),
    "rabbit-angry":     ("fengxin-rabbit/master/angry.mp4", "Tingting", "生气"),
    "rabbit-shy":       ("fengxin-rabbit/master/shy.mp4", "Tingting", "害羞"),
    "fox-happy":        ("xinguang-fox/master/happy.mp4", "Tingting", "开心"),
    "fox-aggrieved":    ("xinguang-fox/master/aggrieved.mp4", "Tingting", "委屈"),
    "fox-angry":        ("xinguang-fox/master/angry.mp4", "Tingting", "生气"),
    "fox-playful":      ("xinguang-fox/master/playful.mp4", "Tingting", "调皮"),
}

MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "2"))
SEM = threading.BoundedSemaphore(MAX_CONCURRENT)

# 简单频率限制：同一 IP 每窗口最多 N 次
RATE_WINDOW = float(os.environ.get("RATE_WINDOW", "60"))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "6"))
_rates = {}
_rate_lock = threading.Lock()

def rate_ok(ip):
    now = time.time()
    with _rate_lock:
        ts = [t for t in _rates.get(ip, []) if now - t < RATE_WINDOW]
        if len(ts) >= RATE_LIMIT:
            return False
        ts.append(now)
        _rates[ip] = ts
    return True

_counter = iter(range(1000000))
def fresh(suffix):
    return os.path.join(tempfile.gettempdir(), "send-%d-%d-%d%s" % (os.getpid(), next(_counter), int(time.time()*1000), suffix))

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/make-send":
            return super().do_GET()

        if not rate_ok(self.client_address[0]):
            self.send_response(429)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"too many requests")
            return

        if not SEM.acquire(blocking=False):
            self.send_response(429)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"server busy")
            return

        try:
            qs = urllib.parse.parse_qs(parsed.query)
            text = (qs.get("text", [""])[0] or "今天先开心，其他事情都给我排队。")[:40]
            item = qs.get("item", ["rabbit-happy"])[0]
            if item not in MASTERS:
                item = "rabbit-happy"
            master_rel, voice, emotion_name = MASTERS[item]
            master = os.path.join(BASE, master_rel)
            video = fresh(".mp4"); raw = fresh(".m4a"); aac = fresh(".m4a"); final = fresh(".mp4")
            data = None
            try:
                subprocess.run([BIN_VIDEO, master, video, text, emotion_name, "720", "1280", "24", "10"],
                               capture_output=True, text=True, timeout=240)
                subprocess.run(["/usr/bin/say", "-v", voice, "-o", raw, text],
                               capture_output=True, text=True, timeout=60)
                subprocess.run(["/usr/bin/afconvert", "-f", "m4af", "-d", "aac@44100", "-b", "96000", "-c", "1", raw, aac],
                               capture_output=True, text=True, timeout=60)
                subprocess.run([BIN_MUX, video, aac, final],
                               capture_output=True, text=True, timeout=120)
                with open(final, "rb") as f:
                    data = f.read()
            finally:
                for p in (video, raw, aac, final):
                    if os.path.exists(p):
                        try: os.unlink(p)
                        except OSError: pass

            if not data:
                self.send_response(500)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"make-send failed")
                return

            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition", 'attachment; filename="%s.mp4"' % item)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
        finally:
            SEM.release()

port = int(os.environ.get("PORT", "8000"))
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
print("make-send server on 0.0.0.0:%d (concurrent=%d) master_root=%s" % (port, MAX_CONCURRENT, BASE))
httpd.serve_forever()
