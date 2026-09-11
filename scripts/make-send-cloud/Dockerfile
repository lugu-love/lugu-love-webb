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
    curl -fsSL -o "masters/fox_white_hurt_sad_alpha_hevc.mov" "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/xinguang-fox/01-fox-white-hurt/delivery/fox_white_hurt_sad_alpha_hevc.mov" || exit 1; \
    curl -fsSL -o "masters/fox_navy_angry_alpha_hevc.mov" "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/xinguang-fox/02-fox-navy-angry/delivery/fox_navy_angry_alpha_hevc.mov" || exit 1; \
    curl -fsSL -o "masters/fox_pink_coquettish_alpha_hevc.mov" "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/xinguang-fox/03-fox-pink-coquettish/delivery/fox_pink_coquettish_alpha_hevc.mov" || exit 1; \
    curl -fsSL -o "masters/fox_black_playful_alpha_hevc.mov" "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/xinguang-fox/04-fox-black-playful/delivery/fox_black_playful_alpha_hevc.mov" || exit 1; \
    curl -fsSL -o "masters/fox_red_happy_alpha_hevc.mov" "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/xinguang-fox/05-fox-red-happy/delivery/fox_red_happy_alpha_hevc.mov" || exit 1; \
    curl -fsSL -o "masters/fox_teal_surprised_alpha_hevc.mov" "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/xinguang-fox/06-fox-teal-surprised/delivery/fox_teal_surprised_alpha_hevc.mov" || exit 1; \
    curl -fsSL -o "masters/fox_defiant_alpha_hevc.mov" "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/xinguang-fox/07-fox-defiant/delivery/fox_defiant_alpha_hevc.mov" || exit 1; \
    curl -fsSL -o "masters/fox_giveup_alpha_hevc.mov" "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/xinguang-fox/08-fox-giveup/delivery/fox_giveup_alpha_hevc.mov" || exit 1; \
    curl -fsSL -o "poc/sample.mp4" "https://raw.githubusercontent.com/lugu-love/lugu-love-webb/${MASTERS_REF}/scripts/make-send-cloud/poc/sample.mp4" || exit 1

ENV PORT=8000 \
    FONT_FILE=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc \
    FONT_INDEX=2 \
    FONT_FC="Noto Sans CJK SC" \
    FFMPEG_BIN=ffmpeg \
    FFMPEG_THREADS=2 \
    TTS_PROVIDER=edge-tts \
    SERVICE_ENABLED=true \
    SITE_STATE_FILE=/data/site_state.json \
    FPS=18 \
    BITRATE_KBPS=2500 \
    MAX_CONCURRENT=2 \
    RATE_LIMIT=6

EXPOSE 8000
CMD ["python", "server.py"]
