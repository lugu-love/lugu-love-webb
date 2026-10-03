/* Frontstage Player V1 — 唯一有权控制前场的状态机
 *
 * 设计铁律（对应 docs/frontstage-v2-control-audit.md 第 4 节）：
 *   1. DOM 是状态的纯函数：只有 render() 写 DOM。
 *   2. 单一句柄：state 只能经 transition() 变化，非法转移抛错并记 anomaly。
 *   3. 零 setTimeout 同步补偿：只允许"超时看门狗"。
 *   4. 零跨作用域代理：外部只能通过 start()/confirmForeground()/requestReturn()/secondPlay()。
 *   5. 媒体监听在元素创建后立即挂载。
 */
(function (global) {
  'use strict';

  var STATES = ['INIT','PRELOAD','BOTTLE_ENTER','CHARACTER_IN_BOTTLE','READY','FOREGROUND','RETURN','DONE'];

  var TRANSITIONS = {
    INIT:                 ['PRELOAD'],
    PRELOAD:              ['BOTTLE_ENTER'],
    BOTTLE_ENTER:         ['CHARACTER_IN_BOTTLE'],
    CHARACTER_IN_BOTTLE:  ['READY'],
    READY:                ['FOREGROUND'],
    FOREGROUND:           ['RETURN'],
    RETURN:               ['DONE'],
    DONE:                 ['BOTTLE_ENTER']   // 第二次播放：DONE -> BOTTLE_ENTER
  };

  /* 每个状态允许修改的 DOM/video 属性。render() 之外的任何写入都会被 assertWrite 拦下。 */
  var ALLOWED_WRITES = {
    INIT:                 [],
    PRELOAD:              ['root.dataset'],
    BOTTLE_ENTER:         ['root.dataset','bottle.visible','bottle.transform'],
    CHARACTER_IN_BOTTLE:  ['root.dataset','character.mount','character.transform','character.opacity'],
    READY:                ['root.dataset','bottle.visible'],
    FOREGROUND:           ['root.dataset','character.transform','character.opacity','video.currentTime','video.play','video.pause'],
    RETURN:               ['root.dataset','character.transform','character.opacity','bottle.visible'],
    DONE:                 ['root.dataset','bottle.visible']
  };

  /* 每个状态的超时看门狗（ms）与失败处理。0 = 无看门狗。 */
  var WATCHDOG = {
    INIT: 0, PRELOAD: 12000, BOTTLE_ENTER: 2500, CHARACTER_IN_BOTTLE: 4000,
    READY: 0, FOREGROUND: 0 /* 由素材时长决定 */, RETURN: 6000, DONE: 0
  };

  var guard = { on: true, state: 'INIT' };
  function assertWrite(control) {
    if (!guard.on) return;
    var list = ALLOWED_WRITES[guard.state] || [];
    if (list.indexOf(control) === -1) {
      throw new Error('[player] illegal write "' + control + '" in state ' + guard.state);
    }
  }

  function now() { return (global.performance && global.performance.now) ? global.performance.now() : Date.now(); }

  function createPlayer(options) {
    options = options || {};
    var root = options.root;
    var registry = options.registry;
    var config = options.config || {};
    if (!root) throw new Error('[player] root required');
    if (!registry) throw new Error('[player] registry required');

    var player = {
      state: 'INIT',
      cycle: 0,
      log: [],
      anomalies: [],
      media: { attachedAt: null, events: [], readyStateAtAttach: null },
      timeline: [],
      stateEnteredAt: 0,
      destroyed: false
    };

    var listeners = {};
    var watchdogTimer = null;
    var dwellTimer = null;
    var rafId = 0;
    var character = null;       // { itemId, sheets:[Image], poster:Image, fps, frames, frameSize, gridCols }
    var canvas = null, ctx = null;
    var video = null;
    var frameIndex = 0, lastFrameAt = 0, playing = false;
    var foregroundEndsAt = 0;

    /* ---------- 可观测日志 ---------- */
    function log(event, extra) {
      var entry = { t: Math.round(now()), cycle: player.cycle, state: player.state, event: event };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) entry[k] = extra[k];
      player.log.push(entry);
      player.timeline.push(entry);
      emit('log', entry);
      return entry;
    }
    function anomaly(code, detail) {
      var entry = { t: Math.round(now()), cycle: player.cycle, state: player.state, code: code, detail: detail || null };
      player.anomalies.push(entry);
      log('anomaly', { code: code, detail: detail || null });
      return entry;
    }
    function on(name, cb) { (listeners[name] = listeners[name] || []).push(cb); return player; }
    function emit(name, payload) {
      var l = listeners[name]; if (!l) return;
      for (var i = 0; i < l.length; i++) { try { l[i](payload, player); } catch (e) { /* 监听器异常不得中断状态机 */ } }
    }

    /* ---------- 状态转移 ---------- */
    function transition(next, reason, extra) {
      var allowed = TRANSITIONS[player.state] || [];
      if (allowed.indexOf(next) === -1) {
        anomaly('ILLEGAL_TRANSITION', { from: player.state, to: next, allowed: allowed, reason: reason });
        throw new Error('[player] illegal transition ' + player.state + ' -> ' + next);
      }
      if (next === 'BOTTLE_ENTER' && player.state === 'DONE') player.cycle += 1;
      var from = player.state;
      log('state.exit', { from: from, to: next, reason: reason, extra: extra || null });
      // 离开 FOREGROUND 时，在 FOREGROUND 权限内收掉媒体，RETURN 不碰 video。
      if (from === 'FOREGROUND') stopForegroundMedia();
      player.state = next;
      guard.state = next;
      clearWatchdog();
      player.stateEnteredAt = now();
      log('state.enter', { from: from, to: next });
      render(next, extra);
      emit('state', { from: from, to: next, reason: reason });
      armWatchdog(next);
      return player;
    }

    function render(state, extra) {
      assertWrite('root.dataset');
      root.setAttribute('data-player-state', state);
      switch (state) {
        case 'BOTTLE_ENTER':
          assertWrite('bottle.visible');
          root.setAttribute('data-bottle-visible', '1');
          break;
        case 'CHARACTER_IN_BOTTLE':
          mountCharacter();
          paintFrame(0);
          break;
        case 'READY':
          assertWrite('bottle.visible');
          root.setAttribute('data-bottle-visible', '1');
          break;
        case 'FOREGROUND':
          beginForeground();
          break;
        case 'RETURN':
          beginReturn();
          break;
        case 'DONE':
          assertWrite('bottle.visible');
          root.setAttribute('data-bottle-visible', '1');
          emit('done', { cycle: player.cycle });
          break;
        default: break;
      }
    }

    /* ---------- 看门狗（只用于超时失败处理，不做同步补偿） ---------- */
    function armWatchdog(state) {
      var ms = WATCHDOG[state] || 0;
      if (state === 'FOREGROUND' && foregroundDurationMs()) ms = foregroundDurationMs() + 3000;
      if (!ms) return;
      var expected = state;
      watchdogTimer = global.setTimeout(function () {
        if (player.destroyed || player.state !== expected) return;
        anomaly('STATE_TIMEOUT', { state: expected, ms: ms });
        fail(expected);
      }, ms);
    }
    function clearWatchdog() { if (watchdogTimer) { global.clearTimeout(watchdogTimer); watchdogTimer = null; } }
    function fail(state) {
      if (state === 'PRELOAD' || state === 'BOTTLE_ENTER' || state === 'CHARACTER_IN_BOTTLE') {
        transition('BOTTLE_ENTER' === state ? 'CHARACTER_IN_BOTTLE' : 'BOTTLE_ENTER', 'fail-forward');
      } else if (state === 'RETURN') {
        transition('DONE', 'fail-forward');
      }
    }

    /* ---------- 素材：只加载，不决定显示 ---------- */
    function loadImage(src) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('image load failed: ' + src)); };
        img.src = src;
      });
    }

    function preload(item) {
      player.media.attachedAt = Math.round(now());
      log('preload.start', { itemId: item.itemId, assetBase: item.assetBase });
      var jobs = [];
      jobs.push(loadImage(item.poster).then(function (img) { character = character || {}; character.poster = img; }));
      var sheets = [];
      for (var i = 0; i < item.sheets; i++) {
        (function (idx) {
          jobs.push(loadImage(item.assetBase + 'sheet-' + pad2(idx) + '.webp').then(function (img) { sheets[idx] = img; }));
        })(i);
      }
      return Promise.all(jobs).then(function () {
        character = {
          itemId: item.itemId,
          characterId: item.characterId,
          emotionId: item.emotionId,
          sheets: sheets,
          poster: character && character.poster,
          fps: item.fps,
          frames: item.frames,
          frameSize: item.frameSize,
          gridCols: item.gridCols,
          framesPerSheet: item.framesPerSheet
        };
        log('preload.done', { itemId: item.itemId, sheets: sheets.length, frames: item.frames });
        emit('preloaded', { itemId: item.itemId });
      });
    }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    /* ---------- 角色挂载与绘制（唯一绘制点） ---------- */
    function mountCharacter() {
      var slot = root.querySelector('[data-role="character-slot"]');
      if (!slot) return anomaly('SLOT_MISSING', null);
      assertWrite('character.mount');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'player-character';
        canvas.width = config.canvasSize || 540;
        canvas.height = config.canvasSize || 540;
        ctx = canvas.getContext('2d');
      }
      if (canvas.parentNode !== slot) {
        while (slot.firstChild) slot.removeChild(slot.firstChild);
        slot.appendChild(canvas);
      }
      attachVideoEarly();   // 媒体监听在元素创建后立即挂载
      log('character.mounted', { itemId: character && character.itemId });
      /* 几何落到 CSS（data-player-state 驱动），JS 不写 style */
      requestAnimationFrameOnce(function () { if (player.state === 'CHARACTER_IN_BOTTLE') transition('READY', 'attached'); });
    }

    function paintFrame(idx) {
      if (!ctx || !character || !character.sheets.length) return;
      var f = character.frameSize, per = character.framesPerSheet, cols = character.gridCols;
      var sheet = character.sheets[Math.floor(idx / per)];
      if (!sheet) return;
      var local = idx % per;
      var sx = (local % cols) * f, sy = Math.floor(local / cols) * f;
      var size = canvas.width;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(sheet, sx, sy, f, f, 0, 0, size, size);
    }

    /* ---------- 媒体：提前挂载 + 早期事件记录 ---------- */
    function attachVideoEarly() {
      if (video || !character) return;
      video = document.createElement('video');
      video.className = 'player-video';
      video.muted = true; video.playsInline = true; video.preload = 'auto';
      video.setAttribute('aria-hidden', 'true');
      var src = (config.videoSource || null);
      if (src) video.src = src;
      player.media.readyStateAtAttach = video.readyState;
      ['loadedmetadata','loadeddata','canplay','canplaythrough','playing','pause','ended','error','stalled','waiting']
        .forEach(function (name) {
          video.addEventListener(name, function () {
            player.media.events.push({ t: Math.round(now()), type: name, readyState: video.readyState, currentTime: video.currentTime });
          });
        });
      player.media.attachedAt = Math.round(now());
      log('media.listeners-attached', { readyStateAtAttach: player.media.readyStateAtAttach });
    }

    function foregroundDurationMs() {
      if (!character) return 0;
      return Math.round((character.frames / character.fps) * 1000);
    }

    function beginForeground() {
      frameIndex = 0; lastFrameAt = 0; playing = true;
      foregroundEndsAt = now() + foregroundDurationMs();
      log('foreground.begin', { durationMs: foregroundDurationMs(), frames: character.frames, fps: character.fps });
      emit('foreground', { cycle: player.cycle, itemId: character.itemId, emotionId: character.emotionId });
      if (video && video.src) {
        assertWrite('video.currentTime'); try { video.currentTime = 0; } catch (e) {}
        assertWrite('video.play'); try { video.play(); } catch (e) {}
      }
      rafId = requestAnimationFrameOnce(tick);
    }

    function tick() {
      if (player.destroyed || player.state !== 'FOREGROUND' || !playing) return;
      var t = now();
      if (!lastFrameAt) lastFrameAt = t;
      var step = 1000 / character.fps;
      if (t - lastFrameAt >= step) {
        var advance = Math.max(1, Math.floor((t - lastFrameAt) / step));
        lastFrameAt += advance * step;
        frameIndex += advance;
        if (frameIndex >= character.frames) {
          frameIndex = character.frames - 1;
          paintFrame(frameIndex);
          playing = false;
          log('foreground.media-ended', { frameIndex: frameIndex });
          transition('RETURN', 'media-ended');
          return;
        }
      }
      paintFrame(frameIndex);
      rafId = requestAnimationFrameOnce(tick);
    }

    function requestAnimationFrameOnce(cb) {
      return global.requestAnimationFrame(function (ts) { cb(ts); });
    }

    /* ---------- 回瓶 ---------- */
    function beginReturn() {
      log('return.begin', { cycle: player.cycle });
      emit('return', { cycle: player.cycle });
      requestAnimationFrameOnce(function () {
        if (player.state !== 'RETURN') return;
        transition('DONE', 'return-flight-finished');
      });
    }

    function stopForegroundMedia() {
      playing = false;
      if (rafId) { global.cancelAnimationFrame(rafId); rafId = 0; }
      if (video) { assertWrite('video.pause'); try { video.pause(); } catch (e) {} }
    }

    /* ---------- 对外接口 ---------- */
    player.start = function () {
      if (player.state !== 'INIT') { anomaly('START_IGNORED', { state: player.state }); return player; }
      log('player.start');
      transition('PRELOAD', 'start');
      var item = registry.items[config.itemId] || registry.items[Object.keys(registry.items)[0]];
      preload(item).then(function () {
        if (player.destroyed || player.state !== 'PRELOAD') return;
        transition('BOTTLE_ENTER', 'assets-ready');
        requestAnimationFrameOnce(function () {
          if (player.state === 'BOTTLE_ENTER') transition('CHARACTER_IN_BOTTLE', 'bottle-settled');
        });
      }).catch(function (err) {
        anomaly('PRELOAD_FAILED', String(err && err.message || err));
        emit('error', { stage: 'PRELOAD', error: String(err) });
      });
      return player;
    };

    /* B 实时对话接入点：进入 FOREGROUND 后调用，锁住不回瓶 */
    player.confirmForeground = function () {
      if (player.state !== 'FOREGROUND') { anomaly('CONFIRM_IGNORED', { state: player.state }); return player; }
      player._foregroundLocked = true;
      log('foreground.locked', { by: 'external' });
      return player;
    };

    /* 结束对话 / 播放结束 -> 允许回瓶 */
    player.requestReturn = function (reason) {
      if (player.state !== 'FOREGROUND') { anomaly('RETURN_IGNORED', { state: player.state }); return player; }
      log('return.requested', { reason: reason || 'external' });
      transition('RETURN', reason || 'external-request');
      return player;
    };

    /* READY 阶段自动进场；也允许手动点瓶推进 */
    player.advance = function () {
      if (player.state === 'READY') { transition('FOREGROUND', 'user-advance'); return player; }
      if (player.state === 'DONE') { return player.secondPlay(); }
      anomaly('ADVANCE_IGNORED', { state: player.state }); return player;
    };

    /* 第二次连续播放：DONE -> BOTTLE_ENTER */
    player.secondPlay = function () {
      if (player.state !== 'DONE') { anomaly('SECOND_PLAY_IGNORED', { state: player.state }); return player; }
      log('secondPlay.begin', { nextCycle: player.cycle + 1 });
      transition('BOTTLE_ENTER', 'second-play');
      requestAnimationFrameOnce(function () {
        if (player.state === 'BOTTLE_ENTER') transition('CHARACTER_IN_BOTTLE', 'bottle-settled');
      });
      return player;
    };

    player.snapshot = function () {
      return {
        state: player.state, cycle: player.cycle,
        itemId: character && character.itemId,
        characterId: character && character.characterId,
        emotionId: character && character.emotionId,
        events: player.log.length,
        anomalies: player.anomalies.length,
        sequences: player.log.filter(function (e) { return e.event === 'state.enter'; }).map(function (e) { return e.to; })
      };
    };

    player.destroy = function () {
      player.destroyed = true;
      clearWatchdog();
      if (dwellTimer) global.clearTimeout(dwellTimer);
      stopForegroundMedia();
      return player;
    };

    /* READY 停留：用 rAF 计时，不用 setTimeout */
    var readyDwellStart = 0;
    var readyRaf = 0;
    function readyDwell() {
      if (player.state !== 'READY') return;
      if (!readyDwellStart) readyDwellStart = now();
      var dwell = config.readyDwellMs || 1200;
      if (now() - readyDwellStart >= dwell) {
        readyDwellStart = 0;
        transition('FOREGROUND', 'ready-dwell-elapsed');
        return;
      }
      readyRaf = requestAnimationFrameOnce(readyDwell);
    }

    var origRender = render;
    render = function (state, extra) {
      origRender(state, extra);
      if (state === 'READY') { readyDwellStart = 0; readyRaf = requestAnimationFrameOnce(readyDwell); }
    };

    player.assertInvariants = function () {
      var problems = [];
      if (STATES.indexOf(player.state) === -1) problems.push('unknown state ' + player.state);
      if (player.state === 'FOREGROUND' && video && !video.paused && !video.src) problems.push('video playing without src');
      if (player.state !== 'FOREGROUND' && rafId) problems.push('raf active outside FOREGROUND');
      return problems;
    };

    player.on = on;
    guard.on = !!config.enforceWriteGuard;
    return player;
  }

  global.FrontstagePlayerV1 = { STATES: STATES, TRANSITIONS: TRANSITIONS, ALLOWED_WRITES: ALLOWED_WRITES, createPlayer: createPlayer };
})(window);
