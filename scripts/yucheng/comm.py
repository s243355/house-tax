import os
from paths import ROOT,DATA
import json,sys,html
sys.path.insert(0,'.')
from common import page
from shared_layers import STATIONS,load
e=html.escape
C=json.load(open(os.path.join(DATA,'communities.json'),encoding='utf-8'))
_de=json.load(open(os.path.join(DATA,'stats_meta.json'),encoding='utf-8'))['data_end'];DLABEL=f"{int(_de[:4])-1911} 年 {int(_de[5:7])} 月"
L,OV=load()
for c in C:
    if str(c['id']) in OV:c['lat'],c['lng']=OV[str(c['id'])]
G={'new':('新成屋','#0a8a43','5 年內'),'mid':('輕屋齡','#b8892f','5–20 年'),'old':('中古屋','#5b6f8a','20–30 年')}
def label(c):return c['name'] or c['addr']
cnt={g:sum(1 for c in C if c['grp']==g) for g in G}
nan=sum(1 for c in C if c.get('an'))
# static list
rows=[]
for g,(t,col,d) in G.items():
    xs=sorted([c for c in C if c['grp']==g],key=lambda c:c['age'])
    rows.append(f'<div class="grp" data-grp="{g}"><h3><i class="dot" style="background:{col}"></i>{t}<small>{d}・<span class="gc">{len(xs)}</span> 個</small></h3>')
    for c in xs:
        an=f' <a class="abadge" href="/yucheng-a-{c["id"]}">購屋分析</a>' if c.get('an') else ''
        hh=f'・{c["hh"]} 戶' if c.get('hh') else ''
        yoy=f'・<span class="{"up" if c["yoy"]>=0 else "dn"}">年 {"+" if c["yoy"]>=0 else ""}{c["yoy"]*100:.1f}%</span>' if c.get('yoy') is not None and c['n1y']>=5 else ''
        rows.append(f'''<article class="row" id="c{c["id"]}" data-id="{c["id"]}" data-town="{c["town"]}" data-grp="{g}" data-an="{1 if c.get("an") else 0}" data-p="{c["p1y"]}" data-age="{c["age"]}" data-n="{c["n1y"]}" data-q="{e(label(c)+c["addr"]+c["vill"])}" tabindex="0">
<div style="min-width:0"><h4 class="nm">{e(label(c))}{an}</h4><p class="meta">{c["year"]} 完工・約 {round(c["age"])} 年・{c["type"]} {c["floors"]}F{hh}</p><p class="meta">{e(c["addr"]) if c["name"] else ""}{"｜" if c["name"] else ""}{c["town"]}{"・"+c["vill"] if c["vill"] else ""}</p></div>
<div class="pr"><b>{c["p1y"]:.1f}</b> 萬/坪<small>近一年 {c["n1y"]} 筆{yoy}</small></div></article>''')
    rows.append('</div>')
