"""按真实字体宽度进行中文/混合文本自动换行与排版。"""
from PIL import ImageFont

# 本轮明确不支持的字符：emoji / 旗帜 / 变体选择符 / ZWJ / tag 字符
EMOJI_RANGES = [
    (0x1F000, 0x1FAFF),
    (0x1F1E6, 0x1F1FF),
    (0xFE00, 0xFE0F),
    (0x200D, 0x200D),
    (0xE0020, 0xE007F),
]


def has_unsupported(text):
    for ch in text:
        cp = ord(ch)
        for lo, hi in EMOJI_RANGES:
            if lo <= cp <= hi:
                return True
    return False


def load_font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.truetype(path, size)


def wrap_text(text, font, max_width):
    lines = []
    cur = ""
    cur_w = 0.0
    for ch in text:
        w = font.getlength(ch)
        if cur and cur_w + w > max_width:
            lines.append(cur)
            cur = ch
            cur_w = w
        else:
            cur += ch
            cur_w += w
    if cur:
        lines.append(cur)
    return lines


def layout_lines(text, font_path, base_size, safe_width, max_height, line_spacing, min_size=34):
    size = base_size
    while size >= min_size:
        font = load_font(font_path, size)
        lines = wrap_text(text, font, safe_width)
        block_h = len(lines) * size + (len(lines) - 1) * line_spacing
        if block_h <= max_height:
            return lines, size, block_h
        size -= 2
    font = load_font(font_path, size)
    lines = wrap_text(text, font, safe_width)
    block_h = len(lines) * size + (len(lines) - 1) * line_spacing
    return lines, size, block_h
