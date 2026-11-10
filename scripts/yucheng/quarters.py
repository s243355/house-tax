"""由既有實價登錄算出各社區近三年「每季」成交中位單價。

跟 lvr_calc.compute 用同一套社區比對、車位扣除與極端值篩法，
只多寫 data/yucheng/quarters.json，不改 stats.json 或頁面上的年度數字。
寫出前會用同一批交易重算年度中位數，必須和 stats.json 的 yrs 一致。
"""
import collections
import datetime
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lvr_calc as L

OUT = os.path.join(L.YC, "quarters.json")


def median(v):
    return round(statistics.median(v), 1) if v else None


def shift_quarter(year, quarter, delta):
    index = year * 4 + (quarter - 1) + delta
    return index // 4, index % 4 + 1


def quarter_of(day):
    return day.year, (day.month - 1) // 3 + 1


def matched_sales():
    """回傳 {社區 id: 納入行情的交易}。篩選條件對齊 lvr_calc.compute。"""
    comms = json.load(open(os.path.join(L.YC, "communities.json"), encoding="utf-8"))
    rows = L.load_sales()
    pest = L.parking_est(rows)
    for row in rows:
        row["u"] = L.unit_price(row, pest)
    by_st = collections.defaultdict(list)
    by_built = collections.defaultdict(list)
    for row in rows:
        by_st[(row["town"], row["st"])].append(row)
        if row["built"]:
            by_built[(row["town"], row["built"])].append(row)
    matched = {c["id"]: L.match(c, by_st, by_built) for c in comms}
    owner = {}
    for comm in comms:
        street, number = L.claim_key(comm)
        for row in matched[comm["id"]]:
            score = (0 if row["st"] == street else 1, abs(row["no"] - (number or 0)))
            if id(row) not in owner or score < owner[id(row)][0]:
                owner[id(row)] = (score, comm["id"])
    kept = {}
    for comm in comms:
        group = [row for row in matched[comm["id"]] if owner[id(row)][1] == comm["id"] and row["u"] and not row["excl"]]
        if group:
            mid = statistics.median(row["u"] for row in group)
            group = [row for row in group if 0.5 * mid <= row["u"] <= 2 * mid]
        kept[comm["id"]] = group
    return kept


def yearly(group):
    buckets = collections.defaultdict(list)
    for row in group:
        buckets[row["date"].year].append(row["u"])
    return [[year, len(values), median(values)] for year, values in sorted(buckets.items())]


def assert_matches_stats(kept):
    stats = json.load(open(os.path.join(L.YC, "stats.json"), encoding="utf-8"))
    bad = []
    for cid, group in kept.items():
        got = yearly(group)
        want = stats.get(str(cid), {}).get("yrs") or []
        if got != want:
            bad.append((cid, want, got))
    if bad:
        cid, want, got = bad[0]
        raise SystemExit(f"季度計算用的交易和 stats.json 年度數字不一致，例如 {cid}：stats={want} 重算={got}（共 {len(bad)} 個社區）。未寫入 quarters.json。")


def build():
    meta = json.load(open(os.path.join(L.YC, "stats_meta.json"), encoding="utf-8"))
    data_end = datetime.date.fromisoformat(meta["data_end"])
    end_y, end_q = quarter_of(data_end)
    start_y, start_q = shift_quarter(end_y, end_q, -11)
    slots = []
    year, quarter = start_y, start_q
    for _ in range(12):
        slots.append((year, quarter))
        year, quarter = shift_quarter(year, quarter, 1)
    kept = matched_sales()
    assert_matches_stats(kept)
    out = {
        "_meta": {
            "data_end": meta["data_end"],
            "quarters": [f"{y}Q{q}" for y, q in slots],
            "method": "與 lvr_calc.compute 相同的社區比對、車位扣除與 0.5–2 倍極端值篩選；中位數四捨五入到小數一位。",
        }
    }
    for cid, group in kept.items():
        buckets = collections.defaultdict(list)
        for row in group:
            y, q = quarter_of(row["date"])
            if (start_y, start_q) <= (y, q) <= (end_y, end_q):
                buckets[(y, q)].append(row["u"])
        out[str(cid)] = [[y, q, len(buckets[(y, q)]), median(buckets[(y, q)])] for y, q in slots]
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    filled = sum(1 for cid, rows in out.items() if cid != "_meta" and sum(r[2] for r in rows) >= 2 and sum(1 for r in rows if r[2]) >= 2)
    print(f"quarters {len(out)-1} communities, chartable {filled}, window {slots[0]}–{slots[-1]}")


if __name__ == "__main__":
    build()
