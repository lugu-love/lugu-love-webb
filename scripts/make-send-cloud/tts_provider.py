"""TTS provider 抽象层。Voice V1 使用 Edge；Voice V1.1 使用 Qwen3-TTS / CosyVoice 原生方言音色。"""
ELEVENLABS_MODEL_ID_DEFAULT = "eleven_v3"
ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128"
import json
import os
import urllib.error
import urllib.request

QWEN_TTS_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
QWEN_EMOTION_INSTRUCTIONS = {
    "happy": "语气开心、轻快、明亮。",
    "wronged": "语气委屈、低落、软一些。",
    "angry": "语气生气，有压住火气但不要咆哮。",
    "comfort": "语气温柔、安慰、耐心。",
    "blessing": "语气温柔真诚，像在送祝福。",
    "neutral": "自然、真诚地朗读。",
}
COSYVOICE_EMOTION_STYLE = {
    "happy": (1.12, 1.04),
    "wronged": (0.92, 1.08),
    "angry": (1.10, 0.96),
    "comfort": (0.90, 0.98),
    "blessing": (0.96, 1.01),
    "neutral": (1.00, 1.00),
}


class TTSProvider:
    name = "base"

    def synthesize(self, text, out_path):
        raise NotImplementedError


class EdgeTTSProvider(TTSProvider):
    name = "edge-tts"

    def __init__(self, voice=None, rate="+0%", volume="+0%", pitch="+0Hz"):
        self.voice = voice or os.environ.get("TTS_VOICE", "zh-CN-XiaoxiaoNeural")
        self.rate = rate or "+0%"
        self.volume = volume or "+0%"
        self.pitch = pitch or "+0Hz"
        self.last_content_type = "audio/mpeg"

    def synthesize(self, text, out_path):
        import asyncio
        import edge_tts

        async def _run():
            com = edge_tts.Communicate(text, self.voice, rate=self.rate, volume=self.volume, pitch=self.pitch)
            await com.save(out_path)

        asyncio.run(_run())
        self.last_content_type = "audio/mpeg"


