export const PLAYER_STATES = Object.freeze({
  INIT: "INIT",
  PRELOAD: "PRELOAD",
  BOTTLE_ENTER: "BOTTLE_ENTER",
  CHARACTER_IN_BOTTLE: "CHARACTER_IN_BOTTLE",
  READY: "READY",
  FOREGROUND: "FOREGROUND",
  RETURN: "RETURN",
  DONE: "DONE"
});

const STATE_TRANSITIONS = Object.freeze({
  INIT: ["PRELOAD"],
  PRELOAD: ["BOTTLE_ENTER", "DONE"],
  BOTTLE_ENTER: ["CHARACTER_IN_BOTTLE", "DONE"],
  CHARACTER_IN_BOTTLE: ["READY", "DONE"],
  READY: ["FOREGROUND", "DONE"],
  FOREGROUND: ["RETURN", "DONE"],
  RETURN: ["DONE"],
  DONE: ["PRELOAD"]
});

const DEFAULT_OPTIONS = Object.freeze({
  autoOpen: false,
  autoCycles: 1,
  cycleGapMs: 500,
  bottleEnterMs: 820,
  bottleExitMs: 720,
  foregroundEntryMs: 980,
  returnMs: 1100,
  readyTimeoutMs: 15000,
  animationTimeoutMs: 6000,
  playTimeoutMs: 12000
});

