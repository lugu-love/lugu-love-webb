
import http.server, ssl, os
port = int(os.environ.get("PORT","8443"))
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), http.server.SimpleHTTPRequestHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain("/tmp/codex-test-cert.pem", "/tmp/codex-test-key.pem")
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f"HTTPS serving on 0.0.0.0:{port}")
httpd.serve_forever()
