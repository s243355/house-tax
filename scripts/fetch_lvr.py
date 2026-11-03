"""抓內政部實價登錄開放資料（台中市：南區、東區、大里區），累積存到 data/lvr/。

- 歷史季別檔：近 4 年各季（DownloadSeason）
- 本期檔：每 10 天發布一次（Download），每次執行都抓並累積
同一筆交易以「編號」去重，新資料覆蓋舊資料。
"""
import csv, io, json, os, sys, time, urllib.request, zipfile, datetime

TOWNS = {"南區", "東區", "大里區"}
KINDS = {"a": "買賣", "b": "預售", "c": "租賃"}
OUT = "data/lvr"
BASE = "https://plvr.land.moi.gov.tw"
UA = {"User-Agent": "Mozilla/5.0 (house-tax data updater)"}


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:
            print("  retry", i + 1, url, e, file=sys.stderr)
            time.sleep(5 * (i + 1))
    return None


def rows_from_zip(blob, kind):
    try:
        z = zipfile.ZipFile(io.BytesIO(blob))
    except zipfile.BadZipFile:
        return None
    name = f"b_lvr_land_{kind}.csv"
    names = {n.lower(): n for n in z.namelist()}
    if name not in names:
        return []
    text = z.read(names[name]).decode("utf-8-sig", errors="replace")
    rd = list(csv.reader(io.StringIO(text)))
    if len(rd) < 2:
        return []
    head = rd[0]
    body = rd[2:] if rd[1] and rd[1][0].startswith("The ") else rd[1:]
    out = []
    for r in body:
        d = dict(zip(head, r))
        if d.get("鄉鎮市區") in TOWNS:
            out.append(d)
    return out


def seasons(n_years=4):
    today = datetime.date.today()
    roc = today.year - 1911
    res = []
    for y in range(roc - n_years, roc + 1):
        for q in range(1, 5):
            res.append(f"{y}S{q}")
    return res


def main():
    os.makedirs(OUT, exist_ok=True)
    store = {}
    for k in KINDS:
        p = f"{OUT}/{k}.json"
        store[k] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
    log = []

    def add(kind, rows, src):
        n = 0
        for d in rows:
            key = d.get("編號") or json.dumps(d, ensure_ascii=False, sort_keys=True)
            d["_src"] = src
            store[kind][key] = d
            n += 1
        return n

    for s in seasons():
        blob = get(f"{BASE}/DownloadSeason?season={s}&type=zip&fileName=lvr_landcsv.zip")
        if not blob:
            log.append(f"{s}: 下載失敗")
            continue
        got = []
        for k in KINDS:
            rows = rows_from_zip(blob, k)
            if rows is None:
                got = None
                break
            got.append(f"{KINDS[k]} {add(k, rows, s)}")
        log.append(f"{s}: " + ("非 zip（尚未發布）" if got is None else "、".join(got)))

    blob = get(f"{BASE}/Download?type=zip&fileName=lvr_landcsv.zip")
    if blob:
        got = []
        for k in KINDS:
            rows = rows_from_zip(blob, k) or []
            got.append(f"{KINDS[k]} {add(k, rows, 'current')}")
        log.append("本期: " + "、".join(got))
    else:
        log.append("本期: 下載失敗")

    for k in KINDS:
        json.dump(store[k], open(f"{OUT}/{k}.json", "w", encoding="utf-8"), ensure_ascii=False)
    meta = {"fetched_at": datetime.datetime.utcnow().isoformat() + "Z",
            "counts": {KINDS[k]: len(store[k]) for k in KINDS}, "log": log}
    json.dump(meta, open(f"{OUT}/meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n".join(log))
    print(meta["counts"])


if __name__ == "__main__":
    main()
