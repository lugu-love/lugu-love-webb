const BASE_PATH = window.__B74_BASE_PATH || '';
const DEFAULT_CHARACTER_ID = 'yunqi-koala';
const DEFAULT_POSTER = `${BASE_PATH}/formal/assets/characters/seven-stars/yunqi-koala/items/yunqi-koala-01-kaixin.webp`;
const BACKDROP = `${BASE_PATH}/formal/earth.webp`;
let posterUrl = DEFAULT_POSTER;
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const INPUT_CHUNK_SAMPLES = 320;
const SILENCE_B64 = bytesToBase64(new Uint8Array(INPUT_CHUNK_SAMPLES * 2));
const JITTER_TARGET_SECONDS = 0.22;
const VAD_RMS_THRESHOLD = 0.04;
const VAD_VOICE_FRAMES = 3;
const VAD_QUIET_FRAMES = 7;

const state = {
  ws: null,
  connected: false,
  closing: false,
  language: '普通话',
  expressionMode: 'accent',
  mood: '',
  subtitleText: '',
  profile: null,
  characters: [],
  voiceSelections: loadSavedVoiceSelections(),
  currentSpeaker: null,
  auditionLanguage: '普通话',
  previewAudio: null,
  openingSent: false,
  videoToken: 0,
  videoState: 'idle',
  phase: 'idle',
  videoElements: new Map(),
  idleTimer: null,
  lifeLoopTimer: null,
  audioCtx: null,
  mediaDest: null,
  captureSink: null,
  outputAudio: null,
  mediaStream: null,
  sourceNode: null,
  processor: null,
  sinkGain: null,
  sendTimer: null,
  sendQueue: [],
  pcmLeftover: new Int16Array(0),
  muted: false,
  playbackSources: new Set(),
  nextPlayTime: 0,
  audioQueue: [],
  audioQueuedSeconds: 0,
  playbackStarted: false,
  audioResponseDone: false,
  firstAudioDeltaAt: 0,
  playbackStartAt: 0,
  userVoiceStartAt: 0,
  userVoiceEndAt: 0,
  voiceFrames: 0,
  quietFrames: 0,
  userSpeaking: false,
  interruptSent: false,
  assistantSpeechStartedAt: 0,
};

let talkButton = null;
let talkButtonTimer = null;
let transitionLayer = null;
let faceLayer = null;
let statusNode = null;
let voiceButton = null;
let voicePanel = null;

function bytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}


function loadSavedVoiceSelections() {
  try {
    const parsed = JSON.parse(localStorage.getItem('b74_voice_selections_v2') || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveVoiceSelections() {
  try { localStorage.setItem('b74_voice_selections_v2', JSON.stringify(state.voiceSelections)); } catch {}
}

function selectedSpeakerFor(profile) {
  if (!profile) return null;
  return state.voiceSelections[profile.character_id] || profile.voice?.speaker || null;
}

function voiceLabelFor(profile, speaker) {
  const candidate = profile?.voice?.candidates?.find(item => item.speaker === speaker);
  return candidate?.label || speaker || '默认音色';
}

function createTransition({ returning = false } = {}) {
  if (transitionLayer) transitionLayer.remove();
  transitionLayer = document.createElement('div');
  transitionLayer.id = 'b74-transition';
  transitionLayer.innerHTML = `<img src="${posterUrl}" alt="${state.profile?.formal_name || '云栖考拉'}">`;
  document.body.appendChild(transitionLayer);
  const layer = transitionLayer;
  requestAnimationFrame(() => {
    if (!layer || !layer.isConnected) return;
    layer.classList.add('show');
    if (!returning) setTimeout(() => { if (layer.isConnected) layer.classList.add('zoom'); }, 80);
  });
  return transitionLayer;
}

function createFaceLayer() {
  if (faceLayer) return faceLayer;
  faceLayer = document.createElement('section');
  faceLayer.id = 'b74-face-layer';
  faceLayer.hidden = true;
  faceLayer.innerHTML = `
    <div id="b74-face-backdrop" style="background-image:url('${BACKDROP}')"></div>
    <div id="b74-video-states"></div>
    <img id="b74-face-poster" src="${posterUrl}" alt="${state.profile?.formal_name || '云栖考拉'}">
    <div id="b74-face-title">${state.profile?.formal_name || '云栖考拉'}</div>
    <div id="b74-mode-wrap" role="group" aria-label="表达模式">
      <button type="button" data-mode="accent">原文 + 方言</button>
      <button type="button" data-mode="local">地方口语</button>
      <button type="button" data-mode="other">其他地方</button>
    </div>
    <div id="b74-language-wrap">
      <label for="b74-language">当前语言</label>
      <select id="b74-language">
        <option value="普通话" selected>普通话</option>
        <option value="四川话">四川话</option>
        <option value="陕西话">陕西话</option>
        <option value="粤语">粤语</option>
        <option value="东北话">东北话</option>
        <option value="上海话">上海话</option>
        <option value="英语">English</option>
      </select>
    </div>
    <div id="b74-subtitle" aria-live="polite"></div>
    <div id="b74-face-status">正在让云栖考拉出来…</div>
    <div id="b74-face-controls">
      <button id="b74-mic" type="button">麦克风：开</button>
      <button id="b74-interrupt" type="button">打断</button>
      <button id="b74-end" type="button">结束对话</button>
      <button id="b74-back" type="button">返回地球</button>
    </div>
  `;
  document.body.appendChild(faceLayer);
  statusNode = faceLayer.querySelector('#b74-face-status');
  renderVideoStateLayer();
  setVideoState('idle');
  faceLayer.querySelector('#b74-mic').addEventListener('click', async () => {
    state.muted = !state.muted;
    if (state.muted) state.sendQueue = [];
    faceLayer.querySelector('#b74-mic').textContent = state.muted ? '麦克风：关' : '麦克风：开';
  });
  faceLayer.querySelector('#b74-interrupt').addEventListener('click', () => {
    stopPlayback();
    if (state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'cancel' }));
    }
    setVideoState('listening');
    setStatus('正在听你说', 'listening');
  });
  faceLayer.querySelector('#b74-end').addEventListener('click', () => finishSession({ returnHome: true }));
  faceLayer.querySelector('#b74-back').addEventListener('click', () => finishSession({ returnHome: true }));
  faceLayer.querySelector('#b74-language').addEventListener('change', event => {
    const language = event.target.value;
    state.language = language;
    if (state.connected && state.ws?.readyState === WebSocket.OPEN) {
      stopPlayback();
      state.ws.send(JSON.stringify({ type: 'cancel' }));
      state.ws.send(JSON.stringify({ type: 'switch_language', language, mode: state.expressionMode }));
      setStatus(`正在切换到${language}…`, 'connecting');
    }
  });
  faceLayer.querySelectorAll('#b74-mode-wrap [data-mode]').forEach(button => {
    button.addEventListener('click', () => setExpressionMode(button.dataset.mode));
  });
  updateExpressionModeUI();
  return faceLayer;
}

