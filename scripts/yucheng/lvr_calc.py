"""用內政部實登資料（data/lvr）重算社區行情。

輸入：data/lvr/a.json（買賣）、c.json（租賃）、data/yucheng/communities.json（社區清單）
輸出：data/yucheng/stats.json（每個社區的行情數字）、area 中位數
比對規則：同行政區、同路段（含段巷弄；臺／台視為同一條路）、建物總樓層數相同、
建築完成年份差 1 年內，並以門牌號碼距離挑出最可能的那一批（同一個建築完成年月）。
社區若臨兩條路，把另一條路的門牌寫在 communities.json 的 addrs。
這些門牌仍須和主門牌同一批完工年月、樓高相符，而且門牌號距離在 40 號以內。
"""
import json, re, statistics, datetime, collections, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LVR = os.path.join(ROOT, "data", "lvr")
YC = os.path.join(ROOT, "data", "yucheng")
PING = 3.30579

FW = str.maketrans("０１２３４５６７８９－", "0123456789-")
CN = {"零": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def cn2int(s):
    s = s.strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)
    n, cur = 0, 0
    for ch in s:
        if ch == "十":
            n += (cur or 1) * 10
            cur = 0
        elif ch in CN:
            cur = CN[ch]
        else:
            return None
    return n + cur


PUA = {"\ue0d2": "磘", "\ue643": "磘"}


def norm_addr(a, town):
    a = "".join(PUA.get(ch, ch) for ch in a.translate(FW)).replace("臺", "台").replace("台中市", "")
    if a.startswith(town):
        a = a[len(town):]
    a = re.sub(r"([一二三四五六七八九十]+)段", lambda m: f"{cn2int(m.group(1))}段", a)
    return a


def split_addr(a):
    """回傳 (路段巷弄, 門牌主號)；抓不到回 (None, None)"""
    m = re.match(r"(.+?)(\d+)(?:[-之]\d+)?號", a)
    if not m:
        return None, None
    return m.group(1), int(m.group(2))


EXCL = ("特殊關係", "債權債務", "政府機關", "協議價購", "急買急賣", "瑕疵", "凶宅", "讓渡", "毛胚", "含租約")


def roc_date(s):
    s = (s or "").strip()
    if len(s) < 7 or not s.isdigit():
        return None
    try:
        return datetime.date(int(s[:-4]) + 1911, int(s[-4:-2]), int(s[-2:]))
    except ValueError:
        return None


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def load_sales():
    raw = json.load(open(os.path.join(LVR, "a.json"), encoding="utf-8"))
    rows = []
    for d in raw.values():
        if "建物" not in d["交易標的"] and "房地" not in d["交易標的"]:
            continue
        town = d["鄉鎮市區"]
        a = norm_addr(d["土地位置建物門牌"], town)
        st, no = split_addr(a)
        if not st:
            continue
        td = roc_date(d["交易年月日"])
        if not td:
            continue
        built = d["建築完成年月"].strip()
        rows.append({
            "town": town, "st": st, "no": no, "addr": a, "date": td,
            "built": built, "by": (int(built[:-4]) + 1911) if len(built) >= 6 and built.isdigit() else None,
            "ft": cn2int(d["總樓層數"].replace("層", "")),
            "fl": d["移轉層次"], "type": d["建物型態"],
            "total": fnum(d["總價元"]), "area": fnum(d["建物移轉總面積平方公尺"]),
            "pk_type": d["車位類別"].strip(), "pk_area": fnum(d["車位移轉總面積平方公尺"]), "pk_price": fnum(d["車位總價元"]),
            "rooms": int(fnum(d["建物現況格局-房"])), "mgmt": d["有無管理組織"] == "有",
            "main": fnum(d["主建物面積"]), "att": fnum(d["附屬建物面積"]), "bal": fnum(d["陽台面積"]),
            "note": d["備註"], "excl": any(k in d["備註"] for k in EXCL), "n_units": d["交易筆棟數"],
        })
    return rows


