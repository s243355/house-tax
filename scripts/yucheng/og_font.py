"""找出繁體中文無襯線字型，給分享預覽圖用。

Ubuntu 的 fonts-noto-cjk 只帶 Regular、Bold 兩個檔（NotoSansCJK-*.ttc），
家族名與路徑在不同版本也不一定一樣。這裡用 fontconfig（fc-match / fc-query / fc-list）
問多個家族名，缺的字重改用已安裝的 Regular 或 Bold，再退回常見檔名。
"""
import os, subprocess

# 先問地區明確的家族，再問沒有地區後綴的名字（有些版本把 TC 放在 PostScript 名）。
FAMILIES = (
    "Noto Sans CJK TC",
    "Noto Sans CJK",
    "Noto Sans TC",
    "Source Han Sans TC",
    "Source Han Sans",
)

# 要求的字重 → 實際可接受的字重。fonts-noto-cjk 沒有 Medium、Black。
STYLE_FALLBACK = {
    "Thin": ("Thin", "Light", "Regular", "Bold"),
    "Light": ("Light", "DemiLight", "Regular", "Bold"),
    "DemiLight": ("DemiLight", "Light", "Regular", "Bold"),
    "Regular": ("Regular", "Medium", "Bold"),
    "Medium": ("Medium", "Regular", "Bold"),
    "Bold": ("Bold", "Black", "Medium", "Regular"),
    "Black": ("Black", "Bold", "Medium", "Regular"),
}

WGHT = {
    "Thin": 100,
    "Light": 300,
    "DemiLight": 350,
    "Regular": 400,
    "Medium": 500,
    "Bold": 700,
    "Black": 900,
}

FONT_DIRS = (
    "/usr/share/fonts/opentype/noto",
    "/usr/share/fonts/noto-cjk",
    "/usr/share/fonts/truetype/noto",
    "/usr/share/fonts/truetype/noto-cjk",
    "/usr/share/fonts/noto",
    "/usr/local/share/fonts",
    "/usr/local/share/fonts/noto",
)

FILE_PATTERNS = (
    "NotoSansCJK-{style}.ttc",
    "NotoSansCJK-{style}.otf",
    "NotoSansCJK-{style}.ttf",
    "NotoSansCJKtc-{style}.otf",
    "NotoSansCJKtc-{style}.ttf",
    "NotoSansTC-{style}.otf",
    "NotoSansTC-{style}.ttf",
    "SourceHanSansTC-{style}.otf",
    "SourceHanSansTC-{style}.ttf",
)

VARIABLE_FILES = (
    "NotoSansCJKtc-VF.otf",
    "NotoSansCJKtc-VF.ttf",
    "NotoSansCJK-VF.otf.ttc",
    "NotoSansCJK-VF.ttf.ttc",
    "NotoSansCJK-VF.ttc",
    "NotoSansTC-VF.otf",
    "NotoSansTC-VF.ttf",
)

_BAD_REGION = (
    "CJK JP", "CJK KR", "CJK SC", "CJK HK",
    "CJKjp", "CJKkr", "CJKsc", "CJKhk",
    "Sans JP", "Sans KR", "Sans SC", "Sans HK",
)
_GOOD_REGION = (
    "CJK TC", "CJKtc",
    "Noto Sans TC", "NotoSansTC",
    "Source Han Sans TC", "SourceHanSansTC",
)

_listed = None
_tc_index = {}


class FontSpec:
    def __init__(self, path, index, style, family, postscript=""):
        self.path = path
        self.index = int(index or 0)
        self.style = style or ""
        self.family = family or ""
        self.postscript = postscript or ""

    def __repr__(self):
        return f"FontSpec({self.family} {self.style} #{self.index} {self.path})"


def styles_for(weight):
    return STYLE_FALLBACK.get(weight, (weight, "Bold", "Regular"))


def face_kind(family, style, postscript, path):
    """'tc'：繁體；'cjk'：沒標地區的 CJK 黑體；''：不能用。"""
    blob = " ".join([family or "", style or "", postscript or "", os.path.basename(path or "")])
    if "Mono" in blob or "mono" in os.path.basename(path or "").lower():
        return ""
    for bad in _BAD_REGION:
        if bad in blob:
            return ""
    for good in _GOOD_REGION:
        if good in blob:
            return "tc"
    fam = family or ""
    base = os.path.basename(path or "")
    stem = os.path.splitext(base)[0]
    if fam in ("Noto Sans CJK", "Source Han Sans") or stem.startswith(("NotoSansCJK", "SourceHanSans")):
        # 副檔名 .ttc 不能拿來判斷地區；地區在檔名本身（NotoSansCJKtc）或家族名。
        if "TC" in fam or "tc" in stem or "TC" in stem:
            return "tc"
        return "cjk"
    return ""


