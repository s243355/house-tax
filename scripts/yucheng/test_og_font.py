"""字型解析：fonts-noto-cjk 只有 Regular/Bold 時，Medium、Black 仍要找得到繁體。"""
import os, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import og_font

UBUNTU_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
UBUNTU_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


def test_parse_and_kind():
    hit = og_font.parse_fc_match("/tmp/Noto.ttc\t3\tNoto Sans CJK TC\tBold\tNotoSansCJKtc-Bold\n")
    assert hit["index"] == 3 and hit["family"] == "Noto Sans CJK TC"
    assert og_font.parse_fc_match("") is None
    assert og_font.parse_fc_match("only-one-field") is None
    assert og_font.face_kind("Noto Sans CJK TC", "Bold", "", UBUNTU_BOLD) == "tc"
    assert og_font.face_kind("Noto Sans CJK", "Bold", "NotoSansCJKtc-Bold", UBUNTU_BOLD) == "tc"
    assert og_font.face_kind("Noto Sans CJK JP", "Bold", "NotoSansCJKjp-Bold", UBUNTU_BOLD) == ""
    assert og_font.face_kind("Noto Sans CJK SC", "Regular", "", UBUNTU_REGULAR) == ""
    assert og_font.face_kind("Noto Sans CJK HK", "Bold", "", UBUNTU_BOLD) == ""
    assert og_font.face_kind("Noto Sans Mono CJK TC", "Bold", "", UBUNTU_BOLD) == ""
    assert og_font.face_kind("Noto Sans CJK", "Bold", "", UBUNTU_BOLD) == "cjk"
    assert og_font.face_kind("Noto Sans", "Bold", "NotoSans-Bold", "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf") == ""
    assert og_font.face_kind("DejaVu Sans", "Book", "", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf") == ""


def test_paths_fall_back_to_shipped_weights():
    medium = og_font.candidate_paths("Medium")
    black = og_font.candidate_paths("Black")
    assert medium.count(UBUNTU_BOLD.replace("Bold.ttc", "Medium.ttc")) == 1
    assert UBUNTU_REGULAR in medium and UBUNTU_BOLD in medium
    assert medium.index(UBUNTU_REGULAR) < medium.index(UBUNTU_BOLD)
    assert black.index(UBUNTU_BOLD) < black.index(UBUNTU_REGULAR)
    assert any(path.endswith("NotoSansCJKtc-VF.otf") for path in medium)


def touch(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").close()
    return path


def test_missing_weights_use_regular_and_bold():
    """只裝 fonts-noto-cjk 時，Medium 用 Regular、Black 用 Bold，不要誤用 Noto Sans 或 DejaVu。"""
    with tempfile.TemporaryDirectory() as tmp:
        bold = touch(os.path.join(tmp, "NotoSansCJK-Bold.ttc"))
        regular = touch(os.path.join(tmp, "NotoSansCJK-Regular.ttc"))
        latin = touch(os.path.join(tmp, "NotoSans-Bold.ttf"))
        dejavu = touch(os.path.join(tmp, "DejaVuSans.ttf"))

        def match(family, style):
            exact = {
                ("Noto Sans CJK TC", "Bold"): {
                    "path": bold, "index": 3, "family": "Noto Sans CJK TC", "style": "Bold", "postscript": "NotoSansCJKtc-Bold",
                },
                ("Noto Sans CJK TC", "Regular"): {
                    "path": regular, "index": 3, "family": "Noto Sans CJK TC", "style": "Regular", "postscript": "NotoSansCJKtc-Regular",
                },
            }
            if (family, style) in exact:
                return exact[(family, style)]
            if family == "Noto Sans CJK TC" and style in ("Medium", "Black", "Light", "Thin", "DemiLight"):
                return exact[("Noto Sans CJK TC", "Regular")]
            if family == "Noto Sans CJK":
                return {"path": latin, "index": 0, "family": "Noto Sans", "style": "Bold", "postscript": "NotoSans-Bold"}
            return {"path": dejavu, "index": 0, "family": "DejaVu Sans", "style": "Book", "postscript": "DejaVuSans"}

        medium, tried_m = og_font.resolve_font("Medium", match=match)
        black, tried_b = og_font.resolve_font("Black", match=match)
        chosen, _ = og_font.resolve_font("Bold", match=match)
        assert medium.path == regular and medium.index == 3 and medium.style == "Regular", medium
        assert black.path == bold and black.index == 3 and black.style == "Bold", black
        assert chosen.path == bold and chosen.index == 3 and chosen.style == "Bold", chosen
        assert any("略過" in line and "Noto Sans" in line for line in tried_m)
        assert any("DejaVu Sans" in line for line in tried_b)


def test_postscript_tc_when_family_has_no_suffix():
    with tempfile.TemporaryDirectory() as tmp:
        bold = touch(os.path.join(tmp, "NotoSansCJK-Bold.ttc"))

        def match(family, style):
            if family == "Noto Sans CJK" and style == "Bold":
                return {"path": bold, "index": 3, "family": "Noto Sans CJK", "style": "Bold", "postscript": "NotoSansCJKtc-Bold"}
            if family == "Noto Sans CJK" and style == "Regular":
                return {"path": bold, "index": 0, "family": "Noto Sans CJK", "style": "Regular", "postscript": "NotoSansCJKjp-Regular"}
            return None

        spec, tried = og_font.resolve_font("Bold", match=match)
        assert spec is not None and spec.index == 3 and spec.postscript == "NotoSansCJKtc-Bold", (spec, tried)
        assert any("無結果" in line for line in tried)


def test_miss_lists_what_was_tried():
    def match(family, style):
        return None

    spec, tried = og_font.resolve_font("Medium", match=match)
    assert spec is None
    text = og_font.format_miss("Medium", tried, [])
    assert "Medium" in text and "Regular" in text and "Bold" in text
    assert "Noto Sans CJK TC" in text
    assert "Noto Sans CJK" in text
    assert "fonts-noto-cjk" in text
    assert "/usr/share/fonts/opentype/noto" in text
    assert any("無結果" in line for line in tried)


def test_real_fontconfig_if_present():
    spec, tried = og_font.resolve_font("Bold")
    assert tried and any("Noto Sans CJK TC" in line for line in tried)
    if spec is None:
        print("skip open: 這台沒有 Noto Sans CJK TC")
        return
    assert spec.style in og_font.styles_for("Bold")
    assert "TC" in spec.family or "CJKtc" in spec.postscript
    assert og_font.tc_index_from_file(spec.path) == spec.index
    try:
        from PIL import Image, ImageDraw
        import og
    except ImportError:
        print("skip open: 沒有 Pillow")
        return
    for weight in ("Bold", "Medium", "Black"):
        face = og.font(weight, 36)
        name, style = face.getname()
        assert name and "TC" in name and "Mono" not in name, (weight, name, style)
        image = Image.new("L", (240, 64), 255)
        ImageDraw.Draw(image).text((4, 4), "祐承實價", font=face, fill=0)
        assert image.getextrema()[0] < 250, weight
    print("opened", og.font("Bold", 36).getname(), og.font("Medium", 36).getname(), og.font("Black", 36).getname())


def main():
    test_parse_and_kind()
    test_paths_fall_back_to_shipped_weights()
    test_missing_weights_use_regular_and_bold()
    test_postscript_tc_when_family_has_no_suffix()
    test_miss_lists_what_was_tried()
    test_real_fontconfig_if_present()
    print("ok")


if __name__ == "__main__":
    main()
