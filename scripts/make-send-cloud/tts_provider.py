"""TTS provider 抽象层。当前仅 edge-tts，用于 P3 技术验证，后续可替换正式服务。"""
import os


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


_PROVIDERS = {
    "edge-tts": EdgeTTSProvider,
}


def make_tts_provider(name=None):
    name = (name or os.environ.get("TTS_PROVIDER", "edge-tts")).lower()
    cls = _PROVIDERS.get(name)
    if not cls:
        raise ValueError("unknown TTS provider: %s" % name)
    return cls()
