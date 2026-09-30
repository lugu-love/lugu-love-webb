import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_MODULE || "/Users/liangminghua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const sharpPath = process.env.SHARP_PATH || "/Users/liangminghua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp";
const playwright = require(playwrightPath);
const sharp = require(sharpPath);

const engine = process.env.ENGINE || "chromium";
const deviceName = process.env.DEVICE || "desktop-chrome";
const runs = Math.max(1, Number.parseInt(process.env.RUNS || "20", 10) || 20);
const cycles = Math.max(1, Number.parseInt(process.env.CYCLES || "2", 10) || 2);
const itemId = process.env.ITEM_ID || "rabbit-happy";
const baseUrl = process.env.PLAYER_URL || "http://127.0.0.1:8770/candidate-20260930-frontstage-player-v1-r1/";
const expectedSequence = ["PRELOAD", "BOTTLE_ENTER", "CHARACTER_IN_BOTTLE", "READY", "FOREGROUND", "RETURN", "DONE"];

function browserType() {
  if (engine === "webkit") return playwright.webkit;
  if (engine === "firefox") return playwright.firefox;
  return playwright.chromium;
}

function contextOptions() {
  if (deviceName === "iphone-13") return { ...playwright.devices["iPhone 13"] };
  if (deviceName === "huawei-p30") {
    return {
      userAgent: "Mozilla/5.0 (Linux; Android 12; ELS-NX9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      viewport: { width: 360, height: 800 },
      screen: { width: 360, height: 800 },
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true
    };
  }
  return { viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 };
}

function centerInside(inner, outer) {
  const x = inner.left + inner.width / 2;
  const y = inner.top + inner.height / 2;
  return x >= outer.left && x <= outer.left + outer.width && y >= outer.top && y <= outer.top + outer.height;
}

function rectInside(inner, outer, pad = 2) {
  return inner.left >= outer.left - pad
    && inner.top >= outer.top - pad
    && inner.left + inner.width <= outer.left + outer.width + pad
    && inner.top + inner.height <= outer.top + outer.height + pad;
}

async function imageMetrics(buffer) {
  const { data, info } = await sharp(buffer).resize(108, 225, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let white = 0;
  let green = 0;
  let black = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 245 && g > 245 && b > 245) white += 1;
    if (g > 120 && g > r * 1.35 && g > b * 1.25) green += 1;
    if (r < 12 && g < 12 && b < 12) black += 1;
  }
  const pixels = data.length / info.channels;
  return { white: white / pixels, green: green / pixels, black: black / pixels };
}

