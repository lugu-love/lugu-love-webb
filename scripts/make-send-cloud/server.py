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
import html

from text_layout import layout_lines, has_unsupported
from tts_provider import make_tts_provider, ElevenLabsProvider
import journey_store

ROOT = os.path.dirname(os.path.abspath(__file__))
MASTERS_DIR = os.path.join(ROOT, "masters")
MANIFEST_FILE = os.path.join(ROOT, "emotion-manifest.json")
POC_SAMPLE_FILE = os.path.join(ROOT, "poc", "sample.mp4")
FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FONT_FILE = os.environ.get("FONT_FILE", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
FONT_INDEX = int(os.environ.get("FONT_INDEX", "2"))
FONT_FC = os.environ.get("FONT_FC", "Noto Sans CJK SC")

# 兜底映射：仅当 emotion-manifest.json 缺失/损坏时使用。
_FALLBACK_MASTERS = {
    "rabbit-happy":     ("happy-master-v2.mp4", "开心"),
    "rabbit-aggrieved": ("wronged-master-v2.mp4", "委屈"),
    "rabbit-angry":     ("angry-master-v2.mp4", "生气"),
    "rabbit-playful":   ("playful-master-v2.mp4", "调皮"),
}
_FALLBACK_JOURNEY_META = {
    "rabbit-happy":     ("fengxin-rabbit", "happy"),
    "rabbit-aggrieved": ("fengxin-rabbit", "wronged"),
    "rabbit-angry":     ("fengxin-rabbit", "angry"),
    "rabbit-playful":   ("fengxin-rabbit", "playful"),
}


def _load_emotion_manifest():
    """读取统一映射 emotion-manifest.json；失败返回 {}，交由兜底逻辑处理。"""
    try:
        with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
            return json.load(f).get("emotions") or {}
    except Exception:
        return {}


_emotions = _load_emotion_manifest()
MASTERS = {}
JOURNEY_META = {}
for _item_id, _e in _emotions.items():
    _master = _e.get("renderMaster")
    if _master:
        MASTERS[_item_id] = (_master, _e.get("label", _item_id))
    JOURNEY_META[_item_id] = (_e.get("characterId", "fengxin-rabbit"), _e.get("emotionId", _item_id))
if not MASTERS:
    MASTERS = dict(_FALLBACK_MASTERS)
if not JOURNEY_META:
    JOURNEY_META = dict(_FALLBACK_JOURNEY_META)

# 七星使者 · 测试声音池（ElevenLabs premade，voice_id 为稳定引用）
VOICE_LIBRARY = {
    "FGY2WhTYpPnrIDTdsKH5": "Laura",
    "cgSgspJ2msm6clMCkdW9": "Jessica",
    "EXAVITQu4vr4xnSDxMaL": "Sarah",
    "pFZP5JQG7iQjIQuC4Bku": "Lily",
    "hpp4J3VqNfWAUOO0d1Us": "Bella",
    "Xb7hH8MSUJpSbSDYk0k2": "Alice",
    "TX3LPaxmHKxFdv7VOQHJ": "Liam",
    "bIHbv24MWmeRgasZH58o": "Will",
    "pNInz6obpgDQGcFmaJgB": "Adam",
    "JBFqnCBsd6RMkjVDRZzb": "George",
    "cjVigY5qzO86Huf0OWal": "Eric",
    "nPczCjzI2devNBz1zQrb": "Brian",
    "pqHfZKP75CvOlQylNhV4": "Bill",
    # 风信兔 · 角色化测试候选（characters_animation，测试默认 Lulu，非最终角色声）
    "ocZQ262SsZb9RIxcQBOj": "Lulu",
    "lhTvHflPVOqgSWyuWQry": "Hina",
    "Jr72SE8p9OcJmr8hyX0D": "Chutki",
}
DEFAULT_VOICE_ID = "Jr72SE8p9OcJmr8hyX0D"  # Chutki（风信兔正式声音身份）

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
TEXT_MAX = int(os.environ.get("TEXT_MAX", "20"))
SAFE_WIDTH = 620
BASE_FONT_SIZE = 50
LINE_SPACING = 20
COPY_TOP = 480   # 首行 y = H - 480 = 800（V2 正文区，避开播放器控制区）
BOTTOM_MARGIN = 10
MAX_HEIGHT = 2 * BASE_FONT_SIZE + LINE_SPACING   # 最多 2 行 = 120

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
_app_videos = {}
_app_video_lock = threading.Lock()
DEFAULT_TEXT = "今天先开心，其他事情都给我排队。"
APP_VIDEO_TTL = int(os.environ.get("APP_VIDEO_TTL", "600"))
APP_VIDEO_MAX_READS = int(os.environ.get("APP_VIDEO_MAX_READS", "3"))
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "https://api.lugu.love").rstrip("/")
ANDROID_PACKAGE = "love.lugu.videosharepoc"
ANDROID_DEBUG_CERT_SHA256 = os.environ.get(
    "ANDROID_APP_CERT_SHA256",
    "3E:0B:BE:A2:D5:2C:BD:05:7E:84:FB:2D:E6:11:F9:6A:B5:AC:96:57:10:98:2E:A0:50:3F:AA:87:56:F1:2A:F7",
)

