/* 七星使者 send-test.html P0 回归测试
 * 运行：node tests/regression-send-test.mjs
 * 覆盖：字数计数规则 / 超限提示 / >40 阻断 / 错误后无刷新恢复（9 个场景）
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
// 优先使用环境变量指定的 playwright（本机 bundled 路径），否则用常规解析
const _pw = process.env.PLAYWRIGHT_PATH || "playwright";
const { chromium } = await import(_pw);

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PORT = 8931;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(fs.readFileSync(file));
});

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
function section(t) { console.log("\n== " + t + " =="); }

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const SUCCESS_BODY = Buffer.from("fake-mp4-bytes-for-regression-test-0123456789");

// 前后端计数规则一致性样本：JS Array.from(trim) 必须等于 Python len(trim)
const COUNT_SAMPLES = [
  ["今天真的很开心", 7],
  ["hello 123 !!", 12],
  ["你好，世界。Hello 2026", 16],
  ["😀😀😀", 3],            // emoji 按码点计 1（与 Python len 一致，而非 UTF-16 的 6）
  ["带 空格 的句子", 8],
  ["第一行\n第二行", 7],      // 换行算 1 字
  ["　全角空格", 4],   // trim/strip 会去掉全角空格，前后端一致
];

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage();

  let scenario = { kind: "success" };
  let fetchCalls = 0;
  const fetchedUrls = [];

  await page.route("**/status", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true }) });
  });
  await page.route(/\/make-send\?/, (route) => {
    fetchCalls++;
    fetchedUrls.push(route.request().url());
    if (scenario.kind === "http400") {
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "TEXT_TOO_LONG", message: "这句话有点长，当前最长支持 40 字，请缩短后重试。" }),
      });
    }
    if (scenario.kind === "http500") {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal server error" }) });
    }
    if (scenario.kind === "network-fail") {
      return route.abort("failed");
    }
    route.fulfill({ status: 200, contentType: "video/mp4", body: SUCCESS_BODY });
  });
  await page.route("**/sheet-*.webp", (route) =>
    route.fulfill({ status: 200, contentType: "image/webp", body: TINY_PNG })
  );

  const URL = `http://127.0.0.1:${PORT}/send-test.html`;
  async function loadFresh() {
    fetchCalls = 0;
    fetchedUrls.length = 0;
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const el = document.getElementById("charCount");
      return el && el.textContent === "0 / 40";
    }, { timeout: 10000 });
  }
  async function setText(t) {
    await page.evaluate((v) => {
      const ta = document.getElementById("textInput");
      ta.value = v;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }, t);
  }
  async function clickGenerate() {
    await page.evaluate(() => document.getElementById("btnGenerate").click());
  }
  async function state() {
    return page.evaluate(() => {
      const ta = document.getElementById("textInput");
      const cc = document.getElementById("charCount");
      const bg = document.getElementById("btnGenerate");
      const st = document.getElementById("status");
      const diag = document.getElementById("diag");
      return {
        value: ta.value,
        count: cc.textContent,
        countClass: cc.className,
        disabled: bg.disabled,
        btnText: bg.textContent,
        status: st.textContent,
        statusClass: st.className,
        genCount: (diag.textContent.match(/生成次数:\s*(\d+)/) || [])[1] || "?",
      };
    });
  }
  async function waitStatus(prefix, timeout = 15000) {
    await page.waitForFunction((p) => {
      const st = document.getElementById("status");
      return st && st.textContent.indexOf(p) === 0;
    }, prefix, { timeout });
  }

  const texts = {
    t10: "今天真的很开心呀呀呀",
    t39: "今天真的很开心今天真的很开心今天真的很开心今天真的很开心今天真的很开心呀呀呀呀",
    t40: "今天真的很开心今天真的很开心今天真的很开心今天真的很开心今天真的很开心呀呀呀呀呀",
    t41: "今天真的很开心今天真的很开心今天真的很开心今天真的很开心今天真的很开心呀呀呀呀呀啊",
    t42: "今天真的很开心今天真的很开心今天真的很开心今天真的很开心今天真的很开心呀呀呀呀呀啊哦",
  };
  const L10 = Array.from(texts.t10).length;
  const L39 = Array.from(texts.t39).length;
  const L40 = Array.from(texts.t40).length;
  const L41 = Array.from(texts.t41).length;
  if (!(L10 === 10 && L39 === 39 && L40 === 40 && L41 === 41)) {
    throw new Error("test fixture lengths wrong: " + [L10, L39, L40, L41].join(","));
  }

  // ===== 计数规则（前后端一致，码点计数） =====
  section("计数规则：前端码点计数 == Python len");
  for (const [sample, expect] of COUNT_SAMPLES) {
    await loadFresh();
    await setText(sample);
    const s = await state();
    const front = parseInt(s.count, 10);
    check(`计数 ${JSON.stringify(sample)} = ${expect}`, front === expect, `前端显示 ${s.count}`);
  }

  // ===== 场景 1-3：10 / 39 / 40 字正常生成 =====
  section("场景 1-3：10/39/40 字 → 正常生成");
  for (const [label, t, expectCount, clsContains] of [
    ["10 字", texts.t10, 10, null],
    ["39 字", texts.t39, 39, "near"],
    ["40 字", texts.t40, 40, "max"],
  ]) {
    await loadFresh();
    scenario = { kind: "success" };
    await setText(t);
    let s = await state();
    check(`${label} 计数器显示 ${expectCount} / 40`, s.count.indexOf(`${expectCount} / 40`) === 0, s.count);
    if (clsContains) check(`${label} 计数样式 ${clsContains}`, s.countClass.indexOf(clsContains) >= 0, s.countClass);
    await clickGenerate();
    await waitStatus("视频生成成功");
    s = await state();
    check(`${label} 生成成功`, s.status === "视频生成成功" && s.statusClass.indexOf("ok") >= 0);
    check(`${label} 按钮恢复`, !s.disabled && s.btnText.indexOf("生成视频") === 0);
    check(`${label} 只发了 1 次请求`, fetchCalls === 1, `fetch=${fetchCalls}`);
  }

  // ===== 场景 4：41 字 → 前端提示超 1 字，不发请求，不进入加载 =====
  section("场景 4：41 字 → 阻断，不发请求，不进入加载");
  await loadFresh();
  scenario = { kind: "success" };
  await setText(texts.t41);
  let s = await state();
  check("41 字计数器显示已超出 1 字", s.count.indexOf("41 / 40 · 已超出 1 字") === 0, s.count);
  check("41 字计数样式 over", s.countClass.indexOf("over") >= 0, s.countClass);
  check("41 字状态提示已超出", s.status.indexOf("已超出 1 字") === 0, s.status);
  const genBefore = s.genCount;
  await clickGenerate();
  await page.waitForTimeout(500);
  s = await state();
  check("41 字按钮保持禁用", s.disabled);
  check("41 字按钮未进入加载", s.btnText.indexOf("正在生成") !== 0, s.btnText);
  check("41 字未发起请求", fetchCalls === 0, `fetch=${fetchCalls}`);
  check("41 字生成次数未增加", s.genCount === genBefore, `gen=${genBefore}->${s.genCount}`);

  // ===== 场景 5：41 → 删到 10 → 无刷新直接生成成功 =====
  section("场景 5：41 字 → 删到 10 字 → 无刷新恢复生成");
  await setText(texts.t10);
  s = await state();
  check("删回后计数器恢复 10 / 40", s.count.indexOf("10 / 40") === 0, s.count);
  check("删回后按钮恢复可用", !s.disabled);
  check("删回后超限提示自动消失", s.status.indexOf("已超出") === -1, s.status);
  await clickGenerate();
  await waitStatus("视频生成成功");
  s = await state();
  check("删回后无刷新生成成功", s.status === "视频生成成功" && !s.disabled);
  check("仅发 1 次请求", fetchCalls === 1, `fetch=${fetchCalls}`);

  // ===== 场景 6：41 字 → 切换情绪 → 输入合法文本 → 直接生成成功 =====
  section("场景 6：41 字 → 切换情绪 → 合法文本 → 无刷新生成");
  await loadFresh();
  scenario = { kind: "success" };
  await setText(texts.t41);
  await page.click(".emotion:nth-child(2)"); // 委屈
  s = await state();
  check("切换情绪后文字被清空", s.value === "");
  check("切换情绪后计数器归零", s.count.indexOf("0 / 40") === 0, s.count);
  await setText("我没事，就是有一点想被抱抱。");
  await clickGenerate();
  await waitStatus("视频生成成功");
  s = await state();
  check("切换情绪后无刷新生成成功", s.status === "视频生成成功" && !s.disabled);

  // ===== 场景 7：连续超限两次 → 删回合法 → 仍可生成 =====
  section("场景 7：连续超限两次 → 删回合法 → 仍可生成");
  await loadFresh();
  scenario = { kind: "success" };
  await setText(texts.t41);
  await clickGenerate();
  await page.waitForTimeout(500);
  await setText(texts.t42);
  await clickGenerate();
  await page.waitForTimeout(500);
  check("连续超限未发请求", fetchCalls === 0, `fetch=${fetchCalls}`);
  await setText(texts.t10);
  await clickGenerate();
  await waitStatus("视频生成成功");
  s = await state();
  check("连续超限后删回仍可生成", s.status === "视频生成成功" && !s.disabled);
  check("最终只发 1 次请求", fetchCalls === 1, `fetch=${fetchCalls} urls=${JSON.stringify(fetchedUrls)}`);

  // ===== 场景 8：后端 400（TEXT_TOO_LONG）一次 → 下一次合法请求仍可生成 =====
  section("场景 8：后端 400 一次 → 下次合法请求恢复");
  await loadFresh();
  scenario = { kind: "http400" };
  await setText(texts.t10);
  await clickGenerate();
  await waitStatus("这句话有点长", 15000);
  s = await state();
  check("400 时显示后端超限文案", s.status.indexOf("当前最长支持 40 字") >= 0, s.status);
  check("400 后按钮恢复可用", !s.disabled && s.btnText.indexOf("生成视频") === 0);
  check("400 后未锁死（生成次数+1）", s.genCount === "1", `gen=${s.genCount}`);
  scenario = { kind: "success" };
  await clickGenerate();
  await waitStatus("视频生成成功");
  s = await state();
  check("400 后下一次合法请求无刷新成功", s.status === "视频生成成功" && !s.disabled);
  check("共发 2 次请求", fetchCalls === 2, `fetch=${fetchCalls}`);

  // ===== 场景 9：网络失败一次 → 下一次合法请求仍可生成 =====
  section("场景 9：网络失败一次 → 下次合法请求恢复");
  await loadFresh();
  scenario = { kind: "network-fail" };
  await setText(texts.t10);
  await clickGenerate();
  await waitStatus("视频生成失败", 15000);
  s = await state();
  check("网络失败显示失败文案", s.status.indexOf("视频生成失败") === 0, s.status);
  check("网络失败后按钮恢复可用", !s.disabled && s.btnText.indexOf("生成视频") === 0);
  scenario = { kind: "success" };
  await clickGenerate();
  await waitStatus("视频生成成功");
  s = await state();
  check("网络失败后下一次合法请求无刷新成功", s.status === "视频生成成功" && !s.disabled);
  check("共发 2 次请求", fetchCalls === 2, `fetch=${fetchCalls}`);

  // ===== 额外：HTTP 500 一次 → 恢复（回归覆盖 500） =====
  section("额外：后端 500 一次 → 下次合法请求恢复");
  await loadFresh();
  scenario = { kind: "http500" };
  await setText(texts.t10);
  await clickGenerate();
  await waitStatus("internal server error", 15000);
  s = await state();
  check("500 显示后端错误文案", s.status.indexOf("internal server error") === 0, s.status);
  check("500 后按钮恢复可用", !s.disabled && s.btnText.indexOf("生成视频") === 0);
  scenario = { kind: "success" };
  await clickGenerate();
  await waitStatus("视频生成成功");
  check("500 后下一次合法请求无刷新成功", true);

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log("\n================ 汇总 ================");
  console.log(`通过 ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    console.log("失败项：");
    failed.forEach((f) => console.log("  - " + f.name));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("测试运行出错:", e);
  server.close();
  process.exit(2);
});