LIST='\n'.join(rows)
LD={"@context":"https://schema.org","@type":"ItemList","name":"台中南區、東區、大里區社區清單","numberOfItems":len(C),"itemListElement":[{"@type":"ListItem","position":i+1,"item":{"@type":"Residence","name":label(c),"address":{"@type":"PostalAddress","addressRegion":"台中市","addressLocality":c['town'],"streetAddress":c['addr']},"geo":{"@type":"GeoCoordinates","latitude":c['lat'],"longitude":c['lng']},**({"url":f"https://tcyucheng.com/yucheng-a-{c['id']}"} if c.get('an') else {})}} for i,c in enumerate(C)]}
css='''
.band{background:var(--tint);border-bottom:1px solid var(--line)}
.band .wrap{padding-block:22px;display:flex;flex-direction:column;gap:12px}
.cchips{display:flex;flex-wrap:wrap;gap:8px}
.cchip{display:inline-flex;align-items:center;gap:8px;border:1.5px solid var(--line);background:var(--surface);color:var(--fg);border-radius:999px;padding:5px 8px 5px 12px;font:inherit;font-size:.9rem;cursor:pointer}
.cchip b{background:var(--tint);border-radius:999px;padding:0 8px;font-size:.82rem;font-variant-numeric:tabular-nums}
.cchip[aria-pressed="true"]{border-color:var(--green);background:var(--green);color:var(--on-green)}.cchip[aria-pressed="true"] b{background:rgba(255,255,255,.25)}
.tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tools select,.tools input{border:1.5px solid var(--line);border-radius:8px;background:var(--surface);color:var(--fg);font:inherit;font-size:.9rem;padding:6px 10px;min-width:0}
.tools input{flex:1 1 180px}
.mapwrap{position:relative}
.edit-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
.edit-bar .btn{padding:6px 14px;font-size:.85rem}
#editOut{width:100%;min-height:80px;font-family:ui-monospace,monospace;font-size:.8rem;border:1.5px solid var(--line);border-radius:8px;background:var(--surface);color:var(--fg);padding:8px}
.grp h3{font-size:1.1rem;margin:22px 0 6px;display:flex;align-items:center;gap:8px}.grp h3 small{font-family:var(--body);color:var(--muted);font-weight:400;font-size:.85rem}
[hidden]{display:none!important}
.row{display:grid;grid-template-columns:1fr auto;gap:4px 14px;padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer}
.row:hover .nm{color:var(--green-ink)}.nm{font-weight:700;font-size:1rem;margin:0;font-family:var(--body)}.meta{font-size:.85rem;color:var(--muted)}
.pr{text-align:right;font-variant-numeric:tabular-nums}.pr b{font-family:var(--display);font-size:1.15rem;color:var(--green-ink)}.pr small{display:block;font-size:.78rem;color:var(--muted)}
.up{color:#c0392b}.dn{color:#2471a3}
.pbtn{display:inline-block;margin:6px 0 2px;background:#0a8a43;color:#fff!important;text-decoration:none;font-weight:700;padding:6px 14px;border-radius:999px}
.abadge{font-size:.72rem;font-weight:700;color:var(--on-green);background:var(--green);border-radius:999px;padding:1px 8px;text-decoration:none;vertical-align:2px}
.fab{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:1002;background:#7a3b16;color:#fff;border:0;border-radius:999px;padding:11px 22px;font:inherit;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
.stlbl{background:none;border:0;font-family:var(--body);font-size:11px;font-weight:700;color:#7a3b16;text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap;transform:translate(-50%,-50%)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.85rem;color:var(--muted);margin-top:8px}
.ring{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px dashed #7a3b16;vertical-align:-2px;margin-right:5px}
'''
body=f'''<main>
<section class="band"><div class="wrap">
  <p class="eyebrow">祐承的商圈</p>
  <h1>南區・東區・大里 社區地圖</h1>
  <p class="lead">屋齡 30 年內的電梯大樓與華廈 {len(C)} 個，依屋齡分色。點圓點看社區資料；標有「購屋分析」的社區，有完整行情、樓層房型價差、租金與看屋重點。</p>
  <div class="cchips" id="gchips">
    <button class="cchip" aria-pressed="false" data-grp="new"><i class="dot" style="background:#0a8a43"></i>新成屋<b>{cnt["new"]}</b></button>
    <button class="cchip" aria-pressed="false" data-grp="mid"><i class="dot" style="background:#b8892f"></i>輕屋齡<b>{cnt["mid"]}</b></button>
    <button class="cchip" aria-pressed="false" data-grp="old"><i class="dot" style="background:#5b6f8a"></i>中古屋<b>{cnt["old"]}</b></button>
    <button class="cchip" aria-pressed="false" id="anChip">📄 有購屋分析<b>{nan}</b></button>
  </div>
  <div class="cchips" id="tchips">
    <button class="cchip" aria-pressed="true" data-town="">全部區域</button><button class="cchip" aria-pressed="false" data-town="南區">南區<b>{sum(1 for c in C if c["town"]=="南區")}</b></button><button class="cchip" aria-pressed="false" data-town="東區">東區<b>{sum(1 for c in C if c["town"]=="東區")}</b></button><button class="cchip" aria-pressed="false" data-town="大里區">大里<b>{sum(1 for c in C if c["town"]=="大里區")}</b></button>
  </div>
</div></section>
<section class="wrap" style="padding-top:18px">
  <div class="tools"><select id="fSort" aria-label="排序"><option value="age">屋齡新到舊</option><option value="pasc">單價低到高</option><option value="pdesc">單價高到低</option><option value="n">近一年成交多到少</option></select><input id="fQ" type="search" placeholder="搜尋社區名、路名或里名" aria-label="搜尋"></div>
  <div class="mapwrap" style="margin-top:12px"><div id="map" role="region" aria-label="社區地圖"></div></div>
  <div class="legend"><span><i class="dot" style="background:#0a8a43"></i>新成屋</span><span><i class="dot" style="background:#b8892f"></i>輕屋齡</span><span><i class="dot" style="background:#5b6f8a"></i>中古屋</span><span>圓點越大，近一年成交越多</span><span><i class="ring"></i>車站 800 公尺生活圈</span><span>右上角可切換生活圈、地段力、行政區界</span></div>
  <div class="edit-bar"><button class="btn" id="editBtn" type="button">✏️ 校正位置</button><span class="note" id="editHint">位置不準時，按「校正位置」把圓點拖到正確的大樓上。</span></div>
  <div id="editPanel" hidden style="margin-top:8px"><p class="note">拖曳完成後按「完成」，把下面這段複製傳給祐承店長（或 Claude），寫回設定檔重建後才會正式生效。校正只存在這台裝置的瀏覽器裡，換裝置就看不到。</p><textarea id="editOut" readonly aria-label="校正後的座標"></textarea><div class="edit-bar"><button class="btn solid" id="editCopy" type="button">複製</button><button class="btn" id="editClear" type="button">清除這台裝置的校正</button></div></div>
</section>
<section class="wrap" id="list" style="padding-top:8px">
  <h2>社區清單（文字版）</h2>
  <p class="note" style="margin-top:4px">共 <span id="shown">{len(C)}</span> 個。單價為近一年成交中位數（萬/坪，已扣車位）。點一列可在地圖上定位。</p>
  <div id="rows">{LIST}</div>
  <p class="empty note" id="empty" hidden>沒有符合條件的社區，換個條件試試。</p>
</section>
<section class="wrap">
  <h2>常見問題</h2>
  <details><summary>這張地圖收錄哪些社區？</summary><p>台中市南區、東區、大里區，民國 85 年後完工（屋齡 30 年內）的住宅大樓與華廈，而且近一年有成交紀錄。透天、純店面、套房，以及規模太小的華廈（少於 3 個門牌）沒有列入；一樓是店面的 11 層以上住宅大樓（例如鄉林新月灣）有收錄。實價登錄沒有戶數欄位，所以用建物型態來篩出一定規模的社區。</p></details>
  <details><summary>單價是怎麼算的？</summary><p>取該社區近一年的買賣成交，排除親友等特殊交易，把車位價格扣掉後算每坪單價，再取中位數。只有 1～2 筆成交的社區參考性較低，清單上會標示筆數。</p></details>
  <details><summary>為什麼不同網站查到的單價差很多？</summary><p>最常見的原因是車位。有的網站用總價直接除以坪數，車位價格和車位坪數都混在裡面；這裡是扣掉車位後的房屋單價。取平均或中位數、統計期間不同，也會有差距。</p></details>
  <details><summary>生活圈是怎麼畫的？</summary><p>以台鐵與捷運車站為中心，畫出半徑 800 公尺的範圍，大約是步行 10 分鐘。實際步行時間會受路口與地形影響，看屋時建議實際走一趟。</p></details>
  <details><summary>地圖上的位置準嗎？</summary><p>位置取自實價登錄門牌定位，以社區代表門牌為準，大型社區的圓點落在其中一棟。發現不準的，可以用「校正位置」拖曳修正後回報。</p></details>
  <details><summary>我想看的社區不在地圖上怎麼辦？</summary><p>可能是屋齡超過 30 年、近一年沒有成交，或是透天、店面。直接 LINE 告訴我社區名稱，我幫你查成交行情。</p></details>
</section>
</main>
<button class="fab" id="fab" type="button">☰ 社區清單</button>
<script type="application/ld+json">{json.dumps(LD,ensure_ascii=False,separators=(',',':'))}</script>
<script>
const DATA=__DATA__,VIL=__VIL__,ST=__ST__;
const COL={{new:"#0a8a43",mid:"#b8892f",old:"#5b6f8a"}};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const byId=Object.fromEntries(DATA.map(c=>[c.id,c]));
const label=c=>c.name||c.addr;
const lineQ=c=>"https://line.me/R/oaMessage/%40161cayoi/?"+encodeURIComponent("祐承店長你好，我想了解「"+label(c)+"」（"+c.town+"）的行情");
let fGrp=new Set(),fTown="",fAn=false,editing=false;
let FIX={{}};try{{FIX=JSON.parse(localStorage.getItem("yc-fix")||"{{}}")}}catch(e){{}}
const map=L.map("map",{{scrollWheelZoom:false}}).setView([24.115,120.69],13);
const base=L.tileLayer("https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png",{{maxZoom:19,attribution:"&copy; OpenStreetMap"}}).addTo(map);
// overlays
const lifeL=L.layerGroup();ST.forEach(([n,la,ln,k])=>{{L.circle([la,ln],{{radius:800,color:"#7a3b16",weight:2,dashArray:"6 6",fillColor:"#7a3b16",fillOpacity:.06,interactive:false}}).addTo(lifeL);L.marker([la,ln],{{interactive:false,icon:L.divIcon({{className:"stlbl",iconSize:null,html:(k==="mrt"?"🚇 ":"🚆 ")+n}})}}).addTo(lifeL)}});
lifeL.addTo(map);
const RAMP=["#e3f2e7","#a8d8b4","#5fb57d","#23874f","#0b5a32"];
const sc=VIL.villages.filter(v=>v.score!=null).map(v=>v.score).sort((a,b)=>a-b),BR=[1,2,3,4].map(i=>sc[Math.floor(sc.length*i/5)]);
const vby=Object.fromEntries(VIL.villages.map(v=>[v.code,v]));
const vilL=L.geoJSON(VIL.geo,{{style:f=>{{const v=vby[f.properties.code];let k=0;if(v.score==null)return{{weight:.6,color:"#888",fillColor:"#ccc",fillOpacity:.25}};while(k<4&&v.score>=BR[k])k++;return{{weight:.6,color:"#46524a",fillColor:RAMP[k],fillOpacity:.45}}}},onEachFeature:(f,l)=>{{const v=vby[f.properties.code];l.bindTooltip(v.town+v.name+(v.score!=null?"・地段力 "+v.score.toFixed(1):""),{{sticky:true}})}}}});
const townL=L.geoJSON(VIL.towns,{{interactive:false,style:{{weight:3,color:"#14211a",opacity:.8,fill:false}}}}).addTo(map);
L.control.layers(null,{{"車站 800m 生活圈":lifeL,"里界地段力":vilL,"行政區界":townL}},{{collapsed:true}}).addTo(map);
const pts=L.layerGroup().addTo(map);const mk={{}};
function popup(c){{return `<b>${{label(c)}}</b><br>${{c.name?c.addr+"<br>":""}}${{c.town}}${{c.vill?"・"+c.vill:""}}<br>${{c.year}} 完工・約 ${{Math.round(c.age)}} 年・${{c.type}} ${{c.floors}}F${{c.hh?"・"+c.hh+" 戶":""}}<br>近一年單價 <b>${{c.p1y.toFixed(1)}} 萬/坪</b>（${{c.n1y}} 筆）<br>${{c.an?`<a class="pbtn" href="/yucheng-a-${{c.id}}">看社區購屋分析</a><br>`:""}}<a href="${{lineQ(c)}}" target="_blank" rel="noopener">LINE 問這個社區</a>`}}
DATA.forEach(c=>{{const ll=FIX[c.id]||[c.lat,c.lng];const m=L.circleMarker(ll,{{radius:5+Math.min(9,Math.sqrt(c.n1y)*2),color:"#fff",weight:1.5,fillColor:COL[c.grp],fillOpacity:.9}}).bindPopup(()=>popup(c));mk[c.id]=m}});
const dragM={{}};
function vis(c){{return (!fGrp.size||fGrp.has(c.grp))&&(!fTown||c.town===fTown)&&(!fAn||c.an)&&(!q()||(label(c)+c.addr+c.vill).includes(q()))}}
const q=()=>$("#fQ").value.trim();
function render(){{
  pts.clearLayers();let n=0;
  DATA.forEach(c=>{{const ok=vis(c);if(ok){{n++;if(!editing)pts.addLayer(mk[c.id])}};const r=document.getElementById("c"+c.id);if(r)r.hidden=!ok}});
  $$(".grp").forEach(g=>{{const k=g.querySelectorAll(".row:not([hidden])").length;g.hidden=!k;g.querySelector(".gc").textContent=k}});
  $("#shown").textContent=n;$("#empty").hidden=n>0;
  const s=$("#fSort").value,key={{age:r=>+r.dataset.age,pasc:r=>+r.dataset.p,pdesc:r=>-r.dataset.p,n:r=>-r.dataset.n}}[s];
  $$(".grp").forEach(g=>{{[...g.querySelectorAll(".row")].sort((a,b)=>key(a)-key(b)).forEach(r=>g.appendChild(r))}});
}}
$("#gchips").onclick=e=>{{const b=e.target.closest("button");if(!b)return;if(b.id==="anChip"){{fAn=!fAn;b.setAttribute("aria-pressed",fAn)}}else{{const g=b.dataset.grp;fGrp.has(g)?fGrp.delete(g):fGrp.add(g);b.setAttribute("aria-pressed",fGrp.has(g))}}render()}};
$("#tchips").onclick=e=>{{const b=e.target.closest("button");if(!b)return;fTown=b.dataset.town;$$("#tchips button").forEach(x=>x.setAttribute("aria-pressed",x===b));render()}};
["fSort","fQ"].forEach(id=>$("#"+id).addEventListener("input",render));
$("#rows").addEventListener("click",e=>{{if(e.target.closest("a"))return;const r=e.target.closest(".row");if(!r)return;const m=mk[r.dataset.id];map.setView(m.getLatLng(),16);m.openPopup();$("#map").scrollIntoView({{block:"center",behavior:"smooth"}})}});
$("#rows").addEventListener("keydown",e=>{{if(e.key==="Enter"&&e.target.classList.contains("row"))e.target.click()}});
$("#fab").onclick=()=>{{const l=$("#list");const below=l.getBoundingClientRect().top<innerHeight/2;(below?$("#map"):l).scrollIntoView({{behavior:"smooth"}})}};
addEventListener("scroll",()=>{{$("#fab").textContent=$("#list").getBoundingClientRect().top<innerHeight/2?"🗺 回到地圖":"☰ 社區清單"}},{{passive:true}});
// edit mode
function out(){{const o={{}};Object.entries(FIX).forEach(([k,v])=>o[k]=[+v[0].toFixed(6),+v[1].toFixed(6)]);$("#editOut").value=Object.keys(o).length?JSON.stringify(o):"（還沒有校正）";try{{localStorage.setItem("yc-fix",JSON.stringify(o))}}catch(e){{}}}}
$("#editBtn").onclick=()=>{{editing=!editing;$("#editBtn").textContent=editing?"✓ 完成":"✏️ 校正位置";$("#editHint").textContent=editing?"拖曳圖釘到正確位置，放開就會記下來。":"位置不準時，按「校正位置」把圓點拖到正確的大樓上。";
  Object.values(dragM).forEach(m=>map.removeLayer(m));
  if(editing){{DATA.filter(vis).forEach(c=>{{const m=L.marker(mk[c.id].getLatLng(),{{draggable:true,title:label(c)}}).bindTooltip(label(c));m.on("dragend",()=>{{const p=m.getLatLng();FIX[c.id]=[p.lat,p.lng];mk[c.id].setLatLng(p);out()}});m.addTo(map);dragM[c.id]=m}})}}
  else{{$("#editPanel").hidden=false;out()}}render()}};
$("#editCopy").onclick=()=>navigator.clipboard.writeText($("#editOut").value).then(()=>$("#editCopy").textContent="已複製",()=>{{$("#editOut").select()}});
$("#editClear").onclick=()=>{{FIX={{}};try{{localStorage.removeItem("yc-fix")}}catch(e){{}};DATA.forEach(c=>mk[c.id].setLatLng([c.lat,c.lng]));out()}};
render();
</script>
'''
VIL={'villages':[{'code':v['code'],'town':v['town'],'name':v['name'],'score':v['score']} for v in L['villages']],'geo':L['geo'],'towns':L['towns']}
body=body.replace('__DATA__',json.dumps(C,ensure_ascii=False,separators=(',',':'))).replace('__VIL__',json.dumps(VIL,ensure_ascii=False,separators=(',',':'))).replace('__ST__',json.dumps(STATIONS,ensure_ascii=False))
credit=f'資料來源：內政部不動產成交案件實際資訊（實價登錄），資料更新至 {DLABEL}，每月自動更新（申報約晚 1～3 個月）；里界：內政部國土測繪中心；車站：OpenStreetMap。底圖 © OpenStreetMap contributors。單價為統計參考，實際價格依屋況、樓層、車位而異。'
open(ROOT+'/yucheng-communities.html','w',encoding='utf-8').write(page('祐承的商圈｜南區東區大里社區地圖','台中南區、東區、大里區屋齡30年內大樓社區地圖，附近一年實價登錄單價、生活圈與社區購屋分析。｜信義房屋文心高工店 祐承店長',1,css,body,credit,og='communities.jpg',path='/yucheng-communities'))
print('ok')
