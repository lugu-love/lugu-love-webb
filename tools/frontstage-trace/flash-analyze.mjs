// 阶段0：闪烁分析。逐帧亮度(YAVG)+帧间差(tblend difference)，与 DOM 状态时间线对齐。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const arg = (n, d) => { const h = process.argv.find((v) => v.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const LABEL = arg("label", "cand-rabbit");
const DIR = path.join(import.meta.dirname, "flash-frames", LABEL);
const BRIGHT_JUMP = Number(arg("brightjump", "6"));   // 单帧平均亮度跳变阈值(0-255)
const DIFF_SPIKE = Number(arg("diffspike", "10"));    // 单帧帧差阈值(0-255)
const BLANK_RANGE = Number(arg("blankrange", "44"));  // YMAX-YMIN 小于此值视为近似单色(疑似空白/纯背景帧)

const ff = (args) => execFileSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 1 << 28 });
const src = path.join(DIR, "frame-%04d.jpg");

function stats(filter) {
  const out = ff(["-hide_banner", "-loglevel", "error", "-i", src, "-vf", filter, "-f", "null", "-"]);
  return out;
}
function parseStats(text) {
  const rows = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const fm = line.match(/^frame:(\d+)/);
    if (fm) { cur = { i: Number(fm[1]) }; rows.push(cur); continue; }
    const mm = line.match(/^lavfi\.signalstats\.(\w+)=([\d.]+)/);
    if (mm && cur) cur[mm[1]] = Number(mm[2]);
  }
  return rows;
}

const bright = parseStats(stats("signalstats,metadata=print:file=-"));
const diff = parseStats(stats("tblend=all_mode=difference,signalstats,metadata=print:file=-"));
// 白闪 / 黑闪：近白、近黑像素占比（YAVG/255）
const white = parseStats(stats("format=gray,geq=lum='if(gt(lum(X,Y),235),255,0)',signalstats,metadata=print:file=-"));
const black = parseStats(stats("format=gray,geq=lum='if(lt(lum(X,Y),20),255,0)',signalstats,metadata=print:file=-"));
// 角色区域（画面中部）局部指标
const CROP = "crop=200:520:95:160";
const center = parseStats(stats(`${CROP},signalstats,metadata=print:file=-`));
const centerDiff = parseStats(stats(`${CROP},tblend=all_mode=difference,signalstats,metadata=print:file=-`));

const tl = JSON.parse(fs.readFileSync(path.join(DIR, "timeline.json"), "utf8"));
const frameMs = tl.frames.map((f) => f.ms);
const domAt = (ms) => {
  let hit = null;
  for (const d of tl.dom) { if (d.ms <= ms) hit = d; else break; }
  return hit;
};

const n = Math.min(bright.length, diff.length);
const series = [];
for (let i = 0; i < n; i++) {
  series.push({
    i,
    ms: frameMs[i] ?? i * 20,
    y: bright[i].YAVG,
    ymin: bright[i].YMIN,
    ymax: bright[i].YMAX,
    d: diff[i].YAVG ?? 0
    ,
    whiteFrac: (white[i]?.YAVG ?? 0) / 255,
    blackFrac: (black[i]?.YAVG ?? 0) / 255,
    cy: center[i]?.YAVG ?? 0,
    cd: centerDiff[i]?.YAVG ?? 0
  });
}

// 亮度单帧跳变
for (let i = 1; i < series.length; i++) series[i].dy = series[i].y - series[i - 1].y;

