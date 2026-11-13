HEAD = '''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
{og}<link rel="icon" href="favicon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;900&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
:root{--bg:#fbfcfa;--surface:#fff;--tint:#eef5f0;--fg:#14211a;--muted:#56655c;--line:#d8e2db;--green:#0a8a43;--green-ink:#076b34;--on-green:#fff;--gold:#b8892f;--slate:#5b6f8a;
--display:"Noto Serif TC","Songti TC","PMingLiU",serif;--body:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;--r:10px}
@media (prefers-color-scheme:dark){:root{--bg:#0f1712;--surface:#16211a;--tint:#1a2a20;--fg:#e7efe9;--muted:#9db0a4;--line:#2a3a30;--green:#2fb36a;--green-ink:#5fd08f;--on-green:#06140c;--gold:#d8ac58;--slate:#8fa6c4;color-scheme:dark}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--body);font-size:16px;line-height:1.7;padding-bottom:72px}
a{color:var(--green-ink)}:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.wrap{max-width:1100px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1,h2,h3{font-family:var(--display);line-height:1.3;margin:0;text-wrap:balance}h1{font-size:clamp(1.8rem,5vw,2.6rem)}h2{font-size:1.4rem}p{margin:0}
.eyebrow{font-size:.8rem;letter-spacing:.14em;color:var(--green-ink);font-weight:700}.lead{color:var(--muted);max-width:66ch}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:9px 16px;border-radius:999px;font-weight:700;text-decoration:none;border:1.5px solid var(--green);font-size:.9rem;cursor:pointer;font-family:var(--body);background:transparent;color:var(--green-ink)}
.btn.solid{background:var(--green);color:var(--on-green)}
header.top{position:sticky;top:0;z-index:1001;background:var(--surface);border-bottom:1px solid var(--line)}
.top .bar{display:flex;align-items:center;gap:12px;height:56px}
.brand-wrap{display:flex;align-items:center;gap:10px;flex:1;min-width:0;text-decoration:none;color:var(--fg)}
.brand-mark{width:34px;height:34px;border-radius:50%;background:var(--green);color:var(--on-green);display:grid;place-items:center;font-family:var(--display);font-weight:900;flex:none}
.brand{font-family:var(--display);font-weight:900;font-size:1.15rem;white-space:nowrap}.brand b{color:var(--green)}
.tabsrow{border-top:1px solid var(--line)}
nav.menu{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none}nav.menu::-webkit-scrollbar{display:none}
nav.menu a{text-decoration:none;color:var(--muted);font-size:.92rem;padding:10px 12px;white-space:nowrap;border-bottom:2px solid transparent}
nav.menu a:hover,nav.menu a.on{color:var(--green-ink);border-bottom-color:var(--green)}
section{padding-block:32px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1.5px solid var(--line);background:var(--surface);color:var(--fg);border-radius:999px;padding:4px 12px;font-size:.88rem;cursor:pointer;font-family:var(--body)}
.chip[aria-pressed="true"]{border-color:var(--green);background:var(--tint);color:var(--green-ink);font-weight:700}
#map{height:min(62vh,560px);border-radius:var(--r);border:1px solid var(--line);z-index:0}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:.85rem;color:var(--muted)}
.dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;vertical-align:-1px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.stats{display:flex;flex-wrap:wrap;gap:24px}.stats b{font-family:var(--display);font-size:1.8rem;color:var(--green-ink);display:block;line-height:1.1;font-variant-numeric:tabular-nums}.stats span{font-size:.85rem;color:var(--muted)}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r)}
table{border-collapse:collapse;width:100%;font-size:.9rem;font-variant-numeric:tabular-nums;background:var(--surface)}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}th{font-weight:700;color:var(--muted);font-size:.82rem;cursor:pointer;background:var(--tint)}td.num,th.num{text-align:right}
details{border-bottom:1px solid var(--line);padding-block:12px}summary{cursor:pointer;font-weight:700}details p{color:var(--muted);margin-top:6px}
.note{font-size:.8rem;color:var(--muted)}
.leaflet-popup-content{font-family:var(--body);font-size:.88rem;line-height:1.6}
footer{border-top:1px solid var(--line);padding-block:24px;font-size:.8rem;color:var(--muted)}footer strong{color:var(--fg)}
.dock{position:fixed;left:0;right:0;bottom:0;z-index:1001;display:flex;justify-content:center;gap:8px;background:var(--surface);border-top:1px solid var(--line);padding:8px max(12px,env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px))}
.dock .btn{flex:1;max-width:220px;padding:9px 6px;font-size:.88rem;line-height:1.2;white-space:nowrap;border-width:1.5px}
{extra_css}
.brand-logo{height:20px;width:auto;display:block;flex:none}@media (max-width:380px){.brand-logo{height:16px}}
</style>
</head>
<body>
<header class="top"><div class="wrap bar">
  <a class="brand-wrap" href="/"><img class="brand-logo" src="images/sinyi-logo.png" alt="信義房屋" width="113" height="20" style="height:20px;width:auto;display:block;flex:none"><span aria-hidden="true" style="width:1px;height:18px;background:var(--line,#d5ddd8);flex:none"></span><span class="brand">房產找<b>祐承</b></span></a>
  <a class="btn solid" href="https://line.me/R/ti/p/@161cayoi" target="_blank" rel="noopener">加 LINE</a>
</div>
<div class="tabsrow"><nav class="wrap menu" aria-label="主選單">
  <a href="/#about">關於我</a><a href="/yucheng-listings">最新好案</a><a href="/yucheng-communities"{on1}>祐承的商圈</a><a href="/yucheng-location"{on2}>地段地圖</a><a href="/#services">服務項目</a><a href="/#guides">避坑攻略</a><a href="/#tools">試算工具</a><a href="/#contact">聯絡</a>
</nav></div></header>
'''
FOOT = '''<footer><div class="wrap">
  <p><strong>房產找祐承｜信義房屋 文心高工店</strong></p>
  <p>經紀業：信義房屋股份有限公司文心高工店｜經紀人：李祐承（店長／經理）不動產經紀人證書 (101)中市字第 00879 號</p>
  <p>門市電話 (04)2260-0011｜客訴專線 0800-211-922｜<a href="https://www.facebook.com/share/1GbhqLnwiu/" target="_blank" rel="noopener">分店粉絲專頁</a></p>
  <p>手機 0933-317-625｜LINE @161cayoi｜台中市南區文心南路 888 之 2 號</p>
  <p>{credit}</p>
</div></footer>
<div class="dock"><a class="btn solid" href="https://line.me/R/ti/p/@161cayoi" target="_blank" rel="noopener">加 LINE</a><a class="btn" href="tel:0933317625" aria-label="打電話 0933-317-625">打電話</a><a class="btn" href="yucheng#cform">預約諮詢</a></div>
'''
def og_tags(title,desc,img,path):
    import json as _j,os as _o,html as _h
    from paths import DATA as _D
    try:v=_j.load(open(_o.path.join(_D,'stats_meta.json'),encoding='utf-8'))['data_end'].replace('-','')
    except Exception:v='1'
    q=lambda x:_h.escape(x,quote=True)
    u='https://tcyucheng.com'+path
    im=f'https://tcyucheng.com/og/{img}?v={v}'
    return (f'<link rel="canonical" href="{u}">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="房產找祐承">\n'
            f'<meta property="og:title" content="{q(title)}">\n<meta property="og:description" content="{q(desc)}">\n<meta property="og:url" content="{u}">\n'
            f'<meta property="og:image" content="{im}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="{im}">\n')
def faq_ld(pairs):
    import json as _j
    data={"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
        {"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in pairs]}
    return _j.dumps(data,ensure_ascii=False,separators=(',',':'))
def faq_html(pairs, first_open=False):
    import html as _h
    parts=[]
    for i,(q,a) in enumerate(pairs):
        open_attr=' open' if first_open and i==0 else ''
        parts.append(f'<details{open_attr}><summary>{_h.escape(q)}</summary><p>{_h.escape(a)}</p></details>')
    return '\n  '.join(parts)
def page(title,desc,on,extra_css,body,credit,og=None,path=None):
    h=HEAD.replace('{title}',title).replace('{desc}',desc).replace('{extra_css}',extra_css).replace('{og}',og_tags(title,desc,og,path) if og else '')
    h=h.replace('{on1}',' class="on"' if on==1 else '').replace('{on2}',' class="on"' if on==2 else '')
    return h+body+FOOT.replace('{credit}',credit)+'</body>\n</html>\n'
