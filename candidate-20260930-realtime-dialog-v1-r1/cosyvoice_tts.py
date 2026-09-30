#!/usr/bin/env python3
import json
import os
import sys

import dashscope
from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer


def main():
    payload = json.loads(sys.stdin.read() or '{}')
    text = str(payload.get('text') or '').strip()
    voice = str(payload.get('voice') or '').strip()
    api_key = os.environ.get('DASHSCOPE_API_KEY', '').strip()
    if not text or not voice:
        raise SystemExit('text and voice are required')
    if not api_key:
        raise SystemExit('DASHSCOPE_API_KEY missing')
    dashscope.api_key = api_key
    synth = SpeechSynthesizer(
        model='cosyvoice-v3-flash',
        voice=voice,
        format=AudioFormat.PCM_24000HZ_MONO_16BIT,
        speech_rate=1.0,
        pitch_rate=1.0,
    )
    audio = synth.call(text)
    if not audio:
        raise SystemExit('cosyvoice returned empty audio')
    sys.stdout.buffer.write(audio)


if __name__ == '__main__':
    main()
