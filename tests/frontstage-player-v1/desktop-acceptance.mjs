import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const sharpPath = process.env.SHARP_PATH || "/Users/liangminghua/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp";
let sharp = null;
try { sharp = require(sharpPath); } catch (error) { process.stderr.write(`sharp unavailable: ${error.message}\n`); }

const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const runs = Math.max(1, Number.parseInt(process.env.RUNS || "20", 10) || 20);
const cycles = Math.max(1, Number.parseInt(process.env.CYCLES || "1", 10) || 1);
const baseUrl = process.env.PLAYER_URL || "http://127.0.0.1:8770/candidate-20260930-frontstage-player-v1-r1/";
const expectedSequence = ["PRELOAD", "BOTTLE_ENTER", "CHARACTER_IN_BOTTLE", "READY", "FOREGROUND", "RETURN", "DONE"];
const port = 9500 + Math.floor(Math.random() * 250);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "frontstage-player-acceptance-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--mute-audio",
  "--no-first-run",
  "--no-proxy-server",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--autoplay-policy=no-user-gesture-required",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=430,900",
  "about:blank"
], { stdio: "ignore" });

let ws;
let nextId = 0;
const pending = new Map();
const browserIssues = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(expression).catch(() => false);
    if (value) return value;
    await sleep(100);
  }
  throw new Error("timeout waiting for " + expression);
}

async function analyzeFrame(buffer) {
  if (!sharp) return null;
  const { data, info } = await sharp(buffer).resize(108, 225, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let white = 0;
  let green = 0;
  let black = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    if (r > 245 && g > 245 && b > 245) white += 1;
    if (g > 120 && g > r * 1.35 && g > b * 1.25) green += 1;
    if (r < 12 && g < 12 && b < 12) black += 1;
  }
  const pixels = data.length / info.channels;
  return {
    mean: [rSum / pixels, gSum / pixels, bSum / pixels],
    whiteRatio: white / pixels,
    greenRatio: green / pixels,
    blackRatio: black / pixels
  };
}

function startVisualSampler() {
  const state = { stop: false, frames: [], errors: [] };
  state.promise = (async () => {
    while (!state.stop) {
      try {
        const result = await send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
        const metrics = await analyzeFrame(Buffer.from(result.data, "base64"));
        if (metrics) state.frames.push(metrics);
      } catch (error) {
        state.errors.push(error.message);
      }
      await sleep(90);
    }
  })();
  return state;
}

function visualResult(sampler) {
  const frames = sampler.frames;
  if (!sharp) return { available: false, failures: [], frames: 0 };
  if (!frames.length) return { available: true, failures: ["no visual frames"], frames: 0 };
  const maxWhite = Math.max(...frames.map((frame) => frame.whiteRatio));
  const maxGreen = Math.max(...frames.map((frame) => frame.greenRatio));
  const maxBlack = Math.max(...frames.map((frame) => frame.blackRatio));
  const failures = [];
  if (maxWhite > .02) failures.push(`white flash ratio=${maxWhite.toFixed(5)}`);
  if (maxGreen > .003) failures.push(`green flash ratio=${maxGreen.toFixed(5)}`);
  if (maxBlack > .08) failures.push(`black flash ratio=${maxBlack.toFixed(5)}`);
  if (sampler.errors.length) failures.push(`sampler errors=${sampler.errors.slice(0, 3).join(" | ")}`);
  return { available: true, failures, frames: frames.length, maxWhite, maxGreen, maxBlack };
}

function centerInside(inner, outer) {
  if (!inner || !outer) return false;
  const x = inner.left + inner.width / 2;
  const y = inner.top + inner.height / 2;
  return x >= outer.left && x <= outer.left + outer.width && y >= outer.top && y <= outer.top + outer.height;
}

function rectInside(inner, outer, pad = 1) {
  return inner.left >= outer.left - pad
    && inner.top >= outer.top - pad
    && inner.left + inner.width <= outer.left + outer.width + pad
    && inner.top + inner.height <= outer.top + outer.height + pad;
}