def is_sans_cjk_file(path):
    base = os.path.basename(path or "").lower()
    if not base or "serif" in base or "mono" in base:
        return False
    return any(k in base for k in ("notosanscjk", "notosanstc", "sourcehansans"))


def candidate_paths(weight):
    paths = []
    for style in styles_for(weight):
        for directory in FONT_DIRS:
            for pattern in FILE_PATTERNS:
                paths.append(os.path.join(directory, pattern.format(style=style)))
    for directory in FONT_DIRS:
        for name in VARIABLE_FILES:
            paths.append(os.path.join(directory, name))
    return paths


def _run(args):
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL, timeout=15)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return ""


def parse_fc_match(text):
    line = ""
    for raw in (text or "").splitlines():
        if raw.strip():
            line = raw.strip()
            break
    if not line:
        return None
    parts = line.split("\t")
    if len(parts) < 4 or not parts[0] or parts[0] == "(null)":
        return None
    try:
        index = int(parts[1])
    except ValueError:
        index = 0
    return {
        "path": parts[0],
        "index": index,
        "family": parts[2],
        "style": parts[3],
        "postscript": parts[4] if len(parts) > 4 else "",
    }


def fc_match_query(family, style):
    out = _run(["fc-match", "-f", "%{file}\t%{index}\t%{family}\t%{style}\t%{postscriptname}\n", f"{family}:style={style}"])
    return parse_fc_match(out)


def fc_list_files():
    global _listed
    if _listed is not None:
        return _listed
    out = _run(["fc-list", "-f", "%{file}\n"])
    seen, have = [], set()
    for line in out.splitlines():
        path = line.strip()
        if path and path not in have and is_sans_cjk_file(path):
            have.add(path)
            seen.append(path)
    _listed = seen
    return _listed


def tc_index_from_file(path):
    """用 fc-query 在 TTC 裡找出繁體那個 face 的 index。找不到回 None。"""
    if path in _tc_index:
        return _tc_index[path]
    out = _run(["fc-query", "--format", "%{index}\t%{family}\t%{style}\t%{postscriptname}\n", path])
    found = None
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        family, style = parts[1], parts[2]
        postscript = parts[3] if len(parts) > 3 else ""
        if face_kind(family, style, postscript, path) != "tc":
            continue
        try:
            found = int(parts[0])
        except ValueError:
            found = 0
        break
    _tc_index[path] = found
    return found


def resolve_font(weight, match=None):
    """回傳 (FontSpec 或 None, 嘗試紀錄)。match(family, style) 可在測試替換。"""
    if match is None:
        match = fc_match_query
    tried = []
    substitute = None
    for style in styles_for(weight):
        for family in FAMILIES:
            label = f"fc-match {family}:style={style}"
            try:
                hit = match(family, style)
            except Exception as exc:
                tried.append(f"{label} → 錯誤：{exc}")
                continue
            if not hit or not hit.get("path"):
                tried.append(f"{label} → 無結果")
                continue
            path = hit["path"]
            if not os.path.isfile(path):
                tried.append(f"{label} → 檔案不存在 {path}")
                continue
            kind = face_kind(hit.get("family"), hit.get("style"), hit.get("postscript"), path)
            tried.append(
                f"{label} → {path} #{hit.get('index')} {hit.get('family')} / {hit.get('style')} ({kind or '略過'})"
            )
            if kind != "tc":
                continue
            spec = FontSpec(path, hit.get("index") or 0, hit.get("style"), hit.get("family"), hit.get("postscript"))
            if (hit.get("style") or "").lower() == style.lower():
                return spec, tried
            if substitute is None:
                substitute = spec
    return substitute, tried


def format_miss(weight, tried, files):
    lines = [
        f"找不到繁體中文 Noto 字型（要求字重 {weight}，會改試 {'、'.join(styles_for(weight))}）。",
        "問過的家族名：" + "、".join(FAMILIES),
    ]
    if tried:
        lines.append("fontconfig 結果：")
        lines.extend("  " + item for item in tried)
    else:
        lines.append("fontconfig（fc-match）沒有回傳結果。")
    if files:
        lines.append("有掃過這些檔案，裡面沒有可用的繁體面：")
        lines.extend("  " + path for path in files)
    else:
        lines.append("這些目錄裡沒有 NotoSansCJK / NotoSansTC 檔：")
        lines.extend("  " + directory for directory in FONT_DIRS)
    lines.append("Ubuntu：sudo apt-get install fonts-noto-cjk")
    return "\n".join(lines)
