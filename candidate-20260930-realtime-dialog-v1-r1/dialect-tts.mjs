import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export const DEFAULT_LANGUAGE_VOICE_CHANNELS = {
  '普通话': { mode: 'character_speaker', provider: 'doubao', status: 'character_default' },
  '四川话': { mode: 'native_dialect', provider: 'qwen3-tts', status: 'restored', voices: { female: 'Sunny', male: 'Eric' } },
  '陕西话': { mode: 'native_dialect', provider: 'qwen3-tts', status: 'partial', voices: { female: null, male: 'Marcus' } },
  '粤语': { mode: 'native_dialect', provider: 'qwen3-tts', status: 'restored', voices: { female: 'Kiki', male: 'Rocky' } },
  '东北话': { mode: 'native_dialect', provider: 'cosyvoice', status: 'partial', voices: { female: null, male: 'longlaotie_v3' } },
  '上海话': { mode: 'native_dialect', provider: 'qwen3-tts', status: 'partial', voices: { female: 'Jada', male: null } },
  '英语': { mode: 'character_speaker', provider: 'doubao', status: 'unchanged' },
};

export function getLanguageVoiceChannels(voiceSystem) {
  return voiceSystem?.language_voice_channels?.channels || voiceSystem?.language_voice_channels || DEFAULT_LANGUAGE_VOICE_CHANNELS;
}

export function inferVoiceGender(character) {
  const explicit = character?.voice?.gender;
  if (explicit === 'male' || explicit === 'female') return explicit;
  const speaker = String(character?.voice?.speaker || '');
  if (speaker.includes('_female_')) return 'female';
  if (speaker.includes('_male_')) return 'male';
  return null;
}

export function resolveVoiceChannel({ language, character, currentSpeaker, voiceSystem }) {
  const channels = getLanguageVoiceChannels(voiceSystem);
  const config = channels?.[language] || DEFAULT_LANGUAGE_VOICE_CHANNELS[language] || DEFAULT_LANGUAGE_VOICE_CHANNELS['普通话'];
  const gender = inferVoiceGender(character);
  if (!config || config.mode !== 'native_dialect') {
    return {
      mode: 'character_speaker',
      language,
      provider: 'doubao',
      voice: currentSpeaker,
      gender,
      status: config?.status || 'character_default',
    };
  }
  const voice = gender ? config.voices?.[gender] : null;
  if (!voice) {
    return {
      mode: 'character_speaker',
      language,
      provider: 'doubao',
      voice: currentSpeaker,
      gender,
      status: 'fallback_missing_gender_voice',
      fallback_reason: `历史原生方言声道没有${gender === 'female' ? '女声' : gender === 'male' ? '男声' : '可用性别'}槽位`,
    };
  }
  return {
    mode: 'native_dialect',
    language,
    provider: config.provider,
    voice,
    gender,
    status: config.status || 'restored',
    historical_source: 'scripts/make-send-cloud Voice V1.1',
  };
}

export function extractPcmFromWav(wav) {
  if (!Buffer.isBuffer(wav) || wav.length < 12) throw new Error('invalid wav');
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a wav file');
  }
  const marker = Buffer.from('data');
  const offset = wav.indexOf(marker, 12);
  if (offset < 0 || offset + 8 > wav.length) throw new Error('wav data chunk missing');
  return wav.subarray(offset + 8);
}

async function synthesizeQwen({ text, voice, apiKey, signal }) {
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY missing');
  const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3-tts-flash',
      input: { text, voice, instructions: '用自然、日常、不过度夸张的地方口语说这句话。' },
    }),
    signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || result?.code || `qwen3-tts http ${response.status}`);
  const audioUrl = result?.output?.audio?.url;
  if (!audioUrl) throw new Error('qwen3-tts returned no audio URL');
  const audioResponse = await fetch(audioUrl.replace(/^http:/, 'https:'), { signal });
  if (!audioResponse.ok) throw new Error(`qwen3-tts audio http ${audioResponse.status}`);
  return extractPcmFromWav(Buffer.from(await audioResponse.arrayBuffer()));
}

function synthesizeCosyVoice({ text, voice, apiKey, pythonPath, pythonBin, candidateRoot, signal }) {
  return new Promise((resolvePromise, reject) => {
    if (!apiKey) return reject(new Error('DASHSCOPE_API_KEY missing'));
    const script = resolve(candidateRoot, 'cosyvoice_tts.py');
    const child = spawn(pythonBin || 'python3', [script], {
      env: { ...process.env, PYTHONPATH: pythonPath || '', DASHSCOPE_API_KEY: apiKey },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const abort = () => { try { child.kill('SIGTERM'); } catch {} };
    if (signal) signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => {
      if (settled) return; settled = true;
      reject(error);
    });
    child.on('close', code => {
      if (settled) return; settled = true;
      if (signal?.aborted) return reject(new Error('aborted'));
      if (code !== 0) return reject(new Error(Buffer.concat(stderr).toString('utf8').slice(0, 400) || `cosyvoice exit ${code}`));
      const pcm = Buffer.concat(stdout);
      if (!pcm.length) return reject(new Error('cosyvoice returned empty pcm'));
      resolvePromise(pcm);
    });
    child.stdin.end(JSON.stringify({ text, voice }));
  });
}

export async function synthesizeDialectPcm({ channel, text, apiKey, pythonPath, pythonBin, candidateRoot, signal }) {
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('empty dialect text');
  if (!channel?.voice) throw new Error('dialect voice missing');
  if (channel.provider === 'qwen3-tts') {
    return synthesizeQwen({ text: cleanText, voice: channel.voice, apiKey, signal });
  }
  if (channel.provider === 'cosyvoice') {
    return synthesizeCosyVoice({ text: cleanText, voice: channel.voice, apiKey, pythonPath, pythonBin, candidateRoot, signal });
  }
  throw new Error(`unsupported dialect provider: ${channel.provider}`);
}