def parking_est(rows):
    """各區、各車位類別『分開標價』的中位價，給沒分開標價的交易扣除用"""
    g = collections.defaultdict(list)
    for r in rows:
        if r["pk_type"] and r["pk_price"] > 0 and "車位1" in r["n_units"]:
            g[(r["town"], r["pk_type"])].append(r["pk_price"])
            g[(r["town"], "*")].append(r["pk_price"])
    return {k: statistics.median(v) for k, v in g.items() if len(v) >= 5}


def unit_price(r, pest):
    """萬/坪，已扣車位"""
    total, area = r["total"], r["area"] - r["pk_area"]
    if r["pk_type"]:
        if r["pk_price"] > 0:
            total -= r["pk_price"]
        else:
            n = re.search(r"車位(\d+)", r["n_units"])
            n = int(n.group(1)) if n else 1
            total -= n * pest.get((r["town"], r["pk_type"]), pest.get((r["town"], "*"), 0))
    if area <= 3 or total <= 0:
        return None
    return total / (area / PING) / 10000


def floor_no(s):
    m = re.match(r"([一二三四五六七八九十]+)層", s or "")
    return cn2int(m.group(1)) if m else None


def median(v):
    return round(statistics.median(v), 1) if v else None


def road_base(st):
    """路名去掉巷弄，同一條路的巷弄算同一路段。"""
    return re.sub(r"\d+巷.*", "", st or "")


def address_seeds(comm):
    """主門牌在前。addrs 是同一棟臨另一條路的門牌，格式和 addr 相同。"""
    raws = [comm.get("addr") or ""]
    extra = comm.get("addrs") or []
    if isinstance(extra, str):
        extra = [extra]
    raws.extend(extra)
    seeds = []
    for raw in raws:
        st, no = split_addr(norm_addr(raw, comm.get("town") or ""))
        if st and no is not None:
            seeds.append((st, no))
    return seeds


def match(comm, by_st, by_built):
    """先用主門牌（同路段＋門牌相近＋完工年＋樓高）找出這個社區的建築完成年月，
    再把同行政區、同完成年月、樓高相近的交易納入。
    主路段含同一條路的巷弄；addrs 只納入該街門牌距離 40 號以內的交易，
    避免把整條大路或隔壁巷的別棟算進來。"""
    seeds = address_seeds(comm)
    if not seeds:
        return []
    st, no = seeds[0]
    F = comm["floors"]
    ok_ft = lambda r: r["ft"] and F - 5 <= r["ft"] <= F
    cand = [r for r in by_st.get((comm["town"], st), [])
            if ok_ft(r) and r["by"] and abs(r["by"] - comm["year"]) <= 1 and abs(r["no"] - no) <= 40]
    if not cand:
        return []
    near = min(abs(r["no"] - no) for r in cand)
    dates = collections.Counter(r["built"] for r in cand if abs(r["no"] - no) <= near + 20)
    # 只留主要的完成年月（至少佔一成），避免把隔壁另一棟算進來
    tot = sum(dates.values())
    keep = {d for d, n in dates.items() if n >= max(1, tot * 0.1)}
    fts = {r["ft"] for r in cand if r["built"] in keep}
    base = road_base(st)
    extra = seeds[1:]
    out, seen = [], set()
    for d in keep:
        for r in by_built.get((comm["town"], d), []):
            if not (r["ft"] in fts or ok_ft(r)):
                continue
            take = road_base(r["st"]) == base or any(
                r["st"] == est and abs(r["no"] - eno) <= 40 for est, eno in extra)
            if take and id(r) not in seen:
                seen.add(id(r))
                out.append(r)
    return out


def claim_key(comm):
    st, no = split_addr(norm_addr(comm["addr"], comm["town"]))
    return st, no


