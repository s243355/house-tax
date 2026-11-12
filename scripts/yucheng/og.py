"""產生分享到 LINE／Facebook 時的預覽圖（1200×630），存到 og/。

- og/yucheng.jpg：個人頁
- og/communities.jpg、og/location.jpg：社區地圖、地段地圖
- og/listings.jpg：最新好案（物件會換，所以圖上只放不會過期的字）
- og/a-<id>.jpg：各社區購屋分析（社區名、近一年單價、屋齡戶數、祐承照片）
內容沒變的圖不會重寫，避免每次更新都多出一堆改動。
"""
import json, os, glob, hashlib, io
from PIL import Image, ImageDraw, ImageFont
from paths import ROOT, DATA
import og_font

W, H = 1200, 630
GREEN, INK, FG, MUTED, BG, GOLD = (10, 138, 67), (7, 107, 52), (20, 33, 26), (86, 101, 92), (251, 252, 250), (184, 137, 47)
OUT = os.path.join(ROOT, "og")
os.makedirs(OUT, exist_ok=True)

_plans = {}
_font_cache = {}
_logged = set()


def _reject_face(face):
    name = face.getname()[0] or ""
    if "Mono" in name:
        return True
    return any(tag in name for tag in ("CJK JP", "CJK KR", "CJK SC", "CJK HK"))


def _scan_tc(path, size):
    """在靜態 TTC 或可變字型裡找出繁體那個 face。"""
    index = og_font.tc_index_from_file(path)
    if index is not None:
        try:
            face = ImageFont.truetype(path, size, index=index)
        except OSError:
            face = None
        if face is not None and not _reject_face(face):
            return face
    for i in range(32):
        try:
            face = ImageFont.truetype(path, size, index=i)
        except OSError:
            break
        name = face.getname()[0] or ""
        if "TC" in name and "Mono" not in name:
            return face
    return None


def _apply_variable(face, weight):
    """靜態字重檔沒有變化軸；可變字型才把字重調到要求的那一檔。"""
    try:
        names = face.get_variation_names()
    except OSError:
        return
    if not names:
        return
    for name in names:
        text = name.decode("utf-8", "replace") if isinstance(name, bytes) else str(name)
        if text.lower() == weight.lower():
            face.set_variation_by_name(name)
            return
    wght = og_font.WGHT.get(weight)
    if wght is None:
        return
    try:
        axes = face.get_variation_axes()
    except OSError:
        return
    if len(axes) == 1:
        face.set_variation_by_axes([float(wght)])


def _plan(weight):
    if weight not in _plans:
        spec, tried = og_font.resolve_font(weight)
        files, seen = [], set()
        for path in list(og_font.candidate_paths(weight)) + og_font.fc_list_files():
            if path in seen or not os.path.isfile(path) or not og_font.is_sans_cjk_file(path):
                continue
            seen.add(path)
            files.append(path)
        _plans[weight] = (spec, tried, files)
    return _plans[weight]


def _files_for_weight(files, weight):
    """檔名裡看得到字重的先用。Black 會先碰到 Bold，不會先用 Regular。"""
    order = [style.lower() for style in og_font.styles_for(weight)]

    def rank(path):
        tokens = os.path.splitext(os.path.basename(path).lower())[0].replace("_", "-").split("-")
        for i, style in enumerate(order):
            if style in tokens:
                return i
        return len(order)

    return sorted(files, key=rank)


def _open_planned(spec, files, weight, size):
    if spec is not None and os.path.isfile(spec.path):
        face = None
        try:
            opened = ImageFont.truetype(spec.path, size, index=spec.index)
        except OSError:
            opened = None
        if opened is not None and not _reject_face(opened):
            name = opened.getname()[0] or ""
            if "TC" in name or og_font.face_kind(spec.family, spec.style, spec.postscript, spec.path) == "tc":
                face = opened
        if face is None:
            face = _scan_tc(spec.path, size)
        if face is not None:
            _apply_variable(face, weight)
            return face
    for path in _files_for_weight(files, weight):
        face = _scan_tc(path, size)
        if face is None:
            continue
        _apply_variable(face, weight)
        return face
    return None


def font(weight, size):
    key = (weight, size)
    if key in _font_cache:
        return _font_cache[key]
    spec, tried, files = _plan(weight)
    face = _open_planned(spec, files, weight, size)
    if face is None:
        raise SystemExit(og_font.format_miss(weight, tried, files))
    if weight not in _logged:
        name, style = face.getname()
        print(f"og 字型 {weight}：{name} {style}", flush=True)
        _logged.add(weight)
    _font_cache[key] = face
    return face


PHOTO = Image.open(os.path.join(ROOT, "images", "yucheng.jpg")).convert("RGB")


def photo_panel(w, h):
    # 從頭到腰：寬 600、照比例取高度
    cw = 600
    ch = int(cw * h / w)
    x0 = (PHOTO.width - cw) // 2
    return PHOTO.crop((x0, 10, x0 + cw, 10 + ch)).resize((w, h), Image.LANCZOS)


def fit(draw, text, weight, size, maxw, minsize=34):
    while size > minsize:
        f = font(weight, size)
        if draw.textlength(text, font=f) <= maxw:
            return f
        size -= 2
    return font(weight, minsize)


def wrap2(draw, text, f, maxw):
    """最多兩行，超過就截斷加…"""
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=f) > maxw:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    lines.append(cur)
    if len(lines) > 2:
        lines = lines[:2]
        while draw.textlength(lines[1] + "…", font=f) > maxw:
            lines[1] = lines[1][:-1]
        lines[1] += "…"
    return lines


