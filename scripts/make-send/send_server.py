import http.server, ssl, os, subprocess, urllib.parse, tempfile, time, threading, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(ROOT, "..", ".."))
BIN_DIR = os.path.join(ROOT, "bin")

BASE = os.path.abspath(os.environ.get("MASTER_ROOT", os.path.join(PROJECT_ROOT, "assets", "seven-stars-library")))
BIN_VIDEO = os.environ.get("MAKE_SEND_MP4_BIN", os.path.join(BIN_DIR, "make-send-mp4"))
BIN_MUX = os.environ.get("MUX_AUDIO_BIN", os.path.join(BIN_DIR, "mux-audio"))

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

RATE_WINDOW = float(os.environ.get("RATE_WINDOW", "60"))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "6"))
_rates = {}
_rate_lock = threading.Lock()

# 注意：* 仅用于当前临时 MVP 真机测试。正式上线前应限制为正式站 Origin。
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")

def log(msg):
    print("[%s] %s" % (datetime.datetime.now().strftime("%H:%M:%S"), msg), flush=True)

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
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/make-send":
            self.send_response(404)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"not found")
            return

        start = time.time()
        qs = urllib.parse.parse_qs(parsed.query)
        text = (qs.get("text", [""])[0] or "今天先开心，其他事情都给我排队。")[:40]
        item = qs.get("item", ["rabbit-happy"])[0]
        if item not in MASTERS:
            item = "rabbit-happy"
        text_len = len(text)
        log("REQ /make-send item=%s text_len=%d" % (item, text_len))

        if not rate_ok(self.client_address[0]):
            log("RATE-LIMIT item=%s" % item)
            self.send_response(429)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"too many requests")
            return

        if not SEM.acquire(blocking=False):
            log("BUSY item=%s" % item)
            self.send_response(429)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"server busy")
            return

        data = None
        err = None
        try:
            master_rel, voice, emotion_name = MASTERS[item]
            master = os.path.join(BASE, master_rel)
            video = fresh(".mp4"); raw = fresh(".m4a"); aac = fresh(".m4a"); final = fresh(".mp4")

            r1 = subprocess.run([BIN_VIDEO, master, video, text, emotion_name, "720", "1280", "24", "10"],
                                capture_output=True, text=True, timeout=240)
            log("VIDEO item=%s rc=%d" % (item, r1.returncode))
            if r1.returncode != 0:
                raise RuntimeError("video synth rc=%d" % r1.returncode)

            r2 = subprocess.run(["/usr/bin/say", "-v", voice, "-o", raw, text],
                                capture_output=True, text=True, timeout=60)
            log("TTS item=%s rc=%d" % (item, r2.returncode))
            if r2.returncode != 0:
                raise RuntimeError("tts rc=%d" % r2.returncode)

            r3 = subprocess.run(["/usr/bin/afconvert", "-f", "m4af", "-d", "aac@44100", "-b", "96000", "-c", "1", raw, aac],
                                capture_output=True, text=True, timeout=60)
            log("AFCONVERT item=%s rc=%d" % (item, r3.returncode))
            if r3.returncode != 0:
                raise RuntimeError("afconvert rc=%d" % r3.returncode)

            r4 = subprocess.run([BIN_MUX, video, aac, final],
                                capture_output=True, text=True, timeout=120)
            log("MUX item=%s rc=%d" % (item, r4.returncode))
            if r4.returncode != 0:
                raise RuntimeError("mux rc=%d" % r4.returncode)

            with open(final, "rb") as f:
                data = f.read()
            log("SUCCESS item=%s size=%d total=%.2fs" % (item, len(data), time.time() - start))
        except Exception as e:
            err = "%s: %s" % (type(e).__name__, e)
            log("ERROR item=%s %s total=%.2fs" % (item, err, time.time() - start))
        finally:
            for p in (video, raw, aac, final):
                if os.path.exists(p):
                    try: os.unlink(p)
                    except OSError: pass

        if err or not data:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"make-send failed")
            SEM.release()
            return

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", 'attachment; filename="%s.mp4"' % item)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
        SEM.release()

port = int(os.environ.get("PORT", "8000"))
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
log("start port=%d concurrent=%d master_root=%s" % (port, MAX_CONCURRENT, BASE))
httpd.serve_forever()
