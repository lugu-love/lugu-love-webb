// 阶段0：前场过渡逐帧抓屏。自动走完“心星→瓶内→打字”，在前场过渡窗口做高频截帧。
// 输出：<out>/frame-%04d.jpg + timeline.json（帧时间戳 + DOM 状态时间线）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (n, d) => { const h = process.argv.find((v) => v.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };

const BASE = arg("base", "https://lugu-love.github.io/lugu-love-webb/candidate-20260920-frontstage-preload-r1/");
const ITEM = arg("item", "rabbit-happy");
const LABEL = arg("label", "run");
const OUT = path.join(import.meta.dirname, "flash-frames", LABEL);
const CAPTURE_MS = Number(arg("capture", "16000"));
const PRE_ROLL_MS = Number(arg("preroll", "1200"));
const CPU_RATE = Number(arg("cpu", "1"));                 // 1 = 不限速；4 ≈ 中端手机
const NET = arg("net", "off");                            // off | fast3g | slow4g
const UA = "Mozilla/5.0 (Linux; Android 12; NOH-AN00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 HuaweiBrowser/14.0.0.302 Mobile Safari/537.36";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const ud = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lugu-flash-"));
const port = 9200 + Math.floor(Math.random() * 500);
const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
  "--autoplay-policy=no-user-gesture-required", "--no-proxy-server", "--hide-scrollbars",
  `--remote-debugging-port=${port}`, `--user-data-dir=${ud}`, "about:blank"], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 150 && !wsUrl; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); wsUrl = (l.find(t => t.type === "page" && t.webSocketDebuggerUrl) || {}).webSocketDebuggerUrl; } catch (e) {}
  if (!wsUrl) await sleep(200);
}
const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));

