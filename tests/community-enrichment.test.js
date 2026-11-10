const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const panda = read('yucheng-a-457647.html');
assert.ok(panda.includes('<h1>熊貓公園市</h1>'));
assert.ok(panda.includes('樣本極少，行情請另參考 2023 年同社區 3 筆成交（中位 24.2 萬/坪）'));
assert.ok(!panda.includes('近三年每季'), 'frozen panda page must stay untouched');
assert.ok(panda.includes('本頁為統計參考'));

const communities = read('yucheng-communities.html');
assert.ok(communities.includes('<h4 class="nm">'));
assert.ok(communities.includes('class="abadge" href="/yucheng-a-'));
assert.ok(!communities.includes('class="abadge" href="yucheng-a-'));

const anDir = path.join(root, 'data', 'yucheng', 'an');
let checked = 0;
for (const name of fs.readdirSync(anDir)) {
  if (!name.endsWith('.json')) continue;
  const an = JSON.parse(fs.readFileSync(path.join(anDir, name), 'utf8'));
  if (!an.p1y || an.p1y < 12) continue;
  const htmlPath = path.join(root, `yucheng-a-${an.id}.html`);
  assert.ok(fs.existsSync(htmlPath), 'missing page ' + an.id);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const price = Number(an.p1y).toFixed(1);
  assert.ok(html.includes('>' + price + '<small'), an.id + ' median tile changed');
  assert.ok(html.includes('本頁為統計參考'), an.id + ' disclaimer');
  assert.ok(html.includes('內政部不動產成交案件實際資訊'), an.id + ' source');
  if (an.id !== 457647) {
    assert.ok(html.includes('近三年每季'), an.id + ' quarterly section');
    assert.ok(html.includes('已扣車位'), an.id + ' parking-adjusted note');
  }
  checked += 1;
}
assert.ok(checked >= 200, 'expected the analysis pages');

const quarters = JSON.parse(read('data/yucheng/quarters.json'));
const busy = read('yucheng-a-559190.html');
assert.ok(busy.includes('aria-label="近三年每季成交中位單價"'));
assert.ok(busy.includes('115Q3') || busy.includes('114Q4'));
const busyRow = quarters['559190'];
assert.ok(busyRow.some((row) => row[2] === 0), 'a gap quarter should stay in the series');

const verified = JSON.parse(read('data/yucheng/verified_fields.json'));
let sourced = 0;
for (const [id, fields] of Object.entries(verified)) {
  if (id.startsWith('_')) continue;
  const html = read(`yucheng-a-${id}.html`);
  for (const [key, rec] of Object.entries(fields)) {
    if (key.startsWith('_') || !rec || !rec.value) continue;
    assert.ok(html.includes(rec.value), id + ' missing verified ' + key);
    const url = (rec.sources && rec.sources[0] && rec.sources[0].url) || '';
    assert.ok(url.startsWith('http'), id + ' ' + key + ' source');
    assert.ok(html.includes(url), id + ' source link for ' + key);
    sourced += 1;
  }
}
assert.ok(sourced > 0, 'expected at least one sourced field');

const schools = JSON.parse(read('data/yucheng/school_districts.json'));
const tree = schools.levels.elementary.areas['南區|樹義里'];
const treeJr = schools.levels.junior.areas['南區|樹義里'];
assert.strictEqual(tree, undefined, '樹義里 elementary district is split by neighborhood');
assert.ok(treeJr && treeJr.schools.includes('四育國中'));
const yue = read('yucheng-a-614790.html');
assert.ok(yue.includes('四育國中'));
assert.ok(yue.includes('https://data.gov.tw/dataset/130179'));
assert.ok(yue.includes('拆到鄰的里不猜'));

console.log('community enrichment tests passed', checked, 'pages', sourced, 'sourced fields');
