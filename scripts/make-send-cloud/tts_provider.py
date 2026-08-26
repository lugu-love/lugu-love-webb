"""TTS provider 抽象层。edge-tts 为兜底，ElevenLabs 为正式声音源。"""
import json
import os
import urllib.error
import urllib.request


class TTSProvider:
    name = "base"

    def synthesize(self, text, out_path):
        raise NotImplementedError


class EdgeTTSProvider(TTSProvider):
    name = "edge-tts"

    def __init__(self, voice=None):
        self.voice = voice or os.environ.get("TTS_VOICE", "zh-CN-XiaoxiaoNeural")

    def synthesize(self, text, out_path):
        import asyncio
        import edge_tts

        async def _run():
            com = edge_tts.Communicate(text, self.voice)
            await com.save(out_path)

        asyncio.run(_run())


class ElevenLabsProvider(TTSProvider):
    """ElevenLabs 声音源。voice_id 使用 ElevenLabs 稳定 voice_id；Key 仅从环境变量读取，不落日志。"""

    name = "elevenlabs"

    def __init__(self, voice_id, api_key=None, model_id=None):
        self.voice_id = voice_id
        self.api_key = api_key or os.environ.get("ELEVENLABS_API_KEY", "")
        self.model_id = model_id or os.environ.get("ELEVENLABS_MODEL_ID", "eleven_v3")

    def synthesize(self, text, out_path):
        if not self.voice_id:
            raise RuntimeError("elevenlabs: missing voice_id")
        if not self.api_key:
            raise RuntimeError("elevenlabs: ELEVENLABS_API_KEY not configured")
        url = "https://api.elevenlabs.io/v1/text-to-speech/%s" % self.voice_id
        payload = json.dumps({
            "text": text,
            "model_id": self.model_id,
            "output_format": "mp3_44100_128",
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
}


def make_tts_provider(name=None):
    name = (name or os.environ.get("TTS_PROVIDER", "edge-tts")).lower()
    cls = _PROVIDERS.get(name)
    if not cls:
        raise ValueError("unknown TTS provider: %s" % name)
    return cls()