const median = (arr) => { const a = [...arr].filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const mad = (arr) => { const m = median(arr); return median(arr.map((v) => Math.abs(v - m))); };

const ys = series.map((s) => s.y);
const ds = series.map((s) => s.d).slice(1);
for (let i = 1; i < series.length; i++) {
  series[i].dcy = series[i].cy - series[i - 1].cy;
  series[i].dwhite = series[i].whiteFrac - series[i - 1].whiteFrac;
  series[i].dblack = series[i].blackFrac - series[i - 1].blackFrac;
}
const medY = median(ys), madY = mad(ys);
const medD = median(ds), madD = mad(ds);
const medCy = median(series.map((s) => s.cy));
const medCd = median(series.map((s) => s.cd));

// 指标阈值：整屏/局部亮度跳变、白黑像素占比跳变、角色区帧差
const TH = {
  brightJump: BRIGHT_JUMP,
  centerJump: Number(arg("centerjump", "5")),
  whiteJump: Number(arg("whitejump", "0.02")),
  blackJump: Number(arg("blackjump", "0.05")),
  centerDiff: Number(arg("centerdiff", "12"))
};

const anomalies = { brightJump: [], diffSpike: [], blank: [], centerSpike: [], whiteSpike: [], blackSpike: [], consecutive: [] };
for (let i = 1; i < series.length; i++) {
  const s = series[i];
  if (Math.abs(s.dy) >= BRIGHT_JUMP) {
    // 一闪而回：下一帧往回走且幅度接近
    const next = series[i + 1];
    const isFlash = next && Math.sign(next.dy ?? 0) === -Math.sign(s.dy) && Math.abs(next.dy) >= Math.abs(s.dy) * 0.5;
    s.flash = isFlash;
    anomalies.brightJump.push({ i, ms: s.ms, dy: +s.dy.toFixed(2), y: +s.y.toFixed(2), nextDy: next ? +(next.dy ?? 0).toFixed(2) : null, oneFrameFlash: !!isFlash, dom: domAt(s.ms) });
  }
  if (s.d >= DIFF_SPIKE) anomalies.diffSpike.push({ i, ms: s.ms, d: +s.d.toFixed(2), dom: domAt(s.ms) });
  if (Number.isFinite(s.ymax) && Number.isFinite(s.ymin) && s.ymax - s.ymin <= BLANK_RANGE) {
    anomalies.blank.push({ i, ms: s.ms, range: +(s.ymax - s.ymin).toFixed(1), dom: domAt(s.ms) });
  }
  if (Math.abs(s.dcy ?? 0) >= TH.centerJump) anomalies.centerSpike.push({ i, ms: s.ms, dcy: +(s.dcy).toFixed(2), cy: +s.cy.toFixed(2), dom: domAt(s.ms) });
  if (Math.abs(s.dwhite ?? 0) >= TH.whiteJump) anomalies.whiteSpike.push({ i, ms: s.ms, dwhite: +(s.dwhite * 100).toFixed(2) + "%", dom: domAt(s.ms) });
  if (Math.abs(s.dblack ?? 0) >= TH.blackJump) anomalies.blackSpike.push({ i, ms: s.ms, dblack: +(s.dblack * 100).toFixed(2) + "%", dom: domAt(s.ms) });
}
// 连续异常帧（亮度跳变/帧差尖峰相邻 ≥2 帧）
const flagged = new Set([
  ...anomalies.brightJump.map((a) => a.i),
  ...anomalies.centerSpike.map((a) => a.i),
  ...anomalies.whiteSpike.map((a) => a.i),
  ...anomalies.blackSpike.map((a) => a.i)
]);
let run = [];
for (let i = 0; i < series.length; i++) {
  if (flagged.has(i)) run.push(i);
  else { if (run.length >= 2) anomalies.consecutive.push({ from: run[0], to: run[run.length - 1], frames: run.length }); run = []; }
}
if (run.length >= 2) anomalies.consecutive.push({ from: run[0], to: run[run.length - 1], frames: run.length });

const top = [...series].map((s) => ({ i: s.i, ms: s.ms, d: s.d, dom: domAt(s.ms) })).sort((a, b) => b.d - a.d).slice(0, 8);
const topCenterDiff = [...series].map((s) => ({ i: s.i, ms: s.ms, cd: s.cd, dom: domAt(s.ms) })).sort((a, b) => b.cd - a.cd).slice(0, 8);
const topJump = [...series].filter((s) => Number.isFinite(s.dy)).sort((a, b) => Math.abs(b.dy) - Math.abs(a.dy)).slice(0, 8)
  .map((s) => ({ i: s.i, ms: s.ms, dy: +s.dy.toFixed(2), flash: !!s.flash }));

const report = {
  label: LABEL, url: tl.url, frames: series.length, fps: +tl.fpsMeasured.toFixed(1),
  thresholds: { BRIGHT_JUMP, DIFF_SPIKE, BLANK_RANGE },
  stats: {
    yAvgMedian: +medY.toFixed(2), yAvgMad: +madY.toFixed(2),
    frameDiffMedian: +medD.toFixed(2), frameDiffMad: +madD.toFixed(2),
    centerYMedian: +medCy.toFixed(2), centerDiffMedian: +medCd.toFixed(2),
    maxAbsBrightJump: +Math.max(...series.filter((s) => Number.isFinite(s.dy)).map((s) => Math.abs(s.dy))).toFixed(2),
    maxFrameDiff: +Math.max(...series.map((s) => s.d)).toFixed(2),
    maxCenterJump: +Math.max(...series.filter((s) => Number.isFinite(s.dcy)).map((s) => Math.abs(s.dcy))).toFixed(2),
    maxCenterDiff: +Math.max(...series.map((s) => s.cd)).toFixed(2),
    maxWhiteJumpPct: +(Math.max(...series.filter((s) => Number.isFinite(s.dwhite)).map((s) => Math.abs(s.dwhite))) * 100).toFixed(2),
    maxBlackJumpPct: +(Math.max(...series.filter((s) => Number.isFinite(s.dblack)).map((s) => Math.abs(s.dblack))) * 100).toFixed(2)
  },
  counts: {
    brightJump: anomalies.brightJump.length,
    oneFrameFlash: anomalies.brightJump.filter((a) => a.oneFrameFlash).length,
    diffSpike: anomalies.diffSpike.length,
    blankLike: anomalies.blank.length,
    centerSpike: anomalies.centerSpike.length,
    whiteSpike: anomalies.whiteSpike.length,
    blackSpike: anomalies.blackSpike.length,
    consecutiveRuns: anomalies.consecutive.length
  },
  anomalies, topDiff: top, topCenterDiff, topJump
};

fs.writeFileSync(path.join(DIR, "flash-report.json"), JSON.stringify(report, null, 2));

console.log(`\n=== 闪烁测量 ${LABEL}`);
console.log(`帧数=${series.length}  实测fps=${report.fps}`);
console.log(`整屏亮度中位数=${report.stats.yAvgMedian}  整屏帧差中位数=${report.stats.frameDiffMedian}  角色区亮度中位数=${report.stats.centerYMedian}  角色区帧差中位数=${report.stats.centerDiffMedian}`);
console.log(`整屏亮度跳变(≥${TH.brightJump}): ${report.counts.brightJump}  角色区亮度跳变(≥${TH.centerJump}): ${report.counts.centerSpike}  白闪(≥${(TH.whiteJump*100).toFixed(0)}%): ${report.counts.whiteSpike}  黑闪(≥${(TH.blackJump*100).toFixed(0)}%): ${report.counts.blackSpike}`);
console.log(`帧差尖峰(≥${DIFF_SPIKE}): ${report.counts.diffSpike}  近似单色帧: ${report.counts.blankLike}  连续异常段: ${report.counts.consecutiveRuns}`);
console.log(`最大值: 整屏亮度跳变=${report.stats.maxAbsBrightJump}  角色区跳变=${report.stats.maxCenterJump}  角色区帧差=${report.stats.maxCenterDiff}  白闪=${report.stats.maxWhiteJumpPct}%  黑闪=${report.stats.maxBlackJumpPct}%`);
console.log("\n整屏帧差最大的 8 帧（时间/帧差/DOM状态）:");
for (const t of report.topDiff) console.log(`  #${t.i} ${t.ms}ms  d=${t.d.toFixed(1)}  ${JSON.stringify(t.dom ? { zoom: t.dom.zoom, pos: t.dom.canvasPos, expanded: t.dom.expanded } : null)}`);
console.log("\n角色区帧差最大的 8 帧:");
for (const t of report.topCenterDiff) console.log(`  #${t.i} ${t.ms}ms  cd=${t.cd.toFixed(1)}  ${JSON.stringify(t.dom ? { zoom: t.dom.zoom, pos: t.dom.canvasPos, expanded: t.dom.expanded } : null)}`);
console.log("\n亮度跳变最大的 8 帧:");
for (const t of report.topJump) console.log(`  #${t.i} ${t.ms}ms  dy=${t.dy}  ${t.flash ? "★闪一下即回" : ""}`);
console.log("\n连续异常段:");
for (const c of anomalies.consecutive) console.log(`  #${c.from}–#${c.to}（${c.frames} 帧）`);
