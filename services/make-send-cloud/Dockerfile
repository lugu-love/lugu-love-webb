FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8000 \
    FFMPEG_BIN=/usr/bin/ffmpeg \
    FFPROBE_BIN=/usr/bin/ffprobe \
    SEND_FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc \
    OUT_DIR=/data/out \
    MASTERS_DIR=/data/masters
RUN mkdir -p /data/out
EXPOSE 8000
CMD ["python", "server.py"]
