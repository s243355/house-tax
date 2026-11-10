"""用 591 公開頁補「目前是待確認」的社區欄位。

只接受同時對得上社區名稱（無名社區則改對門牌）與位置的資料。
建設公司排除銀行、保險等起造人。兩份資料數字打架就留空，不挑一個。
不會覆蓋 intro 裡已經寫好的值。
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lvr_calc as L
from paths import DATA

OUT = os.path.join(DATA, "verified_fields.json")
RETRIEVED = "2026-11-10"
UA = "Mozilla/5.0 (compatible; tcyucheng-field-check/1.0; +https://tcyucheng.com/)"
FIELDS = ("developer", "mgmt_fee", "households", "buildings", "parking", "public_ratio")
REJECT_DEV = ("銀行", "保險", "證券", "農會", "漁會", "信用合作社", "政府", "管理委員會", "都發局", "市府")
KEEP_DEV = ("建設", "開發", "營建", "機構", "實業", "興業")
SKIP_IDS = {457647}

PLAN_RE = re.compile(
    r'community-plan__label"[^>]*>([^<]+)</span>\s*<span class="community-plan__value"[^>]*>\s*<span[^>]*>([^<]*)</span>'
)


def norm_name(value):
    value = value or ""
    value = value.replace("（2025 完工）", "")
    value = re.sub(r"[（(].*?[）)]", "", value)
    table = str.maketrans({
        "．": "", ".": "", "‧": "", "・": "", " ": "", "　": "",
        "-": "", "－": "", "—": "", "閲": "閱", "双": "雙", "臺": "台",
    })
    return value.translate(table).casefold()


def dev_key(value):
    value = norm_name(value)
    for token in ("股份有限公司", "有限公司", "股份"):
        value = value.replace(token, "")
    return value


def ok_developer(value):
    value = (value or "").strip()
    if not value or len(value) > 40:
        return False
    if any(word in value for word in REJECT_DEV):
        return False
    return any(word in value for word in KEEP_DEV)


def ok_fee(value):
    value = (value or "").strip()
    if not value or len(value) > 24:
        return False
    if any(word in value for word in ("待定", "面議", "詳洽", "無", "--", "－", "未定")):
        return False
    return bool(re.search(r"\d", value) and "元" in value)


def tidy_number(value):
    value = re.sub(r"(\d+(?:\.\d+)?)", r" \1 ", value or "")
    return re.sub(r"\s+", " ", value).strip()


def hh_total(value):
    match = re.match(r"(\d+)\s*戶", value or "")
    return int(match.group(1)) if match else None


def hav_m(lat1, lng1, lat2, lng2):
    import math
    radius = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def addr_close(comm, address):
    street, number = L.split_addr(L.norm_addr(address or "", comm["town"]))
    if not street or number is None:
        return False
    for seed_street, seed_no in L.address_seeds(comm):
        if L.road_base(seed_street) == L.road_base(street) and abs(seed_no - number) <= 40:
            return True
    return False


def same_place(comm, api_name, api_addr, lat, lng):
    names = {norm_name(comm.get("name")), norm_name(comm.get("alias"))}
    names.discard("")
    api = norm_name(api_name)
    named = bool(names)
    if named and api not in names:
        return False
    near = False
    if lat and lng and comm.get("lat") and comm.get("lng"):
        near = hav_m(comm["lat"], comm["lng"], float(lat), float(lng)) <= 400
    close = addr_close(comm, api_addr)
    if named:
        return near or close
    return close


def http_get(url, accept="application/json"):
    last = None
    for attempt in range(3):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return res.read()
        except urllib.error.HTTPError as err:
            last = err
            if err.code in (429, 500, 502, 503):
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as err:
            last = err
            time.sleep(1.2 * (attempt + 1))
    raise last


CACHE = {}


def cached_json(url):
    if url not in CACHE:
        CACHE[url] = json.loads(http_get(url).decode("utf-8"))
        time.sleep(0.12)
    return CACHE[url]


def community_detail(cid):
    data = cached_json(f"https://bff.591.com.tw/v1/community/detail?id={cid}")
    if not data.get("status") or not data.get("data"):
        return None
    return data["data"].get("community") or None


def search_housing(name):
    url = "https://newhouse.591.com.tw/home/housing/search?regionid=8&keyword=" + urllib.parse.quote(name)
    data = cached_json(url)
    if not data.get("status"):
        return []
    return (data.get("data") or {}).get("items") or []


def housing_plan(hid):
    url = f"https://newhouse.591.com.tw/{hid}"
    if url not in CACHE:
        try:
            CACHE[url] = http_get(url, "text/html").decode("utf-8", "replace")
        except Exception:
            CACHE[url] = ""
        time.sleep(0.12)
    html = CACHE[url]
    return {label.strip(): value.strip() for label, value in PLAN_RE.findall(html)}


def market_ids(intro):
    found = []
    for source in intro.get("sources") or []:
        url = source if isinstance(source, str) else (source.get("url") or "")
        match = re.search(r"market\.591\.com\.tw/(\d+)", url)
        if match and match.group(1) not in found:
            found.append(match.group(1))
    return found


def parse_plan_text(text):
    buildings = None
    households = None
    total = None
    if not text:
        return buildings, households, total
    dong = re.search(r"(\d+)\s*棟", text)
    block = re.search(r"(\d+)\s*幢", text)
    if dong:
        buildings = f"{dong.group(1)} 棟" + (f"（{block.group(1)} 幢）" if block else "")
    homes = re.search(r"(\d+)\s*戶住家", text)
    shops = re.search(r"(\d+)\s*戶店面", text)
    parts = []
    count = 0
    if homes:
        parts.append(f"{homes.group(1)} 戶住家")
        count += int(homes.group(1))
    if shops:
        parts.append(f"{shops.group(1)} 戶店面")
        count += int(shops.group(1))
    if parts:
        households = f"{count} 戶（{'、'.join(parts)}）"
        total = count
    return buildings, households, total


class Bag:
    def __init__(self):
        self.items = []

    def add(self, value, source, total=None, key=None):
        if not value:
            return
        self.items.append({"value": value, "source": source, "total": total, "key": key if key is not None else value})

    def resolve(self):
        if not self.items:
            return None
        keys = [item["key"] for item in self.items]
        if all(isinstance(key, str) for key in keys):
            unique = set(keys)
            if len(unique) > 1:
                longest = max(unique, key=len)
                if not all(key and (key in longest or longest in key) for key in unique):
                    return None
        elif all(isinstance(key, int) for key in keys):
            if len(set(keys)) > 1:
                return None
        else:
            numbers = [key for key in keys if isinstance(key, int)]
            if len(set(numbers)) != 1:
                return None
            number = numbers[0]
            for item in self.items:
                if isinstance(item["key"], int):
                    continue
                found = [int(piece) for piece in re.findall(r"\d+", item["value"])]
                if number not in found and sum(found) != number:
                    return None
        totals = {item["total"] for item in self.items if item["total"] is not None}
        if len(totals) > 1:
            return None
        best = max(self.items, key=lambda item: len(item["value"]))
        sources = []
        seen = set()
        for item in self.items:
            url = item["source"]["url"]
            if url in seen:
                continue
            seen.add(url)
            sources.append(item["source"])
        return {"value": best["value"], "sources": sources}


def source(title, url, label):
    return {"title": title, "url": url, "label": label, "retrieved": RETRIEVED}


def consider_detail(comm, detail, bags):
    if not detail:
        return False
    if not same_place(comm, detail.get("name"), detail.get("address"), detail.get("lat"), detail.get("lng")):
        return False
    src = source(
        f"591實價登錄 {detail.get('name')}",
        f"https://market.591.com.tw/{detail.get('id')}",
        "社區詳情",
    )
    if ok_developer(detail.get("const_company")):
        company = detail["const_company"].strip()
        bags["developer"].add(company, {**src, "label": "建設公司"}, key=dev_key(company))
    holds = (detail.get("house_holds") or "").strip()
    match = re.fullmatch(r"(\d+)戶", holds)
    if match and int(match.group(1)) > 0:
        count = int(match.group(1))
        bags["households"].add(f"{count} 戶", {**src, "label": "總戶數"}, total=count, key=count)
    park = detail.get("park_num") or 0
    try:
        park = int(park)
    except (TypeError, ValueError):
        park = 0
    if park > 0:
        bags["parking"].add(f"{park} 個（591 社區資料，未區分平面或機械）", {**src, "label": "車位數"}, key=park)
    return True


def consider_plan(comm, item, plan, detail, bags):
    hid = item.get("hid")
    name = item.get("build_name") or (detail or {}).get("name")
    address = (detail or {}).get("address") or item.get("address")
    lat = (detail or {}).get("lat")
    lng = (detail or {}).get("lng")
    if not same_place(comm, name, address, lat, lng):
        return False
    src = source(f"591新建案 {name}", f"https://newhouse.591.com.tw/{hid}", "建案基本資料")
    company = (plan.get("投資建設") or "").strip()
    if ok_developer(company):
        bags["developer"].add(company, {**src, "label": "投資建設"}, key=dev_key(company))
    fee = plan.get("管理費用") or ""
    if ok_fee(fee):
        bags["mgmt_fee"].add(tidy_number(fee), {**src, "label": "管理費用"}, key=re.sub(r"\s+", "", fee))
    buildings, households, total = parse_plan_text(plan.get("棟戶規劃") or "")
    if buildings:
        bags["buildings"].add(buildings, {**src, "label": "棟戶規劃"}, key=buildings)
    if households and total:
        bags["households"].add(households, {**src, "label": "棟戶規劃"}, total=total, key=total)
    parking = (plan.get("車位規劃") or "").strip()
    if parking and parking not in ("無", "無車位", "-", "—") and len(parking) <= 24 and re.search(r"\d", parking):
        bags["parking"].add(tidy_number(parking), {**src, "label": "車位規劃"}, key=re.sub(r"\s+", "", parking))
    ratio = (plan.get("公設比") or "").strip()
    if re.fullmatch(r"\d+(?:\.\d+)?%", ratio):
        bags["public_ratio"].add(f"{ratio}（591 建案標示，不是實登推估）", {**src, "label": "公設比"}, key=ratio)
    return True


def empty(value):
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, dict)) and not value:
        return True
    return False


def main():
    comms = json.load(open(os.path.join(DATA, "communities.json"), encoding="utf-8"))
    by_id = {c["id"]: c for c in comms}
    intro = json.load(open(os.path.join(DATA, "intro.json"), encoding="utf-8"))
    intro_by_id = json.load(open(os.path.join(DATA, "intro_by_id.json"), encoding="utf-8"))
    stats = json.load(open(os.path.join(DATA, "stats.json"), encoding="utf-8"))
    pages = []
    for comm in comms:
        if not comm.get("an"):
            continue
        pages.append(comm)
    pages.sort(key=lambda c: (-(c.get("n1y") or 0), -(stats.get(str(c["id"]), {}).get("n3y") or 0), c["id"]))

    result = {}
    checked = 0
    matched = 0
    for index, comm in enumerate(pages, 1):
        if comm["id"] in SKIP_IDS:
            continue
        name = (comm["name"] or comm["addr"].replace(comm["town"], "", 1)).replace("（2025 完工）", "")
        block = intro_by_id.get(str(comm["id"])) or intro.get(name) or {}
        an_path = os.path.join(DATA, "an", f"{comm['id']}.json")
        an = json.load(open(an_path, encoding="utf-8")) if os.path.exists(an_path) else {}
        missing = {field for field in FIELDS if empty(block.get(field))}
        if "public_ratio" in missing and an.get("pr"):
            missing.remove("public_ratio")
        if not missing:
            continue
        checked += 1
        bags = {field: Bag() for field in FIELDS}
        hit = False
        for cid in market_ids(block):
            try:
                detail = community_detail(cid)
            except Exception as err:
                print("detail fail", cid, err)
                continue
            hit = consider_detail(comm, detail, bags) or hit
        query = comm.get("name") or ""
        if query and missing & {"developer", "mgmt_fee", "households", "buildings", "parking", "public_ratio"}:
            try:
                items = search_housing(query)
            except Exception as err:
                print("search fail", query, err)
                items = []
            seen = set()
            for item in items:
                if norm_name(item.get("build_name")) != norm_name(query) and norm_name(item.get("build_name")) != norm_name(comm.get("alias")):
                    continue
                if item.get("section") and item.get("section") != comm["town"]:
                    continue
                hid = item.get("hid")
                if hid in seen:
                    continue
                seen.add(hid)
                detail = None
                if item.get("community_id"):
                    try:
                        detail = community_detail(item["community_id"])
                    except Exception as err:
                        print("detail fail", item.get("community_id"), err)
                try:
                    plan = housing_plan(hid)
                except Exception as err:
                    print("plan fail", hid, err)
                    plan = {}
                hit = consider_plan(comm, item, plan, detail, bags) or hit
        record = {}
        for field in FIELDS:
            if field not in missing:
                continue
            resolved = bags[field].resolve()
            if resolved:
                record[field] = resolved
        if record:
            record["_match"] = {"id": comm["id"], "name": comm.get("name") or comm["addr"], "town": comm["town"]}
            result[str(comm["id"])] = record
            matched += 1
        if index % 25 == 0:
            print(f"progress {index}/{len(pages)} filled {matched}", flush=True)

    counts = {field: sum(1 for row in result.values() if field in row) for field in FIELDS}
    meta = {
        "retrieved": RETRIEVED,
        "analysis_pages": len(pages),
        "pages_checked_because_a_field_was_empty": checked,
        "pages_with_at_least_one_new_field": matched,
        "filled": counts,
        "skipped": [
            "熊貓公園市（457647）整頁凍結，不補資料。",
            "591 社區詳情把銀行或個人列為起造人時，不當作建設公司。",
            "同一欄位兩份公開數字不一致就留待確認。",
            "管理費只採用新建案頁「管理費用」欄，不用單一物件的刊登管理費。",
            "沒有對上名稱與位置的社區維持待確認。",
        ],
    }
    payload = {"_meta": meta, **result}
    json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(meta, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