function modeLabel(mode) {
  return mode === 'local' ? '地方口语' : mode === 'other' ? '其他地方' : '原文 + 方言';
}

function updateExpressionModeUI() {
  if (!faceLayer) return;
  faceLayer.querySelectorAll('#b74-mode-wrap [data-mode]').forEach(button => {
    const active = button.dataset.mode === state.expressionMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setExpressionMode(mode) {
  state.expressionMode = ['accent', 'local', 'other'].includes(mode) ? mode : 'accent';
  updateExpressionModeUI();
  if (state.connected && state.ws?.readyState === WebSocket.OPEN) {
    stopPlayback();
    state.ws.send(JSON.stringify({ type: 'cancel' }));
    state.ws.send(JSON.stringify({ type: 'switch_mode', mode: state.expressionMode, language: state.language }));
    setStatus(`已切换到${modeLabel(state.expressionMode)}`, 'connecting');
  }
}

function setSubtitle(text) {
  state.subtitleText = String(text || '').trim();
  if (faceLayer) {
    const node = faceLayer.querySelector('#b74-subtitle');
    if (node) node.textContent = state.subtitleText;
  }
}

function setStatus(text, mode = 'idle') {
  if (statusNode) {
    statusNode.textContent = text;
    statusNode.dataset.state = mode === 'hide' ? 'hide' : 'show';
  }
}

function setLayerVisible(visible) {
  if (!faceLayer) return;
  faceLayer.hidden = !visible;
  requestAnimationFrame(() => faceLayer.classList.toggle('visible', visible));
}

function absoluteAsset(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${BASE_PATH}${path}`;
}

function applyCharacter(profile) {
  if (!profile) return;
  state.profile = profile;
  posterUrl = absoluteAsset(profile.main_image || profile.portrait) || DEFAULT_POSTER;
  if (transitionLayer) {
    const image = transitionLayer.querySelector('img');
    if (image) image.src = posterUrl;
  }
  if (faceLayer) {
    const poster = faceLayer.querySelector('#b74-face-poster');
    const backdrop = faceLayer.querySelector('#b74-face-backdrop');
    const title = faceLayer.querySelector('#b74-face-title');
    if (poster) poster.src = posterUrl;
    if (backdrop) backdrop.style.backgroundImage = `url('${BACKDROP}')`;
    if (title) title.textContent = profile.formal_name || '云栖考拉';
  }
  renderVideoStateLayer();
  setVideoState('idle');
}

function ensureLifeLoopPlaying() {
  const video = state.videoElements.get('life');
  if (!video) return;
  if (state.closing || !faceLayer || faceLayer.hidden) return;
  if (video.paused) video.play().catch(() => {});
}

function startLifeLoopWatchdog() {
  if (state.lifeLoopTimer) return;
  state.lifeLoopTimer = setInterval(ensureLifeLoopPlaying, 700);
}

function stopLifeLoopWatchdog() {
  if (state.lifeLoopTimer) clearInterval(state.lifeLoopTimer);
  state.lifeLoopTimer = null;
}

function renderVideoStateLayer() {
  if (!faceLayer) return;
  const container = faceLayer.querySelector('#b74-video-states');
  if (!container) return;
  state.videoToken += 1;
  for (const video of state.videoElements.values()) {
    try { video.pause(); } catch {}
    video.removeAttribute('src');
    video.load();
  }
  state.videoElements.clear();
  container.innerHTML = '';
  faceLayer.classList.remove('video-ready');

  const profile = state.profile;
  const videoStates = profile?.video_states?.states;
  const singleLoop = profile?.video_states?.life_loop || (profile?.video_states?.mode === 'single_loop' ? profile.video_states.single_loop : null);
  if (!videoStates && !singleLoop) return;
  if (singleLoop) startLifeLoopWatchdog();

  const definitions = singleLoop
    ? [['life', singleLoop]]
    : ['idle', 'listening', 'thinking', 'speaking']
        .filter(stateName => videoStates?.[stateName]?.source)
        .map(stateName => [stateName, videoStates[stateName]]);

  for (const [stateName, clip] of definitions) {
    const video = document.createElement('video');
    video.className = 'b74-state-video';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.volume = 0;
    if (singleLoop) {
      video.loop = true;
      video.autoplay = true;
      video.addEventListener('ended', () => video.play().catch(() => {}));
      video.addEventListener('pause', () => {
        if (!state.closing && faceLayer && !faceLayer.hidden) setTimeout(() => video.play().catch(() => {}), 120);
      });
    }
    video.dataset.stateName = stateName;
    video.dataset.start = String(clip.start ?? 0);
    video.dataset.end = String(clip.end ?? 2.5);
    video.classList.add('is-active');
    video.src = absoluteAsset(clip.source);
    video.addEventListener('loadeddata', () => {
      faceLayer.classList.add('video-ready');
      try { video.currentTime = Number(video.dataset.start) || 0; } catch {}
      video.play().catch(() => {});
      if (!singleLoop) monitorVideo(video, state.videoToken);
    });
    container.appendChild(video);
    state.videoElements.set(stateName, video);
  }
}

function monitorVideo(video, token) {
  if (token !== state.videoToken || !video.classList.contains('is-active')) return;
  const start = Number(video.dataset.start) || 0;
  const end = Number(video.dataset.end) || start + 2;
  if (video.currentTime >= end || video.currentTime < start - 0.08) {
    try { video.currentTime = start; } catch {}
  }
  if (video.requestVideoFrameCallback) {
    video.requestVideoFrameCallback(() => monitorVideo(video, token));
  } else {
    setTimeout(() => monitorVideo(video, token), 40);
  }
}

function setVideoState(nextState) {
  state.videoState = nextState;
  if (!faceLayer) return;
  const videoStates = state.profile?.video_states?.states;
  const singleLoop = state.profile?.video_states?.life_loop || (state.profile?.video_states?.mode === 'single_loop' ? state.profile.video_states.single_loop : null);
  if (!videoStates && !singleLoop) return;
  if (singleLoop) {
    const video = state.videoElements.get('life');
    if (video) {
      if (video.readyState >= 2) {
        faceLayer.classList.add('video-ready');
        video.play().catch(() => {});
      }
      startLifeLoopWatchdog();
    }
    return;
  }
  state.videoToken += 1;
  const token = state.videoToken;
  for (const [name, video] of state.videoElements) {
    const active = name === nextState;
    video.classList.toggle('is-active', active);
    if (!active) {
      try { video.pause(); } catch {}
      continue;
    }
    if (video.readyState >= 2) {
      faceLayer.classList.add('video-ready');
      const start = Number(video.dataset.start) || 0;
      if (Math.abs(video.currentTime - start) > 0.25) {
        try { video.currentTime = start; } catch {}
      }
      video.play().catch(() => {});
      monitorVideo(video, token);
    }
  }
}

function stopVideoLayer() {
  stopLifeLoopWatchdog();
  state.videoToken += 1;
  for (const video of state.videoElements.values()) {
    try { video.pause(); } catch {}
  }
  if (faceLayer) faceLayer.classList.remove('video-ready');
}

function mergeInt16(left, right) {
  if (!left.length) return right;
  if (!right.length) return left;
  const merged = new Int16Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

function downsampleToInt16(input, inputRate) {
  if (inputRate === INPUT_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / INPUT_RATE;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function enqueuePcm(pcm) {
  const merged = mergeInt16(state.pcmLeftover, pcm);
  let offset = 0;
  while (offset + INPUT_CHUNK_SAMPLES <= merged.length) {
    const chunk = merged.subarray(offset, offset + INPUT_CHUNK_SAMPLES);
    state.sendQueue.push(bytesToBase64(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
    offset += INPUT_CHUNK_SAMPLES;
  }
  state.pcmLeftover = merged.slice(offset);
  if (state.sendQueue.length > 24) state.sendQueue.splice(0, state.sendQueue.length - 24);
}

function flushAudioQueue() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN || state.closing) return;
  const data = state.sendQueue.shift() || SILENCE_B64;
  state.ws.send(JSON.stringify({ type: 'audio', data }));
}

async function initializeAudio() {
  if (!state.audioCtx) state.audioCtx = new AudioContext({ latencyHint: 'interactive' });
  await state.audioCtx.resume();
  if (!state.mediaDest) state.mediaDest = state.audioCtx.createMediaStreamDestination();
  if (!state.captureSink) state.captureSink = state.audioCtx.createMediaStreamDestination();
  if (!state.outputAudio) {
    const output = document.createElement('audio');
    output.id = 'b74-audio-output';
    output.autoplay = true;
    output.playsInline = true;
    output.setAttribute('playsinline', '');
    output.style.display = 'none';
    document.body.appendChild(output);
    state.outputAudio = output;
  }
  if (state.outputAudio.srcObject !== state.mediaDest.stream) state.outputAudio.srcObject = state.mediaDest.stream;
  state.outputAudio.play().catch(() => {});
  const usableStream = state.mediaStream && state.mediaStream.getAudioTracks().some(track => track.readyState === "live");
  if (!usableStream) {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }
  for (const track of state.mediaStream.getAudioTracks()) track.enabled = true;
  if (!state.sourceNode) {
    state.sourceNode = state.audioCtx.createMediaStreamSource(state.mediaStream);
    state.processor = state.audioCtx.createScriptProcessor(2048, 1, 1);
    state.sinkGain = state.audioCtx.createGain();
    state.sinkGain.gain.value = 0;
    state.sourceNode.connect(state.processor);
    state.processor.connect(state.sinkGain);
    state.sinkGain.connect(state.captureSink);
    state.processor.onaudioprocess = event => {
      if (!state.connected || state.closing || state.muted) return;
      const input = event.inputBuffer.getChannelData(0);
      updateVoiceActivity(input);
      enqueuePcm(downsampleToInt16(input, event.inputBuffer.sampleRate || state.audioCtx.sampleRate));
    };
  }
  if (!state.sendTimer) state.sendTimer = setInterval(flushAudioQueue, 20);
}

function stopAudioCapture() {
  if (state.sendTimer) clearInterval(state.sendTimer);
  state.sendTimer = null;
  state.sendQueue = [];
  state.pcmLeftover = new Int16Array(0);
  if (state.processor) state.processor.onaudioprocess = null;
  try { state.sourceNode?.disconnect(); } catch {}
  try { state.processor?.disconnect(); } catch {}
  try { state.sinkGain?.disconnect(); } catch {}
  state.sourceNode = null;
  state.processor = null;
  state.sinkGain = null;
  if (state.mediaStream) for (const track of state.mediaStream.getAudioTracks()) track.enabled = false;
}

function sendClientMetric(name, value) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  if (!Number.isFinite(Number(value))) return;
  state.ws.send(JSON.stringify({ type: 'client_metric', name, value: Number(value) }));
}

function stopPlayback() {
  for (const source of state.playbackSources) {
    try { source.stop(); } catch {}
  }
  state.playbackSources.clear();
  state.audioQueue = [];
  state.audioQueuedSeconds = 0;
  state.playbackStarted = false;
  state.audioResponseDone = false;
  state.firstAudioDeltaAt = 0;
  state.playbackStartAt = 0;
  state.nextPlayTime = 0;
}

function drainAudioQueue() {
  if (!state.audioCtx || !state.audioQueue.length) return;
  while (state.audioQueue.length) {
    const buffer = state.audioQueue.shift();
    state.audioQueuedSeconds = Math.max(0, state.audioQueuedSeconds - buffer.duration);
    const source = state.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(state.mediaDest || state.audioCtx.destination);
    const startAt = Math.max(state.audioCtx.currentTime + 0.015, state.nextPlayTime || state.audioCtx.currentTime + 0.015);
    source.start(startAt);
    state.nextPlayTime = startAt + buffer.duration;
    state.playbackSources.add(source);
    source.onended = () => state.playbackSources.delete(source);
  }
}

function startBufferedPlayback() {
  if (state.playbackStarted || !state.audioQueue.length) return;
  state.playbackStarted = true;
  state.playbackStartAt = performance.now();
  if (state.firstAudioDeltaAt) sendClientMetric('first_audio_to_play_ms', state.playbackStartAt - state.firstAudioDeltaAt);
  sendClientMetric('jitter_buffer_ms', Math.round(state.audioQueuedSeconds * 1000));
  drainAudioQueue();
}

function enqueuePcmAudio(base64) {
  if (!state.audioCtx) return;
  const bytes = base64ToBytes(base64);
  if (bytes.byteLength < 2) return;
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const buffer = state.audioCtx.createBuffer(1, pcm.length, OUTPUT_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768;
  state.audioQueue.push(buffer);
  state.audioQueuedSeconds += buffer.duration;
  if (!state.firstAudioDeltaAt) {
    state.firstAudioDeltaAt = performance.now();
    if (state.userVoiceEndAt) {
      sendClientMetric('vad_end_to_first_audio_ms', state.firstAudioDeltaAt - state.userVoiceEndAt);
      state.userVoiceEndAt = 0;
    }
  }
  if (!state.playbackStarted && (state.audioQueuedSeconds >= JITTER_TARGET_SECONDS || state.audioResponseDone)) {
    startBufferedPlayback();
  } else if (state.playbackStarted) {
    drainAudioQueue();
  }
}

function triggerUserInterrupt() {
  if (state.interruptSent) return;
  state.interruptSent = true;
  const now = performance.now();
  if (state.userVoiceStartAt) sendClientMetric('interrupt_to_stop_ms', now - state.userVoiceStartAt);
  if (state.assistantSpeechStartedAt && now - state.assistantSpeechStartedAt < 400) {
    sendClientMetric('false_turn', 1);
  }
  stopPlayback();
  state.phase = 'listening';
  setVideoState('listening');
  setStatus('正在听你说', 'listening');
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'cancel' }));
  }
}

function updateVoiceActivity(input) {
  if (!input.length) return;
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
  const rms = Math.sqrt(sum / input.length);
  if (rms >= VAD_RMS_THRESHOLD) {
    state.voiceFrames += 1;
    state.quietFrames = 0;
    if (!state.userSpeaking && state.voiceFrames >= VAD_VOICE_FRAMES) {
      state.userSpeaking = true;
      state.userVoiceStartAt = performance.now();
      if (state.phase === 'speaking' || state.playbackStarted || state.audioQueue.length) {
        triggerUserInterrupt();
      }
    }
  } else {
    state.voiceFrames = 0;
    state.quietFrames += 1;
    if (state.userSpeaking && state.quietFrames >= VAD_QUIET_FRAMES) {
      state.userSpeaking = false;
      state.userVoiceEndAt = performance.now();
    }
  }
}

function openingText(language) {
  const name = state.profile?.formal_name || '云栖考拉';
  const mood = String(state.mood || '').trim();
  if (language === '英语') {
    return mood
      ? `Hello, I am ${name}. I am coming out with a feeling of ${mood}. Let me tell you how I feel before we talk.`
      : `Hello, I am ${name}, one of the Seven Star Messengers. What would you like to talk about?`;
  }
  return mood
    ? `你好，我是${name}。我现在带着一点${mood}的心情出来，先想和你说说这份心情，再慢慢听你说。`
    : `你好，我是七星使者${name}。你有什么要说的吗？`;
}

function openingPrompt(language, expressionMode = 'accent') {
  if (language === '英语') return 'Speak in natural conversational English.';
  if (language === '普通话') return '用自然、亲切、温暖的普通话说这句话。';
  if (expressionMode === 'local') return `直接使用自然的${language}地方口语说这句话，句式要像当地人日常聊天。`;
  if (expressionMode === 'other') return `保留普通话词义，使用邻近地区常见、易懂的${language}口音和表达说这句话。`;
  return `只给普通话原文加入自然、不过度夸张的${language}口音，不要把词义改成方言词。`;
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = window.__B74_WS_URL || `${protocol}//${location.host}${BASE_PATH}/ws/doubao`;
  const ws = new WebSocket(wsUrl);
  state.ws = ws;
  state.closing = false;
  setStatus('正在让云栖考拉出来…', 'connecting');

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'start',
      language: state.language,
      mode: state.expressionMode,
      characterId: state.profile?.character_id || DEFAULT_CHARACTER_ID,
      speaker: selectedSpeakerFor(state.profile),
    }));
  };
  ws.onmessage = message => {
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    handleServerEvent(event);
  };
  ws.onerror = () => setStatus('连接出现问题', 'idle');
  ws.onclose = () => {
    state.connected = false;
    stopAudioCapture();
    stopPlayback();
  };
}

