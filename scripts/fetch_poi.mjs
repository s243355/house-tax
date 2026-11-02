// 從 OpenStreetMap（Overpass API）抓台中南區、東區、大里區一帶的設施點位，存成 data/poi-taichung.json。
// 由 .github/workflows/fetch-poi.yml 手動觸發執行。資料授權：OpenStreetMap contributors (ODbL)。
import fs from 'node:fs';
const bbox = '24.06,120.635,24.16,120.75'; // 南,西,北,東
const q = `[out:json][timeout:120];
(
  nwr["amenity"="school"](${bbox});
  nwr["leisure"="park"]["name"](${bbox});
  nwr["shop"~"^(mall|department_store)$"](${bbox});
  nwr["amenity"="marketplace"](${bbox});
  nwr["railway"="station"](${bbox});
  nwr["amenity"="bus_station"](${bbox});
  nwr["highway"="motorway_junction"](${bbox});
  nwr["amenity"~"^(hospital|clinic|doctors|dentist)$"](${bbox});
);
out center tags;`;
const hosts = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
let data;
for (const h of hosts) {
  try {
    const r = await fetch(h, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'house-tax-poi/1.0' } });
    if (r.ok) { data = await r.json(); break; }
    console.error(h, r.status);
  } catch (e) { console.error(h, e.message); }
}
if (!data) process.exit(1);
const cat = t => {
  if (t.amenity === 'school') return 'school';
  if (t.leisure === 'park') return 'park';
  if (t.shop === 'mall' || t.shop === 'department_store' || t.amenity === 'marketplace') return 'shop';
  if (t.railway === 'station' || t.amenity === 'bus_station' || t.highway === 'motorway_junction') return 'transit';
  if (['hospital', 'clinic', 'doctors', 'dentist'].includes(t.amenity)) return 'medical';
};
const out = data.elements.map(e => {
  const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  return { c: cat(t), name: t.name || t['name:zh'] || '', sub: t.amenity || t.leisure || t.shop || t.railway || t.highway, lat, lng };
}).filter(p => p.c && p.lat);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/poi-taichung.json', JSON.stringify({ fetched_at: new Date().toISOString(), source: 'OpenStreetMap contributors (ODbL) via Overpass API', items: out }));
console.log('saved', out.length);