function validate(run, snapshot, visualFrames, pageErrors) {
  const failures = [];
  const logs = snapshot.logs || [];
  const sequence = logs.filter((entry) => entry.event === "state-enter").map((entry) => entry.to);
  const expected = Array.from({ length: cycles }, () => expectedSequence).flat();
  if (JSON.stringify(sequence) !== JSON.stringify(expected)) failures.push(`state sequence mismatch: ${sequence.join(">")}`);
  if (snapshot.error) failures.push(`player error: ${snapshot.error.message}`);
  if (snapshot.state !== "DONE" || snapshot.cycle !== cycles) failures.push(`final state=${snapshot.state} cycle=${snapshot.cycle}`);
  if (snapshot.videoCurrentTime > 0.001) failures.push(`DONE currentTime=${snapshot.videoCurrentTime}`);
  if (pageErrors.length) failures.push(`page errors: ${pageErrors.slice(0, 3).join(" | ")}`);

  const endedCount = logs.filter((entry) => entry.event === "video-event" && entry.eventName === "ended").length;
  if (endedCount !== cycles) failures.push(`ended count=${endedCount}`);

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const cycleLogs = logs.filter((entry) => entry.cycle === cycle);
    const inBottle = cycleLogs.find((entry) => entry.event === "character-in-bottle")?.dom;
    const foreground = cycleLogs.find((entry) => entry.event === "foreground-entered")?.dom;
    const returned = cycleLogs.find((entry) => entry.event === "returned-to-bottle")?.dom;
    if (!inBottle) failures.push(`cycle ${cycle}: missing in-bottle snapshot`);
    else {
      if (inBottle.bottle.visibility !== "visible" || inBottle.bottle.opacity < .99) failures.push(`cycle ${cycle}: empty bottle`);
      if (inBottle.character.visibility !== "visible" || inBottle.character.opacity < .99 || inBottle.character.active !== "1") failures.push(`cycle ${cycle}: character hidden in bottle`);
      if (!centerInside(inBottle.character.rect, inBottle.bottle.rect)) failures.push(`cycle ${cycle}: character outside bottle`);
      if (!inBottle.video.paused) failures.push(`cycle ${cycle}: video playing in bottle`);
    }
    if (!foreground) failures.push(`cycle ${cycle}: missing foreground snapshot`);
    else {
      if (foreground.bottle.opacity > .2) failures.push(`cycle ${cycle}: bottle not receded`);
      if (foreground.character.visibility !== "visible" || foreground.character.opacity < .99) failures.push(`cycle ${cycle}: foreground hidden`);
      if (Number(foreground.character.zIndex) <= 4) failures.push(`cycle ${cycle}: foreground below bottle front`);
      if (!rectInside(foreground.character.rect, { left: 0, top: 0, width: foreground.stage.width, height: foreground.stage.height })) failures.push(`cycle ${cycle}: foreground outside viewport`);
      if (foreground.video.currentTime > .01) failures.push(`cycle ${cycle}: foreground not frame zero`);
    }
    if (!returned) failures.push(`cycle ${cycle}: missing return snapshot`);
    else {
      if (returned.bottle.visibility !== "visible" || returned.bottle.opacity < .99) failures.push(`cycle ${cycle}: bottle not restored`);
      if (returned.character.visibility !== "visible" || returned.character.opacity < .99) failures.push(`cycle ${cycle}: returned character hidden`);
      if (!centerInside(returned.character.rect, returned.bottle.rect)) failures.push(`cycle ${cycle}: returned character outside bottle`);
      if (!returned.video.paused || returned.video.currentTime > .001) failures.push(`cycle ${cycle}: returned video not reset`);
    }
  }

  if (!visualFrames.length) failures.push("no visual frames");
  const maxWhite = Math.max(0, ...visualFrames.map((frame) => frame.white));
  const maxGreen = Math.max(0, ...visualFrames.map((frame) => frame.green));
  const maxBlack = Math.max(0, ...visualFrames.map((frame) => frame.black));
  if (maxWhite > .02) failures.push(`white flash=${maxWhite.toFixed(5)}`);
  if (maxGreen > .003) failures.push(`green flash=${maxGreen.toFixed(5)}`);
  if (maxBlack > .08) failures.push(`black flash=${maxBlack.toFixed(5)}`);
  return { run, pass: failures.length === 0, failures, sequence, visual: { frames: visualFrames.length, maxWhite, maxGreen, maxBlack } };
}

const launchOptions = { headless: true };
if (engine === "chromium") launchOptions.channel = "chrome";
const browser = await browserType().launch(launchOptions);
const context = await browser.newContext(contextOptions());
const page = await context.newPage();
const results = [];
for (let run = 1; run <= runs; run += 1) {
  const pageErrors = [];
  const onPageError = (error) => pageErrors.push(error.message);
  page.on("pageerror", onPageError);
  const url = new URL(baseUrl);
  url.searchParams.set("item", itemId);
  url.searchParams.set("auto", "1");
  url.searchParams.set("cycles", String(cycles));
  url.searchParams.set("acceptanceRun", `${deviceName}-${run}`);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30000 });
  const visualFrames = [];
  const started = Date.now();
  let snapshot = null;
  while (Date.now() - started < 30000 + cycles * 15000) {
    snapshot = await page.evaluate(() => window.__frontstagePlayer?.getSnapshot?.() || null);
    if (snapshot?.error || (snapshot?.state === "DONE" && snapshot?.cycle === cycles)) break;
    const image = await page.screenshot({ type: "jpeg", quality: 70 });
    visualFrames.push(await imageMetrics(image));
    await page.waitForTimeout(50);
  }
  if (!snapshot?.error && (snapshot?.state !== "DONE" || snapshot?.cycle !== cycles)) {
    process.stderr.write(`timeout snapshot: ${JSON.stringify(snapshot)}\n`);
    throw new Error(`timeout waiting for ${deviceName} run ${run}`);
  }
  const result = validate(run, snapshot, visualFrames, pageErrors);
  results.push(result);
  page.off("pageerror", onPageError);
  process.stderr.write(`[${deviceName}] run ${run}/${runs}: ${result.pass ? "PASS" : "FAIL"}${result.failures.length ? " " + result.failures.join("; ") : ""}\n`);
  if (!result.pass) break;
}
await browser.close();

const passed = results.length === runs && results.every((result) => result.pass);
console.log(JSON.stringify({ passed, engine, deviceName, runsRequested: runs, cyclesPerRun: cycles, runsCompleted: results.length, failures: results.flatMap((result) => result.failures.map((failure) => `run ${result.run}: ${failure}`)), compact: results.map((result) => ({ run: result.run, pass: result.pass, visual: result.visual })) }, null, 2));
if (!passed) process.exitCode = 2;