def compute(today=None):
    today = today or datetime.date.today()
    comms = json.load(open(os.path.join(YC, "communities.json"), encoding="utf-8"))
    rows = load_sales()
    pest = parking_est(rows)
    for r in rows:
        r["u"] = unit_price(r, pest)
    by_st = collections.defaultdict(list)
    by_built = collections.defaultdict(list)
    for r in rows:
        by_st[(r["town"], r["st"])].append(r)
        if r["built"]:
            by_built[(r["town"], r["built"])].append(r)
    d1, d2, d3 = today - datetime.timedelta(days=365), today - datetime.timedelta(days=730), today - datetime.timedelta(days=365 * 3)
    data_end = max(r["date"] for r in rows)
    # 年增率用資料完整月份：以資料最後一天往前推
    c1, c2 = data_end - datetime.timedelta(days=365), data_end - datetime.timedelta(days=730)

    # 行政區整體（住宅大樓、華廈，近一年）
    area = {}
    for t in {c["town"] for c in comms}:
        v = [r["u"] for r in rows if r["town"] == t and r["date"] >= d1 and not r["excl"] and r["u"]
             and (r["type"].startswith("住宅大樓") or r["type"].startswith("華廈"))]
        area[t] = median(v)

    rent = load_rent()
    # 同一筆交易若被兩個社區認領，給門牌最接近的那個
    M = {c["id"]: match(c, by_st, by_built) for c in comms}
    owner = {}
    for c in comms:
        st, no = claim_key(c)
        for r in M[c["id"]]:
            score = (0 if r["st"] == st else 1, abs(r["no"] - (no or 0)))
            if id(r) not in owner or score < owner[id(r)][0]:
                owner[id(r)] = (score, c["id"])
    out = {}
    for c in comms:
        m = [r for r in M[c["id"]] if owner[id(r)][1] == c["id"] and r["u"] and not r["excl"]]
        # 排除極端值（低於中位一半、高於兩倍，多為瑕疵或含店面）
        if m:
            med = statistics.median(r["u"] for r in m)
            m = [r for r in m if 0.5 * med <= r["u"] <= 2 * med]
        y1 = [r for r in m if r["date"] >= d1]
        y3 = [r for r in m if r["date"] >= d3]
        a1 = [r["u"] for r in m if r["date"] >= c1]
        a0 = [r["u"] for r in m if c2 <= r["date"] < c1]
        yoy = (statistics.median(a1) / statistics.median(a0) - 1) if len(a1) >= 3 and len(a0) >= 3 else None
        gy = collections.defaultdict(list)
        for r in m:
            gy[r["date"].year].append(r["u"])
        yrs = [[y, len(v), median(v)] for y, v in sorted(gy.items())]
        d5 = today - datetime.timedelta(days=365 * 5)
        r5 = [r for r in m if r["date"] >= d5]
        fl = []
        bands = [("1樓", lambda f: f == 1), ("2–5樓", lambda f: 2 <= f <= 5), ("6–10樓", lambda f: 6 <= f <= 10),
                 ("11–15樓", lambda f: 11 <= f <= 15), ("16樓以上", lambda f: f >= 16)]
        for name, fn in bands:
            v = [r["u"] for r in r5 if floor_no(r["fl"]) and fn(floor_no(r["fl"]))]
            if v:
                fl.append([name, len(v), median(v)])
        rm = []
        gr = collections.defaultdict(list)
        for r in r5:
            gr[r["rooms"]].append(r)
        for k in sorted(gr):
            g = gr[k]
            if len(g) < 2:
                continue
            rm.append([f"{k}房" if k else "開放格局", len(g), median([r["u"] for r in g]),
                       int(statistics.median(r["total"] for r in g) / 10000), median([r["area"] / PING for r in g])])
        sales = []
        for r in sorted(m, key=lambda r: r["date"], reverse=True)[:10]:
            sales.append([r["date"].strftime("%Y-%m"), floor_no(r["fl"]), r["ft"], round(r["area"] / PING, 1), r["rooms"],
                          int(round(r["total"] / 10000)), round(r["u"], 1), 1 if r["pk_type"] else 0])
        prs = [1 - (r["main"] + r["att"] + r["bal"]) / (r["area"] - r["pk_area"]) for r in m
               if r["main"] > 0 and r["area"] - r["pk_area"] > 0]
        prs = [p for p in prs if 0.05 < p < 0.6]
        rr = match_rent(c, rent, today)
        p1 = median([r["u"] for r in y1])
        ry = None
        if rr and p1:
            mon = [x for x in rr["rows"] if x["date"] >= d1]
            if len(mon) >= 2:
                yp = statistics.median(x["rent"] / x["ping"] for x in mon if x["ping"] > 0) * 12
                ry = round(yp / (p1 * 10000), 4)
        out[str(c["id"])] = {
            "id": c["id"], "n1y": len(y1), "p1y": p1, "n3y": len(y3), "p3y": median([r["u"] for r in y3]),
            "yoy": round(yoy, 3) if yoy is not None else None, "yrs": yrs, "fl": fl, "rm": rm, "sales": sales,
            "pr": round(statistics.median(prs), 3) if prs else None,
            "mgmt": any(r["mgmt"] for r in m), "bt": len({r["no"] for r in m}),
            "rent": rr["table"] if rr else [], "ry": ry, "n_all": len(m),
            "built": collections.Counter(r["built"] for r in m).most_common(1)[0][0] if m else None,
        }
    meta = {"computed_at": today.isoformat(), "data_end": data_end.isoformat(), "area": area}
    return out, meta


