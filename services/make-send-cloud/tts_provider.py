"""TTS provider 抽象。默认 edge-tts（免费、无需 API key）。"""

import asyncio
import os


class TTSProvider:
    name = "base"

    def synthesize(self, text, out_path, voice=None):
        raise NotImplementedError


class EdgeTTSProvider(TTSProvider):
    name = "edge-tts"

    def __init__(self, default_voice=None):
        self.default_voice = default_voice or os.environ.get("TTS_VOICE", "zh-CN-XiaoxiaoNeural")

    def synthesize(self, text, out_path, voice=None):
        import edge_tts

        chosen = voice or self.default_voice

        async def _run():
            communicate = edge_tts.Communicate(text, chosen)
            await communicate.save(out_path)

        asyncio.run(_run())
        return out_path


_PROVIDERS = {"edge-tts": EdgeTTSProvider}


def make_tts_provider(name=None):
    name = (name or os.environ.get("TTS_PROVIDER", "edge-tts")).strip()
    if name not in _PROVIDERS:
        raise ValueError("unknown TTS provider: %s" % name)
    return _PROVIDERS[name]()
