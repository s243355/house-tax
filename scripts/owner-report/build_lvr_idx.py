"""把 data/lvr/a.json（內政部實價登錄開放資料）整理成「依門牌查社區成交」的精簡索引，給屋主售屋建議報告書用。

輸出 data/lvr-idx/<行政區>.json：
  { "文心南路888號": [[成交日 yyymmdd, 樓層, 總價元, 建物移轉m2, 車位m2, 車位價元, 車位類別, 房, 廳, 衛, 備註], ...], ... }
只留近 3 年、有建物的買賣，排除僅車位、親友等特殊交易。
"""
import json, os, re, datetime

SRC = "data/lvr/a.json"
OUT = "data/lvr-idx"
FW = str.maketrans("０１２３４５６７８９－", "0123456789-")
NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
SKIP_NOTE = re.compile("親友|特殊關係|共有人|瑕疵|凶|急買|急賣|債權|法拍|政府機關")


def cn_floor(s):
    s = str(s or "").strip()
    m = re.match(r"^([一二三四五六七八九十]+)層", s)
    if not m:
        return ""
    t = m.group(1)
    if t == "十":
        return 10
    if "十" in t:
        a, _, b = t.partition("十")
        return (NUM.get(a, 1) if a else 1) * 10 + (NUM.get(b, 0) if b else 0)
    return NUM.get(t, "")


def addr_key(raw):
    s = str(raw or "").translate(FW)
    s = re.sub(r"^(臺中市|台中市)", "", s)
    s = re.sub(r"^[^\d]{1,3}?區", "", s)
    m = re.match(r"^(.+?\d+(?:之\d+)?號)", s)
    return m.group(1) if m else ""


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    rows = [v for v in data.values() if "建物" in v.get("交易標的", "")]
    if not rows:
        return
    latest = max(int(v["交易年月日"]) for v in rows if str(v.get("交易年月日", "")).isdigit())
    cutoff = latest - 30000  # 民國年 yyymmdd，往回 3 年
    idx = {}
    for v in rows:
        d = str(v.get("交易年月日", ""))
        if not d.isdigit() or int(d) < cutoff:
            continue
        if SKIP_NOTE.search(v.get("備註", "")):
            continue
        key = addr_key(v.get("土地位置建物門牌"))
        if not key:
            continue
        town = v.get("鄉鎮市區", "")
        def f(k):
            try:
                return round(float(v.get(k) or 0), 2)
            except ValueError:
                return 0
        idx.setdefault(town, {}).setdefault(key, []).append([
            int(d), cn_floor(v.get("移轉層次")), int(f("總價元")), f("建物移轉總面積平方公尺"),
            f("車位移轉總面積平方公尺"), int(f("車位總價元")), v.get("車位類別", ""),
            v.get("建物現況格局-房", ""), v.get("建物現況格局-廳", ""), v.get("建物現況格局-衛", ""),
            (v.get("備註", "") or "")[:30],
        ])
    os.makedirs(OUT, exist_ok=True)
    for town, m in idx.items():
        for k in m:
            m[k].sort(key=lambda r: -r[0])
        with open(os.path.join(OUT, town + ".json"), "w", encoding="utf-8") as fh:
            json.dump({"latest": latest, "data": m}, fh, ensure_ascii=False, separators=(",", ":"))
    print({t: len(m) for t, m in idx.items()}, "latest", latest)


if __name__ == "__main__":
    main()
