"""用臺中市政府教育局公開的學區表，標出「整里都屬於同一所學校」的社區。

國小用 112 學年度學區表，國中用 111 學年度學區表（資料開放平臺上最新的機器可讀版本）。
里被拆成不同鄰、或表上寫排除部分鄰，就不標，避免用社區座標去猜鄰。
整里被兩所學校列為共同學區時，兩所都寫上。
"""
import csv
import io
import json
import os
import re
import urllib.request

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import DATA

TOWNS = ("南區", "東區", "大里區")
OUT = os.path.join(DATA, "school_districts.json")
# 里名接在標點後面，後面緊接著（全里）、（第n鄰）或「第」。
# 這樣不會把「全里」或校名裡的「大里高中」當成里。
LI = re.compile(r"(?<![\u4e00-\u9fff])((?:(?!全里)[\u4e00-\u9fff]){2,4}里)(?=[（(第\s]|$)")
FULL = re.compile(r"^\s*[（(]\s*全里\s*[）)]")

SOURCES = {
    "elementary": {
        "level": "國小",
        "school_year": "112",
        "title": "臺中市國民小學學區表（112學年度）",
        "page": "https://data.gov.tw/dataset/84169",
        "download": "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=7dea3695-ade0-46c7-bb81-b883ce6027f5",
        "publisher": "臺中市政府教育局",
        "town_col": "學區範圍_行政區",
        "scope_col": "學區範圍_里鄰",
    },
    "junior": {
        "level": "國中",
        "school_year": "111",
        "title": "臺中市國民中學學區劃分表（111學年度）",
        "page": "https://data.gov.tw/dataset/130179",
        "download": "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=01d07ebf-9581-498b-84d4-b3dc7e8d3eda",
        "publisher": "臺中市政府教育局",
        "town_col": "行政區",
        "scope_col": "里鄰",
    },
}


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=40) as res:
        raw = res.read()
    text = raw.decode("utf-8-sig")
    return text.lstrip("\ufeff")


def mentions(scope):
    """每個里切出到下一個里之前的那段文字。"""
    found = list(LI.finditer(scope or ""))
    out = []
    for i, match in enumerate(found):
        end = found[i + 1].start() if i + 1 < len(found) else len(scope)
        chunk = scope[match.end():end]
        out.append((match.group(1), chunk))
    return out


def classify(chunk):
    """回傳 full / joint / partial。只有緊接在里名後面的（全里）才算整里。"""
    if not FULL.match(chunk or ""):
        return "partial"
    if "除外" in chunk or re.search(r"第?\d", chunk):
        return "partial"
    if "共同學區" in chunk:
        return "joint"
    return "full"


def assign(rows, town_col, scope_col):
    bucket = {}
    skipped_rows = 0
    for row in rows:
        town = (row.get(town_col) or "").strip()
        if town not in TOWNS:
            continue
        if "、" in town or "，" in town:
            skipped_rows += 1
            continue
        school = (row.get("學校名稱") or "").strip()
        for li, chunk in mentions(row.get(scope_col) or ""):
            bucket.setdefault((town, li), []).append({"school": school, "kind": classify(chunk)})
    assigned = {}
    for key, items in bucket.items():
        kinds = {item["kind"] for item in items}
        schools = []
        for item in items:
            if item["school"] not in schools:
                schools.append(item["school"])
        if kinds == {"full"} and len(schools) == 1:
            assigned[key] = {"schools": schools, "joint": False}
        elif kinds == {"joint"} and len(schools) >= 2:
            assigned[key] = {"schools": schools, "joint": True}
        # 有鄰別拆分、或整里卻對到兩所以上又沒寫共同學區：不猜
    return assigned


def main():
    levels = {}
    for key, spec in SOURCES.items():
        text = download(spec["download"])
        rows = list(csv.DictReader(io.StringIO(text)))
        mapping = assign(rows, spec["town_col"], spec["scope_col"])
        levels[key] = {
            "level": spec["level"],
            "school_year": spec["school_year"],
            "title": spec["title"],
            "page": spec["page"],
            "publisher": spec["publisher"],
            "areas": {f"{town}|{li}": value for (town, li), value in sorted(mapping.items())},
        }
        print(key, "whole-li assignments", len(mapping))
    comms = json.load(open(os.path.join(DATA, "communities.json"), encoding="utf-8"))
    pages = [c for c in comms if c.get("an")]
    for key, level in levels.items():
        hit = sum(1 for c in pages if f"{c['town']}|{c['vill']}" in level["areas"])
        print(f"  analysis pages covered by {key}: {hit}/{len(pages)}")
    payload = {
        "retrieved": "2026-11-10",
        "rule": "只標教育局學區表寫成全里、且沒有再依鄰排除或拆開的里。共同學區會並列學校。拆鄰的里維持待確認。",
        "levels": levels,
    }
    json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
