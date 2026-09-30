import http from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, extname, normalize } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { resolveVoiceChannel, synthesizeDialectPcm } from './dialect-tts.mjs';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 8784);
const UPSTREAM_URL = 'wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue';
const MODEL = process.env.DOUBAO_S2S_MODEL || '1.2.6.1';
const RESOURCE_ID = 'volc.speech.dialog';
const DOUBAO_ENV_PATH = process.env.DOUBAO_S2S_ENV_FILE || `${process.env.HOME}/.config/lugu-love/doubao-realtime.env`;
const DASHSCOPE_ENV_PATH = process.env.DASHSCOPE_ENV_FILE || `${process.env.HOME}/.config/lugu-love/dashscope.env`;
const FORMAL_ROOT = resolve(process.env.B74_FORMAL_ROOT || '/tmp/b74-doubao-formal-release/candidate-20260920-nuanshan-bear-r1');
const CANDIDATE_ROOT = resolve(new URL('.', import.meta.url).pathname);
const WORLD_KNOWLEDGE_PATH = resolve(CANDIDATE_ROOT, 'world-knowledge.v0.1.json');
const CHARACTERS_PATH = resolve(CANDIDATE_ROOT, 'characters.v1.json');
const VOICE_SYSTEM_PATH = resolve(CANDIDATE_ROOT, 'voice-system.v1.json');
const DEFAULT_LANGUAGE = '普通话';
const MAX_CONCURRENT_SESSIONS = Number(process.env.B74_MAX_CONCURRENT_SESSIONS || 3);
const MAX_SESSION_MS = Number(process.env.B74_MAX_SESSION_MS || 20 * 60 * 1000);
const MAX_IDLE_MS = Number(process.env.B74_MAX_IDLE_MS || 120000);
const VAD_END_SMOOTH_MS = Number(process.env.B74_VAD_END_SMOOTH_MS || 800);
let activeSessionCount = 0;
const runtimeMetrics = {
  sessions_started: 0,
  sessions_closed: 0,
  response_latency_samples_ms: [],
  last_response_latency_ms: null,
  max_response_latency_ms: null,
  audio_gap_samples_ms: [],
  max_audio_gap_ms: null,
  cancels: 0,
  jitter_buffer_samples_ms: [],
  last_jitter_buffer_ms: null,
  max_jitter_buffer_ms: null,
  first_audio_to_play_samples_ms: [],
  last_first_audio_to_play_ms: null,
  vad_end_to_first_audio_samples_ms: [],
  last_vad_end_to_first_audio_ms: null,
  max_vad_end_to_first_audio_ms: null,
  interrupt_stop_samples_ms: [],
  last_interrupt_stop_ms: null,
  client_false_turn_count: 0,
  last_language: null,
  last_character: null,
  last_voice: null,
  last_session_seconds: null,
  current_character: null,
  language_mode: null,
  voice_provider: null,
  active_speaker: null,
  language_switch_source: null,
  language_switch_at: null,
  last_voice_intent_text: null,
  language_switch_history: [],
};

const LANGUAGE_MODE_KEYS = {
  '普通话': 'mandarin',
  '四川话': 'sichuan',
  '陕西话': 'shaanxi',
  '粤语': 'cantonese',
  '东北话': 'northeast',
  '上海话': 'shanghainese',
  '英语': 'english',
};

const LANGUAGE_INTENT_PATTERNS = {
  '四川话': [
    /(?:说|讲|聊|换|切|用|改成|换成|跟我|和我|要).{0,8}四川话/,
    /四川话.{0,8}(?:说|讲|聊|跟我|跟我聊|和我说)/,
  ],
  '陕西话': [
    /(?:说|讲|聊|换|切|用|改成|换成|跟我|和我|要).{0,8}陕西话/,
    /陕西话.{0,8}(?:说|讲|聊|跟我|跟我聊|和我说)/,
  ],
  '粤语': [
    /(?:说|讲|聊|换|切|用|改成|换成|跟我|和我|要).{0,8}(?:粤语|广东话)/,
    /(?:粤语|广东话).{0,8}(?:说|讲|聊|跟我|跟我聊|和我说)/,
  ],
  '东北话': [
    /(?:说|讲|聊|换|切|用|改成|换成|跟我|和我|要).{0,8}东北话/,
    /东北话.{0,8}(?:说|讲|聊|跟我|跟我聊|和我说)/,
  ],
  '上海话': [
    /(?:说|讲|聊|换|切|用|改成|换成|跟我|和我|要).{0,8}上海话/,
    /上海话.{0,8}(?:说|讲|聊|跟我|跟我聊|和我说)/,
  ],
  '普通话': [
    /(?:说|讲|聊|换|切|用|改成|换成|回到|回到用|跟我|和我|要).{0,8}普通话/,
    /还是普通话吧/,
    /普通话说吧/,
  ],
  '英语': [
    /(?:说|讲|聊|换|切|用|改成|换成|跟我|和我|要).{0,8}英语/,
    /\b(?:speak|talk|switch|use|continue|reply|answer)\b.{0,16}\benglish\b/i,
    /\benglish\b.{0,12}\b(?:please|ok|okay)?\b/i,
  ],
};

