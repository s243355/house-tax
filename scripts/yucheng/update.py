"""把 lvr_calc.py 算出的 stats.json 合併進社區清單與各社區分析資料。

比對不到交易的社區保留原本數字（不覆蓋），並在 an 檔標記 frozen。
"""
import json, os, glob, datetime
from paths import DATA

C = json.load(open(os.path.join(DATA, "communities.json"), encoding="utf-8"))
S = json.load(open(os.path.join(DATA, "stats.json"), encoding="utf-8"))
M = json.load(open(os.path.join(DATA, "stats_meta.json"), encoding="utf-8"))
today = datetime.date.fromisoformat(M["computed_at"])

KEYS = ["n1y", "p1y", "n3y", "p3y", "yoy", "yrs", "fl", "rm", "sales", "pr", "mgmt", "bt", "rent", "ry"]
updated, frozen = 0, []
byname = {}
for c in C:
    s = S.get(str(c["id"]))
    p = os.path.join(DATA, "an", f"{c['id']}.json")
    A = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {"id": c["id"], "near": [], "poi": [], "presale": []}
    # 屋齡：有建築完成年月就用，否則用完工年
    if s and s.get("built") and len(s["built"]) >= 6:
        b = s["built"]
        bd = datetime.date(int(b[:-4]) + 1911, max(1, int(b[-4:-2]) or 1), 1)
        c["age"] = round(max(0, (today - bd).days / 365.25), 1)
    else:
        c["age"] = round(max(0, today.year - c["year"] + 0.5), 1)
    c["grp"] = "new" if c["age"] < 5 else ("mid" if c["age"] < 20 else "old")
    if s and s["n_all"] and (s["p1y"] or s["p3y"]):
        for k in KEYS:
            A[k] = s[k]
        if not A["p1y"]:
            A["p1y"] = A["p3y"]
            A["note"] = f"近一年沒有成交登錄，單價以近三年 {A['n3y']} 筆的中位數 {A['p3y']} 萬/坪 代替。"
        elif A["n1y"] < 3 and A["n3y"] > A["n1y"]:
            A["note"] = f"近一年只有 {A['n1y']} 筆成交，行情請同時參考近三年 {A['n3y']} 筆（中位 {A['p3y']} 萬/坪）。"
        else:
            A.pop("note", None)
        A.pop("frozen", None)
        c["p1y"], c["n1y"], c["yoy"] = A["p1y"], A["n1y"], A["yoy"]
        updated += 1
    else:
        A["frozen"] = True
        frozen.append(c["name"] or c["addr"])
    c["an"] = 1 if A.get("p1y") and A["p1y"] >= 12 else 0
    json.dump(A, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    for k in (c["name"], c["addr"].replace(c["town"], "", 1)):
        if k:
            byname[k] = c

# 周邊社區比較：自己清單裡的社區用最新單價
for p in glob.glob(os.path.join(DATA, "an", "*.json")):
    A = json.load(open(p, encoding="utf-8"))
    ch = False
    for row in A.get("near", []):
        cc = byname.get(row[0])
        if cc and cc.get("p1y") and row[2] != cc["p1y"]:
            row[2] = cc["p1y"]
            ch = True
    if ch:
        json.dump(A, open(p, "w", encoding="utf-8"), ensure_ascii=False)

json.dump(C, open(os.path.join(DATA, "communities.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"更新 {updated} 個社區；比對不到、沿用舊數字 {len(frozen)} 個：{frozen}")
