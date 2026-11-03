import os
from paths import ROOT,DATA
import json,math,urllib.parse
P=json.load(open(ROOT+'/data/poi-taichung.json'))['items']
BIG=('好市多','家樂福','大潤發','愛買','Costco','COSTCO')
def hav(a,b,c,d):
    R=6371000;p1,p2=math.radians(a),math.radians(c);dp=p2-p1;dl=math.radians(d-b)
    x=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2;return 2*R*math.asin(math.sqrt(x))
ROWS=[('買菜、日用品','超市',lambda p:p['c']=='grocery' and not any(b in p['name'] for b in BIG)),
 ('傳統市場','市場',lambda p:p['sub']=='marketplace'),
 ('大採購','量販店',lambda p:any(b in p['name'] for b in BIG) and p['c'] in('grocery','bigbox','shop')),
 ('逛街、吃飯','百貨商場',lambda p:p['sub'] in('mall','department_store')),
 ('小孩上學','國小',lambda p:p['c']=='school' and ('國小' in p['name'] or '國民小學' in p['name'])),
 ('散步、運動','公園',lambda p:p['c']=='park'),
 ('看病','醫院',lambda p:p['sub']=='hospital'),
 ('搭車通勤','台鐵／捷運站',lambda p:p['sub']=='station'),
 ('開車上國道','交流道',lambda p:p['sub']=='motorway_junction')]
def life(lat,lng):
    out=[]
    for task,kind,f in ROWS:
        best=None
        for p in P:
            if not p['name'] or not f(p):continue
            d=hav(lat,lng,p['lat'],p['lng'])
            if best is None or d<best[0]:best=(d,p)
        if not best or best[0]>8000:continue
        d,p=best;r=d*1.3
        if r<=900:how=f'步行約 {max(1,round(r/75))} 分';mode='walking'
        elif r<=6000:how=f'騎車約 {max(2,round(r/400))} 分・開車約 {max(3,round(r/450)+2)} 分';mode='driving'
        else:how=f'開車約 {round(r/550)+3} 分';mode='driving'
        url='https://www.google.com/maps/dir/?api=1&origin='+f'{lat:.6f},{lng:.6f}'+'&destination='+urllib.parse.quote(p['name']+' 台中')+'&travelmode='+mode
        out.append((task,kind,p['name'],round(d),how,url))
    return out
