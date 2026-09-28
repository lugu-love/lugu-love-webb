// 2B 验收判据：过渡窗口异常帧 + 前场阶段异常帧
import fs from "node:fs";
import path from "node:path";
const arg = (n, d) => { const h = process.argv.find((v) => v.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const label = arg("label", "");
const dir = path.join(import.meta.dirname, "flash-frames", label);
const rep = JSON.parse(fs.readFileSync(path.join(dir, "flash-report.json"), "utf8"));
const tl = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const fixed = tl.dom.find((d) => d.canvasPos === "fixed");
const frameMs = tl.frames.map((f) => f.ms);
const swapIdx = fixed ? frameMs.findIndex((ms) => ms >= fixed.ms) : -1;
const PAD = 6;
const winFrom = Math.max(0, swapIdx - PAD), winTo = swapIdx + PAD;
const A = rep.anomalies;
const inWin = (a) => swapIdx >= 0 && a.i >= winFrom && a.i <= winTo;
const inFg = (a) => swapIdx >= 0 && a.i > winTo;
const all = [...A.brightJump, ...A.centerSpike, ...A.whiteSpike, ...A.blackSpike, ...A.blank];
const count = (fn) => all.filter(fn).length;
const out = {
  label, reachedForeground: !!fixed, swapMs: fixed ? fixed.ms : null,
  window: { from: winFrom, to: winTo, anomalies: swapIdx < 0 ? null : count(inWin) },
  foreground: { anomalies: swapIdx < 0 ? null : count(inFg) },
  残留明细: all.filter((a) => !inWin(a)).map((a) => `#${a.i}@${a.ms}ms ${a.dcy !== undefined ? "dcy=" + a.dcy : a.d !== undefined ? "d=" + a.d : ""}`).slice(0, 6)
};
console.log(JSON.stringify(out));
