"""夜間預抓信義官網社區資料，給屋主售屋建議報告書用（白天帶入幾乎即時）。

要抓哪些社區：
  1. data/lvr-idx/comm.json 裡對得到信義社區編號的社區（網站社區頁資料）
  2. data/owner-report/sinyi-hot.json 手動清單（["0016889", ...]）
  3. 店內社區資料庫存過的信義社區編號（Apps Script「hot」，讀不到就略過）
結果寫到 data/sinyi-cache/<編號>.json，網站後端 4 天內直接用。
"""
import json, os, re, sys, time, urllib.error, urllib.request

SITE = os.environ.get("SITE", "https://tcyucheng.com")
OUT = "data/sinyi-cache"
MAX = int(os.environ.get("SINYI_MAX", "60"))
UA = {"Content-Type": "application/json", "User-Agent": "tcyucheng-owner-report-cache/1.0"}


def post(url, body, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=UA, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:  # 讀取服務忙碌時回 502，內容仍是 JSON
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:  # noqa: BLE001
            return {"ok": False, "error": "HTTP %s" % e.code}


def ids_from_files():
    ids = []
    try:
        comm = json.load(open("data/lvr-idx/comm.json", encoding="utf-8"))
        ids += [x[2] for t in comm.values() for x in t.values() if x[2]]
    except (OSError, ValueError):
        pass
    try:
        ids += json.load(open("data/owner-report/sinyi-hot.json", encoding="utf-8"))
    except (OSError, ValueError):
        pass
    return ids


def ids_from_store():
    try:
        html = open("owner-report.html", encoding="utf-8").read()
        m = re.search(r"GAS_URL\s*=\s*['\"](https://script\.google\.com/[^'\"]+)['\"]", html)
        if not m:
            return []
        r = post(m.group(1), {"action": "hot"}, 30)
        return r.get("ids", []) if r.get("ok") else []
    except Exception as e:  # noqa: BLE001
        print("店內資料庫讀不到，略過：", type(e).__name__)
        return []


def main():
    seen, ids = set(), []
    for i in ids_from_store() + ids_from_files():
        i = str(i).strip().upper()
        if re.fullmatch(r"[A-Z0-9]{5,12}", i) and i not in seen:
            seen.add(i)
            ids.append(i)
    ids = ids[:MAX]
    os.makedirs(OUT, exist_ok=True)
    ok = fail = 0
    for i in ids:
        try:
            d = post(SITE + "/api/sinyi-community", {"id": i, "fresh": True})
            if not d.get("ok"):  # 讀取服務一分鐘內次數有限，等一下再試一次
                time.sleep(30)
                d = post(SITE + "/api/sinyi-community", {"id": i, "fresh": True})
            if d.get("ok"):
                d.pop("source", None)
                d["fetchedTs"] = int(time.time() * 1000)
                with open(os.path.join(OUT, i + ".json"), "w", encoding="utf-8") as fh:
                    json.dump(d, fh, ensure_ascii=False, separators=(",", ":"))
                ok += 1
            else:
                fail += 1
                print(i, d.get("error"))
        except Exception as e:  # noqa: BLE001
            fail += 1
            print(i, type(e).__name__, e)
        time.sleep(10)  # 一筆一筆慢慢抓，不造成官網與讀取服務負擔
    # 不在清單裡的舊檔刪掉
    for f in os.listdir(OUT):
        if f.endswith(".json") and f[:-5] not in seen:
            os.remove(os.path.join(OUT, f))
    print(f"社區 {len(ids)} 個，成功 {ok}、失敗 {fail}")
    if ids and ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
