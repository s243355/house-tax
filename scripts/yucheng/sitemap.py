"""產生 tcyucheng.com 的網站地圖（個人頁、最新好案、社區地圖、地段地圖、各社區購屋分析）"""
import json, os, datetime
from paths import ROOT, DATA
ids = json.load(open(os.path.join(DATA, "an_ids.json")))
day = datetime.date.today().isoformat()
paths = ["/", "/yucheng-listings", "/yucheng-communities", "/yucheng-location"] + [f"/yucheng-a-{i}" for i in ids]
body = "\n".join(f"  <url><loc>https://tcyucheng.com{p}</loc><lastmod>{day}</lastmod></url>" for p in paths)
open(os.path.join(ROOT, "sitemap-yucheng.xml"), "w", encoding="utf-8").write(
    f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n')
print(len(paths), "urls")
