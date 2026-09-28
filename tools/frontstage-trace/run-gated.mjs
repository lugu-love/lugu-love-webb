// 采集一致性闸门：构建指纹校验 + videos=2 + swap>=1，否则该次采集判废并重试一次
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const DIR = "candidate-20260927-frontstage-2c4-r1";
const BASE = `https://lugu-love.github.io/lugu-love-webb/${DIR}/`;
const cases = [
  { label: "2g-rabbit-1x", item: "rabbit-happy", cpu: 1 },
  { label: "2g-rabbit-4x-1", item: "rabbit-happy", cpu: 4 },
  { label: "2g-rabbit-4x-2", item: "rabbit-happy", cpu: 4 },
  { label: "2g-rabbit-4x-3", item: "rabbit-happy", cpu: 4 },
  { label: "2g-rabbit-4x-4", item: "rabbit-happy", cpu: 4 },
  { label: "2g-rabbit-4x-5", item: "rabbit-happy", cpu: 4 },
  { label: "2g-bear-4x", item: "nuanshan-bear-01-kaixin", cpu: 4 }
];

const raw = execFileSync("curl.exe", ["-s", BASE], { encoding: "utf8", maxBuffer: 1 << 28 });
const buildHash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12);
const releaseId = (raw.match(/name="lugu-release-id" content="([^"]+)"/) || [])[1] || "?";
console.log(`构建指纹: ${DIR}  releaseId=${releaseId}  sha256=${buildHash}  bytes=${raw.length}`);

const rows = [];
for (const c of cases) {
  let attempt = 0, rec = null;
  while (attempt < 2 && !rec) {
    attempt++;
    const label = c.label + (attempt > 1 ? "-r" + attempt : "");
    const t0 = Date.now();
    execFileSync(process.execPath, [path.join(here, "flash-capture.mjs"), `--label=${label}`, `--base=${BASE}`, `--item=${c.item}`, `--cpu=${c.cpu}`, "--capture=14000"], { stdio: ["ignore", "ignore", "inherit"] });
    const loadMs = Date.now() - t0;
    execFileSync(process.execPath, [path.join(here, "flash-analyze.mjs"), `--label=${label}`], { stdio: ["ignore", "ignore", "inherit"] });
    const out = JSON.parse(execFileSync(process.execPath, [path.join(here, "acceptance.mjs"), `--label=${label}`], { encoding: "utf8" }));
    const tl = JSON.parse(fs.readFileSync(path.join(here, "flash-frames", label, "timeline.json"), "utf8"));
    const videos = Math.max(0, ...tl.dom.map((d) => Number(d.videos) || 0));
    const swaps = Math.max(0, ...tl.dom.map((d) => Number(d.bufferSwapCount) || 0));
    const reason = (tl.dom.map((d) => d.bufferReason).filter(Boolean).slice(-1)[0]) || "";
    const valid = out.reachedForeground && videos >= 2 && swaps >= 1;
    process.stderr.write(`   ${label}: videos=${videos} swap=${swaps} reason=${reason} 过渡=${out.window.anomalies} 前场=${out.foreground.anomalies} ${valid ? "有效" : "判废"}\n`);
    if (valid) rec = { label, item: c.item, cpu: c.cpu, videos, swaps, reason, loadMs, win: out.window.anomalies, fg: out.foreground.anomalies };
  }
  if (!rec) rec = { label: c.label, item: c.item, cpu: c.cpu, videos: 0, swaps: 0, reason: "INVALID", loadMs: 0, win: null, fg: null };
  rows.push(rec);
}

console.log("\n================ 一致性锁定后的矩阵 ================");
console.log("Candidate\tcommit\tbuildHash\t用例\tCPU\tvideos\tswap\treason\t加载ms\t过渡\t前场");
for (const r of rows) {
  console.log(`${DIR}\t0f1c792\t${buildHash}\t${r.label}\t${r.cpu}x\t${r.videos}\t${r.swaps}\t${r.reason}\t${r.loadMs}\t${r.win}\t${r.fg}`);
}
const validRows = rows.filter((r) => r.videos >= 2 && r.swaps >= 1);
const pass = validRows.length === rows.length && rows.every((r) => r.win === 0 && r.fg === 0);
console.log(`\n有效采集 ${validRows.length}/${rows.length}；结论：${pass ? "全部通过" : "未达标"}`);