function handleServerEvent(event) {
  switch (event.type) {
    case 'proxy.character_ready':
      if (!state.profile && event.characterId) {
        const profile = state.characters.find(item => item.character_id === event.characterId);
        if (profile) applyCharacter(profile);
      }
      break;
    case 'proxy.language_ready':
      state.language = event.language || state.language;
      if (faceLayer) {
        const select = faceLayer.querySelector('#b74-language');
        if (select && event.language && select.value !== event.language) select.value = event.language;
      }
      if (event.source === 'voice_intent') setStatus(`已切换到${state.language}`, 'idle');
      break;
    case 'proxy.mode_ready':
      state.expressionMode = event.mode || state.expressionMode;
      updateExpressionModeUI();
      break;
    case 'proxy.voice_ready':
      state.currentSpeaker = event.speaker || state.currentSpeaker;
      renderVoiceAudition();
      break;
    case 'session.created':
      state.connected = true;
      state.phase = 'speaking';
      state.interruptSent = false;
      state.assistantSpeechStartedAt = performance.now();
      setVideoState('speaking');
      setStatus(`${state.profile?.formal_name || '使者'}正在说`, 'speaking');
      if (!state.openingSent) {
        state.openingSent = true;
        state.ws.send(JSON.stringify({
          type: 'say',
          text: openingText(state.language),
          tts_prompt: openingPrompt(state.language, state.expressionMode) + (state.mood ? ` 语气要自然体现“${state.mood}”的情绪。` : ''),
        }));
      }
      break;
    case 'conversation.item.input_audio_transcription.started':
      setSubtitle('');
      if (state.phase === 'speaking' || state.playbackStarted || state.audioQueue.length) triggerUserInterrupt();
      else stopPlayback();
      state.interruptSent = false;
      state.phase = 'listening';
      setVideoState('listening');
      setStatus('正在听你说', 'listening');
      break;
    case 'conversation.item.input_audio_transcription.completed':
      setSubtitle(event.transcript || '');
      state.phase = 'thinking';
      setVideoState('thinking');
      setStatus('云栖考拉正在想…', 'thinking');
      break;
    case 'response.output_audio.started':
      state.phase = 'speaking';
      state.interruptSent = false;
      state.assistantSpeechStartedAt = performance.now();
      state.audioResponseDone = false;
      state.firstAudioDeltaAt = 0;
      setVideoState('speaking');
      setStatus(`${state.profile?.formal_name || '使者'}正在说`, 'speaking');
      break;
    case 'response.output_text.delta':
      setSubtitle((state.subtitleText || '') + (event.delta || ''));
      break;
    case 'response.output_text.done':
      setSubtitle(event.text || state.subtitleText || '');
      break;
    case 'response.output_audio.delta':
      if (event.delta) enqueuePcmAudio(event.delta);
      break;
    case 'response.output_audio.done':
      state.audioResponseDone = true;
      if (!state.playbackStarted) startBufferedPlayback();
      setTimeout(() => {
        if (state.connected && state.phase === 'speaking' && !state.playbackSources.size && !state.audioQueue.length) {
          state.phase = 'idle';
          setVideoState('idle');
          setStatus('正在等待你', 'idle');
        }
      }, 650);
      break;
    case 'response.canceled':
      state.audioResponseDone = true;
      stopPlayback();
      state.phase = 'listening';
      setVideoState('listening');
      setStatus('正在听你说', 'listening');
      break;
    case 'response.done':
      state.audioResponseDone = true;
      if (!state.playbackStarted) startBufferedPlayback();
      setTimeout(() => {
        if (state.connected && state.phase === 'speaking' && !state.playbackSources.size && !state.audioQueue.length) {
          state.phase = 'idle';
          setVideoState('idle');
          setStatus('正在等待你', 'idle');
        }
      }, 650);
      break;
    case 'session.closed':
      stopPlayback();
      stopVideoLayer();
      if (state.ws?.readyState === WebSocket.OPEN) state.ws.close(1000, 'closed');
      break;
    case 'error':
    case 'proxy.error':
      setStatus('连接出现问题', 'idle');
      console.error('[B74 Doubao]', event.error || event);
      break;
    case 'proxy.upstream_closed':
      setStatus('对话已结束', 'idle');
      break;
    default:
      break;
  }
}

