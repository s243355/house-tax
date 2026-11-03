import os
from paths import ROOT,DATA
import json,glob,os,sys,html
sys.path.insert(0,'.')
from common import page
from lifecalc import life as LIFE
CL=json.load(open(os.path.join(DATA,'communities.json'),encoding='utf-8'));C={c['id']:c for c in CL}
I=json.load(open(os.path.join(DATA,'intro.json'),encoding='utf-8'))
IID=json.load(open(os.path.join(DATA,'intro_by_id.json'),encoding='utf-8'))
L=json.load(open(os.path.join(DATA,'loc_data.json'),encoding='utf-8'))
VB={(v['town'],v['name']):v for v in L['villages']}
scored=sorted([v for v in L['villages'] if v['score'] is not None],key=lambda v:-v['score'])
VR={(v['town'],v['name']):i+1 for i,v in enumerate(scored)}
_SM=json.load(open(os.path.join(DATA,'stats_meta.json'),encoding='utf-8'))
AREA=_SM['area'];_de=_SM['data_end'];NOWY=int(_SM['computed_at'][:4])
DLABEL=f"{int(_de[:4])-1911} 年 {int(_de[5:7])} 月"
CATS={'school':'學區','park':'公園','shop':'商場市場','transit':'交通','medical':'醫療'}
e=html.escape
def f1(x):return f'{x:.1f}'
def pct(x):return ('+' if x>=0 else '')+f'{x*100:.1f}%'
css='''
.hero{display:flex;flex-direction:column;gap:10px}
.crumb{font-size:.85rem;color:var(--muted)}.crumb a{color:var(--muted)}
.greet{display:flex;gap:12px;align-items:flex-start;background:var(--tint);border-radius:var(--r);padding:14px 16px;max-width:760px}
.greet .gav{width:60px;height:60px;border-radius:50%;object-fit:cover;object-position:50% 14%;flex:none;background:var(--line)}
.life a{color:var(--green-ink)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.tile{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);padding:14px 16px;display:flex;flex-direction:column;gap:2px}
.tile .k{font-size:.82rem;color:var(--muted)}.tile .v{font-family:var(--display);font-size:1.7rem;font-weight:900;color:var(--green-ink);line-height:1.2;font-variant-numeric:tabular-nums}.tile .s{font-size:.8rem;color:var(--muted)}
.up{color:#c0392b}.dn{color:#2471a3}
h2{margin-bottom:12px}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:8px 18px;margin:0}.kv dt{color:var(--muted);font-size:.9rem}.kv dd{margin:0}
.tbd{color:var(--gold);font-size:.85rem}
.bars{display:flex;flex-direction:column;gap:8px;max-width:760px}
.bar{display:grid;grid-template-columns:minmax(7em,11em) 1fr 4.5em;gap:10px;align-items:center;font-size:.9rem}
.bar .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar .tr{background:var(--tint);border-radius:4px;height:14px;overflow:hidden}
.bar .fl{height:100%;background:var(--slate);border-radius:4px}.bar.me .fl{background:var(--green)}.bar.me .t{font-weight:700}.bar.area .fl{background:var(--gold)}
.bar .n{text-align:right;font-variant-numeric:tabular-nums}
.chart svg{width:100%;height:auto;max-width:760px;display:block}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media (max-width:760px){.grid2{grid-template-columns:1fr}}
ul.clean{margin:0;padding-left:1.2em}ul.clean li{margin-bottom:6px}
.fit{display:grid;grid-template-columns:1fr;gap:16px}.fit>div{border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;background:var(--surface)}
@media (max-width:760px){.fit{grid-template-columns:1fr}}
ol.five{margin:0;padding-left:1.3em}ol.five li{margin-bottom:8px}
.cta{background:var(--green);color:var(--on-green);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:10px}
.cta h2{color:var(--on-green);margin:0}.cta .btn{background:var(--surface);color:var(--green-ink);border-color:var(--surface);align-self:flex-start}
'''
def chart(yrs):
    if len(yrs)<2:return ''
    W,H,pl,pb,pt=720,240,40,28,16
    mx=max(y[2] for y in yrs)*1.12;n=len(yrs);bw=(W-pl-10)/n
    s=f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="歷年成交中位單價"><g font-size="11" fill="currentColor">'
    for t in range(0,int(mx)+1,max(5,int(mx/5)//5*5 or 5)):
        y=H-pb-(t/mx)*(H-pb-pt);s+=f'<line x1="{pl}" x2="{W}" y1="{y:.1f}" y2="{y:.1f}" stroke="currentColor" stroke-opacity=".12"/><text x="{pl-6}" y="{y+4:.1f}" text-anchor="end" fill-opacity=".6">{t}</text>'
    pts=[]
    for i,(yr,cnt,v) in enumerate(yrs):
        x=pl+i*bw+bw/2;y=H-pb-(v/mx)*(H-pb-pt);pts.append((x,y))
        s+=f'<text x="{x:.1f}" y="{H-8}" text-anchor="middle" fill-opacity=".65">{str(yr)[2:] if n>8 else yr}</text>'
    s+='<polyline fill="none" stroke="#0a8a43" stroke-width="2.5" points="'+' '.join(f'{x:.1f},{y:.1f}' for x,y in pts)+'"/>'
    for i,(x,y) in enumerate(pts):
        last=i==n-1;s+=f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{5 if last else 3.5}" fill="#0a8a43" stroke="#fff" stroke-width="1.5"/>'
        if last or i==0 or n<=6:s+=f'<text x="{x:.1f}" y="{y-9:.1f}" text-anchor="middle" font-weight="700" fill="#076b34">{yrs[i][2]:.1f}</text>'
    return s+'</g></svg>'
def table(head,rows,num=()):
    h='<div class="tbl"><table><thead><tr>'+''.join(f'<th class="{"num" if i in num else ""}">{x}</th>' for i,x in enumerate(head))+'</tr></thead><tbody>'
    for r in rows:h+='<tr>'+''.join(f'<td class="{"num" if i in num else ""}">{x}</td>' for i,x in enumerate(r))+'</tr>'
    return h+'</tbody></table></div>'
made=[]
for fn in sorted(glob.glob(os.path.join(DATA,'an','*.json'))):
    A=json.load(open(fn));
    if A['p1y']<12:continue
    c=C[A['id']];name=(c['name'] or c['addr'].replace(c['town'],'',1)).replace('（2025 完工）','');town=c['town'];vill=c['vill']
    intro=IID.get(str(A['id'])) or I.get(name,{});
    intro=dict(intro);intro['sources']=[x if isinstance(x,str) else (x.get('url') or '') for x in (intro.get('sources') or [])];intro['sources']=[x for x in intro['sources'] if x.startswith('http')]
    age=round(c['age']);area=AREA[town]
    diff=A['p1y']/area-1
    A['sales']=[x for x in A['sales'] if x[6]>=0.4*A['p1y']];_m=sorted(y[2] for y in A['yrs']);A['yrs']=[y for y in A['yrs'] if not _m or y[2]<=2.5*_m[len(_m)//2]];A.setdefault('yoy',None);A.setdefault('rmk',{});A.setdefault('poi',[]);A.setdefault('near',[]);A.setdefault('presale',[]);A.setdefault('rent',[]);A.setdefault('liq',None)
    med_total=sorted(s[5] for s in A['sales'])[len(A['sales'])//2] if A['sales'] else None
    SP=[s[6] for s in A['sales']] or [A['p1y']];lo=min(SP);hi=max(SP)
    msg=f"祐承店長你好，我在看「{name}」的購屋分析，想進一步了解"
    line="https://line.me/R/oaMessage/%40161cayoi/?"+__import__('urllib.parse').parse.quote(msg)
    tiles=f'''<div class="tiles">
<div class="tile"><span class="k">近一年成交中位單價</span><span class="v">{f1(A['p1y'])}<small style="font-size:.9rem"> 萬/坪</small></span><span class="s">已扣車位・{A['n1y']} 筆</span></div>
<div class="tile"><span class="k">近期成交單價區間</span><span class="v" style="font-size:1.35rem">{f1(lo)}–{f1(hi)}</span><span class="s">萬/坪・最近 {len(A['sales'])} 筆</span></div>
<div class="tile"><span class="k">和{town}整體比</span><span class="v {'up' if diff>=0 else 'dn'}">{pct(diff)}</span><span class="s">{town}各屋齡近一年中位 {f1(area)} 萬/坪</span></div>
<div class="tile"><span class="k">近一年價格變化</span><span class="v {'' if A['yoy'] is None else ('up' if A['yoy']>=0 else 'dn')}">{'樣本不足' if A['yoy'] is None else pct(A['yoy'])}</span><span class="s">和前一年中位數比較</span></div>
</div>'''
    note=f'<p class="note" style="margin-top:10px">{e(A["note"])}</p>' if A.get('note') else ''
    def iv(k,fmt=lambda x:x):
        v=intro.get(k);return e(fmt(v)) if v else '<span class="tbd">待確認</span>'
    basics=f'''<dl class="kv">
<dt>完工</dt><dd>{c['year']} 年・{('新成屋（未滿 1 年）' if c['age']<1 else f'屋齡約 {age} 年')}</dd>
<dt>樓高</dt><dd>{e(intro['floors']) if intro.get('floors') else '地上 '+str(c['floors'])+' 層'}</dd>
<dt>戶數</dt><dd>{iv('households')}</dd>
<dt>棟數／門牌</dt><dd>{iv('buildings')}{'' if intro.get('buildings') else ''}　<span class="note">實登登記門牌 {A['bt']} 個</span></dd>
<dt>建設公司</dt><dd>{iv('developer')}</dd>
<dt>公設比</dt><dd>{('約 '+format(A['pr']*100,'.1f')+'%　<span class="note">歷年成交中位數，以權狀為準</span>') if A.get('pr') else '<span class="tbd">待確認</span>'}</dd>
<dt>管理費</dt><dd>{iv('mgmt_fee')}</dd>
<dt>管理方式</dt><dd>{'有管理組織' if A['mgmt'] else '<span class="tbd">待確認</span>'}</dd>
<dt>車位</dt><dd>{iv('parking')}</dd>
<dt>學區</dt><dd>{e('、'.join(intro['schools'])) if intro.get('schools') else '<span class="tbd">待確認</span>'}</dd>
<dt>公共設施</dt><dd>{e('、'.join(intro['facilities'])) if intro.get('facilities') else '<span class="tbd">待確認</span>'}</dd>
<dt>地址</dt><dd>台中市{e(c['addr'])}</dd>
</dl>'''+(('<p class="note" style="margin-top:10px">社區介紹來源：'+'、'.join(f'<a href="{e(u)}" target="_blank" rel="noopener">{e(u.split("/")[2])}</a>' for u in intro['sources'])+'（以門牌比對確認為同一社區；各網站數字可能不同，以現場與權狀為準）</p>') if intro.get('sources') else '')
    feats=''
    if intro.get('features'):feats='<h3 style="margin:18px 0 6px;font-size:1.05rem">社區特色</h3><ul class="clean">'+''.join(f'<li>{e(x)}</li>' for x in intro['features'][:5])+'</ul>'
    # positioning bars
    items=[(name+'（本社區）',A['p1y'],'me',f'{age} 年')]+[(n,p,'',f'{NOWY-y} 年') for n,y,p,d in A['near'] if p and n!=name][:4]+[(n+'（預售）',p,'',f'{d}m') for n,dev,p,d in A['presale'][:3] if p]+[(town+'整體',area,'area','')]
    items.sort(key=lambda x:x[1]);mx=max(x[1] for x in items)
    bars='<div class="bars">'+''.join(f'<div class="bar {k}"><span class="t" title="{e(n)}">{e(n)}</span><span class="tr"><span class="fl" style="width:{p/mx*100:.1f}%;display:block"></span></span><span class="n">{f1(p)}</span></div>' for n,p,k,_ in items)+'</div>'
    BYN={}
    for cc in CL:
        for k in (cc['name'],cc['addr'].replace(cc['town'],'',1),cc['addr']):
            if k:BYN.setdefault(k,cc)
    def hh_of(n):
        cc=BYN.get(n)
        if not cc:return '<span class="tbd">待確認</span>',None
        it=IID.get(str(cc['id'])) or I.get(cc['name'],{})
        return (e(it['households']) if it.get('households') else '<span class="tbd">待確認</span>'),cc
    comp_rows=[]
    me_hh=intro.get('households')
    comp_rows.append(f'<tr class="me"><td><b>{e(name)}</b>（本社區）</td><td class="num">{"未滿 1" if c["age"]<1 else round(c["age"])} 年</td><td>{e(me_hh) if me_hh else "<span class=tbd>待確認</span>"}</td><td class="num"><b>{f1(A["p1y"])}</b></td><td class="num">—</td></tr>')
    for n,y,p,d in A['near'][:5]:
        if not p or n==name:continue
        hh,cc=hh_of(n)
        nm=f'<a href="/yucheng-a-{cc["id"]}">{e(n)}</a>' if cc and cc.get('an') else e(n)
        comp_rows.append(f'<tr><td>{nm}</td><td class="num">{max(0,NOWY-y)} 年</td><td>{hh}</td><td class="num">{f1(p)}</td><td class="num">{d:,} m</td></tr>')
    comp='<h3 style="margin:20px 0 8px;font-size:1.05rem">周邊社區比較</h3><div class="tbl"><table><thead><tr><th>社區</th><th class="num">屋齡</th><th>戶數</th><th class="num">近一年單價</th><th class="num">距離</th></tr></thead><tbody>'+''.join(comp_rows)+'</tbody></table></div>' if len(comp_rows)>1 else ''
    pos_note='周邊社區屋齡、坪數、車位條件不同，只能當作行情參考；預售為建案近期成交中位數。'
    fl='<p class="note">近五年樓層資料不足。</p>' if not A['fl'] else table(['樓層','筆數','中位單價'],[[b,n,f1(p)] for b,n,p in A['fl']],(1,2))
    rm='<p class="note">近五年房型資料不足。</p>' if not A['rm'] else table(['房型','筆數','中位單價','中位總價','中位坪數'],[[b,n,f1(p),f'{t:,} 萬',f1(a)] for b,n,p,t,a in A['rm']],(1,2,3,4))
    sales='<p class="note">近期沒有成交登錄。</p>' if not A['sales'] else table(['年月','樓層','坪數','房型','總價（含車位）','單價＊'],[[d,(f'{f}/{ft}F' if f else '—'),f1(a),f'{r} 房',f'{t:,} 萬'+(' 🅿' if pk else ''),f'<b>{f1(u)}</b>'] for d,f,ft,a,r,t,u,pk in A['sales']],(2,4,5))
    rent=''
    if A['rent']:
        rent=table(['類型','房型','筆數','月租中位','坪數'],[[t,('開放格局' if str(r).startswith('0房') else r),n,f'{m:,} 元',f1(a)] for t,r,n,m,a in A['rent']],(2,3,4))
        if A.get('ry'):rent+=f'<p class="note" style="margin-top:8px">以近一年租金與單價估算，毛租金報酬率約 <b>{A["ry"]*100:.1f}%</b>（未扣管理費、稅費與空租）。</p>'
    else: rent='<p class="note">近兩年沒有足夠的租賃登錄。</p>'
    # life
    v=VB.get((town,vill))
    LR=LIFE(c['lat'],c['lng'])
    lifetbl=('<div class="tbl life"><table><thead><tr><th>要做什麼</th><th>去哪裡</th><th class="num">直線距離</th><th>怎麼去</th></tr></thead><tbody>'+''.join(f'<tr><td>{t}</td><td><a href="{u}" target="_blank" rel="noopener">{e(n)}</a><br><span class="note">{k}</span></td><td class="num">{d:,} m</td><td>{h}</td></tr>' for t,k,n,d,h,u in LR)+'</tbody></table></div><p class="note" style="margin-top:8px">時間以直線距離加三成估算的非尖峰時間，點地點名稱可開 Google 地圖看實際路線。設施取自 OpenStreetMap，可能有漏列。</p>') if LR else ''
    life0='<ul class="clean">'+''.join(f'<li><b>{k}</b>　{e(n.replace("臺中捷運","").replace("_出入口3",""))}　<span class="note">約 {d:,} 公尺</span></li>' for k,n,d in A['poi'])+'</ul>' if A['poi'] else ''
    life=lifetbl+('<h3 style="margin:18px 0 6px;font-size:1.05rem">學區與車站</h3>'+life0 if A['poi'] else '')
    if v:
        life+=f'<p style="margin-top:12px">所在的<b>{town}{vill}</b>，地段力 <b>{v["score"] if v["score"] is not None else "—"}</b> 分（三區 61 里中第 {VR.get((town,vill),"—")} 名）。</p><ul class="clean">'+''.join(f'<li>{t}：{v["n"][k]} 處{("（"+e("、".join(v["list"][k][:5]))+"）") if v["list"][k] else ""}</li>' for k,t in CATS.items() if v['n'][k])+f'</ul><p class="note"><a href="/yucheng-location">看三區地段地圖</a></p>'
    # risk & remarks
    rk=A.get('rmk') or {}
    risk=f'<ul class="clean"><li>土壤液化潛勢：<b>{A["liq"] or "未收錄"}</b>{"（經濟部地質調查及礦業管理中心）" if A["liq"] else ""}</li><li>淹水潛勢：請到經濟部水利署「淹水潛勢圖」或台中市防災資訊網，用門牌查詢。</li>'
    if rk:risk+='<li>歷年成交備註提到：'+'、'.join(f'{k} {n} 筆' for k,n in rk.items())+'。看屋時請確認現況是否有增建、陽台外推，合法性與貸款估價可能受影響。</li>'
    risk+='</ul>'
    # fit
    main_rm=max(A['rm'],key=lambda r:r[1]) if A['rm'] else None
    good=[];bad=[];pros=[]
    if main_rm:good.append(f'以{main_rm[0]}為主（近五年 {main_rm[1]} 筆，中位總價約 {main_rm[3]:,} 萬），預算在這附近的買方')
    if age<=8:good.append('想買新成屋、不想處理老屋修繕的家庭');pros.append('屋齡新，管線與公設狀況較好')
    elif age>=20:good.append('重視總價、能接受屋齡的首購或自住族');bad.append('想要新成屋、不想處理修繕的人');pros.append(f'總價相對友善，單價比同區新案低')
    if diff<-0.05:pros.append(f'單價低於{town}整體約 {abs(diff)*100:.0f}%')
    if diff>0.15:bad.append(f'預算有限的首購族（單價高於{town}整體約 {diff*100:.0f}%）')
    if A.get('ry') and A['ry']>=0.03:good.append(f'想置產出租的人（毛租金報酬率約 {A["ry"]*100:.1f}%）');pros.append('租屋需求穩定')
    if A['n1y']>=10:pros.append(f'近一年成交 {A["n1y"]} 筆，交易活絡、行情透明，日後轉手較容易')
    if A['yoy'] is not None and A['yoy']<-0.05:pros.append(f'近一年價格回檔約 {abs(A["yoy"])*100:.0f}%，議價空間較大')
    if (A.get('pr') or 0)>=0.34:bad.append(f'在意室內實坪的人（公設比約 {A["pr"]*100:.0f}%）')
    school=[n for k,n,d in A['poi'] if k=='國小' and d<500]
    if school:pros.append(f'步行可到{school[0].replace("市立","")}（約 {[d for k,n,d in A["poi"] if k=="國小"][0]} 公尺）')
    if not bad:bad.append('需要大坪數、多房數的大家庭（請先確認是否有合適房型）')
    fit=f'<div class="fit"><div><b>適合</b><ul class="clean" style="margin-top:6px">{"".join(f"<li>{e(x)}</li>" for x in good)}</ul></div></div><h3 style="margin:16px 0 6px;font-size:1.05rem">這個社區的優點</h3><ul class="clean">{"".join(f"<li>{e(x)}</li>" for x in pros)}</ul>'
    check=table(['項目','要確認什麼'],[['棟別門牌',f'社區有 {A["bt"]} 個門牌，比價時用同棟、同座向的成交最準'],['樓層',f'地上 {c["floors"]} 層；看上表的樓層價差，判斷開價是否合理'],['座向採光','實地看早上與下午的日照，西曬戶夏天較熱'],['車位','確認車位種類（平面／機械）與編號，車位價格會影響單價'],['管理費與公設','確認管理費、公基金，以及公設實際使用狀況'],['增建與現況','陽台外推、夾層等增建可能影響貸款與日後轉手']])
    body=f'''<main>
<section class="wrap hero">
<p class="crumb"><a href="/yucheng-communities">祐承的商圈</a> ／ 社區購屋分析</p>
<p class="eyebrow">社區購屋分析</p>
<h1>{e(name)}</h1>
<p class="lead">台中市{town}｜{vill}｜{e(c['addr'].replace(town,'',1))}｜資料至 {DLABEL}</p>
<div class="greet"><img class="gav" src="/images/yucheng.jpg" alt="李祐承" width="60" height="60" loading="lazy"><p>嗨，我是祐承店長（李祐承）。這頁把「{e(name)}」的實價登錄、樓層房型價差、租金和生活機能整理在一起，看屋或出價前先看一遍，心裡比較有底。不確定的資料會標「待確認」，不會用猜的。</p></div>
</section>
<section class="wrap"><h2>買這裡之前，先看懂這幾個數字</h2>{tiles}{note}<p class="note" style="margin-top:10px">單價皆已扣除車位價格，取中位數；和其他網站「總價÷坪數」的算法不同，數字會比較低。</p></section>
<section class="wrap"><h2>社區基本資料</h2>{basics}{feats}</section>
<section class="wrap"><h2>區域市場定位</h2><p class="note" style="margin-bottom:12px">近一年成交中位單價（萬/坪）。{pos_note}</p>{bars}{comp}</section>
<section class="wrap"><h2>歷年行情</h2><p class="note" style="margin-bottom:8px">每年成交中位單價（萬/坪，已扣車位）</p><div class="chart">{chart(A['yrs']) or ('<p class="note">完工時間較短，目前只有一年的成交資料。</p>' if c['age']<4 else '<p class="note">成交筆數太少，只有單一年度資料，無法畫出長期走勢。</p>')}</div></section>
<section class="wrap"><h2>樓層、房型怎麼差</h2><p class="note" style="margin-bottom:10px">近五年成交，筆數少於 3 的組別參考性低。</p><div class="grid2"><div>{fl}</div><div>{rm}</div></div></section>
<section class="wrap"><h2>近期實價登錄</h2><p class="note" style="margin-bottom:10px">＊單價已扣車位（萬/坪）；🅿 為含車位交易。出價前請以內政部實價登錄網站為準。</p>{sales}</section>
<section class="wrap"><h2>租金行情</h2>{rent}</section>
<section class="wrap"><h2>住進來怎麼生活</h2>{life}</section>
<section class="wrap"><h2>環境與看屋提醒</h2>{risk}</section>
<section class="wrap"><h2>適合對象與社區優點</h2>{fit}</section>
<section class="wrap"><h2>看屋時建議確認</h2>{check}</section>
<section class="wrap"><h2>買之前，我陪您看清楚這五件事</h2><ol class="five">
<li><b>地段</b>：實際走一趟通勤、上學、買菜的動線，平日和假日各看一次。</li>
<li><b>預算</b>：總價、車位、貸款成數和每月還款一起算，先用<a href="/yucheng#tools">試算工具</a>抓範圍。</li>
<li><b>行情</b>：用同棟、同樓層帶、扣車位後的單價比，不被開價帶著走。</li>
<li><b>轉手性</b>：看這個社區每年成交幾筆、主力房型是什麼，日後比較好賣。</li>
<li><b>風險</b>：屋齡、修繕紀錄、增建、漏水與西曬，簽約前都要確認。</li></ol></section>
<section class="wrap"><div class="cta"><h2>下一步：告訴我預算和想要的格局</h2><p>我幫您看「{e(name)}」適不適合，也可以直接約看屋。</p><a class="btn" href="{line}" target="_blank" rel="noopener">LINE 問祐承這個社區</a><p style="font-size:.9rem">手機 0933-317-625｜LINE @161cayoi</p></div></section>
</main>
'''
    credit=f'資料來源：內政部不動產成交案件實際資訊（實價登錄），資料更新至 {DLABEL}，每月自動更新；社區介紹為本店整理之公開資料；土壤液化潛勢：經濟部地質調查及礦業管理中心；設施：OpenStreetMap。本頁為統計參考，實際以實價登錄網站、謄本與現場為準。'
    title=f'{name}｜社區購屋分析'
    open(f'{ROOT}/yucheng-a-{A["id"]}.html','w',encoding='utf-8').write(page(title,f'{name}（台中{town}）社區購屋分析：近一年實登單價、樓層房型價差、租金、生活機能與看屋重點。｜信義房屋文心高工店 祐承店長',1,css,body,credit,og=f'a-{A["id"]}.jpg',path=f'/yucheng-a-{A["id"]}'))
    made.append(A['id'])
json.dump(made,open(os.path.join(DATA,'an_ids.json'),'w'));print(made)
