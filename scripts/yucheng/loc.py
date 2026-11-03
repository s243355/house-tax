import os
from paths import ROOT,DATA
import json,sys
sys.path.insert(0,'.')
from common import page
from shared_layers import STATIONS
CM=json.load(open(os.path.join(DATA,'communities.json'),encoding='utf-8'))
D=json.load(open(os.path.join(DATA,'loc_data.json'),encoding='utf-8'))
css='''
.ctl{display:flex;flex-direction:column;gap:10px}
.frow{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.frow>label{font-size:.85rem;color:var(--muted);min-width:3em}
.split{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-top:14px}
.panel{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);padding:16px;min-width:0;max-height:min(62vh,560px);overflow:auto}
.panel h3{font-size:1.2rem}.panel .sc{font-family:var(--display);font-size:2.2rem;color:var(--green-ink);font-weight:900;line-height:1.1}
.cat{margin-top:12px}.cat b{font-size:.9rem}.cat p{font-size:.85rem;color:var(--muted)}
.ramp{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-size:.82rem;color:var(--fg);font-variant-numeric:tabular-nums}.ramp span{display:inline-flex;align-items:center;gap:5px}.ramp i{display:inline-block;width:18px;height:14px;border:1px solid rgba(0,0,0,.2);border-radius:2px}
.vlbl{background:none;border:0;text-align:center;white-space:nowrap;transform:translate(-50%,-50%);font-family:var(--body);line-height:1.15;color:#14211a;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff;pointer-events:none}
.vlbl b{display:block;font-size:12px}.vlbl span{display:block;font-size:11px;font-variant-numeric:tabular-nums}
.vlbl.dk{color:#fff;text-shadow:0 0 3px rgba(0,0,0,.7),0 0 2px rgba(0,0,0,.7)}
#map{height:min(70vh,640px)}
.rank{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}
.rank ol{margin:6px 0 0;padding-left:1.4em;font-size:.9rem;font-variant-numeric:tabular-nums}.rank li span{color:var(--muted)}
@media (max-width:820px){.split{grid-template-columns:1fr}.panel{max-height:none}}
'''
body='''<main>
<section class="wrap" style="display:flex;flex-direction:column;gap:14px">
  <p class="eyebrow">地段地圖</p>
  <h1>南區・東區・大里 66 里地段力</h1>
  <p class="lead">地圖顏色越深，代表該里的生活機能越密集；粗黑線是行政區界，放大地圖可以看到里名和分數。把學區、公園、商場市場、交通、醫療五類設施，依每平方公里的密集度算成「地段力」分數。點地圖上任一個里，看它有哪些設施、排第幾名。</p>
</section>
<section class="wrap" style="padding-top:0">
  <div class="ctl">
    <div class="frow"><label>看什麼</label><div class="chips" id="fMet"></div></div>
    <div class="frow"><label>算法</label><div class="chips" id="fMode"></div></div>
  </div>
  <div class="split">
    <div><div id="map" role="region" aria-label="里別地段地圖"></div>
      <div class="ramp" style="margin-top:8px" id="ramp"></div></div>
    <aside class="panel" id="panel" aria-live="polite"></aside>
  </div>
</section>
<section class="wrap">
  <h2>五類排行榜（密集度前 10 名）</h2>
  <div class="rank" id="rank" style="margin-top:12px"></div>
</section>
<section class="wrap">
  <h2>66 里完整對照表</h2>
  <p class="note" style="margin:4px 0 10px">每格為設施數量（密集度排名）。點欄位標題可排序。</p>
  <div class="tbl"><table id="tbl">__TBL__</table></div>
</section>
<section class="wrap">
  <h2>計算方式與資料來源</h2>
  <details open><summary>地段力怎麼算？</summary><p>每個里的五類設施數量，各自除以里面積得到密集度（個/km²），避免大面積的里占便宜。五類密集度分別換成標準分數（z 分數），等權重加總，再把 66 里中的最高分設為 100、最低分設為 0。五類都沒有收錄的里不計分。</p></details>
  <details><summary>五類設施包含什麼？</summary><p>學區：國小、國中（含附小、附中），不含高中職與幼兒園。公園：有名稱的公園綠地。商場市場：百貨、購物中心、市場。交通：台鐵與捷運車站、客運轉運站、國道交流道。醫療：醫院、診所、牙醫。</p></details>
  <details><summary>資料從哪裡來？</summary><p>里界：內政部國土測繪中心村（里）界，經 taiwan-atlas 1.1.0 整理。設施：OpenStreetMap 志工圖資（ODbL 授權），__DATE__ 經 Overpass API 擷取，依座標落點歸到各里。OpenStreetMap 不是政府資料，可能有漏標或未更新，「無收錄」不代表一定沒有。</p></details>
  <details><summary>分數高就代表房價會漲嗎？</summary><p>不一定。地段力只反映生活機能的密集程度，商圈核心機能好，但也可能比較吵、比較老舊。買房還要一起看屋齡、社區管理和實價登錄，歡迎 LINE 我一起看。</p></details>
</section>
</main>
<script>
const D=__DATA__,CM=__CM__,ST=__ST__;
const CATS={school:"學區",park:"公園",shop:"商場市場",transit:"交通",medical:"醫療"};
let met="score",mode="d";
const V=D.villages,byCode=Object.fromEntries(V.map(v=>[v.code,v]));
const $=s=>document.querySelector(s);
const val=v=>met==="score"?v.score:(mode==="d"?v.d[met]:v.n[met]);
function ranks(key){const a=V.filter(v=>key==="score"?v.score!=null:true).map(v=>[v.code,key==="score"?v.score:(mode==="d"?v.d[key]:v.n[key])]).sort((x,y)=>y[1]-x[1]);
  const r={};let prev=null,rk=0;a.forEach(([c,x],i)=>{if(x!==prev){rk=i+1;prev=x}r[c]=x>0||key==="score"?rk:null});return r}
const RAMP=["#e3f2e7","#a8d8b4","#5fb57d","#23874f","#0b5a32"],ZERO="#f4f1e8",NODATA="#c9ccc9";
let BR=[];
function breaks(){const xs=V.map(val).filter(x=>x!=null&&x>0).sort((a,b)=>a-b);BR=[1,2,3,4].map(i=>xs[Math.floor(xs.length*i/5)]);}
function cls(x){if(x==null)return-2;if(x<=0)return-1;let i=0;while(i<4&&x>=BR[i])i++;return i}
function color(x){const k=cls(x);return k===-2?NODATA:k===-1?ZERO:RAMP[k]}
const fmt=x=>met==="score"||mode==="d"?(+x).toFixed(1):Math.round(x);
const map=L.map("map",{scrollWheelZoom:false}).setView([24.11,120.69],13);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap &copy; CARTO"}).addTo(map);
map.createPane("lbl");map.getPane("lbl").style.zIndex=650;map.getPane("lbl").style.pointerEvents="none";
let sel=null;
const geo=L.geoJSON(D.geo,{style:()=>({weight:1,color:"#46524a",opacity:.55,fillOpacity:.88}),onEachFeature:(f,l)=>{const v=byCode[f.properties.code];
  l.bindTooltip(v.town+v.name,{sticky:true});l.on("click",()=>{sel=v.code;showPanel();paint()})}}).addTo(map);
const townL=L.geoJSON(D.towns,{interactive:false,style:{weight:3,color:"#14211a",opacity:.9,fill:false}}).addTo(map);
const COL={new:"#0a8a43",mid:"#b8892f",old:"#5b6f8a"};
const commL=L.layerGroup();CM.forEach(c=>L.circleMarker([c.lat,c.lng],{radius:4.5,color:"#fff",weight:1.2,fillColor:COL[c.grp],fillOpacity:.95,pane:"markerPane"}).bindPopup(`<b>${c.name||c.addr}</b><br>${c.year} 完工・近一年 ${c.p1y.toFixed(1)} 萬/坪${c.an?`<br><a href="/yucheng-a-${c.id}">看社區購屋分析</a>`:""}`).addTo(commL));
const lifeL=L.layerGroup();ST.forEach(([n,la,ln,k])=>{L.circle([la,ln],{radius:800,color:"#7a3b16",weight:2,dashArray:"6 6",fill:false,interactive:false}).addTo(lifeL)});
L.control.layers(null,{"社區點位（屋齡分色）":commL,"車站 800m 生活圈":lifeL,"行政區界":townL},{collapsed:true}).addTo(map);
map.fitBounds(geo.getBounds(),{padding:[8,8]});
const labels=L.layerGroup().addTo(map);
function drawLabels(){labels.clearLayers();const z=map.getZoom();if(z<13)return;
  V.forEach(v=>{const x=val(v);const k=cls(x);const dark=k>=2;
    labels.addLayer(L.marker(v.c,{pane:"lbl",interactive:false,icon:L.divIcon({className:"vlbl"+(dark?" dk":""),iconSize:null,html:`<b>${v.name.replace("里","")}</b>${z>=14&&x!=null?`<span>${fmt(x)}</span>`:""}`})}))})}
map.on("zoomend",drawLabels);
function paint(){breaks();
  geo.eachLayer(l=>{const v=byCode[l.feature.properties.code];const s=v.code===sel;l.setStyle({fillColor:color(val(v)),weight:s?4:1,color:s?"#d97706":"#46524a",opacity:s?1:.55});if(s)l.bringToFront()});
  const unit=met==="score"?"分":mode==="d"?"個/km²":"處";const lo=[0,...BR];
  $("#ramp").innerHTML=RAMP.map((c,i)=>`<span><i style="background:${c}"></i>${i<4?fmt(lo[i])+"–"+fmt(BR[i]):fmt(lo[i])+" 以上"}</span>`).join("")+(met==="score"?"":`<span><i style="background:${ZERO}"></i>無收錄</span>`)+`<span><i style="background:${NODATA}"></i>無資料</span><span class="note">單位：${unit}，五級各約占兩成</span>`;
  drawLabels()}
function showPanel(){const v=byCode[sel];if(!v){$("#panel").innerHTML=`<h3>點地圖上的里</h3><p class="note" style="margin-top:6px">會顯示該里的地段力分數、五類設施數量、排名與設施名單。</p>`+topScore();return}
  const R={score:ranks("score")};Object.keys(CATS).forEach(k=>R[k]=ranks(k));
  $("#panel").innerHTML=`<p class="eyebrow">${v.town}</p><h3>${v.name}</h3><div class="sc">${v.score!=null?v.score.toFixed(1):"—"}</div><p class="note">綜合地段力${v.score!=null?`・第 ${R.score[v.code]} 名／61`:"（五類皆無收錄，不計分）"}・面積 ${v.area} km²</p>`+
   (()=>{const cs=CM.filter(c=>c.town===v.town&&c.vill===v.name).sort((a,b)=>(b.an||0)-(a.an||0)||b.n1y-a.n1y);return cs.length?`<div class="cat"><b>這個里的社區（${cs.length}）</b><p>${cs.slice(0,12).map(c=>c.an?`<a href="/yucheng-a-${c.id}">${c.name||c.addr}</a>`:(c.name||c.addr)).join("、")}${cs.length>12?" 等":""}</p><p><a href="/yucheng-communities">在社區地圖看全部</a></p></div>`:""})()+Object.entries(CATS).map(([k,t])=>`<div class="cat"><b>${t}　${v.n[k]?v.n[k]+" 處":"無收錄"}</b>${v.n[k]?`<span class="note">　密集度 ${v.d[k]} 個/km²・第 ${R[k][v.code]} 名</span>`:""}<p>${v.list[k].slice(0,12).join("、")}${v.list[k].length>12?" 等":""}</p></div>`).join("")}
function topScore(){const a=V.filter(v=>v.score!=null).sort((x,y)=>y.score-x.score).slice(0,5);return `<p class="eyebrow" style="margin-top:16px">綜合前 5 名</p><ol style="padding-left:1.3em;margin:4px 0 0">${a.map(v=>`<li>${v.town}${v.name}　<b>${v.score.toFixed(1)}</b></li>`).join("")}</ol>`}
function chips(el,items,cur,set){el.innerHTML=items.map(([v,t])=>`<button class="chip" aria-pressed="${v===cur}" data-v="${v}">${t}</button>`).join("");el.onclick=e=>{const b=e.target.closest("button");if(!b)return;set(b.dataset.v);ui()}}
function rankBox(){$("#rank").innerHTML=Object.entries(CATS).map(([k,t])=>{const a=V.filter(v=>v.n[k]>0).sort((x,y)=>y.d[k]-x.d[k]).slice(0,10);
  return `<div><b>${t}</b><ol>${a.map(v=>`<li>${v.town}${v.name}　<span>${v.d[k]} 個/km²（${v.n[k]} 處）</span></li>`).join("")}</ol></div>`}).join("")}
let sortKey="score",sortDir=-1;
function table(){const R={score:ranks("score")};Object.keys(CATS).forEach(k=>R[k]=ranks(k));
  const cols=[["name","里"],["town","區"],["score","地段力"],...Object.entries(CATS)];
  const a=[...V].sort((x,y)=>{const g=v=>sortKey==="name"||sortKey==="town"?v[sortKey]:sortKey==="score"?(v.score??-1):(mode==="d"?v.d[sortKey]:v.n[sortKey]);const p=g(x),q=g(y);return (p>q?1:p<q?-1:0)*sortDir});
  $("#tbl").innerHTML=`<thead><tr>${cols.map(([k,t])=>`<th data-k="${k}" class="${k==="name"||k==="town"?"":"num"}">${t}${sortKey===k?(sortDir<0?" ▼":" ▲"):""}</th>`).join("")}</tr></thead><tbody>`+
   a.map(v=>`<tr><td>${v.name}</td><td>${v.town}</td><td class="num">${v.score!=null?v.score.toFixed(1)+`（${R.score[v.code]}）`:"無資料"}</td>${Object.keys(CATS).map(k=>`<td class="num">${v.n[k]?v.n[k]+`（${R[k][v.code]}）`:"無收錄"}</td>`).join("")}</tr>`).join("")+"</tbody>";}
$("#tbl").addEventListener("click",e=>{const th=e.target.closest("th");if(!th)return;const k=th.dataset.k;sortDir=sortKey===k?-sortDir:(k==="name"||k==="town"?1:-1);sortKey=k;table()});
function ui(){chips($("#fMet"),[["score","綜合地段力"],...Object.entries(CATS)],met,v=>met=v);
  chips($("#fMode"),[["d","密集度（個/km²）"],["n","絕對數量"]],mode,v=>mode=v);
  $("#fMode").parentElement.hidden=met==="score";paint();showPanel();table()}
rankBox();ui();
</script>
'''
date=D['poi_fetched'][:10].replace('2026-','115 年 ').replace('-',' 月 ',1)+' 日'
body=body.replace('__CM__',json.dumps([{k:c.get(k) for k in ('id','name','addr','town','vill','year','p1y','grp','lat','lng','an')} for c in CM],ensure_ascii=False,separators=(',',':'))).replace('__ST__',json.dumps(STATIONS,ensure_ascii=False)).replace('__DATA__',json.dumps(D,ensure_ascii=False,separators=(',',':'))).replace('__DATE__',date)
sv=sorted(D['villages'],key=lambda v:-(v['score'] if v['score'] is not None else -1))
TBL='<thead><tr><th>里</th><th>區</th><th class="num">地段力</th>'+''.join(f'<th class="num">{x}</th>' for x in ['學區','公園','商場市場','交通','醫療'])+'</tr></thead><tbody>'+''.join(f"<tr><td>{v['name']}</td><td>{v['town']}</td><td class='num'>{'%.1f'%v['score'] if v['score'] is not None else '無資料'}</td>"+''.join(f"<td class='num'>{v['n'][k] or '無收錄'}</td>" for k in ['school','park','shop','transit','medical'])+'</tr>' for v in sv)+'</tbody>'
body=body.replace('__TBL__',TBL)
credit='里界：內政部國土測繪中心（taiwan-atlas 1.1.0）。設施：© OpenStreetMap contributors（ODbL），'+date+'擷取。底圖 © OpenStreetMap © CARTO。地段力為生活機能統計參考，不代表房價或增值保證。'
open(ROOT+'/yucheng-location.html','w',encoding='utf-8').write(page('地段地圖｜南區東區大里 66 里地段力','台中南區、東區、大里區 66 里的學區、公園、商場市場、交通、醫療設施密集度與地段力排行。｜信義房屋文心高工店 祐承店長',2,css,body,credit))
print('ok',date)
