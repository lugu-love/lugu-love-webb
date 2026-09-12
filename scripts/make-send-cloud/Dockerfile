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

COPY server.py tts_provider.py text_layout.py journey_store.py ./
COPY template/ template/

# generationMaster 只能来自 manifest 声明的目录，不再下载或猜测历史 masters。
COPY generation-masters/ generation-masters/
COPY poc/ poc/

# 唯一生产资产契约由前端不可变 Release 固定 SHA 拉取。
ARG RELEASE_MANIFEST_URL=https://raw.githubusercontent.com/lugu-love/lugu-love-webb/1187b9b61d49370fd1e9b429f98f378f2546970a/dist/release-20260912-01/asset-manifest.json
ARG RELEASE_MANIFEST_SHA256=c84c7ef6fec29235513475bb5f919a40fdf932aab6384bff1eb2f88e8af19f6b
RUN curl -fsSL "$RELEASE_MANIFEST_URL" -o asset-manifest.json && \
    echo "$RELEASE_MANIFEST_SHA256  asset-manifest.json" | sha256sum -c -

ENV PORT=8000 \
    FONT_FILE=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    FONT_INDEX=2 \
    FONT_FC="Noto Sans CJK SC" \
    FFMPEG_BIN=ffmpeg \
    FFMPEG_THREADS=2 \
    TTS_PROVIDER=edge-tts \
    SERVICE_ENABLED=true \
    GENERATION_MASTERS_DIR=/app/generation-masters \
    SITE_STATE_FILE=/data/site_state.json \
    FPS=24 \
    BITRATE_KBPS=6000 \
    MAX_CONCURRENT=2 \
    RATE_LIMIT=6

EXPOSE 8000
CMD ["python", "server.py"]
