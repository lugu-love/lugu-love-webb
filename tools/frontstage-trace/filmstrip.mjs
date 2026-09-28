// 视觉证据收口：抓“瓶体有效可见”前后 ±1s 的连续浏览器画面（screencast）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://lugu-love.github.io/lugu-love-webb/candidate-20260927-frontstage-2c10-r1/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
const CASES = [
  { name: "rabbit", item: "rabbit-happy" },
  { name: "fox", item: "fox-red-happy" },
  { name: "bear", item: "nuanshan-bear-01-kaixin" },
  { name: "koala", item: "yunqi-koala-01-kaixin" }
];
const ROOT = path.join(import.meta.dirname, "filmstrip-2c10");
fs.rmSync(ROOT, { recursive: true, force: true });
const ud = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lugu-film-"));
const port = 9800 + Math.floor(Math.random() * 150);
const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--no-proxy-server", "--hide-scrollbars",
  "--window-size=430,900", `--remote-debugging-port=${port}`, `--user-data-dir=${ud}`, "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 150 && !wsUrl; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); wsUrl = (l.find((t) => t.type === "page" && t.webSocketDebuggerUrl) || {}).webSocketDebuggerUrl; } catch (e) {} if (!wsUrl) await sleep(200); }
const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));
let id = 0; const pending = new Map(); let frames = []; let capturing = false;
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
  if (m.method === "Page.screencastFrame") { const { data, sessionId, metadata } = m.params; if (capturing) frames.push({ ts: metadata.timestamp, b64: data }); send("Page.screencastFrameAck", { sessionId }).catch(() => {}); }
});
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => { pending.set(i, { resolve: res, reject: rej }); setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + method)); } }, 60000); }); };
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
await send("Page.enable"); await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
window.__fm={bottleAt:null,charAt:null};
const vis=function(el,clip){try{if(!el)return false;let op=1,n=el;while(n&&n.nodeType===1){const cs=getComputedStyle(n);if(cs.visibility==="hidden"||cs.display==="none")return false;op*=Number(cs.opacity||1);n=n.parentElement;}if(op<0.5)return false;const r=el.getBoundingClientRect();if(!r.width)return false;let c=clip?clip.getBoundingClientRect():{left:0,top:0,right:innerWidth,bottom:innerHeight};const ix=Math.max(0,Math.min(r.right,c.right)-Math.max(r.left,c.left)),iy=Math.max(0,Math.min(r.bottom,c.bottom)-Math.max(r.top,c.top));return (ix*iy)/(r.width*r.height)>0.5;}catch(e){return false;}};
const tick=function(){try{const b=document.querySelector('.voice-bottle'),d=document.querySelector('.fengxin-rabbit-demo'),c=document.querySelector('.fengxin-rabbit-crop');const t=performance.now();
if(!window.__fm.bottleAt&&vis(b,null))window.__fm.bottleAt=t;
if(!window.__fm.charAt&&vis(d,c))window.__fm.charAt=t;}catch(e){}requestAnimationFrame(tick);};requestAnimationFrame(tick);
` });
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 430, screenHeight: 900 });
await send("Emulation.setUserAgentOverride", { userAgent: UA, platform: "Win32" });
const summary = [];
for (const c of CASES) {
  const dir = path.join(ROOT, c.name);
  fs.mkdirSync(dir, { recursive: true });
  await send("Page.navigate", { url: BASE + "?item=" + c.item });
  let clicked = false;
  for (let i = 0; i < 30 && !clicked; i++) { await sleep(500); try { clicked = await ev(`(()=>{const s=document.querySelector('.voice-star');if(!s)return false;s.click();return true;})()`); } catch (e) {} }
  frames = []; capturing = true;
  await send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 430, maxHeight: 900, everyNthFrame: 1 });
  await sleep(5000);
  const fm = JSON.parse(await ev(`JSON.stringify(window.__fm)`));
  const t0 = Date.now();
  await sleep(1200);
  capturing = false;
  await send("Page.stopScreencast").catch(() => {});
  const base = frames.length ? frames[0].ts : 0;
  frames.forEach((f, i) => fs.writeFileSync(path.join(dir, `frame-${String(i).padStart(4, "0")}.jpg`), Buffer.from(f.b64, "base64")));
  const ms = frames.map((f) => Math.round((f.ts - base) * 1000));
  const bottleMs = fm.bottleAt ? Math.round(fm.bottleAt - (performance.now ? 0 : 0)) : null;
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ label: c.name, item: c.item, frameCount: frames.length, frame0Ts: base, bottleAtPerf: fm.bottleAt, charAtPerf: fm.charAt, ms }, null, 2));
  summary.push({ who: c.name, frames: frames.length, hasBottleAt: !!fm.bottleAt, hasCharAt: !!fm.charAt, bottleAtPerf: fm.bottleAt ? Math.round(fm.bottleAt) : null, charAtPerf: fm.charAt ? Math.round(fm.charAt) : null });
  console.log(`${c.name}: 抓帧=${frames.length} 瓶体有效可见(perf)=${fm.bottleAt ? Math.round(fm.bottleAt) : "?"}ms 使者有效可见=${fm.charAt ? Math.round(fm.charAt) : "?"}ms 时间差=${(fm.bottleAt && fm.charAt) ? Math.round(fm.charAt - fm.bottleAt) : "?"}ms -> filmstrip-2c10/${c.name}/`);
}
console.log("\n截图目录: " + ROOT);
ws.close(); child.kill();