const LANGUAGE_STYLES = {
  '普通话': '使用自然、清晰、亲切的普通话。',
  '四川话': '请直接使用四川/川渝人的自然日常口语来表达，而不是把普通话逐字换成四川口音。可自然使用常见四川方言词、语气词和句尾习惯；保持原意、事实和人物关系不变，不要堆砌方言词，也不要演成夸张段子。',
  '陕西话': '请直接使用陕西关中人的自然日常口语来表达，而不是把普通话逐字模仿成陕西口音。可自然使用常见关中方言词、语气词和短句习惯；事实、人物关系和原意必须保持不变，不要为了方言感牺牲可理解性。',
  '粤语': '请优先直接使用自然、易懂的粤语口语组织回答，而不只是把普通话逐字套上粤语发音。使用真实粤语句式、语气词和常用表达；必要时可以少量混用普通话帮助理解，但不得改变事实和原意。',
  '东北话': '请直接使用东北人的自然日常口语来表达，而不是给普通话逐字加东北口音。可自然使用常见东北词汇、语气词和表达节奏；保持轻松亲切，不要演成夸张小品腔，事实和人物关系保持不变。',
  '上海话': '请优先直接使用自然、易懂的上海话口语组织回答，而不只是把普通话逐字模仿成上海口音。使用常见上海话词句和语气习惯；必要时可以解释或少量混用普通话，但事实、原意和人物关系不能改变。',
  '英语': '默认使用自然、地道的英语对话。用户用中文提问时可以自然切换中文；涉及项目知识时用英语清楚说明。',
};
const LANGUAGES = Object.keys(LANGUAGE_STYLES);
const PRICES_CNY_PER_TOKEN = {
  input_text_tokens: 10 / 1_000_000,
  input_audio_tokens: 80 / 1_000_000,
  cached_text_tokens: 5 / 1_000_000,
  cached_audio_tokens: 5 / 1_000_000,
  output_text_tokens: 80 / 1_000_000,
  output_audio_tokens: 300 / 1_000_000,
};
const USAGE_KEYS = Object.keys(PRICES_CNY_PER_TOKEN);

let lastUsage = {
  updated_at: null,
  sessions: 0,
  input_audio_seconds: 0,
  output_audio_seconds: 0,
  tokens: Object.fromEntries(USAGE_KEYS.map(key => [key, 0])),
  estimated_cny: 0,
};

function loadEnv(path) {
  const out = {};
  if (process.env.DOUBAO_S2S_API_KEY) out.DOUBAO_S2S_API_KEY = process.env.DOUBAO_S2S_API_KEY;
  if (process.env.DASHSCOPE_API_KEY) out.DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith('#')) continue;
      const index = text.indexOf('=');
      if (index < 0) continue;
      out[text.slice(0, index).trim()] = text.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  return out;
}

const env = { ...loadEnv(DOUBAO_ENV_PATH), ...loadEnv(DASHSCOPE_ENV_PATH) };
const API_KEY = env.DOUBAO_S2S_API_KEY || '';
const DASHSCOPE_API_KEY = env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_PYTHONPATH = process.env.DASHSCOPE_PYTHONPATH || '/opt/lugu-b74/python-deps';
const DASHSCOPE_PYTHON_BIN = process.env.DASHSCOPE_PYTHON_BIN || 'python3';
let currentWorldKnowledge = null;
let currentCharacters = null;
let currentVoiceSystem = null;

function loadWorldKnowledge() {
  const parsed = JSON.parse(readFileSync(WORLD_KNOWLEDGE_PATH, 'utf8'));
  const now = Date.now();
  const items = (parsed.items || []).filter(item => {
    if (item.visibility && item.visibility !== 'public') return false;
    if (item.valid_until && Date.parse(item.valid_until) < now) return false;
    return true;
  });
  const statusText = {
    active: '当前有效',
    building: '建设/开发中，不能描述为已完成',
    planned: '规划中，不能描述为已完成',
  };
  const context = items.map(item => `- ${item.content}（状态：${statusText[item.status] || item.status}）`).join('\n');
  currentWorldKnowledge = { ...parsed, items };
  return { ...parsed, items, context };
}

function loadCharacters() {
  const parsed = JSON.parse(readFileSync(CHARACTERS_PATH, 'utf8'));
  currentCharacters = parsed;
  return parsed;
}

function loadVoiceSystem() {
  const parsed = JSON.parse(readFileSync(VOICE_SYSTEM_PATH, 'utf8'));
  currentVoiceSystem = parsed;
  return parsed;
}

function findCharacter(characterId) {
  const registry = currentCharacters || loadCharacters();
  return (registry.characters || []).find(item => item.character_id === characterId)
    || (registry.characters || []).find(item => item.character_id === 'yunqi-koala')
    || null;
}

function verifiedSpeakerSet() {
  if (!currentVoiceSystem) {
    try { loadVoiceSystem(); } catch {}
  }
  return new Set((currentVoiceSystem?.voices || []).filter(item => item.tts_verified).map(item => item.speaker));
}

function resolveSpeaker(character, requestedSpeaker) {
  const fallback = character?.voice?.speaker || 'zh_female_vv_jupiter_bigtts';
  const requested = typeof requestedSpeaker === 'string' ? requestedSpeaker.trim() : '';
  if (!requested) return fallback;
  const allowed = verifiedSpeakerSet();
  if (allowed.has(requested)) return requested;
  return fallback;
}