async function openFaceToFace() {
  if (faceLayer && !faceLayer.hidden) return;
  if (voicePanel && !voicePanel.hidden) toggleVoiceAudition(false);
  createTransition();
  document.body.classList.add('b74-transitioning');
  createFaceLayer();
  setLayerVisible(true);
  state.phase = 'idle';
  setVideoState('idle');
  setStatus('正在获取麦克风…', 'connecting');
  setTimeout(() => {
    if (faceLayer && !faceLayer.hidden) {
      transitionLayer?.remove();
      transitionLayer = null;
    }
  }, 950);
  try {
    await initializeAudio();
  } catch (error) {
    setStatus('需要麦克风权限', 'idle');
    console.error('[B74 microphone]', error);
    return false;
  }
  setTimeout(connect, 850);
  return true;
}

function sendClose() {
  state.closing = true;
  stopAudioCapture();
  stopPlayback();
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'close' }));
    setTimeout(() => {
      try { state.ws?.close(1000, 'client closed'); } catch {}
    }, 1800);
  }
}

function finishSession({ returnHome = true } = {}) {
  if (state.closing && !faceLayer?.hidden) return;
  if (voicePanel && !voicePanel.hidden) toggleVoiceAudition(false);
  sendClose();
  stopVideoLayer();
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'b74-session-ended' }, '*'); } catch (error) {}
  setStatus('正在回到地球…', 'idle');
  const returning = createTransition({ returning: true });
  setTimeout(() => {
    returning.classList.add('returning');
    setLayerVisible(false);
  }, 120);
  setTimeout(() => {
    returning.remove();
    transitionLayer = null;
    document.body.classList.remove('b74-transitioning');
    state.connected = false;
    state.openingSent = false;
    state.closing = false;
    if (faceLayer) faceLayer.hidden = true;
  }, 1150);
}

