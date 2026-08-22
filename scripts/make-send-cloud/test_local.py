#!/usr/bin/env python3
import os
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def _ffmpeg_path():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


os.environ.setdefault("FFMPEG_BIN", _ffmpeg_path())
os.environ.setdefault("FONT_FILE", os.environ.get("TEST_FONT", "/tmp/noto/NotoSansCJKsc-Regular.otf"))
os.environ.setdefault("FONT_INDEX", "0")
os.environ.pop("FONT_FC", None)

import server  # noqa: E402

CASES = [
    ("rabbit-happy", "今天开心"),
    ("rabbit-happy", "今天心情不错，想把这份开心也分给你。"),
    ("rabbit-aggrieved", "我有点委屈"),
    ("rabbit-aggrieved", "我没事，就是有一点想被抱抱，你今天都没有理我。"),
    ("rabbit-angry", "我生气了"),
    ("rabbit-angry", "我现在真的有点生气，让我缓一缓，你先别跟我说话。"),
]


def main():
    for item, text in CASES:
        d = tempfile.mkdtemp(prefix="p3test-")
        t0 = time.time()
        try:
            final, meta = server.generate(item, text, d)
            print("=== %s | %s ===" % (item, text))
            print("  lines=%d font=%d layout=%.2fs tts=%.2fs ffmpeg=%.2fs total=%.2fs size=%d"
                  % (meta["lines"], meta["font_size"], meta["layout"], meta["tts"],
                     meta["ffmpeg"], time.time() - t0, meta["size"]))
        except Exception as e:
            print("=== %s | %s FAILED: %s ===" % (item, text, e))
        finally:
            shutil.rmtree(d, ignore_errors=True)


if __name__ == "__main__":
    main()