let id = 0;
const pending = new Map();
const frames = [];
let capturing = false;
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    return;
  }
  if (m.method === "Page.screencastFrame") {
    const { data, sessionId, metadata } = m.params;
    if (capturing) frames.push({ idx: frames.length, ts: metadata.timestamp, b64: data });
    send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  }
});
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res, rej) => {
    pending.set(i, { resolve: res, reject: rej });
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + method)); } }, 60000);
  });
};
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
window.__probe={alignTargetTime:null,phaseAlignedAt:null,swapSeq:0,swapAt:null,swapFromVideo:null,swapToVideo:null,visibleSeek:[],media:[],dom:[]};
const P=HTMLMediaElement.prototype;
const d=Object.getOwnPropertyDescriptor(P,"currentTime");
const isVisible=function(el){const cs=getComputedStyle(el);return cs.visibility!=="hidden"&&Number(cs.opacity)>0.5;};
const isBuf=function(el){return String(el.className||"").includes("is-buffer");};
Object.defineProperty(P,"currentTime",{get:d.get,set:function(v){
try{
const who=isBuf(this)?"buffer":"active";
window.__probe.media.push([performance.now(),"seek",who,+Number(v).toFixed(3),isVisible(this)]);
if(!isBuf(this)&&isVisible(this)) window.__probe.visibleSeek.push([performance.now(),+Number(v).toFixed(3)]);
if(isBuf(this)) window.__probe.alignTargetTime=+Number(v).toFixed(3);
}catch(e){}
return d.set.call(this,v);}});
document.addEventListener("seeked",function(e){try{if(e.target.tagName!=="VIDEO")return;const b=isBuf(e.target);
window.__probe.media.push([performance.now(),b?"buf.seeked":"active.seeked",b?"buffer":"active",+e.target.currentTime.toFixed(3),0]);
if(b&&e.target.readyState>=2&&e.target.videoWidth>0&&!e.target.error&&window.__probe.phaseAlignedAt===null) window.__probe.phaseAlignedAt=performance.now();
}catch(e){}},true);
const mo=new MutationObserver(function(ms){for(const m of ms){try{const el=m.target;if(el&&el.tagName==="VIDEO"){const vis=String(el.style.visibility||""),op=String(el.style.opacity||"");
const last=window.__probe.dom.filter(function(x){return x[0]==="video"}).slice(-1)[0]||[];
if(!last[1]||last[2]!==vis||last[3]!==op){window.__probe.swapSeq+=1;window.__probe.swapAt=performance.now();window.__probe.swapToVideo=isBuf(el)?"buffer":"active";window.__probe.swapFromVideo=(window.__probe.swapToVideo==="buffer")?"active":"buffer";}
window.__probe.dom.push(["video",vis,op,performance.now()]);}
else if(el&&el.nodeType===1){window.__probe.dom.push([String(el.className).slice(0,60),String(el.style.transform||"").slice(0,60),String(el.style.opacity||""),performance.now()]);}
}catch(e){}}});
setTimeout(function(){try{mo.observe(document.documentElement,{attributes:true,attributeFilter:["class","style","transform","opacity","visibility"],subtree:true});}catch(e){}},300);
` });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
await send("Emulation.setUserAgentOverride", { userAgent: UA, platform: "Linux armv8l" });
if (CPU_RATE > 1) {
  await send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
  console.log(`CPU 限速 ${CPU_RATE}x`);
}
if (NET !== "off") {
  const profiles = {
    fast3g: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
    slow4g: { offline: false, latency: 100, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 }
  };
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", profiles[NET] || profiles.fast3g);
  console.log(`网络限速 ${NET}`);
}

const url = BASE + "?item=" + ITEM;
await send("Page.navigate", { url });

// 1) 轻抚心星
let clicked = false;
for (let i = 0; i < 40 && !clicked; i++) {
  await sleep(1000);
  try { clicked = await ev(`(()=>{const s=document.querySelector('.voice-star')||document.querySelector('.launched-heart-star');if(!s)return false;s.click();return true;})()`); } catch (e) {}
}
console.log(`star clicked = ${clicked}`);

// 2) 等文案打完（进入大瓶前的最后一步）
const state = `JSON.stringify((()=>{const b=document.querySelector('.voice-bottle');const d=b?b.dataset:{};const c=document.querySelector('.voice-letter-text');const cv=document.querySelector('.fengxin-rabbit-demo');const cs=cv?getComputedStyle(cv):null;return {copyLen:c?c.textContent.length:-1,zoom:d.zoomLevel??null,released:d.rabbitReleased??null,canvasPos:cs?cs.position:null,expanded:!!document.querySelector('.rabbit-expanded'),bufferSwapCount:d.bufferSwapCount??null,bufferReason:d.bufferReason??null,videos:document.querySelectorAll('.fengxin-rabbit-crop > video').length};})())`;
let last = null, stable = 0;
for (let i = 0; i < 120; i++) {
  await sleep(500);
  const s = JSON.parse(await ev(state));
  if (s.copyLen > 0 && s.copyLen === last?.copyLen) { stable++; if (stable >= 2) { console.log(`copy done (${s.copyLen} 字)`); break; } }
  else stable = 0;
  last = s;
}

// 3) 前场过渡窗口逐帧抓屏
const domTimeline = [];
const domPoller = setInterval(async () => {
  try { domTimeline.push({ t: Date.now(), ...JSON.parse(await ev(state)) }); } catch (e) {}
}, 120);

await sleep(PRE_ROLL_MS);
await send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
capturing = true;
const t0 = Date.now();
console.log(`capturing ${CAPTURE_MS} ms ...`);
await sleep(CAPTURE_MS);
capturing = false;
await send("Page.stopScreencast").catch(() => {});
clearInterval(domPoller);
const t1 = Date.now();

// 4) 落盘
const baseTs = frames.length ? frames[0].ts : 0;
const meta = frames.map((f) => ({ idx: f.idx, ts: f.ts, ms: Math.round((f.ts - baseTs) * 1000) }));
frames.forEach((f, i) => {
  fs.writeFileSync(path.join(OUT, `frame-${String(i).padStart(4, "0")}.jpg`), Buffer.from(f.b64, "base64"));
});
fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify({
  label: LABEL, url, item: ITEM,
  cpuRate: CPU_RATE, net: NET,
  captureStart: t0, captureEnd: t1, frameCount: frames.length,
  fpsMeasured: frames.length / ((t1 - t0) / 1000),
  frames: meta,
  dom: domTimeline.map((d) => ({ ms: d.t - t0, copyLen: d.copyLen, zoom: d.zoom, released: d.released, canvasPos: d.canvasPos, expanded: d.expanded, bufferSwapCount: d.bufferSwapCount ?? null, bufferReason: d.bufferReason ?? null, videos: d.videos ?? null }))
}, null, 2));
try {
  const probe = JSON.parse(await ev(`JSON.stringify(window.__probe||{})`));
  fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify({ label: LABEL, url, probe }, null, 2));
  console.log(`evidence: visibleSeek=${(probe.visibleSeek || []).length} phaseAlignedAt=${probe.phaseAlignedAt ? Math.round(probe.phaseAlignedAt) : null} swapSeq=${probe.swapSeq} swapAt=${probe.swapAt ? Math.round(probe.swapAt) : null} from=${probe.swapFromVideo} to=${probe.swapToVideo}`);
} catch (e) {
  console.log("evidence dump failed: " + e.message.slice(0, 80));
}
console.log(`frames=${frames.length}  measured fps=${(frames.length / ((t1 - t0) / 1000)).toFixed(1)}  -> ${OUT}`);

ws.close();
child.kill();
