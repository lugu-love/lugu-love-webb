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

# 素材（masters/*.mp4、poc/sample.mp4）体积较大，改为构建时从正式远端
# lugu-love/lugu-love-webb 的代码分支拉取，避免每次本地上传大文件（当前网络受限）。
# 若日后分支更名，可通过构建变量 MASTERS_REF 覆盖。
ARG MASTERS_REF=codex/p3-cloud
RUN mkdir -p masters poc && \
    for f in happy-master.mp4 angry-master.mp4 wronged-master.mp4 \
             happy-master-v2.mp4 wronged-master-v2.mp4 angry-master-v2.mp4 playful-master-v2.mp4 \
             rabbit-sajiao.mp4 rabbit-playful.mp4 rabbit-jealous.mp4 rabbit-stubborn.mp4 rabbit-surprise.mp4 \
             rabbit-confused.mp4 rabbit-disgust.mp4 rabbit-guilty.mp4 rabbit-apology.mp4 \
             rabbit-lowenergy.mp4 rabbit-cool.mp4 rabbit-gloat.mp4; do \
      curl -fsSL -o "masters/$f" "https://raw.githubusercontent.com/lugu-love/lugu-love-webb/${MASTERS_REF}/scripts/make-send-cloud/masters/$f" || exit 1; \
    done && \
    curl -fsSL -o "poc/sample.mp4" "https://raw.githubusercontent.com/lugu-love/lugu-love-webb/${MASTERS_REF}/scripts/make-send-cloud/poc/sample.mp4" || exit 1

# 狐狸生成母版与 web delivery 完全分离：只复制独立 generation-masters。
COPY generation-masters/ generation-masters/

# 唯一生产资产契约由前端不可变 Release 固定 SHA 拉取。
ARG RELEASE_MANIFEST_URL=https://pub-baeb836de8654e238577516dce76dea3.r2.dev/site-candidates/20260912-01/release-20260912-01/asset-manifest.json
ARG RELEASE_MANIFEST_SHA256=848199accd0e0c3d1000c00a1309f80d80a6d7ef85d9167bc78b6a8294283223
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
