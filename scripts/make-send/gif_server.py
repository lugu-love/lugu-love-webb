
import http.server, ssl, os, subprocess, urllib.parse, tempfile

MASTER = "assets/seven-stars-library/fengxin-rabbit/master/happy.mp4"
SWIFT = "/tmp/make-send-gif-text.swift"
EMOTION = "开心"

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/make-gif":
            qs = urllib.parse.parse_qs(parsed.query)
            text = (qs.get("text", [""])[0] or "今天先开心，其他事情都给我排队。")[:40]
            quality = qs.get("q", ["B"])[0]
            if quality not in ("A", "B", "C"):
                quality = "B"
            fd, tmp = tempfile.mkstemp(suffix=".gif")
            os.close(fd)
            try:
                r = subprocess.run(["swift", SWIFT, MASTER, tmp, text, EMOTION, quality],
                                   capture_output=True, text=True, timeout=180)
                with open(tmp, "rb") as f:
                    data = f.read()
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition", 'attachment; filename="fengxin-rabbit-happy.gif"')
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

port = int(os.environ.get("PORT", "8443"))
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain("/tmp/codex-test-cert.pem", "/tmp/codex-test-key.pem")
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f"HTTPS + /make-gif serving on 0.0.0.0:{port}")
httpd.serve_forever()
