"""把一段文字排成适合 drawtext 的多行。纯函数，无副作用。"""

CJK = "，。！？、；：（）《》“”‘’【】…—～·"

def layout_lines(text, max_chars=14, max_lines=3):
    text = (text or "").strip()
    if not text:
        return []
    lines, cur = [], ""
    for ch in text:
        cur += ch
        hard_break = ch == "\n"
        soft_break = len(cur) >= max_chars and ch in CJK
        too_long = len(cur) >= max_chars + 4
        if hard_break or soft_break or too_long:
            lines.append(cur.strip("\n"))
            cur = ""
            if len(lines) >= max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur.strip("\n"))
    if len(lines) == max_lines and len("".join(lines)) < len(text.replace("\n", "")):
        last = lines[-1]
        lines[-1] = (last[:-1] + "…") if len(last) > 1 else "…"
    return [l for l in lines if l]