let talkButtonTimerHandle = null;
function ensureTalkButton() {
  const actions = document.querySelector('.voice-card-actions');
  const worldButton = actions?.querySelector('.voice-world-button');
  if (!actions || !worldButton) {
    if (talkButton) {
      clearTimeout(talkButtonTimerHandle);
      talkButton.classList.remove('ready');
      talkButton.hidden = true;
    }
    return;
  }
  if (!talkButton) {
    talkButton = document.createElement('button');
    talkButton.id = 'b74-talk-button';
    talkButton.type = 'button';
    talkButton.textContent = '和我说说话';
    talkButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openFaceToFace();
    });
    document.body.appendChild(talkButton);
  }
  talkButton.hidden = false;
  clearTimeout(talkButtonTimerHandle);
  requestAnimationFrame(() => {
    talkButtonTimerHandle = setTimeout(() => {
      if (document.querySelector('.voice-world-button')) talkButton.classList.add('ready');
    }, 900);
  });
}


function stopVoicePreview() {
  if (state.previewAudio) {
    try { state.previewAudio.pause(); } catch {}
    state.previewAudio = null;
  }
}

function playVoiceCandidate(candidate, characterId) {
  const preview = candidate?.language_previews?.[state.auditionLanguage] || candidate?.preview;
  if (!preview) return;
  stopVoicePreview();
  const audio = new Audio(absoluteAsset(preview));
  state.previewAudio = audio;
  audio.addEventListener('ended', () => {
    if (state.previewAudio === audio) state.previewAudio = null;
    renderVoiceAudition();
  }, { once: true });
  audio.play().catch(error => console.error('[B74 voice audition]', error));
  renderVoiceAudition();
}

