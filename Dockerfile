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

COPY scripts/make-send-cloud/server.py scripts/make-send-cloud/tts_provider.py scripts/make-send-cloud/text_layout.py scripts/make-send-cloud/journey_store.py ./
COPY scripts/make-send-cloud/template/ template/
COPY scripts/make-send-cloud/generation-masters/ generation-masters/
COPY scripts/make-send-cloud/poc/ poc/

ARG RELEASE_MANIFEST_URL=https://raw.githubusercontent.com/lugu-love/lugu-love-webb/ad8c1b284819f4439324f3cfb624ebc2c0ae0b1c/release-20260913-ui-01/asset-manifest.json
ARG RELEASE_MANIFEST_SHA256=661e68f933ddea6759cbd3a7efe9048be9e0c6ec25cc308fafd8f38091e9c618
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