function buildInstructions(language, world, character, expressionMode = 'accent') {
  const selected = LANGUAGE_STYLES[language] ? language : DEFAULT_LANGUAGE;
  const profile = character || findCharacter('yunqi-koala');
  const name = profile?.formal_name || '云栖考拉';
  const identity = profile?.base_identity || '七星使者之一。';
  const style = profile?.speaking_style || '自然、真诚、简洁。';
  const lines = [
    `你是${name}，${identity}`,
    `请保持${name}的身份和表达气质，用自然、真诚、简短的方式和用户连续对话，不要解释自己是 AI。`,
    `表达风格：${style}`,
    '你的通用对话能力不受限制。用户聊工作、生活、历史、科技、旅游、电影、英语、闲聊等普通内容时，正常回答，不要强行介绍项目。',
    '只有在用户主动询问云栖考拉、七星使者、泸沽湖、平台、漂流瓶、我的空间、事业共创等项目/世界内容时，才使用下面的世界知识。',
    '世界知识 V0.1：',
    world.context,
    '不要声称建设中或规划中的功能已经完成。',
    LANGUAGE_STYLES[selected],
    expressionMode === 'local'
      ? '表达模式：地方口语。直接使用该地区自然、可理解的日常口语词汇和句式，不要只给普通话换口音。'
      : expressionMode === 'other'
        ? '表达模式：其他地方。保留原文含义，使用邻近地区常见、易懂的口音和表达方式。'
        : '表达模式：原文 + 方言。保留用户的原文词义，只为语音加入自然、不过度夸张的地方口音，不要堆砌方言词。',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildSessionConfig(sessionId, language, world, character, speaker = null, expressionMode = 'accent') {
  const profile = character || findCharacter('yunqi-koala');
  const resolvedSpeaker = resolveSpeaker(profile, speaker);
  return {
    id: sessionId,
    model: MODEL,
    instructions: buildInstructions(language, world, profile, expressionMode),
    audio: {
      input: { format: { type: 'pcm', rate: 16000 } },
      output: {
        format: { type: 'pcm_s16le', rate: 24000 },
        voice: resolvedSpeaker,
      },
    },
    extension: {
      asr: {
        extra: {
          end_smooth_window_ms: VAD_END_SMOOTH_MS,
        },
      },
    },
  };
}

function recalculateUsage() {
  lastUsage.estimated_cny = USAGE_KEYS.reduce((sum, key) => sum + lastUsage.tokens[key] * PRICES_CNY_PER_TOKEN[key], 0);
}

function addUsage(usage) {
  if (!usage || typeof usage !== 'object') return;
  lastUsage.updated_at = new Date().toISOString();
  for (const key of USAGE_KEYS) {
    const value = Number(usage[key] || 0);
    if (Number.isFinite(value)) lastUsage.tokens[key] += value;
  }
  recalculateUsage();
}

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

function safePath(root, relative) {
  const normalized = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const path = resolve(root, normalized);
  return path.startsWith(root) ? path : null;
}

function serveFile(req, res, path) {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error('not file');
    const range = req.headers.range;
    const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) throw new Error('bad range');
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
      createReadStream(path, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    createReadStream(path).pipe(res);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      key_configured: Boolean(API_KEY),
      dashscope_configured: Boolean(DASHSCOPE_API_KEY),
      model: MODEL,
      upstream: UPSTREAM_URL,
      languages: LANGUAGES,
      world_version: currentWorldKnowledge?.version || null,
      voice_system_version: currentVoiceSystem?.version || null,
      active_sessions: activeSessionCount,
      max_concurrent_sessions: MAX_CONCURRENT_SESSIONS,
      max_session_seconds: Math.round(MAX_SESSION_MS / 1000),
      usage: lastUsage,
    });
    return;
  }
  if (pathname === '/api/world') {
    try { json(res, 200, loadWorldKnowledge()); }
    catch (error) { json(res, 500, { error: error.message }); }
    return;
  }
  if (pathname === '/api/characters') {
    try { json(res, 200, currentCharacters || loadCharacters()); }
    catch (error) { json(res, 500, { error: error.message }); }
    return;
  }
  if (pathname === '/api/voice-system') {
    try { json(res, 200, currentVoiceSystem || loadVoiceSystem()); }
    catch (error) { json(res, 500, { error: error.message }); }
    return;
  }
  if (pathname === '/api/usage') {
    json(res, 200, lastUsage);
    return;
  }
  if (pathname === '/api/metrics') {
    json(res, 200, { ...runtimeMetrics, active_sessions: activeSessionCount });
    return;
  }
  if (pathname === '/' || pathname === '/index.html') {
    serveFile(req, res, resolve(CANDIDATE_ROOT, 'index.html'));
    return;
  }
  if (pathname === '/candidate.js') {
    serveFile(req, res, resolve(CANDIDATE_ROOT, 'candidate.js'));
    return;
  }
  if (pathname === '/candidate.css') {
    serveFile(req, res, resolve(CANDIDATE_ROOT, 'candidate.css'));
    return;
  }
  if (pathname === '/world-knowledge.v0.1.json') {
    serveFile(req, res, WORLD_KNOWLEDGE_PATH);
    return;
  }
  if (pathname === '/voice-system.v1.json') {
    serveFile(req, res, VOICE_SYSTEM_PATH);
    return;
  }
  if (pathname.startsWith('/audition/')) {
    const path = safePath(resolve(CANDIDATE_ROOT, 'audition'), pathname.slice('/audition/'.length));
    if (path) serveFile(req, res, path);
    else { res.writeHead(404); res.end('not found'); }
    return;
  }
  if (pathname.startsWith('/formal/')) {
    const path = safePath(FORMAL_ROOT, pathname.slice('/formal/'.length));
    if (path) serveFile(req, res, path);
    else { res.writeHead(404); res.end('not found'); }
    return;
  }
  let relative = pathname.slice(1);
  for (const prefix of ['candidate-20260920-nuanshan-bear-r1/', 'release-20260920-nuanshan-bear-r1/']) {
    if (relative.startsWith(prefix)) {
      relative = relative.slice(prefix.length);
      break;
    }
  }
  const fallback = safePath(FORMAL_ROOT, relative);
  if (fallback) serveFile(req, res, fallback);
  else { res.writeHead(404); res.end('not found'); }
});

