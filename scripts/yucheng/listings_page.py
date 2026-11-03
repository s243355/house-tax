"""把 data/yucheng/listings.json 做成 yucheng-listings.html（最新好案卡片頁）"""
import json, os, html, urllib.parse, sys
from paths import ROOT, DATA
from common import page

e = html.escape
D = json.load(open(os.path.join(DATA, "listings.json"), encoding="utf-8"))
C = json.load(open(os.path.join(DATA, "communities.json"), encoding="utf-8"))
ONLY_MINE = "--all" not in sys.argv  # 正式頁只放本店物件
PHOTO_BASE = None
if "--local-photos" in sys.argv:
    PHOTO_BASE = sys.argv[sys.argv.index("--local-photos") + 1]


def find_comm(it):
    hay = " ".join(x for x in (it.get("community"), it.get("name"), it.get("title")) if x)
    best = None
    for c in C:
        n = c.get("name") or ""
        if len(n) >= 3 and c["town"] == it["town"] and (n in hay or n[2:] in hay and len(n) >= 5):
            if not best or len(n) > len(best["name"]):
                best = c
    return best


def line_url(it):
    msg = f"祐承店長你好，我想了解「{it['title']}」（{it['town']}{it['road']}，{it['price']:,} 萬，物件編號 {it['code']}）"
    return "https://line.me/R/oaMessage/%40161cayoi/?" + urllib.parse.quote(msg)


def card(it):
    c = find_comm(it)
    ph = it["photos"][0] if it["photos"] else None
    if ph and PHOTO_BASE:
        ph = f"{PHOTO_BASE}/{it['code']}-A.jpg"
    img = (f'<img src="{e(ph)}" alt="{e(it["title"])}" loading="lazy">' if ph
           else f'<div class="noimg"><b>{e(it["community"] or (c and c["name"]) or it["road"])}</b><span>照片整理中，歡迎約看實境</span></div>')
    unit = f"{it['price'] / it['area']:.1f}" if it.get("price") and it.get("area") else None
    chips = [x for x in (
        it.get("layout"), f"建坪 {it['area']:.2f} 坪" if it.get("area") else None,
        f"屋齡 {it['age']}" if it.get("age") else None, it.get("floor"),
        ("車位 " + it["park"].split("(")[0]) if it.get("park") else None) if x]
    feats = "".join(f"<li>{e(f)}</li>" for f in it["features"][:3])
    comm = ""
    if c:
        comm = (f'<a class="cm" href="/yucheng-a-{c["id"]}">{e(c["name"])}・社區近一年實登 <b>{c["p1y"]:.1f}</b> 萬/坪 →</a>'
                if c.get("an") else f'<span class="cm">{e(c["name"])}</span>')
    elif it.get("community"):
        comm = f'<span class="cm">{e(it["community"])}</span>'
    pitch = f'<p class="pitch">{e(it["pitch"])}</p>' if it.get("pitch") else ""
    return f'''<article class="lc">
<div class="ph">{img}<span class="tag">{e(it["town"])}・{e(it["road"])}</span></div>
<div class="bd">
<h3>{e(it["title"])}</h3>{pitch}
<p class="pr"><b>{it["price"]:,}</b> 萬{f'<span>建坪單價約 {unit} 萬（含車位）</span>' if unit else ''}</p>
<div class="chips">{"".join(f"<span>{e(x)}</span>" for x in chips)}</div>
{f'<ul class="ft">{feats}</ul>' if feats else ''}
{comm}
<div class="act"><a class="btn" href="{e(line_url(it))}" target="_blank" rel="noopener">LINE 問這間</a><a class="btn ghost" href="{e(it["url"])}" target="_blank" rel="noopener">看物件詳情 ↗</a></div>
<p class="code">物件編號 {e(it["code"])}</p>
</div></article>'''


items = [x for x in D["items"] if x.get("mine") or not ONLY_MINE]
css = '''
.lgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;margin-top:18px}
.lc{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;min-width:0}
.lc .ph{position:relative;aspect-ratio:4/3;background:var(--tint);max-width:100%}
.lc .ph img{width:100%;height:100%;object-fit:cover;display:block}
.lc .noimg{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:16px;color:var(--muted)}
.lc .noimg b{font-size:1.25rem;color:var(--green-ink)}
.lc .tag{position:absolute;left:10px;top:10px;background:rgba(10,30,18,.72);color:#fff;font-size:.8rem;padding:2px 10px;border-radius:999px}
.lc .bd{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}
.lc h3{margin:0;font-size:1.15rem;line-height:1.4}
.lc .pitch{margin:0;color:var(--green-ink);font-weight:700}
.lc .pr{margin:0;color:var(--muted)}.lc .pr b{font-size:1.7rem;color:var(--fg);font-variant-numeric:tabular-nums}
.lc .pr span{display:block;font-size:.82rem}
.lc .chips{display:flex;flex-wrap:wrap;gap:6px}.lc .chips span{background:var(--tint);border-radius:999px;padding:2px 10px;font-size:.85rem}
.lc .ft{margin:0;padding-left:1.1em;font-size:.92rem;color:var(--muted)}
.lc .cm{font-size:.9rem;color:var(--green-ink);text-decoration:none;border-top:1px dashed var(--line);padding-top:8px}
.lc .act{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:6px}.lc .act .btn{flex:1;text-align:center;min-width:120px}
.lc .act .btn:first-child{background:var(--green);color:var(--on-green);border-color:var(--green)}
.btn.ghost{background:transparent;color:var(--green-ink);border:1.5px solid var(--green)}
.lc .code{margin:0;font-size:.75rem;color:var(--muted)}
'''
upd = D["meta"]["updated"]
body = f'''<main class="wrap" style="padding-block:28px">
<p class="eyebrow">最新好案</p>
<h1 style="margin:.2em 0">信義房屋 文心高工店 在售物件</h1>
<p class="lead">每天自動更新，價格與狀態以信義房屋物件頁為準。看到喜歡的，按「LINE 問這間」直接約帶看。</p>
{('<div class="lgrid">' + "".join(card(x) for x in items) + '</div>') if items else '<p class="note">目前沒有上架中的物件，歡迎加 LINE 告訴我你的需求，有適合的第一個通知你。</p>'}
<p class="note" style="margin-top:18px">更新時間 {e(upd)}</p>
</main>'''
credit = "物件資料來源：信義房屋網站物件頁；建坪單價為總價除以建坪（含車位），僅供參考。"
open(os.path.join(ROOT, "yucheng-listings.html"), "w", encoding="utf-8").write(
    page("最新好案｜信義房屋文心高工店 祐承店長", "信義房屋文心高工店在售物件：總價、坪數、格局、社區實登行情，一鍵 LINE 約看。", 0, css, body, credit,
         og="yucheng.jpg", path="/yucheng-listings"))
print(len(items), "cards")
