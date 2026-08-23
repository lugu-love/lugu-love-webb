FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-noto-cjk \
        fontconfig \
        libfreetype6 \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py tts_provider.py text_layout.py ./
COPY masters/ ./masters/

ENV PORT=8000 \
    FONT_FILE=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    FONT_INDEX=2 \
    FONT_FC="Noto Sans CJK SC" \
    FFMPEG_BIN=ffmpeg \
    FFMPEG_THREADS=2 \
    TTS_PROVIDER=edge-tts \
    SERVICE_ENABLED=true \
    FPS=18 \
    BITRATE_KBPS=2500 \
    MAX_CONCURRENT=2 \
    RATE_LIMIT=6

EXPOSE 8000
CMD ["python", "server.py"]