const MEDIA_EVENTS = Object.freeze([
  "loadstart",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting",
  "stalled",
  "ended",
  "error"
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deviceClass() {
  const ua = navigator.userAgent || "";
  if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(ua)) return "safari";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  return "chromium";
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export class FrontstagePlayer extends EventTarget {
  constructor(root, item, options = {}) {
    super();
    if (!root) throw new Error("FrontstagePlayer requires a root element");
    if (!item) throw new Error("FrontstagePlayer requires an item config");
    this.root = root;
    this.item = item;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = PLAYER_STATES.INIT;
    this.cycle = 0;
    this.logs = [];
    this.error = null;
    this._logSeq = 0;
    this._watchdog = 0;
    this._playbackMonitor = null;
    this._activeAnimation = null;
    this._openResolver = null;
    this._runPromise = null;
    this._destroyed = false;
    this._activeMedia = null;
    this._buildDom();
    this._bindEvents();
    this._setStateData();
  }

  start() {
    if (this.state !== PLAYER_STATES.INIT) return this._runPromise;
    this._runPromise = this._runCycle();
    return this._runPromise;
  }

  open() {
    if (this.state !== PLAYER_STATES.READY) return false;
    this._clearWatchdog();
    this._log("user-action", { action: "open" });
    this._openResolver?.();
    this._openResolver = null;
    return true;
  }

  replay() {
    if (this.state !== PLAYER_STATES.DONE) return false;
    this._clearWatchdog();
    this._log("user-action", { action: "replay" });
    this._runPromise = this._runCycle();
    return true;
  }

  destroy() {
    this._destroyed = true;
    this._clearWatchdog();
    this._activeAnimation?.cancel();
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.root.removeEventListener("click", this._onRootClick);
  }

  getSnapshot() {
    return {
      state: this.state,
      cycle: this.cycle,
      itemId: this.item.itemId,
      characterId: this.item.characterId,
      mediaUrl: this._activeMedia?.url || null,
      videoReadyState: this.video.readyState,
      videoCurrentTime: Number.isFinite(this.video.currentTime) ? Number(this.video.currentTime.toFixed(3)) : 0,
      error: this.error ? { name: this.error.name, message: this.error.message } : null,
      stateSequence: this.logs.filter((entry) => entry.event === "state-enter").map((entry) => entry.to),
      logs: this.logs.slice()
    };
  }

  _buildDom() {
    this.root.classList.add("frontstage-player");
    this.root.innerHTML = `
      <div class="frontstage-stage" data-player-stage>
        <div class="frontstage-bottle" data-player-bottle aria-hidden="true">
          <div class="frontstage-bottle-back"></div>
          <div class="frontstage-bottle-highlight"></div>
        </div>
        <div class="frontstage-character" data-player-character aria-hidden="true">
          <video class="frontstage-video" data-player-video muted playsinline webkit-playsinline preload="auto"></video>
          <img class="frontstage-poster" data-player-poster alt="" decoding="async">
        </div>
        <div class="frontstage-bottle-front" aria-hidden="true">
          <span class="frontstage-bottle-shine"></span>
          <span class="frontstage-bottle-cork"></span>
        </div>
        <button class="frontstage-action" data-player-action type="button">轻抚瓶子</button>
        <div class="frontstage-status" data-player-status aria-live="polite"></div>
      </div>`;
    this.stage = this.root.querySelector("[data-player-stage]");
    this.bottle = this.root.querySelector("[data-player-bottle]");
    this.character = this.root.querySelector("[data-player-character]");
    this.video = this.root.querySelector("[data-player-video]");
    this.poster = this.root.querySelector("[data-player-poster]");
    this.action = this.root.querySelector("[data-player-action]");
    this.status = this.root.querySelector("[data-player-status]");
    this.bottleFront = this.root.querySelector(".frontstage-bottle-front");
    this.poster.src = this.item.poster;
    this.poster.onerror = () => {
      if (this.poster.getAttribute("src") !== this.item.posterFallback) {
        this.poster.src = this.item.posterFallback;
      }
    };
    this.video.setAttribute("aria-label", `${this.item.characterId} ${this.item.label}`);
    this._setBottleVisual({ visible: false, opacity: 0 });
    this._setCharacterVisual({ visible: false, opacity: 0, zIndex: 3 });
  }

  _bindEvents() {
    this._onRootClick = () => {
      if (this.state === PLAYER_STATES.READY) this.open();
      else if (this.state === PLAYER_STATES.DONE) this.replay();
    };
    this.root.addEventListener("click", this._onRootClick);
    MEDIA_EVENTS.forEach((eventName) => {
      this.video.addEventListener(eventName, () => this._log("video-event", { eventName }));
    });
  }

  async _runCycle() {
    this.cycle += 1;
    this.error = null;
    this._log("cycle-enter", { cycle: this.cycle });
    try {
      await this._transition(PLAYER_STATES.PRELOAD);
      await this._preload();

      await this._transition(PLAYER_STATES.BOTTLE_ENTER);
      await this._enterBottle();

      await this._transition(PLAYER_STATES.CHARACTER_IN_BOTTLE);
      await this._showCharacterInBottle();

      await this._transition(PLAYER_STATES.READY);
      await this._waitForOpen();

      await this._transition(PLAYER_STATES.FOREGROUND);
      await this._performForeground();

      await this._transition(PLAYER_STATES.RETURN);
      await this._returnToBottle();

      await this._transition(PLAYER_STATES.DONE);
      this._afterDone();
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this._log("player-error", { name: this.error.name, message: this.error.message });
      this.dispatchEvent(new CustomEvent("playererror", { detail: this.getSnapshot() }));
      if (this.state === PLAYER_STATES.FOREGROUND) {
        try {
          await this._transition(PLAYER_STATES.RETURN, { reason: "failure-recovery" });
          await this._returnToBottle();
        } catch (recoveryError) {
          this._log("failure-recovery-error", { message: recoveryError.message });
        }
      }
      if (this.state !== PLAYER_STATES.DONE) await this._transition(PLAYER_STATES.DONE, { reason: "failure" });
      this._setStatus("播放失败：" + this.error.message);
    }
  }

  async _transition(next, details = {}) {
    const allowed = STATE_TRANSITIONS[this.state] || [];
    if (!allowed.includes(next)) {
      throw new Error(`Illegal state transition: ${this.state} -> ${next}`);
    }
    const from = this.state;
    this._clearWatchdog();
    this._log("state-exit", { from, to: next, ...details });
    this.state = next;
    this._stateChangedAt = performance.now();
    this._setStateData();
    this._log("state-enter", { from, to: next, ...details });
    this.dispatchEvent(new CustomEvent("statechange", { detail: { from, to: next, cycle: this.cycle, at: performance.now() } }));
    this._updateUi();
  }

  _setStateData() {
    this.root.dataset.playerState = this.state;
    this.root.dataset.cycle = String(this.cycle);
  }

  _updateUi() {
    const ready = this.state === PLAYER_STATES.READY;
    const done = this.state === PLAYER_STATES.DONE;
    this.action.disabled = !(ready || done);
    this.action.textContent = done ? "再看一次" : "轻抚瓶子";
    this.action.dataset.visible = ready || done ? "1" : "0";
    if (ready) this._setStatus("准备好了，轻抚瓶子");
    else if (done && !this.error) this._setStatus("已回到瓶中");
    else if (this.error) this._setStatus("播放失败：" + this.error.message);
    else this._setStatus("");
  }

  _setStatus(message) {
    if (this.status) this.status.textContent = message;
  }

  async _preload() {
    this._log("preload-start", { itemId: this.item.itemId });
    const candidates = this._orderedCandidates();
    const failures = [];
    for (const candidate of candidates) {
      if (this._destroyed) throw new Error("Player destroyed");
      try {
        await this._loadCandidate(candidate);
        this._activeMedia = candidate;
        this._log("preload-selected", { url: candidate.url, type: candidate.type });
        return;
      } catch (error) {
        failures.push({ url: candidate.url, message: error.message });
        this._log("preload-candidate-failed", { url: candidate.url, message: error.message });
      }
    }
    const error = new Error("No playable media candidate");
    error.failures = failures;
    throw error;
  }

  _orderedCandidates() {
    const device = deviceClass();
    const transparent = this.item.requireAlpha
      ? this.item.media.filter((candidate) => candidate.alpha === true)
      : this.item.media;
    return [...transparent].sort((a, b) => {
      const aOrder = a.order.indexOf(device);
      const bOrder = b.order.indexOf(device);
      return (aOrder === -1 ? 99 : aOrder) - (bOrder === -1 ? 99 : bOrder);
    });
  }

  async _loadCandidate(candidate) {
    const currentSource = this.video.currentSrc || this.video.src || "";
    if (this._activeMedia?.url === candidate.url && currentSource === candidate.url && this.video.readyState >= 2 && !this.video.error) {
      this.video.pause();
      this.video.loop = false;
      await this._resetVideoToStart(true);
      this._log("preload-reused", { url: candidate.url, type: candidate.type });
      return;
    }
    this.video.pause();
    this.video.loop = false;
    this.video.src = candidate.url;
    this.video.load();
    if (this.video.readyState < 2) {
      await this._waitForVideoEvent("loadeddata", this.options.readyTimeoutMs, "preload-timeout");
    }
    if (this.video.readyState < 2) throw new Error("Video loadeddata without decodable frame");
    this.video.pause();
    this.video.currentTime = 0;
  }

  async _enterBottle() {
    this._setBottleVisual({ visible: true, opacity: 1, transform: "translate(-50%, -50%)" });
    this._setCharacterVisual({ visible: false, opacity: 0, zIndex: 3 });
    const keyframes = [
      { opacity: 0, transform: "translate(-50%, -50%) translateY(28px) scale(.74) rotate(-7deg)" },
      { opacity: 1, transform: "translate(-50%, -50%) translateY(0) scale(1) rotate(0deg)" }
    ];
    const options = {
      duration: this.options.bottleEnterMs,
      easing: "cubic-bezier(.2,.75,.2,1)",
      fill: "forwards"
    };
    const animation = this.bottle.animate(keyframes, options);
    const frontAnimation = this.bottleFront.animate(keyframes, options);
    this._activeAnimation = [animation, frontAnimation];
    await this._waitForAnimation(Promise.all([animation.finished, frontAnimation.finished]), this.options.animationTimeoutMs, "bottle-enter-timeout");
    animation.commitStyles();
    frontAnimation.commitStyles();
    animation.cancel();
    frontAnimation.cancel();
    this._activeAnimation = null;
    this._log("bottle-entered", { durationMs: this.options.bottleEnterMs, dom: this._snapshotDomState() });
  }

  async _showCharacterInBottle() {
    const rect = this._measureBottleCharacterRect();
    this._setCharacterRect(rect);
    this.character.style.clipPath = "inset(0 round 24% 24% 34% 34%)";
    this._setCharacterVisual({ visible: true, opacity: 1, zIndex: 3 });
    await this._resetVideoToStart(false);
    this.video.loop = false;
    this._showPoster(true);
    this._log("character-in-bottle", { rect, dom: this._snapshotDomState() });
  }

  _waitForOpen() {
    if (this.options.autoOpen) {
      return this._waitDelay(Math.max(250, this.options.cycleGapMs), "auto-open").then(() => this.open());
    }
    return this._withTimeout(new Promise((resolve) => {
      this._openResolver = resolve;
    }), this.options.readyTimeoutMs, "ready-open-timeout", true);
  }

  async _performForeground() {
    this._clearWatchdog();
    this.video.pause();
    this.video.loop = false;
    await this._resetVideoToStart(true);
    const from = this._rectFromStyle();
    const to = this._measureForegroundRect();
    this._showPoster(false);
    this.character.style.zIndex = "8";
    this.character.style.clipPath = "none";
    this._setCharacterVisual({ visible: true, opacity: 1, zIndex: 8 });
    const characterAnimation = this.character.animate([
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, opacity: 1 },
      { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: 1 }
    ], {
      duration: this.options.foregroundEntryMs,
      easing: "cubic-bezier(.2,.78,.2,1)",
      fill: "forwards"
    });
    const bottleKeyframes = [
      { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      { opacity: .12, transform: "translate(-50%, -50%) scale(.82)" }
    ];
    const bottleOptions = {
      duration: this.options.foregroundEntryMs,
      easing: "cubic-bezier(.2,.78,.2,1)",
      fill: "forwards"
    };
    const bottleAnimation = this.bottle.animate(bottleKeyframes, bottleOptions);
    const bottleFrontAnimation = this.bottleFront.animate(bottleKeyframes, bottleOptions);
    this._activeAnimation = [characterAnimation, bottleAnimation, bottleFrontAnimation];
    await this._waitForAnimation(Promise.all([characterAnimation.finished, bottleAnimation.finished, bottleFrontAnimation.finished]), this.options.animationTimeoutMs, "foreground-entry-timeout");
    this._setCharacterRect(to);
    characterAnimation.commitStyles();
    bottleAnimation.commitStyles();
    bottleFrontAnimation.commitStyles();
    characterAnimation.cancel();
    bottleAnimation.cancel();
    bottleFrontAnimation.cancel();
    this._activeAnimation = null;
    this._log("foreground-entered", { rect: to, dom: this._snapshotDomState() });
    await this._playVideo();
    await this._waitForVideoEndOrTimeout();
  }

  async _returnToBottle() {
    this.video.pause();
    const from = this._rectFromStyle();
    const to = this._measureBottleCharacterRect();
    const characterAnimation = this.character.animate([
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, opacity: 1 },
      { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: 1 }
    ], {
      duration: this.options.returnMs,
      easing: "cubic-bezier(.22,.68,.18,1)",
      fill: "forwards"
    });
    const bottleKeyframes = [
      { opacity: .12, transform: "translate(-50%, -50%) scale(.82)" },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1)" }
    ];
    const bottleOptions = {
      duration: this.options.returnMs,
      easing: "cubic-bezier(.22,.68,.18,1)",
      fill: "forwards"
    };
    const bottleAnimation = this.bottle.animate(bottleKeyframes, bottleOptions);
    const bottleFrontAnimation = this.bottleFront.animate(bottleKeyframes, bottleOptions);
    this._activeAnimation = [characterAnimation, bottleAnimation, bottleFrontAnimation];
    await this._waitForAnimation(Promise.all([characterAnimation.finished, bottleAnimation.finished, bottleFrontAnimation.finished]), this.options.animationTimeoutMs, "return-timeout");
    this._setCharacterRect(to);
    characterAnimation.commitStyles();
    bottleAnimation.commitStyles();
    bottleFrontAnimation.commitStyles();
    characterAnimation.cancel();
    bottleAnimation.cancel();
    bottleFrontAnimation.cancel();
    this._activeAnimation = null;
    this.character.style.clipPath = "inset(0 round 24% 24% 34% 34%)";
    this.character.style.zIndex = "3";
    this._showPoster(true);
    this.video.style.opacity = "0";
    await this._resetVideoToStart(false);
    this.video.style.opacity = "1";
    this._showPoster(true);
    this.video.loop = false;
    this._log("returned-to-bottle", { rect: to, dom: this._snapshotDomState() });
  }

  _afterDone() {
    this._setStatus("已回到瓶中");
    if (this.cycle < this.options.autoCycles) {
      this._waitDelay(this.options.cycleGapMs, "auto-replay").then(() => this.replay()).catch(() => {});
    }
  }

  _measureBottleCharacterRect() {
    const stage = this.stage.getBoundingClientRect();
    const bottle = this.bottle.getBoundingClientRect();
    const height = bottle.height * .49;
    const width = Math.min(bottle.width * .58, height * this.item.aspectRatio);
    return {
      left: bottle.left - stage.left + (bottle.width - width) / 2,
      top: bottle.top - stage.top + bottle.height * .31,
      width,
      height
    };
  }

  _measureForegroundRect() {
    const stage = this.stage.getBoundingClientRect();
    const maxWidth = stage.width * .78;
    const maxHeight = stage.height * .68;
    const height = Math.min(maxHeight, maxWidth / this.item.aspectRatio);
    const width = height * this.item.aspectRatio;
    return {
      left: (stage.width - width) / 2,
      top: clamp(stage.height * .10, 12, Math.max(12, stage.height - height - 96)),
      width,
      height
    };
  }

  _setCharacterRect(rect) {
    this.character.style.left = `${rect.left}px`;
    this.character.style.top = `${rect.top}px`;
    this.character.style.width = `${rect.width}px`;
    this.character.style.height = `${rect.height}px`;
  }

  _rectFromStyle() {
    return {
      left: finite(parseFloat(this.character.style.left), 0),
      top: finite(parseFloat(this.character.style.top), 0),
      width: finite(parseFloat(this.character.style.width), 1),
      height: finite(parseFloat(this.character.style.height), 1)
    };
  }

  _snapshotDomState() {
    const stageRect = this.stage.getBoundingClientRect();
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - stageRect.left,
        top: rect.top - stageRect.top,
        width: rect.width,
        height: rect.height
      };
    };
    const computed = (element) => {
      const style = getComputedStyle(element);
      return { visibility: style.visibility, opacity: Number(style.opacity), zIndex: style.zIndex };
    };
    return {
      stage: { width: stageRect.width, height: stageRect.height },
      bottle: { ...computed(this.bottle), rect: rectOf(this.bottle) },
      character: { ...computed(this.character), rect: rectOf(this.character), active: this.character.dataset.active },
      video: {
        currentTime: Number(this.video.currentTime.toFixed(3)),
        readyState: this.video.readyState,
        paused: this.video.paused,
        ended: this.video.ended,
        opacity: Number(getComputedStyle(this.video).opacity)
      }
    };
  }

  _setBottleVisual({ visible, opacity, transform }) {
    [this.bottle, this.bottleFront].forEach((element) => {
      if (!element) return;
      element.style.visibility = visible ? "visible" : "hidden";
      if (opacity != null) element.style.opacity = String(opacity);
      if (transform) element.style.transform = transform;
    });
  }

  _setCharacterVisual({ visible, opacity, zIndex }) {
    this.character.style.visibility = visible ? "visible" : "hidden";
    this.character.style.opacity = String(opacity);
    this.character.style.zIndex = String(zIndex);
    this.character.dataset.active = visible ? "1" : "0";
  }

  _showPoster(visible) {
    this.poster.style.opacity = visible ? "1" : "0";
    this.video.style.opacity = visible ? "0" : "1";
  }

  async _resetVideoToStart(requireSeek) {
    this.video.pause();
    this.video.loop = false;
    if (!requireSeek || this.video.currentTime <= 0.001) {
      this.video.currentTime = 0;
      return;
    }
    const seeked = this._waitForVideoEvent("seeked", 2500, "seek-timeout");
    this.video.currentTime = 0;
    try {
      await seeked;
    } catch (error) {
      this._log("seek-timeout", { message: error.message });
    }
  }

  async _playVideo() {
    const attempt = this.video.play();
    if (attempt && typeof attempt.then === "function") await attempt;
  }

  async _waitForVideoEndOrTimeout() {
    const duration = finite(this.video.duration, this.item.duration);
    const atEnd = () => this.video.ended || (duration > 0.2 && this.video.paused && this.video.currentTime >= duration - 0.05);
    if (atEnd()) return;
    return new Promise((resolve, reject) => {
      let lastTime = this.video.currentTime;
      let lastProgressAt = performance.now();
      const startedAt = performance.now();
      const hardDeadline = Math.max(300000, duration > 0.2 ? duration * 5000 : 0);
      const onEnded = () => finish(resolve);
      const onError = () => finish(() => reject(new Error("Media error")));
      const monitor = window.setInterval(() => {
        if (atEnd()) {
          finish(resolve);
          return;
        }
        const now = performance.now();
        if (this.video.currentTime > lastTime + 0.02) {
          lastTime = this.video.currentTime;
          lastProgressAt = now;
        }
        if (now - lastProgressAt > 60000) {
          finish(() => reject(new Error("video-stalled")));
          return;
        }
        if (now - startedAt > hardDeadline) {
          finish(() => reject(new Error("video-hard-timeout")));
        }
      }, 250);
      const finish = (callback) => {
        window.clearInterval(monitor);
        this.video.removeEventListener("ended", onEnded);
        this.video.removeEventListener("error", onError);
        this._playbackMonitor = null;
        callback();
      };
      this._playbackMonitor = monitor;
      this.video.addEventListener("ended", onEnded, { once: true });
      this.video.addEventListener("error", onError, { once: true });
    });
  }

  _waitForVideoEvent(eventName, timeoutMs, code) {
    const eventPromise = new Promise((resolve, reject) => {
      const onEvent = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Media error"));
      };
      const cleanup = () => {
        this.video.removeEventListener(eventName, onEvent);
        this.video.removeEventListener("error", onError);
      };
      this.video.addEventListener(eventName, onEvent, { once: true });
      this.video.addEventListener("error", onError, { once: true });
    });
    return this._withTimeout(eventPromise, timeoutMs, code);
  }

  async _waitForAnimation(promiseOrAnimation, timeoutMs, code) {
    const promise = promiseOrAnimation instanceof Promise
      ? promiseOrAnimation
      : promiseOrAnimation.finished;
    return this._withTimeout(promise.then(() => true), timeoutMs, code);
  }

  _withTimeout(promise, timeoutMs, code, rejectOnTimeout = true) {
    this._clearTimer();
    return new Promise((resolve, reject) => {
      let settled = false;
      this._watchdog = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        this._watchdog = 0;
        if (rejectOnTimeout) reject(new Error(code));
        else resolve(null);
      }, timeoutMs);
      promise.then((value) => {
        if (settled) return;
        settled = true;
        this._clearTimer();
        resolve(value);
      }, (error) => {
        if (settled) return;
        settled = true;
        this._clearTimer();
        reject(error);
      });
    });
  }

  _waitDelay(delayMs, code) {
    return this._withTimeout(new Promise(() => {}), delayMs, code, false);
  }

  _clearTimer() {
    if (this._watchdog) {
      clearTimeout(this._watchdog);
      this._watchdog = 0;
    }
    if (this._playbackMonitor) {
      clearInterval(this._playbackMonitor);
      this._playbackMonitor = null;
    }
  }

  _clearWatchdog() {
    this._clearTimer();
    if (Array.isArray(this._activeAnimation)) {
      this._activeAnimation.forEach((animation) => animation.cancel());
      this._activeAnimation = null;
    }
  }

  _log(event, details = {}) {
    const entry = {
      seq: ++this._logSeq,
      at: performance.now(),
      state: this.state,
      cycle: this.cycle,
      event,
      ...details
    };
    this.logs.push(entry);
    this.dispatchEvent(new CustomEvent("playerlog", { detail: entry }));
  }
}