function applyVoiceCandidate(characterId, candidate) {
  if (!candidate?.speaker) return;
  state.voiceSelections[characterId] = candidate.speaker;
  saveVoiceSelections();
  const profile = state.characters.find(item => item.character_id === characterId);
  if (profile && state.profile?.character_id === characterId && state.connected && state.ws?.readyState === WebSocket.OPEN) {
    stopPlayback();
    state.ws.send(JSON.stringify({ type: 'cancel' }));
    state.ws.send(JSON.stringify({ type: 'switch_voice', speaker: candidate.speaker }));
    setStatus(`正在切换到 ${candidate.label}…`, 'connecting');
  }
  renderVoiceAudition();
}

function renderVoiceAudition() {
  if (!voicePanel) return;
  const list = voicePanel.querySelector('#b74-voice-list');
  if (!list) return;
  const languageSelect = voicePanel.querySelector('#b74-voice-language');
  if (languageSelect && languageSelect.value !== state.auditionLanguage) languageSelect.value = state.auditionLanguage;
  list.innerHTML = '';
  for (const profile of state.characters) {
    const section = document.createElement('section');
    section.className = 'b74-voice-character';
    const selected = state.voiceSelections[profile.character_id] || profile.voice?.speaker;
    section.innerHTML = `
      <div class="b74-voice-character-head">
        <img src="${absoluteAsset(profile.portrait || profile.main_image)}" alt="">
        <div><b>${profile.formal_name}</b><small>当前试听选择：${voiceLabelFor(profile, selected)}</small></div>
      </div>
      <div class="b74-voice-candidates"></div>
    `;
    const holder = section.querySelector('.b74-voice-candidates');
    for (const candidate of (profile.voice?.candidates || [])) {
      const supported = candidate.verified?.languages?.[state.auditionLanguage] !== false;
      const selectedNow = selected === candidate.speaker;
      const row = document.createElement('div');
      row.className = `b74-voice-row${selectedNow ? ' is-selected' : ''}`;
      row.innerHTML = `
        <div class="b74-voice-row-copy">
          <b>${candidate.label}</b>
          <small>${candidate.direction || ''}</small>
          <code>${candidate.speaker}</code>
        </div>
        <div class="b74-voice-row-actions">
          <button type="button" data-action="play" ${supported ? '' : 'disabled'}>${supported ? '试听' : '该语言未验证'}</button>
          <button type="button" data-action="apply" ${selectedNow ? 'disabled' : ''}>${selectedNow ? '当前' : '设为测试音色'}</button>
        </div>
      `;
      row.querySelector('[data-action="play"]')?.addEventListener('click', () => playVoiceCandidate(candidate, profile.character_id));
      row.querySelector('[data-action="apply"]')?.addEventListener('click', () => applyVoiceCandidate(profile.character_id, candidate));
      holder.appendChild(row);
    }
    list.appendChild(section);
  }
}