const wss = new WebSocketServer({ server, path: '/ws/doubao' });

function sendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

wss.on('connection', client => {
  if (!API_KEY) {
    sendJson(client, { type: 'proxy.error', error: 'DOUBAO_S2S_API_KEY 未配置' });
    client.close(1011, 'key missing');
    return;
  }

  const sessionId = `b74-${randomUUID()}`;
  let upstream = null;
  let started = false;
  let upstreamClosed = false;
  let clientClosed = false;
  let closeTimer = null;
  let currentLanguage = DEFAULT_LANGUAGE;
  let currentExpressionMode = 'accent';
  let currentCharacter = findCharacter('yunqi-koala');
  let currentSpeaker = resolveSpeaker(currentCharacter, null);
  let activeSessionId = sessionId;
  let inputAudioBytes = 0;
  let outputAudioBytes = 0;
  let finalized = false;
  let sessionReleased = false;
  let sessionTimer = null;
  let idleTimer = null;
  let lastActivityAt = Date.now();
  let lastSpeechEndAt = null;
  let lastAudioDeltaAt = null;
  const startedAt = Date.now();

  let currentVoiceChannel = null;
  let responseTextBuffer = '';
  let deferredAudioEvents = [];
  let deferredResponseDone = null;
  let ttsGeneration = 0;
  let externalTtsActive = false;
  let externalTtsAbortController = null;
  let nativeTurnOpen = false;
  let nativeAudioFallbackEnabled = false;
  let voiceIntentLanguage = null;

  const touch = () => { lastActivityAt = Date.now(); };

  const syncVoiceChannel = (source = null) => {
    currentVoiceChannel = {
      ...resolveVoiceChannel({
        language: currentLanguage,
        character: currentCharacter,
        currentSpeaker,
        voiceSystem: currentVoiceSystem,
      }),
      language_mode: LANGUAGE_MODE_KEYS[currentLanguage] || currentLanguage,
    };
    sendJson(client, {
      type: 'proxy.voice_channel',
      language: currentLanguage,
      language_mode: currentVoiceChannel.language_mode,
      expression_mode: currentExpressionMode,
      characterId: currentCharacter?.character_id || 'yunqi-koala',
      characterSpeaker: currentSpeaker,
      switch_source: source,
      channel: currentVoiceChannel,
    });
    if (source) {
      const now = new Date().toISOString();
      runtimeMetrics.last_language = currentLanguage;
      runtimeMetrics.last_character = currentCharacter?.character_id || 'yunqi-koala';
      runtimeMetrics.current_character = runtimeMetrics.last_character;
      runtimeMetrics.language_mode = currentVoiceChannel.language_mode;
      runtimeMetrics.voice_provider = currentVoiceChannel.provider || null;
      runtimeMetrics.active_speaker = currentVoiceChannel.voice || currentSpeaker;
      runtimeMetrics.last_voice = runtimeMetrics.active_speaker;
      runtimeMetrics.language_switch_source = source;
      runtimeMetrics.language_switch_at = now;
      runtimeMetrics.language_switch_history.push({
        at: now,
        language: currentLanguage,
        language_mode: runtimeMetrics.language_mode,
        provider: runtimeMetrics.voice_provider,
        speaker: runtimeMetrics.active_speaker,
        source,
        character_id: runtimeMetrics.current_character,
      });
      if (runtimeMetrics.language_switch_history.length > 50) runtimeMetrics.language_switch_history.shift();
    }
    return currentVoiceChannel;
  };

  const applyLanguageSwitch = (language, source = 'voice_intent') => {
    if (!LANGUAGE_STYLES[language] || language === currentLanguage) return false;
    currentLanguage = language;
    syncVoiceChannel(source);
    if (upstream && upstream.readyState === WebSocket.OPEN) {
      let world;
      try { world = loadWorldKnowledge(); } catch { return true; }
      sendJson(upstream, {
        type: 'session.update',
        event_id: `event-${randomUUID()}`,
        session: buildSessionConfig(activeSessionId, currentLanguage, world, currentCharacter, currentSpeaker, currentExpressionMode),
      });
    }
    if (source === 'voice_intent') {
      sendJson(client, { type: 'proxy.language_ready', language: currentLanguage, source });
    }
    return true;
  };

  const detectLanguageIntent = text => {
    const raw = String(text || '').trim();
    if (!raw) return null;
    for (const [language, patterns] of Object.entries(LANGUAGE_INTENT_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(raw))) return language;
    }
    return null;
  };

  const handleVoiceLanguageIntent = text => {
    const detected = detectLanguageIntent(text);
    if (!detected || detected === currentLanguage || voiceIntentLanguage === detected) return false;
    voiceIntentLanguage = detected;
    runtimeMetrics.last_voice_intent_text = String(text || '').trim();
    return applyLanguageSwitch(detected, 'voice_intent');
  };

  const cancelExternalTtsTurn = () => {
    ttsGeneration += 1;
    if (externalTtsAbortController) {
      try { externalTtsAbortController.abort(); } catch {}
      externalTtsAbortController = null;
    }
    externalTtsActive = false;
    responseTextBuffer = '';
    deferredAudioEvents = [];
    deferredResponseDone = null;
    nativeTurnOpen = false;
    nativeAudioFallbackEnabled = false;
  };

  const beginNativeTurn = () => {
    if (nativeTurnOpen) return;
    nativeTurnOpen = true;
    nativeAudioFallbackEnabled = true;
    deferredAudioEvents = [];
    deferredResponseDone = null;
    responseTextBuffer = '';
  };

  const finishNativeTurn = (responseEvent = null) => {
    const events = deferredAudioEvents;
    deferredAudioEvents = [];
    for (const event of events) sendJson(client, event);
    if (responseEvent) sendJson(client, responseEvent);
    else if (deferredResponseDone) sendJson(client, deferredResponseDone);
    deferredResponseDone = null;
    responseTextBuffer = '';
    nativeTurnOpen = false;
    nativeAudioFallbackEnabled = false;
  };

  const sendPcmAudioEvents = (pcm, generation) => {
    if (generation !== ttsGeneration || clientClosed || !pcm?.length) return false;
    const chunkBytes = 1920; // 40 ms at 24 kHz, mono, s16le
    sendJson(client, { type: 'response.output_audio.started' });
    for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
      if (generation !== ttsGeneration || clientClosed) return false;
      sendJson(client, {
        type: 'response.output_audio.delta',
        delta: pcm.subarray(offset, offset + chunkBytes).toString('base64'),
        dialect_channel: currentVoiceChannel?.mode === 'native_dialect',
      });
    }
    sendJson(client, { type: 'response.output_audio.done' });
    return true;
  };

  const startExternalTts = async (text, { source = 'response', fallbackPrompt = '' } = {}) => {
    if (!currentVoiceChannel || currentVoiceChannel.mode !== 'native_dialect') return false;
    const generation = ++ttsGeneration;
    const controller = new AbortController();
    externalTtsAbortController = controller;
    externalTtsActive = true;
    try {
      const pcm = await synthesizeDialectPcm({
        channel: currentVoiceChannel,
        text,
        apiKey: DASHSCOPE_API_KEY,
        pythonPath: DASHSCOPE_PYTHONPATH,
        pythonBin: DASHSCOPE_PYTHON_BIN,
        candidateRoot: CANDIDATE_ROOT,
        signal: controller.signal,
      });
      if (generation !== ttsGeneration || clientClosed) return false;
      if (!pcm?.length) throw new Error('dialect voice returned empty pcm');
      if (!sendPcmAudioEvents(pcm, generation)) return false;
      if (source === 'response') {
        const doneEvent = deferredResponseDone;
        deferredAudioEvents = [];
        responseTextBuffer = '';
        nativeAudioFallbackEnabled = false;
        if (doneEvent) {
          sendJson(client, doneEvent);
          deferredResponseDone = null;
          nativeTurnOpen = false;
          nativeAudioFallbackEnabled = false;
        }
      }
      externalTtsActive = false;
      return true;
    } catch (error) {
      if (generation !== ttsGeneration) return false;
      const message = error?.name === 'AbortError' ? 'aborted' : (error?.message || String(error));
      externalTtsActive = false;
      if (message !== 'aborted') {
        sendJson(client, {
          type: 'proxy.dialect_voice_error',
          language: currentLanguage,
          provider: currentVoiceChannel.provider,
          voice: currentVoiceChannel.voice,
          error: message,
        });
      }
      if (source === 'response') {
        if (deferredResponseDone) finishNativeTurn(deferredResponseDone);
        else finishNativeTurn();
      } else if (fallbackPrompt && upstream && upstream.readyState === WebSocket.OPEN) {
        sendJson(upstream, {
          type: 'speech_text_buffer.commit',
          event_id: `event-${randomUUID()}`,
          speech_id: `speech-${randomUUID()}`,
          text,
          tts_prompt: fallbackPrompt,
        });
      }
      responseTextBuffer = '';
      return false;
    } finally {
      if (externalTtsAbortController === controller) externalTtsAbortController = null;
    }
  };
  const releaseSession = () => {
    if (sessionReleased) return;
    sessionReleased = true;
    activeSessionCount = Math.max(0, activeSessionCount - 1);
    if (sessionTimer) clearTimeout(sessionTimer);
    if (idleTimer) clearInterval(idleTimer);
    sessionTimer = null;
    idleTimer = null;
  };

  const finalizeUsage = () => {
    if (finalized) return;
    finalized = true;
    const inputSeconds = inputAudioBytes / 2 / 16000;
    const outputSeconds = outputAudioBytes / 2 / 24000;
    lastUsage.updated_at = new Date().toISOString();
    lastUsage.sessions += 1;
    lastUsage.input_audio_seconds += inputSeconds;
    lastUsage.output_audio_seconds += outputSeconds;
    lastUsage.tokens.input_audio_tokens += inputSeconds * 6.25;
    lastUsage.tokens.output_audio_tokens += outputSeconds * 25;
    lastUsage.last_session_seconds = Math.round((Date.now() - startedAt) / 1000);
    lastUsage.last_language = currentLanguage;
    lastUsage.last_character = currentCharacter?.character_id || 'yunqi-koala';
    lastUsage.last_voice = currentSpeaker;
    recalculateUsage();
  };

  const closeUpstream = () => {
    if (!upstream) return;
    if (upstream.readyState === WebSocket.OPEN) {
      sendJson(upstream, { type: 'session.close', event_id: `event-${randomUUID()}` });
      closeTimer = setTimeout(() => { try { upstream.terminate(); } catch {} }, 2500);
    } else if (upstream.readyState === WebSocket.CONNECTING) {
      try { upstream.terminate(); } catch {}
    }
  };

  const openUpstream = (language = DEFAULT_LANGUAGE, characterId = 'yunqi-koala', requestedSpeaker = null, expressionMode = 'accent') => {
    if (started) return;
    if (activeSessionCount >= MAX_CONCURRENT_SESSIONS) {
      sendJson(client, { type: 'proxy.error', error: '当前实时语音并发已满，请稍后再试。' });
      try { client.close(1013, 'concurrency limit'); } catch {}
      return;
    }
    started = true;
    activeSessionCount += 1;
    runtimeMetrics.sessions_started += 1;
    runtimeMetrics.last_language = LANGUAGE_STYLES[language] ? language : DEFAULT_LANGUAGE;
    sessionTimer = setTimeout(() => {
      sendJson(client, { type: 'proxy.error', error: '本轮对话已达到最长时长，已自动结束。' });
      closeUpstream();
    }, MAX_SESSION_MS);
    idleTimer = setInterval(() => {
      if (Date.now() - lastActivityAt > MAX_IDLE_MS) {
        sendJson(client, { type: 'proxy.error', error: '连接长时间无活动，已自动结束。' });
        closeUpstream();
      }
    }, 30000);
    currentLanguage = LANGUAGE_STYLES[language] ? language : DEFAULT_LANGUAGE;
    currentExpressionMode = ['accent', 'local', 'other'].includes(expressionMode) ? expressionMode : 'accent';
    currentCharacter = findCharacter(characterId);
    currentSpeaker = resolveSpeaker(currentCharacter, requestedSpeaker);
    syncVoiceChannel('start');
    runtimeMetrics.last_character = currentCharacter?.character_id || 'yunqi-koala';
    runtimeMetrics.last_voice = currentSpeaker;
    let world;
    try { world = loadWorldKnowledge(); }
    catch (error) {
      sendJson(client, { type: 'proxy.error', error: `World Knowledge 读取失败：${error.message}` });
      return;
    }

    upstream = new WebSocket(UPSTREAM_URL, {
      headers: {
        'X-Api-Key': API_KEY,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Request-Id': randomUUID(),
        'X-Api-Connect-Id': randomUUID(),
      },
      perMessageDeflate: false,
    });

    upstream.on('open', () => {
      sendJson(upstream, {
        type: 'session.create',
        event_id: `event-${randomUUID()}`,
        session: buildSessionConfig(activeSessionId, currentLanguage, world, currentCharacter, currentSpeaker, currentExpressionMode),
      });
    });

    upstream.on('message', raw => {
      touch();
      let event;
      try { event = JSON.parse(raw.toString()); } catch { return; }
      const now = Date.now();
      if (event.type === 'conversation.item.input_audio_transcription.delta') {
        handleVoiceLanguageIntent(event.delta || event.text || '');
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        lastSpeechEndAt = now;
        handleVoiceLanguageIntent(event.text || '');
      }
      if (event.type === 'response.output_audio.started' && lastSpeechEndAt) {
        const latency = now - lastSpeechEndAt;
        runtimeMetrics.last_response_latency_ms = latency;
        runtimeMetrics.response_latency_samples_ms.push(latency);
        if (runtimeMetrics.max_response_latency_ms === null || latency > runtimeMetrics.max_response_latency_ms) runtimeMetrics.max_response_latency_ms = latency;
        lastSpeechEndAt = null;
      }
      if (event.type === 'response.output_audio.delta') {
        if (lastAudioDeltaAt) {
          const gap = now - lastAudioDeltaAt;
          runtimeMetrics.audio_gap_samples_ms.push(gap);
          if (runtimeMetrics.max_audio_gap_ms === null || gap > runtimeMetrics.max_audio_gap_ms) runtimeMetrics.max_audio_gap_ms = gap;
        }
        lastAudioDeltaAt = now;
      }
      if (event.type === 'response.output_audio.done') lastAudioDeltaAt = null;
      if (event.type === 'response.canceled') runtimeMetrics.cancels += 1;
      if (event.type === 'response.done') addUsage(event.usage);
      if (event.type === 'response.output_audio.delta' && typeof event.delta === 'string') {
        try { outputAudioBytes += Buffer.from(event.delta, 'base64').length; } catch {}
      }

      if (event.type === 'session.created') {
        activeSessionId = event.session?.id || activeSessionId;
        sendJson(client, { type: 'proxy.character_ready', characterId: currentCharacter?.character_id || 'yunqi-koala' });
        sendJson(client, { type: 'proxy.language_ready', language: currentLanguage, source: null });
        sendJson(client, { type: 'proxy.voice_ready', speaker: currentSpeaker });
        syncVoiceChannel();
      }
      if (event.type === 'session.updated') {
        sendJson(client, { type: 'proxy.character_ready', characterId: currentCharacter?.character_id || 'yunqi-koala' });
        sendJson(client, { type: 'proxy.language_ready', language: currentLanguage, source: null });
        sendJson(client, { type: 'proxy.voice_ready', speaker: currentSpeaker });
        syncVoiceChannel();
      }
      if (event.type === 'session.closed') {
        cancelExternalTtsTurn();
        clearTimeout(closeTimer);
        finalizeUsage();
        runtimeMetrics.sessions_closed += 1;
        runtimeMetrics.last_language = currentLanguage;
        runtimeMetrics.last_character = currentCharacter?.character_id || 'yunqi-koala';
        runtimeMetrics.last_session_seconds = Math.round((Date.now() - startedAt) / 1000);
        releaseSession();
        sendJson(client, event);
        if (!clientClosed) client.close(1000, 'session closed');
        return;
      }

      const nativeDialect = currentVoiceChannel?.mode === 'native_dialect';
      if (event.type === 'conversation.item.input_audio_transcription.started') {
        voiceIntentLanguage = null;
        if (nativeDialect) cancelExternalTtsTurn();
      }
      if (nativeDialect && event.type === 'response.output_text.delta') {
        beginNativeTurn();
        responseTextBuffer += event.delta || '';
        return;
      }
      if (nativeDialect && event.type === 'response.output_text.done') {
        const text = String(event.text || responseTextBuffer || '').trim();
        responseTextBuffer = '';
        if (text && !externalTtsActive) {
          startExternalTts(text, { source: 'response' });
        } else if (!text && !externalTtsActive && deferredResponseDone) {
          finishNativeTurn(deferredResponseDone);
        }
        return;
      }
      if (nativeDialect && event.type.startsWith('response.output_audio.')) {
        if (event.type === 'response.output_audio.started') beginNativeTurn();
        if (nativeTurnOpen && nativeAudioFallbackEnabled) deferredAudioEvents.push(event);
        return;
      }
      if (nativeDialect && event.type === 'response.done') {
        if (externalTtsActive) {
          deferredResponseDone = event;
          return;
        }
        if (nativeTurnOpen) {
          finishNativeTurn(event);
        } else {
          sendJson(client, event);
        }
        return;
      }
      if (nativeDialect && event.type === 'response.canceled') {
        cancelExternalTtsTurn();
        sendJson(client, event);
        return;
      }

      sendJson(client, event);
    });

    upstream.on('unexpected-response', (_request, response) => {
      releaseSession();
      sendJson(client, { type: 'proxy.error', error: `upstream handshake ${response.statusCode}` });
      try { client.close(1011, 'upstream handshake failed'); } catch {}
    });

    upstream.on('error', error => {
      sendJson(client, { type: 'proxy.error', error: error.message || 'upstream websocket error' });
    });

    upstream.on('close', () => {
      upstreamClosed = true;
      finalizeUsage();
      releaseSession();
      clearTimeout(closeTimer);
      if (!clientClosed) {
        sendJson(client, { type: 'proxy.upstream_closed' });
        try { client.close(1000, 'upstream closed'); } catch {}
      }
    });
  };

  client.on('message', raw => {
    touch();
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === 'client_metric' && typeof message.name === 'string') {
      const value = Number(message.value);
      if (!Number.isFinite(value)) return;
      if (message.name === 'jitter_buffer_ms') {
        runtimeMetrics.last_jitter_buffer_ms = value;
        runtimeMetrics.jitter_buffer_samples_ms.push(value);
        runtimeMetrics.max_jitter_buffer_ms = runtimeMetrics.max_jitter_buffer_ms === null ? value : Math.max(runtimeMetrics.max_jitter_buffer_ms, value);
      } else if (message.name === 'first_audio_to_play_ms') {
        runtimeMetrics.last_first_audio_to_play_ms = value;
        runtimeMetrics.first_audio_to_play_samples_ms.push(value);
      } else if (message.name === 'vad_end_to_first_audio_ms') {
        runtimeMetrics.last_vad_end_to_first_audio_ms = value;
        runtimeMetrics.vad_end_to_first_audio_samples_ms.push(value);
        runtimeMetrics.max_vad_end_to_first_audio_ms = runtimeMetrics.max_vad_end_to_first_audio_ms === null ? value : Math.max(runtimeMetrics.max_vad_end_to_first_audio_ms, value);
      } else if (message.name === 'interrupt_to_stop_ms') {
        runtimeMetrics.last_interrupt_stop_ms = value;
        runtimeMetrics.interrupt_stop_samples_ms.push(value);
      } else if (message.name === 'false_turn') {
        runtimeMetrics.client_false_turn_count += 1;
      }
      return;
    }

    if (message.type === 'start') {
      openUpstream(message.language || DEFAULT_LANGUAGE, message.characterId || 'yunqi-koala', message.speaker || null, message.mode || 'accent');
      return;
    }
    if (message.type === 'switch_mode') {
      const nextMode = ['accent', 'local', 'other'].includes(message.mode) ? message.mode : 'accent';
      currentExpressionMode = nextMode;
      if (upstream && upstream.readyState === WebSocket.OPEN) {
        let world;
        try { world = loadWorldKnowledge(); } catch { return; }
        sendJson(upstream, {
          type: 'session.update',
          event_id: `event-${randomUUID()}`,
          session: buildSessionConfig(activeSessionId, currentLanguage, world, currentCharacter, currentSpeaker, currentExpressionMode),
        });
      }
      sendJson(client, { type: 'proxy.mode_ready', mode: currentExpressionMode });
      return;
    }
    if (message.type === 'switch_character') {
      if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
      cancelExternalTtsTurn();
      currentCharacter = findCharacter(message.characterId || 'yunqi-koala');
      currentSpeaker = resolveSpeaker(currentCharacter, message.speaker || null);
      syncVoiceChannel('character');
      let world;
      try { world = loadWorldKnowledge(); } catch { return; }
      sendJson(upstream, {
        type: 'session.update',
        event_id: `event-${randomUUID()}`,
        session: buildSessionConfig(activeSessionId, currentLanguage, world, currentCharacter, currentSpeaker, currentExpressionMode),
      });
      return;
    }
    if (message.type === 'switch_voice') {
      if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
      cancelExternalTtsTurn();
      currentSpeaker = resolveSpeaker(currentCharacter, message.speaker || null);
      syncVoiceChannel('voice');
      let world;
      try { world = loadWorldKnowledge(); } catch { return; }
      sendJson(upstream, {
        type: 'session.update',
        event_id: `event-${randomUUID()}`,
        session: buildSessionConfig(activeSessionId, currentLanguage, world, currentCharacter, currentSpeaker, currentExpressionMode),
      });
      return;
    }
    if (message.type === 'switch_language') {
      if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
      const next = LANGUAGE_STYLES[message.language] ? message.language : DEFAULT_LANGUAGE;
      if (['accent', 'local', 'other'].includes(message.mode)) currentExpressionMode = message.mode;
      if (next !== currentLanguage) {
        cancelExternalTtsTurn();
        applyLanguageSwitch(next, 'ui');
      }
      sendJson(client, { type: 'proxy.mode_ready', mode: currentExpressionMode });
      return;
    }
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return;

    if (message.type === 'say' && typeof message.text === 'string') {
      const fallbackPrompt = message.tts_prompt || '用自然、亲切、温暖的语气说这句话。';
      if (currentVoiceChannel?.mode === 'native_dialect') {
        cancelExternalTtsTurn();
        startExternalTts(message.text, { source: 'say', fallbackPrompt });
        return;
      }
      sendJson(upstream, {
        type: 'speech_text_buffer.commit',
        event_id: `event-${randomUUID()}`,
        speech_id: `speech-${randomUUID()}`,
        text: message.text,
        tts_prompt: fallbackPrompt,
      });
      return;
    }
    if (message.type === 'audio' && typeof message.data === 'string') {
      try { inputAudioBytes += Buffer.from(message.data, 'base64').length; } catch {}
      sendJson(upstream, { type: 'input_audio_buffer.append', audio: message.data });
      return;
    }
    if (message.type === 'cancel') {
      sendJson(upstream, { type: 'response.cancel', event_id: `event-${randomUUID()}` });
      return;
    }
    if (message.type === 'close') {
      closeUpstream();
    }
  });

  client.on('close', () => {
    clientClosed = true;
    cancelExternalTtsTurn();
    finalizeUsage();
    releaseSession();
    if (!upstreamClosed) closeUpstream();
  });

  client.on('error', () => { try { client.close(); } catch {} });
});

try { loadWorldKnowledge(); } catch (error) { console.error(`world knowledge load failed: ${error.message}`); }
try { loadCharacters(); } catch (error) { console.error(`character registry load failed: ${error.message}`); }
try { loadVoiceSystem(); } catch (error) { console.error(`voice system load failed: ${error.message}`); }

server.listen(PORT, HOST, () => {
  console.log(`B7.4 Doubao Bottle Candidate http://127.0.0.1:${PORT}/`);
  console.log(`formal_root=${FORMAL_ROOT}`);
  console.log(`model=${MODEL}`);
  console.log(`languages=${LANGUAGES.join(',')}`);
  console.log(`key_configured=${Boolean(API_KEY)}`);
  console.log(`dashscope_configured=${Boolean(DASHSCOPE_API_KEY)}`);
});
