"""最新好案：讀「最新好案」分頁 → 抓信義物件頁 → 產生 data/yucheng/listings.json 與 yucheng-listings.html

來源（依序）：
1. 環境變數 LISTINGS_CSV（試算表「發布到網路」的 CSV 網址）
2. data/yucheng/listings_src.json（備用）
抓取用 GitHub Action；本機可用 --html-dir 指向已下載的 HTML 測試。
"""
import csv, html, io, json, os, re, sys, time, urllib.request, datetime
from paths import ROOT, DATA

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9"}
MY_STORE = "文心高工店"


def code_of(url):
    m = re.search(r"/buy/house/([A-Za-z0-9]+)", url or "")
    return m.group(1) if m else None


def load_sources():
    rows = []
    u = os.environ.get("LISTINGS_CSV")
    if u:
        req = urllib.request.Request(u, headers=UA)
        txt = urllib.request.urlopen(req, timeout=60).read().decode("utf-8-sig")
        rd = list(csv.reader(io.StringIO(txt)))
        for r in rd[1:]:
            r = (r + [""] * 5)[:5]
            if r[0].strip():
                rows.append({"url": r[0].strip(), "title": r[1].strip(), "pitch": r[2].strip(), "status": r[3].strip() or "上架"})
    else:
        rows = json.load(open(os.path.join(DATA, "listings_src.json"), encoding="utf-8"))
    return [r for r in rows if r["status"] != "下架" and code_of(r["url"])]


def fetch(code):
    for i in range(3):
        try:
            req = urllib.request.Request(f"https://www.sinyi.com.tw/buy/house/{code}", headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", errors="replace"), r.status
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return None, e.code
            time.sleep(4 * (i + 1))
        except Exception:
            time.sleep(4 * (i + 1))
    return None, 0


def text_lines(s):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    t = re.sub(r"<[^>]+>", "\n", t)
    t = html.unescape(t)
    return [x.strip() for x in t.split("\n") if x.strip()]


def after(lines, label, start=0):
    for i in range(start, len(lines) - 1):
        if lines[i] == label:
            return lines[i + 1]
    return None


def parse(code, s):
    ld = None
    for m in re.finditer(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', s, re.S):
        try:
            j = json.loads(m.group(1))
        except ValueError:
            continue
        if j.get("@type") == "RealEstateListing":
            ld = j
    if not ld:
        return None
    L = text_lines(s)
    about = ld.get("about", {})
    addr = about.get("address", {})
    layout = next((p["value"] for p in about.get("additionalProperty", []) if p.get("name") == "格局"), "")
    price = (ld.get("offers") or {}).get("price")
    avail = (ld.get("offers") or {}).get("availability", "")
    # 基本資料區塊從「基本資料」之後找，避免抓到上方摘要
    b = L.index("基本資料") if "基本資料" in L else 0
    age = after(L, "屋齡", b)
    floor = after(L, "樓層", b)
    park = after(L, "車位", b)
    mgmt = after(L, "管理費", b)
    main = after(L, "主+陽", b)
    # 社區名：物件編號下一行（不是「地址」也不是「非信義物件」時）
    community = None
    for i, x in enumerate(L):
        if x == f"({code})" and i + 1 < len(L):
            nx = L[i + 1]
            if nx not in ("地址", "非信義物件") and not nx.startswith("台中市"):
                community = nx
            break
    store = after(L, "本物件所屬門市為")
    source = after(L, "本物件來源為")
    is_sinyi = "非信義物件" not in L
    desc = ld.get("description", "")
    m = re.search(r"總價[\d,]+萬，(.*?)。來信義房屋", desc)
    feats = []
    if m:
        body = m.group(1)
        parts = body.split("※") if "※" in body else body.split("、")
        for f in parts:
            f = f.strip().strip("、。，,. ")
            if f and len(f) <= 40:
                feats.append(f)
    photos = []
    for p in re.findall(r"https://res\.sinyi\.com\.tw/buy/" + re.escape(code) + r"/bigimg/[A-Za-z0-9_]+\.JPG", s):
        if p not in photos:
            photos.append(p)
    # 只有 og:image 一張時常是空圖（第三方物件），交給 photo_ok() 再確認
    return {
        "code": code, "url": f"https://www.sinyi.com.tw/buy/house/{code}",
        "name": ld.get("name", ""), "price": round(price / 10000) if price else None,
        "area": (about.get("floorSize") or {}).get("value"), "main": main, "layout": layout,
        "age": age, "floor": floor, "park": park, "mgmt": mgmt,
        "town": addr.get("addressLocality", ""), "road": addr.get("streetAddress", ""),
        "community": community, "store": store, "source": source, "is_sinyi": is_sinyi,
        "mine": bool(store and MY_STORE in store),
        "features": feats[:4], "photos": photos[:6], "in_stock": "InStock" in avail,
    }


def photo_ok(url, html_dir=None):
    """信義沒照片時 A.JPG 會回一個很小的空檔"""
    if html_dir:
        code = url.split("/buy/")[1].split("/")[0]
        p = os.path.join(html_dir, f"{code}-A.jpg")
        return os.path.exists(p) and os.path.getsize(p) > 2000
    try:
        req = urllib.request.Request(url, headers=UA, method="GET")
        with urllib.request.urlopen(req, timeout=30) as r:
            return len(r.read(4096)) > 2000
    except Exception:
        return False


def main():
    srcs = load_sources()
    html_dir = None
    if "--html-dir" in sys.argv:
        html_dir = sys.argv[sys.argv.index("--html-dir") + 1]
    out, report = [], []
    for r in srcs:
        code = code_of(r["url"])
        if html_dir:
            p = os.path.join(html_dir, f"{code}.html")
            s, st = (open(p, encoding="utf-8").read(), 200) if os.path.exists(p) else (None, 0)
        else:
            s, st = fetch(code)
            time.sleep(2)
        item = parse(code, s) if s else None
        if not item:
            report.append(f"{code}: 抓不到（HTTP {st}），可能已下架")
            continue
        if item["photos"] and not photo_ok(item["photos"][0], html_dir):
            item["photos"] = []
        item["title"] = r["title"] or item["name"]
        item["pitch"] = r["pitch"]
        if not item["in_stock"]:
            report.append(f"{code}: 信義頁顯示已非銷售中，略過")
            continue
        if not item["mine"]:
            who = item["store"] or item["source"] or "未知"
            report.append(f"{code}: 不是{MY_STORE}的物件（{who}）")
        out.append(item)
    meta = {"updated": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y-%m-%d %H:%M"),
            "report": report}
    json.dump({"items": out, "meta": meta}, open(os.path.join(DATA, "listings.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(meta, ensure_ascii=False, indent=1))
    print(len(out), "items")


if __name__ == "__main__":
    main()