function toggleVoiceAudition(show) {
  if (!voicePanel || !voiceButton) return;
  if (!show) stopVoicePreview();
  voicePanel.hidden = !show;
  voiceButton.textContent = show ? '收起音色' : '音色试听';
  if (show) renderVoiceAudition();
}

function ensureVoiceAuditionButton() {
  if (!voiceButton) {
    voiceButton = document.createElement('button');
    voiceButton.id = 'b74-voice-button';
    voiceButton.type = 'button';
    voiceButton.textContent = '音色试听';
    voiceButton.addEventListener('click', () => toggleVoiceAudition(voicePanel?.hidden !== false));
    document.body.appendChild(voiceButton);
  }
  if (!voicePanel) {
    voicePanel = document.createElement('section');
    voicePanel.id = 'b74-voice-picker';
    voicePanel.hidden = true;
    voicePanel.innerHTML = `
      <div class="b74-voice-panel">
        <div class="b74-voice-head">
          <div><b>七星使者音色试听 V1</b><small>仅内部测试，不会自动决定正式声音</small></div>
          <button type="button" aria-label="关闭">×</button>
        </div>
        <div class="b74-voice-note">统一试听句：你好，我是七星使者。很高兴在这里遇见你。今天想聊点什么？工作、生活、心里的事情，都可以慢慢说。</div>
        <div class="b74-voice-toolbar">
          <label for="b74-voice-language">试听语言</label>
          <select id="b74-voice-language">
            <option value="普通话">普通话</option>
            <option value="四川话">四川话</option>
            <option value="陕西话">陕西话</option>
            <option value="粤语">粤语</option>
            <option value="东北话">东北话</option>
            <option value="上海话">上海话</option>
            <option value="英语">English</option>
          </select>
          <span>试听只播放缓存样本；设为测试音色只影响当前 Candidate</span>
        </div>
        <div id="b74-voice-list"></div>
      </div>
    `;
    voicePanel.querySelector('button[aria-label="关闭"]').addEventListener('click', () => toggleVoiceAudition(false));
    voicePanel.addEventListener('click', event => {
      if (event.target === voicePanel) toggleVoiceAudition(false);
    });
    voicePanel.querySelector('#b74-voice-language').addEventListener('change', event => {
      state.auditionLanguage = event.target.value;
      stopVoicePreview();
      renderVoiceAudition();
    });
    document.body.appendChild(voicePanel);
  }
}

