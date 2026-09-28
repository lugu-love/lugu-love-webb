import fs from "node:fs";
import path from "node:path";
const here = import.meta.dirname;
const labels = ["2i-rabbit-1x-r2","2i-rabbit-4x-1","2i-rabbit-4x-2","2i-rabbit-4x-3","2i-rabbit-4x-4","2i-rabbit-4x-5","2i-bear-4x"];
const out = [];
for (const label of labels) {
  const dir = path.join(here, "flash-frames", label);
  const ev = JSON.parse(fs.readFileSync(path.join(dir, "evidence.json"), "utf8")).probe;
  const tl = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
  const rep = JSON.parse(fs.readFileSync(path.join(dir, "flash-report.json"), "utf8"));
  const seeks = (ev.media || []).filter((m) => m[1] === "seek");
  const visSeeks = seeks.filter((m) => m[4] === true);
  const queued = (tl.dom || []).filter((d) => d.bufferReason === "reset-queued-visible");
  const after = (tl.dom || []).filter((d) => d.bufferReason === "reset-after-hidden");
  const all = [...(rep.anomalies.centerSpike||[]), ...(rep.anomalies.brightJump||[]), ...(rep.anomalies.whiteSpike||[]), ...(rep.anomalies.blackSpike||[]), ...(rep.anomalies.blank||[])];
  const fx = (tl.dom.find((d) => d.canvasPos === "fixed") || {}).ms ?? null;
  const fg = all.filter((a) => fx !== null && a.ms > fx + 300).map((a) => {
    const near = seeks.filter((s) => Math.abs(s[0] - a.ms) < 250).map((s) => `${s[2]}/${s[4] ? "visible" : "hidden"}@${Math.round(s[0])}`);
    return { ms: a.ms, dcy: a.dcy ?? null, near };
  });
  out.push({ label, visibleSeek: visSeeks.length, visTimes: visSeeks.map((m) => Math.round(m[0])), queued: queued.length, after: after.length,
    resetSeeks: seeks.filter((m) => Number(m[3]) === 0).map((m) => `${m[2]}/${m[4] ? "visible" : "hidden"}@${Math.round(m[0])}`),
    phaseAlignedAt: ev.phaseAlignedAt ? Math.round(ev.phaseAlignedAt) : null, swapAt: ev.swapAt ? Math.round(ev.swapAt) : null, fg });
}
for (const r of out) {
  console.log(`\n=== ${r.label}`);
  console.log(`  visibleSeek=${r.visibleSeek} ${r.visTimes.join(",")}`);
  console.log(`  reset-queued-visible=${r.queued}  reset-after-hidden=${r.after}`);
  console.log(`  phaseAlignedAt=${r.phaseAlignedAt}  swapAt=${r.swapAt}`);
  console.log(`  归零类 seek: ${r.resetSeeks.slice(-5).join(" | ")}`);
  console.log(`  前场异常=${r.fg.length} ${r.fg.map((a) => `${a.ms}ms(dcy=${a.dcy})`).join(", ")}`);
  for (const a of r.fg) console.log(`    ↳ ${a.ms}ms 附近 seek: ${a.near.join(" ; ") || "(无)"}`);
}
const totalVis = out.reduce((s, r) => s + r.visibleSeek, 0);
const totalFg = out.reduce((s, r) => s + r.fg.length, 0);
console.log(`\n===== 判定 =====`);
console.log(`visibleSeek 合计=${totalVis}  reset-after-hidden 合计=${out.reduce((s, r) => s + r.after, 0)}  前场异常合计=${totalFg}`);
console.log(totalVis > 0 ? "结论 A：仍有可见层 seek/reset → 机制未彻底封死，需继续修底层" : (totalFg > 0 ? "结论 B：visibleSeek=0，前场仍有异常 → 残留属于素材/内容相位/动画，不再围绕旧兔子深修" : "结论 C：全绿"));