class QwenTTSProvider(TTSProvider):
    """Qwen3-TTS 原生方言系统音色。方言由 voiceId 本身决定，instruction 只控制情绪，不用于伪造方言。"""

    name = "qwen3-tts"

    def __init__(self, voice_id, emotion_style="neutral", api_key=None):
        self.voice_id = voice_id
        self.emotion_style = emotion_style or "neutral"
        self.api_key = api_key or os.environ.get("DASHSCOPE_API_KEY", "")
        self.last_content_type = "audio/wav"

    def synthesize(self, text, out_path):
        if not self.voice_id:
            raise RuntimeError("qwen3-tts: missing voice_id")
        if not self.api_key:
            raise RuntimeError("qwen3-tts: DASHSCOPE_API_KEY not configured")
        payload = json.dumps({
            "model": "qwen3-tts-flash",
            "input": {
                "text": text,
                "voice": self.voice_id,
                "instructions": QWEN_EMOTION_INSTRUCTIONS.get(self.emotion_style, QWEN_EMOTION_INSTRUCTIONS["neutral"]),
            },
        }).encode("utf-8")
        req = urllib.request.Request(
            QWEN_TTS_URL,
            data=payload,
            headers={"Authorization": "Bearer " + self.api_key, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", "replace")[:240]
            except Exception:
                pass
            raise RuntimeError("qwen3-tts http %s: %s" % (e.code, body))
        except Exception as e:
            raise RuntimeError("qwen3-tts request failed: %s" % type(e).__name__)
        audio_url = (((result.get("output") or {}).get("audio") or {}).get("url") or "")
        if not audio_url:
            raise RuntimeError("qwen3-tts returned no audio URL")
        try:
            with urllib.request.urlopen(audio_url.replace("http://", "https://", 1), timeout=120) as resp:
                audio = resp.read()
                content_type = (resp.headers.get("Content-Type") or "").split(";", 1)[0].strip()
        except Exception as e:
            raise RuntimeError("qwen3-tts audio download failed: %s" % type(e).__name__)
        if not audio:
            raise RuntimeError("qwen3-tts returned empty audio")
        if audio.startswith(b"RIFF"):
            self.last_content_type = "audio/wav"
        elif content_type:
            self.last_content_type = content_type
        with open(out_path, "wb") as f:
            f.write(audio)
        return out_path


class CosyVoiceProvider(TTSProvider):
    """CosyVoice 原生方言系统音色。情绪仅通过速度和音高微调，不注入方言 instruction。"""

    name = "cosyvoice"

    def __init__(self, voice_id, emotion_style="neutral", api_key=None):
        self.voice_id = voice_id
        self.emotion_style = emotion_style or "neutral"
        self.api_key = api_key or os.environ.get("DASHSCOPE_API_KEY", "")
        self.last_content_type = "audio/mpeg"

    def synthesize(self, text, out_path):
        if not self.voice_id:
            raise RuntimeError("cosyvoice: missing voice_id")
        if not self.api_key:
            raise RuntimeError("cosyvoice: DASHSCOPE_API_KEY not configured")
        try:
            import dashscope
            from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer
        except Exception as e:
            raise RuntimeError("cosyvoice sdk unavailable: %s" % type(e).__name__)
        dashscope.api_key = self.api_key
        rate, pitch = COSYVOICE_EMOTION_STYLE.get(self.emotion_style, COSYVOICE_EMOTION_STYLE["neutral"])
        synthesizer = SpeechSynthesizer(
            model="cosyvoice-v3-flash",
            voice=self.voice_id,
            format=AudioFormat.MP3_24000HZ_MONO_256KBPS,
            speech_rate=rate,
            pitch_rate=pitch,
        )
        audio = synthesizer.call(text)
        if not audio:
            raise RuntimeError("cosyvoice returned empty audio")
        self.last_content_type = "audio/mpeg"
        with open(out_path, "wb") as f:
            f.write(audio)
        return out_path


class ElevenLabsProvider(TTSProvider):
    """ElevenLabs 声音源。voice_id 使用 ElevenLabs 稳定 voice_id；Key 仅从环境变量读取，不落日志。"""

    name = "elevenlabs"

    def __init__(self, voice_id, api_key=None, model_id=None):
        self.voice_id = voice_id
        self.api_key = api_key or os.environ.get("ELEVENLABS_API_KEY", "")
        self.model_id = model_id or os.environ.get("ELEVENLABS_MODEL_ID", ELEVENLABS_MODEL_ID_DEFAULT)

    def synthesize(self, text, out_path):
        if not self.voice_id:
            raise RuntimeError("elevenlabs: missing voice_id")
        if not self.api_key:
            raise RuntimeError("elevenlabs: ELEVENLABS_API_KEY not configured")
        url = "https://api.elevenlabs.io/v1/text-to-speech/%s" % self.voice_id
        payload = json.dumps({
            "text": text,
            "model_id": self.model_id,
            "output_format": ELEVENLABS_OUTPUT_FORMAT,
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                audio = resp.read()
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", "replace")[:200]
            except Exception:
                pass
            raise RuntimeError("elevenlabs http %s: %s" % (e.code, body))
        except Exception as e:
            raise RuntimeError("elevenlabs request failed: %s" % type(e).__name__)
        if not audio:
            raise RuntimeError("elevenlabs returned empty audio")
        with open(out_path, "wb") as f:
            f.write(audio)
        return out_path


_PROVIDERS = {
    "edge-tts": EdgeTTSProvider,
    "qwen3-tts": QwenTTSProvider,
    "cosyvoice": CosyVoiceProvider,
}


def make_tts_provider(name=None):
    name = (name or os.environ.get("TTS_PROVIDER", "edge-tts")).lower()
    cls = _PROVIDERS.get(name)
    if not cls:
        raise ValueError("unknown TTS provider: %s" % name)
    return cls()
