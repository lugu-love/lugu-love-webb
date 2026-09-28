// 2C-r8：瓶体真实入场完成（IN_BOTTLE_READY）之前，使者即使已解码也不可见；
// 由公共状态驱动，不用固定延时；角色无关。
import fs from "node:fs";
import path from "node:path";
const here = import.meta.dirname;
const SRC = path.join(here, "candidate-2i", "index.html");
const OUT = path.join(here, "candidate-2j");
fs.mkdirSync(OUT, { recursive: true });
let html = fs.readFileSync(SRC, "utf8");
const log = [];
function patch(name, find, replace, expect) {
  const n = html.split(find).length - 1;
  if (n !== (expect || 1)) throw new Error(name + " 期望 " + (expect || 1) + " 实际 " + n);
  html = html.split(find).join(replace);
  log.push(name);
}
// P1 状态机加入 IN_BOTTLE_READY（公共）
patch("P1 IN_BOTTLE_READY 状态",
  `  const S = { IDLE:"IDLE", IN_BOTTLE:"IN_BOTTLE", TYPING:"TYPING", ZOOM:"ZOOM", HANDOFF:"HANDOFF", FOREGROUND:"FOREGROUND", RETURN:"RETURN", DONE:"DONE" };`,
  `  const S = { IDLE:"IDLE", IN_BOTTLE:"IN_BOTTLE", IN_BOTTLE_READY:"IN_BOTTLE_READY", TYPING:"TYPING", ZOOM:"ZOOM", HANDOFF:"HANDOFF", FOREGROUND:"FOREGROUND", RETURN:"RETURN", DONE:"DONE" };
  let inBottleReady = false;`);
patch("P1b 提供标记与等待",
  `  return {
    S: S, state: state, setState: setState,`,
  `  // 瓶体真实入场完成：由入场序列在“瓶体到位且瓶内播放开始”处调用，统一公共路径
  function markInBottleReady() {
    if (inBottleReady) return;
    inBottleReady = true;
    setState(S.IN_BOTTLE_READY, { at: "bottle-arrived" });
  }
  function whenInBottleReady(cb) {
    if (inBottleReady) { cb(); return; }
    const step = function () { if (inBottleReady) cb(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  return {
    S: S, state: state, setState: setState,
    markInBottleReady: markInBottleReady,
    whenInBottleReady: whenInBottleReady,`);
// P2 使者可见 = controller.ready 且 IN_BOTTLE_READY（保持封面直到两条件都满足）
patch("P2 双条件门控可见",
  `controller.ready.then(() => {
if (controller.mode === "video") {
cover.classList.add("is-hidden");
// 用户点击心星属于主动交互：视频一进入场景就立即播放。
controller.play();
} else {
cropWindow.style.setProperty("display", "none");
}
});`,
  `controller.ready.then(() => {
if (controller.mode !== "video") { cropWindow.style.setProperty("display", "none"); return; }
// 2C-r8：必须同时满足「视频就绪」与「瓶体入场完成」才允许可见；
// 未满足前保持封面占位，且角色仍被 .fengxin-rabbit-crop 约束，不会浮到瓶体前方。
const revealWhenBottleReady = function () {
if (container && container.__frontstage && container.__frontstage.whenInBottleReady) {
container.__frontstage.whenInBottleReady(function () {
cover.classList.add("is-hidden");
controller.play();
});
} else {
cover.classList.add("is-hidden");
controller.play();
}
};
revealWhenBottleReady();
});`);
// P3 瓶体到位信号：瓶内播放启动处（与既有入场时序同一节点，非新增定时器）
patch("P3 入场完成点触发",
  `if (isNarrativeTest) runSpritePlayback("narrative-idle");
else runSpritePlayback("initial");`,
  `if (isNarrativeTest) runSpritePlayback("narrative-idle");
else runSpritePlayback("initial");
if (container && container.__frontstage && container.__frontstage.markInBottleReady) container.__frontstage.markInBottleReady();`);
fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log(log.join(" | "), "bytes=" + fs.statSync(path.join(OUT, "index.html")).size);
