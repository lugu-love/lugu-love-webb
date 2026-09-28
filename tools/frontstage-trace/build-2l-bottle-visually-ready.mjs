// 2C-r10：把“使者可见”绑到真正统一的公共节点
// 条件（全部满足，同一 rAF 释放）：inBottleReady 标记 + 瓶体真实可见 + 瓶体入场动画已停 + crop 几何连续两帧稳定
import fs from "node:fs";
import path from "node:path";
const here = import.meta.dirname;
const SRC = path.join(here, "candidate-2k", "index.html");
const OUT = path.join(here, "candidate-2l");
fs.mkdirSync(OUT, { recursive: true });
let html = fs.readFileSync(SRC, "utf8");
const find = `  function whenInBottleReady(cb) {
    if (inBottleReady) { cb(); return; }
    const step = function () { if (inBottleReady) cb(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }`;
const repl = `  // 2C-r10：瓶体视觉 ready 的统一定义（角色无关、无固定延时）
  function bottleVisuallyReady(lastCropRef) {
    if (!inBottleReady || !container) return false;
    const cs = getComputedStyle(container);
    if (cs.visibility === "hidden" || Number(cs.opacity) <= 0.5) return false;
    const anims = container.getAnimations ? container.getAnimations() : [];
    if (anims.some(function (a) { return a.playState === "running"; })) return false;
    const crop = container.querySelector(".fengxin-rabbit-crop");
    const r = crop ? crop.getBoundingClientRect() : null;
    if (!r || !r.width || !r.height) return false;
    const sig = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(",");
    const stable = sig === lastCropRef.value;
    lastCropRef.value = sig;
    return stable;
  }
  function whenInBottleReady(cb) {
    const ref = { value: "" };
    const step = function () {
      try { if (bottleVisuallyReady(ref)) { cb(); return; } } catch (e) {}
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }`;
const n = html.split(find).length - 1;
if (n !== 1) throw new Error("锚点匹配数=" + n);
html = html.split(find).join(repl);
fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log("瓶体视觉 ready 公共节点已建立 bytes=" + fs.statSync(path.join(OUT, "index.html")).size);
