// 视觉时序采集（仅测试工具）：瓶子/使者首次可见、使者是否已在瓶内裁切区
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://lugu-love.github.io/lugu-love-webb/candidate-20260927-frontstage-2c10-r1/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
const CASES = [
  { name: "风信兔", item: "rabbit-happy" },
  { name: "光尾狐", item: "fox-red-happy" },
  { name: "暖山熊", item: "nuanshan-bear-01-kaixin" },
  { name: "云栖考拉", item: "yunqi-koala-01-kaixin" }
];
const ud = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lugu-vs-"));
const port = 9500 + Math.floor(Math.random() * 300);
const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--no-proxy-server", "--hide-scrollbars",
  "--window-size=430,900", `--remote-debugging-port=${port}`, `--user-data-dir=${ud}`, "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 150 && !wsUrl; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); wsUrl = (l.find((t) => t.type === "page" && t.webSocketDebuggerUrl) || {}).webSocketDebuggerUrl; } catch (e) {} if (!wsUrl) await sleep(200); }
const ws = new WebSocket(wsUrl);
await new Promise((res) => ws.addEventListener("open", res, { once: true }));
let id = 0; const pending = new Map(); const errs = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
  if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.exception?.description || "").slice(0, 120));
});
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => { pending.set(i, { resolve: res, reject: rej }); setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error("timeout " + method)); } }, 60000); }); };
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
await send("Page.enable"); await send("Runtime.enable");
// rAF 采样器：只在被启动后记录；字段全部只读
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
window.__vs={active:false,samples:[],readyAt:null,bottleAt:null,charAt:null,insideAt:null};
// 有效可见：祖先链 opacity 累乘 + visibility/display + 与裁切区(clip)的交集覆盖率
const vis=function(el,clip){
try{
if(!el)return false;
let op=1,node=el;
while(node&&node.nodeType===1){const cs=getComputedStyle(node);if(cs.visibility==="hidden"||cs.display==="none")return false;op*=Number(cs.opacity||1);node=node.parentElement;}
if(op<0.5)return false;
const r=el.getBoundingClientRect();
if(!r.width||!r.height)return false;
let c=clip?clip.getBoundingClientRect():null;
if(!c)c={left:0,top:0,right:window.innerWidth,bottom:window.innerHeight};
const ix=Math.max(0,Math.min(r.right,c.right)-Math.max(r.left,c.left));
const iy=Math.max(0,Math.min(r.bottom,c.bottom)-Math.max(r.top,c.top));
return (ix*iy)/(r.width*r.height)>0.5;
}catch(e){return false;}};
const inside=function(a,b){return a.left>=b.left-1&&a.top>=b.top-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1&&a.width>0;};
const tick=function(){
try{
if(!window.__vs.active){requestAnimationFrame(tick);return;}
const b=document.querySelector('.voice-bottle');
const d=document.querySelector('.fengxin-rabbit-demo');
const c=document.querySelector('.fengxin-rabbit-crop');
const v=document.querySelector('.fengxin-rabbit-crop > video');
const t=performance.now();
const bv=!!b&&vis(b,null), dv=!!d&&vis(d,c);
const br=b?b.getBoundingClientRect():null, dr=d?d.getBoundingClientRect():null, cr=c?c.getBoundingClientRect():null;
if(bv&&!window.__vs.bottleAt) window.__vs.bottleAt=t;
if(dv&&!window.__vs.charAt) window.__vs.charAt=t;
if(dv&&cr&&dr&&inside(dr,cr)&&!window.__vs.insideAt) window.__vs.insideAt=t;
if(dv&&v&&v.readyState>=2&&!window.__vs.readyAt) window.__vs.readyAt=t;
window.__vs.samples.push({t:t, bv:bv, dv:dv, inCrop:(cr&&dr)?inside(dr,cr):null,
bottleRect:br?[Math.round(br.left),Math.round(br.top),Math.round(br.width),Math.round(br.height)]:null,
cropRect:cr?[Math.round(cr.left),Math.round(cr.top),Math.round(cr.width),Math.round(cr.height)]:null,
demoRect:dr?[Math.round(dr.left),Math.round(dr.top),Math.round(dr.width),Math.round(dr.height)]:null,
overflow:c?getComputedStyle(c).overflow:null,
state:(b&&b.__frontstage)?b.__frontstage.state.value:null});
}catch(e){}
requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
` });
await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 430, screenHeight: 900 });
await send("Emulation.setUserAgentOverride", { userAgent: UA, platform: "Win32" });
const results = [];
for (const c of CASES) {
  errs.length = 0;
  const plays = [];
  await send("Page.navigate", { url: BASE + "?item=" + c.item });
  await sleep(6000);
  for (let play = 1; play <= 2; play++) {
    if (play === 2) {
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) { await sleep(1000); try { ready = await ev(`(()=>{const b=document.querySelector('.voice-bottle');return !!(b&&b.dataset.rabbitFinalState==="1");})()`); } catch (e) {} }
    }
    await ev(`window.__vs={active:true,samples:[],readyAt:null,bottleAt:null,charAt:null,insideAt:null};`);
    const clicked = await ev(`(()=>{if(${play}===1){const s=document.querySelector('.voice-star');if(!s)return "no-star";s.click();return "star";}const b=document.querySelector('.voice-bottle');if(!b)return "no-bottle";b.click();return "bottle";})()`);
    await sleep(6000);
    const d = JSON.parse(await ev(`JSON.stringify(window.__vs)`));
    await ev(`window.__vs.active=false;`);
    const s = d.samples;
    const empty = s.filter((x) => x.bv && !x.dv).length;
    const outside = s.filter((x) => x.bv && x.dv && x.inCrop === false).length;
    plays.push({ play, clicked, bottleAt: d.bottleAt, charAt: d.charAt, insideAt: d.insideAt, readyAt: d.readyAt,
      d1: (d.charAt && d.bottleAt) ? Math.round(d.charAt - d.bottleAt) : null,
      d2: (d.insideAt && d.bottleAt) ? Math.round(d.insideAt - d.bottleAt) : null,
      emptyFrames: empty, outsideFrames: outside, samples: s.length });
  }
  results.push({ who: c.name, item: c.item, plays, errors: errs.slice(0, 2) });
  const p = plays;
  console.log(`${c.name}: 第一次 Δ1=${p[0].d1}ms Δ2=${p[0].d2}ms 空瓶帧=${p[0].emptyFrames} 瓶前帧=${p[0].outsideFrames} | 第二次 Δ1=${p[1].d1}ms Δ2=${p[1].d2}ms 空瓶帧=${p[1].emptyFrames} 瓶前帧=${p[1].outsideFrames}${errs.length ? " errs=" + errs[0] : ""}`);
}
fs.writeFileSync(path.join(import.meta.dirname, "visual-sync.json"), JSON.stringify(results, null, 2));
ws.close(); child.kill();

