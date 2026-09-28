// 2C-r9：单点修复 —— revealWhenBottleReady() 内 container → stageElement
import fs from "node:fs";
import path from "node:path";
const here = import.meta.dirname;
const SRC = path.join(here, "candidate-2j", "index.html");
const OUT = path.join(here, "candidate-2k");
fs.mkdirSync(OUT, { recursive: true });
let html = fs.readFileSync(SRC, "utf8");
const find = `const revealWhenBottleReady = function () {
if (container && container.__frontstage && container.__frontstage.whenInBottleReady) {
container.__frontstage.whenInBottleReady(function () {`;
const repl = `const revealWhenBottleReady = function () {
if (stageElement && stageElement.__frontstage && stageElement.__frontstage.whenInBottleReady) {
stageElement.__frontstage.whenInBottleReady(function () {`;
const n = html.split(find).length - 1;
if (n !== 1) throw new Error("锚点匹配数=" + n);
html = html.split(find).join(repl);
fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log("container→stageElement 修复完成 bytes=" + fs.statSync(path.join(OUT, "index.html")).size);