# JOURNEY_META 已由 emotion-manifest.json 统一派生（见上方 _load_emotion_manifest）。
APP_VIDEO_DIR = os.environ.get("APP_VIDEO_DIR", "/tmp/app-video-cache")


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


def store_app_video(data):
    os.makedirs(APP_VIDEO_DIR, exist_ok=True)
    now = time.time()
    with _app_video_lock:
        for token, record in list(_app_videos.items()):
            if record["expires"] <= now or record["reads"] <= 0:
                try:
                    os.remove(record["path"])
                except OSError:
                    pass
                _app_videos.pop(token, None)
        token = secrets.token_urlsafe(24)
        path = os.path.join(APP_VIDEO_DIR, token + ".mp4")
        with open(path, "wb") as f:
            f.write(data)
        _app_videos[token] = {
            "path": path,
            "expires": now + APP_VIDEO_TTL,
            "reads": APP_VIDEO_MAX_READS,
        }
    return token


def take_app_video(token):
    now = time.time()
    with _app_video_lock:
        record = _app_videos.get(token)
        if not record or record["expires"] <= now or record["reads"] <= 0:
            if record:
                try:
                    os.remove(record["path"])
                except OSError:
                    pass
                _app_videos.pop(token, None)
            return None
        record["reads"] -= 1
        return record["path"], record["expires"], record["reads"]


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


def build_speech_text(text, emotion):
    """自然优先：默认 speechText = displayText（原句原样朗读，不再做文本级情绪编排）。

    - 不做按字数中间切分；
    - 不固定插入省略号/停顿；
    - 不把末尾 1～3 个字拆出来；
    - 不按情绪套固定断句模板。

    原句本身有明确语义停顿（逗号/句号/问号/叹号）时原样保留，
    由 TTS 在该处自然停顿；无停顿则一口气自然读完整句。
    情绪差异交给母版画面与文案本身，不靠强制断句模拟。
    """
    return text