function validateRun(run, snapshot, expectedCycles) {
  const failures = [];
  const logs = snapshot.logs || [];
  const sequence = logs.filter((entry) => entry.event === "state-enter").map((entry) => entry.to);
  const expected = Array.from({ length: expectedCycles }, () => expectedSequence).flat();
  if (JSON.stringify(sequence) !== JSON.stringify(expected)) failures.push(`state sequence mismatch: ${sequence.join(">")}`);
  if (snapshot.error) failures.push(`player error: ${snapshot.error.message}`);
  if (snapshot.state !== "DONE") failures.push(`final state is ${snapshot.state}`);
  if (snapshot.videoCurrentTime > 0.001) failures.push(`DONE video currentTime=${snapshot.videoCurrentTime}`);

  const endedLogs = logs.filter((entry) => entry.event === "video-event" && entry.eventName === "ended");
  if (endedLogs.length !== expectedCycles) failures.push(`ended count=${endedLogs.length}`);

  for (let cycle = 1; cycle <= expectedCycles; cycle += 1) {
    const cycleLogs = logs.filter((entry) => entry.cycle === cycle);
    const inBottle = cycleLogs.find((entry) => entry.event === "character-in-bottle");
    const foreground = cycleLogs.find((entry) => entry.event === "foreground-entered");
    const returned = cycleLogs.find((entry) => entry.event === "returned-to-bottle");

    if (!inBottle?.dom) {
      failures.push(`cycle ${cycle}: missing character-in-bottle snapshot`);
    } else {
      const { bottle, character } = inBottle.dom;
      if (bottle.visibility !== "visible" || bottle.opacity < .99) failures.push(`cycle ${cycle}: empty bottle at CHARACTER_IN_BOTTLE`);
      if (character.visibility !== "visible" || character.opacity < .99 || character.active !== "1") failures.push(`cycle ${cycle}: character hidden in bottle`);
      if (!centerInside(character.rect, bottle.rect)) failures.push(`cycle ${cycle}: character center outside bottle`);
      if (!inBottle.dom.video.paused) failures.push(`cycle ${cycle}: video should be paused in bottle`);
    }

    if (!foreground?.dom) {
      failures.push(`cycle ${cycle}: missing foreground snapshot`);
    } else {
      const { bottle, character, video } = foreground.dom;
      if (bottle.opacity > .2) failures.push(`cycle ${cycle}: bottle did not recede in foreground`);
      if (character.visibility !== "visible" || character.opacity < .99) failures.push(`cycle ${cycle}: foreground character hidden`);
      if (Number(character.zIndex) <= 4) failures.push(`cycle ${cycle}: foreground character not above bottle front`);
      if (!rectInside(character.rect, { left: 0, top: 0, width: foreground.dom.stage.width, height: foreground.dom.stage.height }, 2)) failures.push(`cycle ${cycle}: foreground character outside viewport`);
      if (video.currentTime > 0.01) failures.push(`cycle ${cycle}: foreground did not start from frame zero`);
    }

    if (!returned?.dom) {
      failures.push(`cycle ${cycle}: missing returned snapshot`);
    } else {
      const { bottle, character, video } = returned.dom;
      if (bottle.visibility !== "visible" || bottle.opacity < .99) failures.push(`cycle ${cycle}: bottle not restored`);
      if (character.visibility !== "visible" || character.opacity < .99) failures.push(`cycle ${cycle}: returned character hidden`);
      if (!centerInside(character.rect, bottle.rect)) failures.push(`cycle ${cycle}: returned character not inside bottle`);
      if (!video.paused) failures.push(`cycle ${cycle}: returned video is still playing`);
      if (video.currentTime > 0.001) failures.push(`cycle ${cycle}: returned currentTime=${video.currentTime}`);
    }
  }

  return { run, pass: failures.length === 0, failures, sequence, snapshot };
}

try {
  let target = null;
  for (let i = 0; i < 120 && !target; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((entry) => entry.type === "page");
    } catch (e) {}
    if (!target) await sleep(100);
  }
  if (!target) throw new Error("Chrome page target not found");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      browserIssues.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
    if (!message.id || !pending.has(message.id)) return;
    const job = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) job.reject(new Error(JSON.stringify(message.error)));
    else job.resolve(message.result);
  });
  await send("Runtime.enable");
  await send("Page.enable");

  const results = [];
  for (let run = 1; run <= runs; run += 1) {
    const url = new URL(baseUrl);
    url.searchParams.set("item", "rabbit-happy");
    url.searchParams.set("auto", "1");
    url.searchParams.set("cycles", String(cycles));
    url.searchParams.set("acceptanceRun", String(run));
    await send("Page.navigate", { url: url.href });
    await waitFor(`window.__frontstagePlayer && location.search.includes('acceptanceRun=${run}') && window.__frontstagePlayer.state !== 'INIT'`, 15000);
    const sampler = startVisualSampler();
    await waitFor(`window.__frontstagePlayer.error || (window.__frontstagePlayer.state === 'DONE' && window.__frontstagePlayer.cycle === ${cycles})`, 30000 + cycles * 15000);
    sampler.stop = true;
    await sampler.promise;
    await sleep(100);
    const snapshot = await evaluate("window.__frontstagePlayer.getSnapshot()");
    const result = validateRun(run, snapshot, cycles);
    result.visual = visualResult(sampler);
    result.failures.push(...result.visual.failures);
    result.pass = result.failures.length === 0;
    results.push(result);
    process.stderr.write(`run ${run}/${runs}: ${result.pass ? "PASS" : "FAIL"}${result.failures.length ? " " + result.failures.join("; ") : ""}\n`);
    if (!result.pass) break;
  }

  const passed = results.length === runs && results.every((result) => result.pass) && browserIssues.length === 0;
  console.log(JSON.stringify({
    passed,
    runsRequested: runs,
    cyclesPerRun: cycles,
    runsCompleted: results.length,
    browserIssues,
    failures: results.flatMap((result) => result.failures.map((failure) => `run ${result.run}: ${failure}`)),
    compact: results.map((result) => ({ run: result.run, pass: result.pass, sequence: result.sequence, visual: result.visual }))
  }, null, 2));
  if (!passed) process.exitCode = 2;
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch (e) {}
  chrome.kill("SIGTERM");
}
