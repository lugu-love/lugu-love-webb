#!/usr/bin/env python3
"""七星使者 · 情绪表达 P3 云端版 /make-send + 测试站总开关控制台

预生成情绪母版 + 动态文字(drawtext) + TTS + FFmpeg mux。
Linux/FFmpeg 兼容，不依赖 macOS。当前仅支持三情绪 MVP。
"""
import hashlib
import http.server
import json
import os
import secrets
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

MASTERS = {
    "rabbit-happy":     ("happy-master.mp4", "开心"),
    "rabbit-aggrieved": ("wronged-master.mp4", "委屈"),
    "rabbit-angry":     ("angry-master.mp4", "生气"),
}

FPS = int(os.environ.get("FPS", "18"))
SERVICE_ENABLED = os.environ.get("SERVICE_ENABLED", "true").lower() in ("1", "true", "yes", "on")
SITE_STATE_FILE = os.environ.get("SITE_STATE_FILE", "/data/site_state.json")
ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()
ADMIN_SESSION_TTL = int(os.environ.get("ADMIN_SESSION_TTL", "3600"))
ADMIN_MAX_FAILS = int(os.environ.get("ADMIN_MAX_FAILS", "5"))
ADMIN_FAIL_WINDOW = int(os.environ.get("ADMIN_FAIL_WINDOW", "600"))
FFMPEG_THREADS = int(os.environ.get("FFMPEG_THREADS", "2"))
BITRATE_KBPS = int(os.environ.get("BITRATE_KBPS", "2500"))
W, H = 720, 1280
DURATION = 10
TEXT_MAX = int(os.environ.get("TEXT_MAX", "40"))
SAFE_WIDTH = int(W * 0.90)
BASE_FONT_SIZE = 52
LINE_SPACING = 12
COPY_TOP = 140
BOTTOM_MARGIN = 10
MAX_HEIGHT = COPY_TOP - BOTTOM_MARGIN

MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT", "2"))
RATE_WINDOW = float(os.environ.get("RATE_WINDOW", "60"))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "6"))
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")

SEM = threading.BoundedSemaphore(MAX_CONCURRENT)
_rates = {}
_rate_lock = threading.Lock()
_sessions = {}
_sessions_lock = threading.Lock()
_login_fails = {}
_login_lock = threading.Lock()
DEFAULT_TEXT = "今天先开心，其他事情都给我排队。"