let characterButton = null;
let characterPanel = null;

function renderCharacterPicker() {
  if (!characterPanel) return;
  const grid = characterPanel.querySelector('#b74-character-grid');
  grid.innerHTML = '';
  for (const profile of state.characters) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'b74-character-card';
    if (profile.character_id === state.profile?.character_id) button.classList.add('is-selected');
    button.innerHTML = `
      <img src="${absoluteAsset(profile.portrait || profile.main_image)}" alt="${profile.formal_name}">
      <span>${profile.formal_name}</span>
    `;
    button.addEventListener('click', () => {
      applyCharacter(profile);
      toggleCharacterPicker(false);
      openFaceToFace();
    });
    grid.appendChild(button);
  }
}

function toggleCharacterPicker(show) {
  if (!characterPanel || !characterButton) return;
  characterPanel.hidden = !show;
  characterButton.textContent = show ? '收起使者' : '选择使者';
}

function ensureCharacterPicker() {
  if (!state.characters.length) return;
  if (!characterButton) {
    characterButton = document.createElement('button');
    characterButton.id = 'b74-character-button';
    characterButton.type = 'button';
    characterButton.textContent = '选择使者';
    characterButton.addEventListener('click', () => toggleCharacterPicker(characterPanel?.hidden !== false));
    document.body.appendChild(characterButton);
  }
  if (!characterPanel) {
    characterPanel = document.createElement('section');
    characterPanel.id = 'b74-character-picker';
    characterPanel.hidden = true;
    characterPanel.innerHTML = `
      <div class="b74-character-panel">
        <div class="b74-character-head">
          <b>选择使者测试</b>
          <button type="button" aria-label="关闭">×</button>
        </div>
        <div id="b74-character-grid"></div>
      </div>
    `;
    characterPanel.querySelector('button[aria-label="关闭"]').addEventListener('click', () => toggleCharacterPicker(false));
    characterPanel.addEventListener('click', event => {
      if (event.target === characterPanel) toggleCharacterPicker(false);
    });
    document.body.appendChild(characterPanel);
  }
  renderCharacterPicker();
  ensureVoiceAuditionButton();
}

async function loadCharacterRegistry() {
  try {
    const response = await fetch(window.__B74_REGISTRY_URL || `${BASE_PATH}/api/characters`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const registry = await response.json();
    state.characters = registry.characters || [];
    const current = state.characters.find(item => item.character_id === DEFAULT_CHARACTER_ID) || state.characters[0];
    if (current) applyCharacter(current);
    ensureCharacterPicker();
    ensureVoiceAuditionButton();
    renderVoiceAudition();
  } catch (error) {
    console.error('[B74 characters]', error);
  }
}

const observer = new MutationObserver(() => ensureTalkButton());
observer.observe(document.body, { childList: true, subtree: true });
ensureTalkButton();
window.__b74Ready = loadCharacterRegistry();
window.__b74OpenFaceToFace = openFaceToFace;
window.__b74SetMood = function(mood) { state.mood = String(mood || "").trim(); };
window.__b74CloseForReuse = function() {
  try { sendClose(); } catch (error) {}
  try { stopVideoLayer(); } catch (error) {}
  state.openingSent = false;
  state.subtitleText = "";
  try { state.outputAudio?.pause(); } catch (error) {}
  if (faceLayer) faceLayer.hidden = true;
  document.body.classList.remove("b74-transitioning");
  try { transitionLayer?.remove(); } catch (error) {}
  transitionLayer = null;
};
window.__b74SelectCharacter = function(characterId) {
  const id = String(characterId || '').trim();
  const profile = state.characters.find(item => item.character_id === id);
  if (!profile) return false;
  applyCharacter(profile);
  return true;
};

function releaseMicrophone() {
  try { state.outputAudio?.pause(); } catch (error) {}
  try { state.outputAudio?.remove(); } catch (error) {}
  state.outputAudio = null;
  try { state.mediaDest?.disconnect(); } catch (error) {}
  state.mediaDest = null;
  try { state.captureSink?.disconnect(); } catch (error) {}
  state.captureSink = null;
  try { state.audioCtx?.close(); } catch (error) {}
  state.audioCtx = null;
  if (!state.mediaStream) return;
  for (const track of state.mediaStream.getTracks()) track.stop();
  state.mediaStream = null;
}

window.addEventListener('pagehide', () => { stopVideoLayer(); sendClose(); releaseMicrophone(); });
window.addEventListener('offline', sendClose);
