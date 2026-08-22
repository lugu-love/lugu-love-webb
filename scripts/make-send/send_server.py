
import http.server, ssl, os, subprocess, urllib.parse, tempfile, time

BASE = os.path.abspath("assets/seven-stars-library")
BIN_VIDEO = "/tmp/make-send-mp4"
BIN_MUX = "/tmp/mux-audio"

MASTERS = {
  "rabbit-happy":     ("fengxin-rabbit/master/happy.mp4", "Tingting"),
  "rabbit-aggrieved": ("fengxin-rabbit/master/aggrieved.mp4", "Tingting"),
  "rabbit-angry":     ("fengxin-rabbit/master/angry.mp4", "Tingting"),
  "rabbit-shy":       ("fengxin-rabbit/master/shy.mp4", "Tingting"),
  "fox-happy":        ("xinguang-fox/master/happy.mp4", "Tingting"),
  "fox-aggrieved":    ("xinguang-fox/master/aggrieved.mp4", "Tingting"),
  "fox-angry":        ("xinguang-fox/master/angry.mp4", "Tingting"),
  "fox-playful":      ("xinguang-fox/master/playful.mp4", "Tingting"),
}

_counter = iter(range(1000000))
def fresh(suffix):
    return os.path.join(tempfile.gettempdir(), f"send-{os.getpid()}-{next(_counter)}-{int(time.time()*1000)}{suffix}")

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/make-send":
            qs = urllib.parse.parse_qs(parsed.query)
            text = (qs.get("text", [""])[0] or "今天先开心，其他事情都给我排队。")[:40]
            item = qs.get("item", ["rabbit-happy"])[0]
            if item not in MASTERS:
                item = "rabbit-happy"
            master_rel, voice = MASTERS[item]
            master = os.path.join(BASE, master_rel)
            video = fresh(".mp4"); raw = fresh(".m4a"); aac = fresh(".m4a"); final = fresh(".mp4")
            try:
                subprocess.run([BIN_VIDEO, master, video, text, "", "720","1280","24","10","1600"], capture_output=True, text=True, timeout=240)
                subprocess.run(["/usr/bin/say", "-v", voice, "-o", raw, text], capture_output=True, text=True, timeout=60)
                subprocess.run(["/usr/bin/afconvert", "-f","m4af","-d","aac@44100","-b","96000","-c","1", raw, aac], capture_output=True, text=True, timeout=60)
                subprocess.run([BIN_MUX, video, aac, final], capture_output=True, text=True, timeout=120)
                with open(final, "rb") as f:
                    data = f.read()
            finally:
                for p in (video, raw, aac, final):
                    if os.path.exists(p):
                        try: os.unlink(p)
                        except OSError: pass
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition", 'attachment; filename="%s.mp4"' % item)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

port = int(os.environ.get("PORT", "8000"))
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
if os.environ.get("TLS") == "1":
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain("/tmp/codex-test-cert.pem", "/tmp/codex-test-key.pem")
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    print(f"HTTPS + /make-send(8 items) on 0.0.0.0:{port}")
else:
    print(f"HTTP + /make-send(8 items) on 0.0.0.0:{port}")
httpd.serve_forever()