def generate(item, text, workdir, tts=None, voice_id=None, speech_text=None):
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
    if speech_text is None:
        speech_text = build_speech_text(text, _emotion)
    provider_used = "edge-tts"
    if voice_id and voice_id in VOICE_LIBRARY:
        try:
            ElevenLabsProvider(voice_id).synthesize(speech_text, tts_path)
            provider_used = "elevenlabs"
        except Exception as e:
            log("ELEVENLABS-FALLBACK voice=%s err=%s" % (voice_id, "%s: %s" % (type(e).__name__, e)))
            make_tts_provider("edge-tts").synthesize(speech_text, tts_path)
            provider_used = "edge-tts-fallback"
    else:
        if voice_id:
            log("UNKNOWN-VOICE voice=%s fallback=edge-tts" % voice_id)
            provider_used = "edge-tts-fallback"
        (tts or make_tts_provider("edge-tts")).synthesize(speech_text, tts_path)
    meta["tts"] = time.time() - t0
    meta["tts_provider"] = provider_used
    meta["voice_id"] = voice_id or ""

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
        self.send_header(
            "Access-Control-Expose-Headers",
            "X-Video-Path, X-Video-Expires-In, X-Video-Id, X-Journey-Id, "
            "X-Parent-Video-Id, X-Generation, X-Remix-Entry",
        )

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

    def _send_assetlinks(self):
        return self._send_json(200, [{
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": ANDROID_PACKAGE,
                "sha256_cert_fingerprints": [ANDROID_DEBUG_CERT_SHA256],
            },
        }])

    def _send_remix_landing(self, share_code):
        if not share_code or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in share_code):
            return self._not_found()
        safe_code = html.escape(share_code, quote=True)
        page = """<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>七星使者 · 我也做一条</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c18;color:#eef0ff;font-family:-apple-system,'PingFang SC',sans-serif}.card{width:min(86vw,390px);padding:30px 22px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:#17192e;text-align:center}h1{margin:0;font-size:23px}p{margin:14px 0 24px;color:#aeb3d1;line-height:1.7}.btn{width:100%%;height:50px;border:0;border-radius:15px;background:linear-gradient(135deg,#7d8bff,#a06bff);color:#fff;font-size:16px;font-weight:650}.status{min-height:22px;margin-top:12px;color:#9aa0c3;font-size:13px}</style></head><body><main class=\"card\"><h1>七星使者</h1><p>喜欢这条情绪？<br>换成你的话，做一个自己的版本。</p><button class=\"btn\" id=\"open\">打开情绪编辑工具</button><div class=\"status\" id=\"status\"></div></main><script>
var b=document.getElementById('open'),s=document.getElementById('status');b.onclick=async function(){b.disabled=true;s.textContent='正在打开…';try{var r=await fetch('/journey/remix-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({share_code:'%s'})});var d=await r.json();if(!r.ok)throw new Error(d.error||'failed');location.href=d.open_url}catch(e){s.textContent='暂时无法打开，请稍后重试。';b.disabled=false}};
</script></body></html>""" % safe_code
        self._send_html(page)

    def _send_remix_open_fallback(self, token):
        if not token or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in token):
            return self._not_found()
        safe_token = html.escape(token, quote=True)
        page = """<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>打开情绪编辑工具</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c18;color:#eef0ff;font-family:-apple-system,'PingFang SC',sans-serif}.card{width:min(86vw,390px);padding:34px 22px;border-radius:22px;background:#17192e;text-align:center}h2{margin:0 0 16px;font-size:24px}p{color:#aeb3d1;line-height:1.7}.btn{display:grid;place-items:center;height:50px;border-radius:15px;background:linear-gradient(135deg,#7d8bff,#a06bff);color:#fff;text-decoration:none;font-weight:650}.wechat-guide{display:none}.wechat-guide p{margin:0 0 20px;font-size:16px;color:#d3d6e8}.real-icon{display:block;width:84px;height:84px;margin:0 auto 8px;border-radius:18px;box-shadow:0 12px 28px rgba(0,0,0,.30)}.icon-label{color:#979dbb;font-size:12px;font-style:italic}.is-wechat .wechat-guide{display:block}.is-wechat .normal-copy,.is-wechat .btn{display:none}
</style></head><body><main class=\"card\"><h2 class=\"normal-copy\">打开情绪编辑工具</h2><p class=\"normal-copy\">如果编辑工具已安装，请点击下面的按钮继续。</p><div class=\"wechat-guide\"><p>点右上角“…” ，选择这个</p><svg class=\"real-icon\" viewBox=\"0 0 48 48\" role=\"img\" aria-label=\"在浏览器中打开图标\"><path fill=\"#17192E\" d=\"M8 4h32a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z\"/><path fill=\"#8E82FF\" d=\"M24 10l3.1 7.7 8.2-.6-6.3 5.3 3.1 7.6-7-4.3-6.3 5.3 2-8-7-4.3 8.2-.6z\"/><circle cx=\"24\" cy=\"24\" r=\"8\" fill=\"#fff\" opacity=\".22\"/></svg><div class=\"icon-label\">在浏览器中打开</div></div><a class=\"btn\" href=\"lugu://remix/%s\">打开情绪编辑工具</a></main><script>if(/MicroMessenger/i.test(navigator.userAgent)&&/Android/i.test(navigator.userAgent))document.body.classList.add('is-wechat');</script></body></html>""" % safe_token
        self._send_html(page)

    def _send_poc_sample(self):
        try:
            with open(POC_SAMPLE_FILE, "rb") as f:
                body = f.read()
        except OSError:
            return self._send_json(404, {"error": "poc sample not found"})
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", 'inline; filename="sample.mp4"')
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        self.wfile.write(body)

    def _send_app_video(self, token):
        if not token or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in token):
            return self._not_found()
        result = take_app_video(token)
        if not result:
            return self._send_json(410, {"error": "video expired or unavailable"})
        path, expires, reads_left = result
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            return self._send_json(410, {"error": "video unavailable"})
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", 'inline; filename="emotion-video.mp4"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Video-Expires-In", str(max(0, int(expires - time.time()))))
        self.send_header("X-Video-Reads-Left", str(reads_left))
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
        if path == "/.well-known/assetlinks.json":
            return self._send_assetlinks()
        if path.startswith("/r/"):
            return self._send_remix_landing(path[len("/r/"):])
        if path.startswith("/remix/open/"):
            return self._send_remix_open_fallback(path[len("/remix/open/"):])
        if path.startswith("/journey/remix-token/"):
            token = path[len("/journey/remix-token/"):]
            try:
                result = journey_store.resolve_remix_token(token, record_open=True, source_channel="android_editor")
            except journey_store.JourneyUnavailable as error:
                return self._send_json(503, {"error": str(error)})
            if not result:
                return self._send_json(410, {"error": "remix token expired or unavailable"})
            return self._send_json(200, result)
        if path.startswith("/journey/videos/") and path.endswith("/children"):
            video_id = path[len("/journey/videos/"):-len("/children")]
            try:
                result = journey_store.get_children(video_id)
            except (journey_store.JourneyUnavailable, ValueError) as error:
                return self._send_json(503 if isinstance(error, journey_store.JourneyUnavailable) else 400, {"error": str(error)})
            return self._send_json(200, {"parent_video_id": video_id, "children": result})
        if path.startswith("/journey/videos/"):
            try:
                result = journey_store.get_video(path[len("/journey/videos/"):])
            except (journey_store.JourneyUnavailable, ValueError) as error:
                return self._send_json(503 if isinstance(error, journey_store.JourneyUnavailable) else 400, {"error": str(error)})
            return self._send_json(200, result) if result else self._not_found()
        if path == "/poc/sample.mp4":
            return self._send_poc_sample()
        if path.startswith("/app-video/") and path.endswith(".mp4"):
            return self._send_app_video(path[len("/app-video/"):-4])
        if path == "/admin":
            return self._send_html(ADMIN_HTML)
        if path == "/make-send":
            qs = urllib.parse.parse_qs(parsed.query)
            app_bridge = qs.get("app_bridge", [""])[0] == "1"
            journey_v1 = qs.get("journey_v1", [""])[0] == "1"
            voice_id = (qs.get("voice") or qs.get("voiceId") or [""])[0] or DEFAULT_VOICE_ID
            speech_text = (qs.get("speechText") or qs.get("speech_text") or [""])[0] or None
            return self._serve(
                qs.get("text", [""])[0], qs.get("item", ["rabbit-happy"])[0], app_bridge,
                journey_v1, qs.get("remix_token", [""])[0], qs.get("source_channel", ["h5"])[0],
                voice_id, speech_text,
            )
        return self._not_found()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/admin/login":
            return self._admin_login()
        if path == "/admin/toggle":
            return self._admin_toggle()
        if path == "/journey/remix-token":
            data = self._read_json_body()
            if data is None:
                return self._send_json(400, {"error": "bad request"})
            try:
                token = journey_store.create_remix_token(data.get("share_code", "") or "")
            except journey_store.JourneyUnavailable as error:
                return self._send_json(503, {"error": str(error)})
            if not token:
                return self._not_found()
            return self._send_json(201, {
                "remix_token": token,
                "open_url": "%s/remix/open/%s" % (PUBLIC_BASE_URL, token),
                "expires_in": journey_store.TOKEN_TTL_SECONDS,
            })
        if path == "/journey/events":
            data = self._read_json_body()
            if data is None:
                return self._send_json(400, {"error": "bad request"})
            try:
                ok = journey_store.record_event(data.get("video_id", ""), data.get("event_type", ""), data.get("source_channel", "h5"))
            except (journey_store.JourneyUnavailable, ValueError) as error:
                return self._send_json(503 if isinstance(error, journey_store.JourneyUnavailable) else 400, {"error": str(error)})
            return self._send_json(201, {"recorded": True}) if ok else self._not_found()
        if path == "/make-send":
            data = self._read_json_body()
            if data is None:
                return self._send_json(400, {"error": "bad request"})
            voice_id = data.get("voice") or data.get("voiceId") or DEFAULT_VOICE_ID
            speech_text = data.get("speechText") or data.get("speech_text") or None
            return self._serve(
                data.get("text", "") or "", data.get("item", "rabbit-happy") or "rabbit-happy",
                bool(data.get("app_bridge")), bool(data.get("journey_v1")),
                data.get("remix_token", "") or "", data.get("source_channel", "h5") or "h5",
                voice_id, speech_text,
            )
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

    def _serve(self, text, item, app_bridge=False, journey_v1=False, remix_token="", source_channel="h5", voice_id=None, speech_text=None):
        if not read_enabled():
            return self._send_json(503, {"error": "service temporarily unavailable"})
        start = time.time()
        text = (text or DEFAULT_TEXT).strip()
        if item not in MASTERS:
            item = "rabbit-happy"
        if len(text) > TEXT_MAX:
            return self._send_json(400, {"error": "TEXT_TOO_LONG", "message": "这句话有点长，当前版本建议缩短到 %d 字以内，效果会更自然。" % TEXT_MAX})
        if has_unsupported(text):
            return self._send_json(400, {"error": "暂不支持 emoji / 特殊符号，请使用文字、数字、标点"})
        if not rate_ok(self.client_address[0]):
            return self._send_json(429, {"error": "too many requests"})
        if not SEM.acquire(blocking=False):
            return self._send_json(429, {"error": "server busy"})

        workdir = None
        try:
            workdir = tempfile.mkdtemp(prefix="make-send-")
            final, meta = generate(item, text, workdir, voice_id=voice_id, speech_text=speech_text)
            with open(final, "rb") as f:
                data = f.read()
            journey_record = None
            if journey_v1:
                character_id, emotion_id = JOURNEY_META[item]
                try:
                    journey_record = journey_store.create_video(
                        character_id, emotion_id, source_channel, remix_token=remix_token or None,
                    )
                except journey_store.InvalidRemixToken as error:
                    return self._send_json(410, {"error": str(error)})
                except journey_store.JourneyUnavailable as error:
                    return self._send_json(503, {"error": str(error)})
            log("SUCCESS item=%s voice=%s tts_provider=%s text_len=%d lines=%d font=%d tts=%.2fs ffmpeg=%.2fs total=%.2fs size=%d"
                % (item, meta.get("voice_id") or "-", meta.get("tts_provider") or "-", len(text), meta["lines"], meta["font_size"], meta["tts"], meta["ffmpeg"],
                   time.time() - start, len(data)))
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Content-Disposition", 'attachment; filename="%s.mp4"' % item)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-TTS-Provider", meta.get("tts_provider", ""))
            self.send_header("X-TTS-Voice", meta.get("voice_id", ""))
            if app_bridge:
                token = store_app_video(data)
                self.send_header("X-Video-Path", "/app-video/%s.mp4" % token)
                self.send_header("X-Video-Expires-In", str(APP_VIDEO_TTL))
            if journey_record:
                self.send_header("X-Video-Id", journey_record["video_id"])
                self.send_header("X-Journey-Id", journey_record["journey_id"])
                self.send_header("X-Parent-Video-Id", journey_record["parent_video_id"] or "")
                self.send_header("X-Generation", str(journey_record["generation"]))
                self.send_header("X-Remix-Entry", "%s/r/%s" % (PUBLIC_BASE_URL, journey_record["share_code"]))
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