def log(msg):
    print("[%s] %s" % (datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def read_enabled():
    """读取站点总开关；状态文件损坏/读取异常时安全关闭。"""
    if not SITE_STATE_FILE:
        return SERVICE_ENABLED
    try:
        with open(SITE_STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("enabled"), bool):
            return data["enabled"]
        log("STATE invalid content, disabling")
        return False
    except FileNotFoundError:
        return SERVICE_ENABLED
    except Exception as e:
        log("STATE read error (%s), disabling: %s" % (type(e).__name__, e))
        return False


def write_enabled(enabled):
    if not SITE_STATE_FILE:
        return
    d = os.path.dirname(SITE_STATE_FILE)
    if d:
        os.makedirs(d, exist_ok=True)
    data = {"enabled": bool(enabled), "updated_at": datetime.now().isoformat(), "updated_by": "admin"}
    tmp = SITE_STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, SITE_STATE_FILE)


def _sha256(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def login_allowed(ip):
    now = time.time()
    with _login_lock:
        ts = [t for t in _login_fails.get(ip, []) if now - t < ADMIN_FAIL_WINDOW]
        _login_fails[ip] = ts
        return len(ts) < ADMIN_MAX_FAILS


def record_login_fail(ip):
    with _login_lock:
        _login_fails.setdefault(ip, []).append(time.time())


def new_session():
    tok = secrets.token_urlsafe(24)
    with _sessions_lock:
        _sessions[tok] = time.time() + ADMIN_SESSION_TTL
    return tok


def session_valid(tok):
    with _sessions_lock:
        exp = _sessions.get(tok)
        if exp and time.time() < exp:
            return True
        if exp:
            _sessions.pop(tok, None)
        return False


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

    t0 = time.time()
    (tts or make_tts_provider()).synthesize(text, tts_path)
    meta["tts"] = time.time() - t0

    t0 = time.time()
    cmd = [
        FFMPEG, "-y", "-i", master, "-i", tts_path,
        "-filter_complex", filtergraph,
        "-map", vlabel, "-map", "1:a",
        "-threads", str(FFMPEG_THREADS),
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


ADMIN_HTML = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>七星使者 · 测试站控制</title>
<style>
body{margin:0;background:#0b0c18;color:#eef0ff;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{width:min(92vw,380px);background:#17192e;border-radius:18px;padding:28px 24px;box-shadow:0 8px 40px rgba(0,0,0,.4)}
h1{font-size:20px;font-weight:600;margin:0 0 6px}
.sub{color:#9aa0c3;font-size:13px;margin:0 0 20px}
.status{font-size:15px;padding:12px 14px;border-radius:12px;margin-bottom:16px;background:rgba(255,255,255,.05)}
.status.on{color:#a9e3a0}.status.off{color:#ff9aa6}
.row{margin-bottom:12px}
input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#12142a;color:#fff;font-size:15px;outline:none}
button{width:100%;padding:13px;border-radius:12px;border:none;font-size:16px;font-weight:650;cursor:pointer}
.btn-toggle{background:rgba(125,139,255,.18);color:#fff;border:1px solid rgba(125,139,255,.3)}
.btn-off{background:rgba(255,120,130,.16);color:#ffc7cd;border:1px solid rgba(255,120,130,.3)}
.hint{color:#9aa0c3;font-size:12px;margin-top:12px;text-align:center}
.err{color:#ff9aa6;font-size:12px;margin-top:8px;min-height:14px}
</style>
</head>
<body>
<div class="card">
<h1>七星使者 · 测试站控制</h1>
<p class="sub">总开关同时控制 send-test / railway-test / make-send</p>
<div class="status" id="status">读取状态中…</div>
<div class="row" id="loginBox"><input type="password" id="pwd" placeholder="管理密码" autocomplete="off"></div>
<div class="row" id="loginBtnWrap"><button onclick="doLogin()">登录</button></div>
<div class="row" id="toggleWrap" style="display:none"><button id="toggleBtn" onclick="doToggle()"></button></div>
<div class="err" id="err"></div>
<div class="hint">操作会即时写入后端状态，数秒内生效</div>
</div>
<script>
var token = sessionStorage.getItem('adm_token') || '';
var enabled = null;
function $(id){return document.getElementById(id);}
function setErr(s){$('err').textContent = s || '';}
function showLogin(){ $('loginBox').style.display='block'; $('loginBtnWrap').style.display='block'; $('toggleWrap').style.display='none'; }
function showToggle(){ $('loginBox').style.display='none'; $('loginBtnWrap').style.display='none'; $('toggleWrap').style.display='block'; }
function render(){
  var st=$('status');
  st.textContent = (enabled === true) ? '🟢 测试站开放中' : (enabled === false ? '🔴 测试站已关闭' : '读取状态中…');
  st.className = 'status ' + (enabled === true ? 'on' : 'off');
  var b=$('toggleBtn');
  if(enabled === true){ b.textContent='关闭测试站'; b.className='btn-off'; }
  else if(enabled === false){ b.textContent='开启测试站'; b.className='btn-toggle'; }
}
function refresh(){
  fetch('/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
    enabled = !!d.enabled; render();
  }).catch(function(){ setErr('无法读取状态'); });
}
function doLogin(){
  var pw=$('pwd').value;
  if(!pw){setErr('请输入密码');return;}
  fetch('/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})})
   .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
   .then(function(x){
     if(x.ok){ token=x.d.token; sessionStorage.setItem('adm_token',token); setErr(''); showToggle(); refresh(); }
     else { setErr(x.d.error||'登录失败'); }
   }).catch(function(){ setErr('登录请求失败'); });
}
function doToggle(){
  if(!token){ setErr('请先登录'); showLogin(); return; }
  fetch('/admin/toggle',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({enabled:!enabled})})
   .then(function(r){
     if(r.status===401){ token=''; sessionStorage.removeItem('adm_token'); setErr('会话过期，请重新登录'); showLogin(); return null; }
     return r.json().then(function(d){return {status:r.status,d:d};});
   })
   .then(function(x){ if(x){ if(x.status===200){ enabled=x.d.enabled; render(); setErr(''); } else { setErr(x.d.error||'操作失败'); } } })
   .catch(function(){ setErr('操作请求失败'); });
}
if(token){ showToggle(); }
refresh();
</script>
</body>
</html>"""


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "make-send-cloud/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, html):
        body = html.encode("utf-8")
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length else b""
        if not body:
            return {}
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:
            return None

    def _not_found(self):
        self._send_json(404, {"error": "not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/status":
            return self._send_json(200, {"enabled": read_enabled()})
        if path == "/admin":
            return self._send_html(ADMIN_HTML)
        if path == "/make-send":
            qs = urllib.parse.parse_qs(parsed.query)
            return self._serve(qs.get("text", [""])[0], qs.get("item", ["rabbit-happy"])[0])
        return self._not_found()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/admin/login":
            return self._admin_login()
        if path == "/admin/toggle":
            return self._admin_toggle()
        if path == "/make-send":
            data = self._read_json_body()
            if data is None:
                return self._send_json(400, {"error": "bad request"})
            return self._serve(data.get("text", "") or "", data.get("item", "rabbit-happy") or "rabbit-happy")
        return self._not_found()

    def _admin_login(self):
        data = self._read_json_body()
        if data is None:
            return self._send_json(400, {"error": "bad request"})
        ip = self.client_address[0]
        if not login_allowed(ip):
            log("ADMIN-LOGIN rate-limited ip=%s" % ip)
            return self._send_json(429, {"error": "too many login attempts"})
        if not ADMIN_PASSWORD_HASH:
            log("ADMIN-LOGIN unconfigured")
            return self._send_json(503, {"error": "admin not configured"})
        pw = data.get("password", "") or ""
        if not secrets.compare_digest(_sha256(pw), ADMIN_PASSWORD_HASH):
            record_login_fail(ip)
            log("ADMIN-LOGIN failed ip=%s" % ip)
            return self._send_json(401, {"error": "wrong password"})
        tok = new_session()
        log("ADMIN-LOGIN ok ip=%s" % ip)
        return self._send_json(200, {"token": tok})

    def _admin_toggle(self):
        auth = self.headers.get("Authorization", "") or ""
        tok = auth[7:] if auth.startswith("Bearer ") else ""
        if not tok or not session_valid(tok):
            return self._send_json(401, {"error": "unauthorized"})
        data = self._read_json_body()
        if data is None or not isinstance(data.get("enabled"), bool):
            return self._send_json(400, {"error": "bad request"})
        enabled = bool(data["enabled"])
        write_enabled(enabled)
        log("ADMIN-TOGGLE enabled=%s" % enabled)
        return self._send_json(200, {"enabled": enabled})

    def _serve(self, text, item):
        if not read_enabled():
            return self._send_json(503, {"error": "service temporarily unavailable"})
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
    log("start port=%d concurrent=%d masters=%s font=%s ffmpeg=%s state=%s"
        % (port, MAX_CONCURRENT, MASTERS_DIR, FONT_FILE, FFMPEG, SITE_STATE_FILE))
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
