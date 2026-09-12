FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-noto-cjk \
        fontconfig \
        libfreetype6 \
        curl \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py tts_provider.py text_layout.py journey_store.py emotion-manifest.json ./
COPY template/ template/

# 旧 Rabbit master 已退出生产链；正式生成等待新版 Release 切换。
RUN mkdir -p masters poc

ENV PORT=8000 \
    FONT_FILE=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    FONT_INDEX=2 \
    FONT_FC="Noto Sans CJK SC" \
    FFMPEG_BIN=ffmpeg \
    FFMPEG_THREADS=2 \
    TTS_PROVIDER=edge-tts \
    SERVICE_ENABLED=true \
    SITE_STATE_FILE=/data/site_state.json \
    FPS=24 \
    BITRATE_KBPS=6000 \
    MAX_CONCURRENT=2 \
    RATE_LIMIT=6

EXPOSE 8000
CMD ["python", "server.py"]