def load_rent():
    p = os.path.join(LVR, "c.json")
    if not os.path.exists(p):
        return {}
    raw = json.load(open(p, encoding="utf-8"))
    by_st = collections.defaultdict(list)
    for d in raw.values():
        town = d["鄉鎮市區"]
        a = norm_addr(d["土地位置建物門牌"], town)
        st, no = split_addr(a)
        td = roc_date(d.get("租賃年月日", ""))
        rent = fnum(d.get("總額元"))
        area = fnum(d.get("建物總面積平方公尺"))
        if not st or not td or rent <= 0 or "建物" not in d["交易標的"] and "房地" not in d["交易標的"]:
            continue
        built = (d.get("建築完成年月") or "").strip()
        by_st[(town, st)].append({
            "no": no, "date": td, "rent": rent, "ping": area / PING, "built": built,
            "by": (int(built[:-4]) + 1911) if len(built) >= 6 and built.isdigit() else None,
            "ft": cn2int((d.get("總樓層數") or "").replace("層", "")),
            "rooms": int(fnum(d.get("建物現況格局-房"))),
            "type": "整層住家" if fnum(d.get("建物現況格局-廳")) >= 1 and fnum(d.get("建物現況格局-房")) >= 1 else "套房／分租",
            "note": d.get("備註", ""),
        })
    return by_st


def match_rent(c, rent, today):
    seeds = address_seeds(c)
    if not seeds:
        return None
    cutoff = today - datetime.timedelta(days=730)
    rows, seen = [], set()
    for st, no in seeds:
        for r in rent.get((c["town"], st), []):
            if r["ft"] == c["floors"] and r["by"] and abs(r["by"] - c["year"]) <= 1 and abs(r["no"] - no) <= 40 and r["date"] >= cutoff and id(r) not in seen:
                seen.add(id(r))
                rows.append(r)
    if not rows:
        return None
    g = collections.defaultdict(list)
    for r in rows:
        g[(r["type"], r["rooms"])].append(r)
    table = []
    for (t, k), v in sorted(g.items(), key=lambda x: (-len(x[1]), x[0])):
        table.append([t, f"{k}房", len(v), int(statistics.median(x["rent"] for x in v)), median([x["ping"] for x in v])])
    return {"rows": rows, "table": table[:6]}


if __name__ == "__main__":
    out, meta = compute()
    os.makedirs(YC, exist_ok=True)
    json.dump(out, open(os.path.join(YC, "stats.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(meta, open(os.path.join(YC, "stats_meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(meta)
    print("matched", sum(1 for v in out.values() if v["n_all"]), "/", len(out))
