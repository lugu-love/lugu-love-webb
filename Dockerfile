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

COPY scripts/make-send-cloud/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/make-send-cloud/server.py scripts/make-send-cloud/tts_provider.py scripts/make-send-cloud/text_layout.py scripts/make-send-cloud/journey_store.py scripts/make-send-cloud/blessing-manifest.json scripts/make-send-cloud/production-master-registry.json scripts/make-send-cloud/production-master-registry-koala.json ./
COPY scripts/make-send-cloud/template/ template/
COPY scripts/make-send-cloud/generation-masters/ generation-masters/
COPY scripts/make-send-cloud/poc/ poc/

ARG RELEASE_MANIFEST_URL=https://raw.githubusercontent.com/lugu-love/lugu-love-webb/e238db70da4bf88a5f43800427c37bab529519e9/release-20260917-lingyao-monkey-r1/asset-manifest.json
ARG RELEASE_MANIFEST_SHA256=03adf706327dcbb529045bde349daa229dad388c15d03aba47fe38a4a0e52359
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
    SITE_STATE_FILE=/tmp/site_state.json \
    FPS=24 \
    BITRATE_KBPS=6000 \
    MAX_CONCURRENT=2 \
    RATE_LIMIT=20

EXPOSE 8000
CMD ["python", "server.py"]