def base(photo_w=380):
    im = Image.new("RGB", (W, H), BG)
    im.paste(photo_panel(photo_w, H - 70), (W - photo_w, 0))
    d = ImageDraw.Draw(im)
    # 底部綠色條
    d.rectangle([0, H - 70, W, H], fill=GREEN)
    d.text((56, H - 35), "祐承店長｜信義房屋 文心高工店", font=font("Bold", 28), fill="white", anchor="lm")
    d.text((W - 40, H - 35), "tcyucheng.com", font=font("Medium", 26), fill="white", anchor="rm")
    # 頂端細綠線
    d.rectangle([0, 0, W - photo_w, 8], fill=GREEN)
    return im, d, W - photo_w - 56 - 40


def save(im, name):
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
    data = buf.getvalue()
    p = os.path.join(OUT, name)
    if os.path.exists(p) and hashlib.md5(open(p, "rb").read()).digest() == hashlib.md5(data).digest():
        return False
    open(p, "wb").write(data)
    return True


def card(eyebrow, title, sub, big=None, big_label=None, big_note=None, pills=None):
    im, d, maxw = base()
    x = 56
    d.text((x, 48), eyebrow, font=font("Bold", 28), fill=INK)
    f = fit(d, title, "Black", 76, maxw)
    lines = wrap2(d, title, f, maxw) if d.textlength(title, font=f) > maxw else [title]
    y = 96
    for ln in lines:
        d.text((x, y), ln, font=f, fill=FG)
        y += int(f.size * 1.22)
    if sub:
        d.text((x, y + 6), sub, font=fit(d, sub, "Medium", 30, maxw, 22), fill=MUTED)
        y += 52
    if big:
        y = max(y + 24, 290)
        d.rounded_rectangle([x, y, x + maxw, y + 200], radius=18, fill=(238, 245, 240))
        d.text((x + 28, y + 20), big_label, font=font("Bold", 26), fill=INK)
        fb = font("Black", 84)
        d.text((x + 26, y + 52), big, font=fb, fill=GREEN)
        bw = d.textlength(big, font=fb)
        d.text((x + 40 + bw, y + 104), "萬/坪", font=font("Bold", 34), fill=GREEN)
        if big_note:
            d.text((x + 28, y + 162), big_note, font=fit(d, big_note, "Medium", 22, maxw - 56, 16), fill=MUTED)
    if pills:
        y = max(y + 40, 270)
        fp = font("Bold", 28)
        for p in pills:
            tw = d.textlength(p, font=fp)
            d.rounded_rectangle([x, y, x + tw + 44, y + 58], radius=29, outline=GOLD, width=3)
            d.text((x + 22, y + 29), p, font=fp, fill=GOLD, anchor="lm")
            y += 74
    return im


def main():
    C = json.load(open(os.path.join(DATA, "communities.json"), encoding="utf-8"))
    IID = json.load(open(os.path.join(DATA, "intro_by_id.json"), encoding="utf-8"))
    I = json.load(open(os.path.join(DATA, "intro.json"), encoding="utf-8"))
    M = json.load(open(os.path.join(DATA, "stats_meta.json"), encoding="utf-8"))
    de = M["data_end"]
    dl = f"資料至 {int(de[:4]) - 1911} 年 {int(de[5:7])} 月"
    ids = set(json.load(open(os.path.join(DATA, "an_ids.json"))))
    n = 0
    n += save(card("台中在地房產｜信義房屋 文心高工店", "房產找祐承", "首購規劃・屋主售屋・換屋銜接・置產評估",
                   pills=["2014 全國傑出金仲獎 經紀人楷模", "國家考試合格 不動產經紀人", "LINE 官方帳號 @161cayoi"]), "yucheng.jpg")
    cnt = len(C)
    n += save(card("祐承的商圈", "南區・東區・大里 社區地圖", f"{cnt} 個屋齡 30 年內社區・{dl}",
                   pills=["每個社區的近一年實登單價", f"{len(ids)} 個社區購屋分析", "每月自動更新實價登錄"]), "communities.jpg")
    n += save(card("祐承的商圈", "地段地圖", "南區・東區・大里 66 里地段力評分",
                   pills=["學區・車站・生活機能", "每一里的地段分數", "疊上社區行情一起看"]), "location.jpg")
    n += save(card("最新好案｜祐承店長精選", "台中精選好案", "降價特區・兩房到透天・信義官網可查",
                   pills=["總價・坪數・屋齡・車位一次看", "點進信義官網看完整照片", "喜歡哪間，LINE 直接問"]), "listings.jpg")
    for c in C:
        if c["id"] not in ids:
            continue
        A = json.load(open(os.path.join(DATA, "an", f"{c['id']}.json"), encoding="utf-8"))
        name = (c["name"] or c["addr"].replace(c["town"], "", 1)).replace("（2025 完工）", "")
        it = IID.get(str(c["id"])) or I.get(c["name"], {}) or {}
        age = "新成屋" if c["age"] < 1 else f"屋齡約 {round(c['age'])} 年"
        parts = [f"台中{c['town']}", age, f"{c['type']} {c['floors']}F"]
        if it.get("households"):
            hh = it["households"].split("（")[0].replace(" ", "")
            if len(hh) <= 8:
                parts.append(hh)
        sub = "・".join(parts)
        note = f"已扣車位・近一年 {A['n1y']} 筆・{dl}" if A.get("n1y") else f"近一年無成交，採近三年中位・{dl}"
        n += save(card("社區購屋分析", name, sub, f"{A['p1y']:.1f}", "近一年成交中位單價", note), f"a-{c['id']}.jpg")
    print("og images updated:", n)


if __name__ == "__main__":
    main()
