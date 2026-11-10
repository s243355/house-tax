// 屋主售屋建議報告書：防呆（信義社區對照、讀取次數上限、B 方案條件、換社區）
// 執行：node tests/owner-report-guard.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const L = require(path.join(root, 'owner-report-logic.js'));

(async () => {
  // ---------- 信義社區對照：名稱或門牌要對得上 ----------
  assert.strictEqual(L.doorOf('台中市南區大慶街一段246之1號'), '大慶街1段246號');
  assert.strictEqual(L.doorOf('大慶街1段246-12號'), '大慶街1段246號');
  assert.strictEqual(L.doorOf('南區工學路155巷16號7樓之1'), '工學路155巷16號');
  assert.strictEqual(L.doorOf('台中市南區高工路'), '', '只有路名沒有門牌不能當門牌比');
  const m = (name, keys, sname, saddr) => L.sinyiMatch({ name, keys }, { name: sname, address: saddr });
  assert.ok(!m('大慶中山', ['高工路178號'], '大慶國宅', '台中市南區高工路,南區高工南路,南區工學二街').ok, '大慶中山不可對到大慶國宅');
  assert.strictEqual(m('中邑一品花園大廈', ['復興路1段207巷17-19號'], '一品華廈美樹館(中邑一品)', '台中市南區復興路一段').by, 'name', '括號裡的別名也算');
  assert.strictEqual(m('悅幸福', [], '詠丞悅幸福', '').by, 'name');
  assert.strictEqual(m('', ['工學路155巷16號', '工學路155巷18號'], '泰鉅綠豐華', '台中市南區工學路155巷16號').by, 'address', '沒有名稱時用門牌對');
  assert.ok(!m('', ['工學路155巷6號'], '泰鉅綠豐華', '台中市南區工學路155巷16號').ok, '隔壁門牌不算');
  assert.ok(!L.sinyiMatch(null, { name: 'x' }).ok);

  // 對照表裡每個已預抓的社區都要對得上；對不上的列出來，請店長確認後寫進 data/owner-report/sinyi-ids.json
  const comm = JSON.parse(fs.readFileSync(path.join(root, 'data/lvr-idx/comm.json'), 'utf8'));
  const bySid = {};
  Object.values(comm).forEach((t) => Object.entries(t).forEach(([k, v]) => { if (v[2]) bySid[v[2]] = { name: v[0], keys: [k] }; }));
  assert.ok(!Object.values(bySid).some((e) => e.name === '大慶中山'), '大慶中山的信義編號已人工停用');
  const cacheDir = path.join(root, 'data/sinyi-cache');
  const bad = [];
  if (fs.existsSync(cacheDir)) {
    fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json')).forEach((f) => {
      const e = bySid[f.slice(0, -5)];
      if (!e) return;
      const d = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8'));
      if (!L.sinyiMatch(e, d).ok) bad.push(`${e.name} ↔ ${d.name}（${f.slice(0, -5)}）`);
    });
  }
  if (bad.length) console.warn('⚠ 信義社區對照對不上，網站不會自動帶入，請確認：\n  ' + bad.join('\n  '));

  // ---------- 讀取信義官網：fresh 不能繞過暫存、同一來源有次數上限 ----------
  const store = new Map();
  globalThis.caches = { default: {
    async match(req) { const v = store.get(req.url); return v ? new Response(v.body, { headers: v.headers }) : undefined; },
    async put(req, res) { store.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
  } };
  let upstream = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { upstream += 1; return new Response(JSON.stringify({ result: '<html></html>' }), { status: 200 }); };
  const worker = await import(pathToFileURL(path.join(root, '_worker.js')).href);
  const env = { CF_ACCOUNT_ID: 'acc', CF_API_TOKEN: 'tok', ASSETS: { fetch: async () => new Response('nf', { status: 404 }) } };
  const post = async (body, ip) => {
    const res = await worker.default.fetch(new Request('https://tcyucheng.com/api/sinyi-community', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip || '1.2.3.4' }, body: JSON.stringify(body),
    }), env);
    return { status: res.status, data: await res.json() };
  };
  try {
    store.set('https://tcyucheng.com/__cache/sinyi-community-v2/0023097', { body: JSON.stringify({ ok: true, id: '0023097', name: '泰鉅綠豐華' }), headers: {} });
    const cached = await post({ id: '0023097', fresh: true });
    assert.strictEqual(cached.data.source, 'cache', 'fresh 只略過夜間預抓檔，6 小時暫存照用');
    assert.strictEqual(upstream, 0, '有暫存就不可再去讀官網');

    const max = worker.SINYI_LIVE_LIMIT.perSource;
    for (let i = 0; i < max; i += 1) {
      const r = await post({ id: 'ZZ' + String(i).padStart(4, '0') });
      assert.notStrictEqual(r.status, 429, `第 ${i + 1} 次不該被擋`);
    }
    assert.strictEqual(upstream, max);
    const over = await post({ id: 'ZZ9999' });
    assert.strictEqual(over.status, 429, `同一來源超過 ${max} 次要擋`);
    assert.strictEqual(upstream, max, '被擋的不可再去讀官網');
    const other = await post({ id: 'ZZ9998' }, '5.6.7.8');
    assert.notStrictEqual(other.status, 429, '別的來源不受影響');
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.caches;
  }

  // ---------- 官網地址只有路名時，用對照表的門牌查近三年實價 ----------
  {
    const realFetch2 = globalThis.fetch;
    const env2 = { ASSETS: { fetch: async (req) => {
      const f = path.join(root, decodeURIComponent(new URL(req.url).pathname));
      return fs.existsSync(f) ? new Response(fs.readFileSync(f), { status: 200 }) : new Response('nf', { status: 404 });
    } } };
    const pre = path.join(root, 'data/sinyi-cache/0004985.json');
    if (fs.existsSync(pre)) {
      const r = await (await worker.default.fetch(new Request('https://tcyucheng.com/api/sinyi-community', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '0004985' }),
      }), env2)).json();
      assert.strictEqual(r.name, '城市之星');
      assert.ok(!/\d+號/.test(r.address), '官網地址只有路名');
      assert.strictEqual(r.lvrAddress, '台中市大里區德芳南路306巷10號', '要補上對照表的門牌');
    }
    globalThis.fetch = realFetch2;
  }

  // ---------- 頁面接線：B 方案條件、換社區、信義對照 ----------
  const html = fs.readFileSync(path.join(root, 'owner-report.html'), 'utf8');
  assert.ok(html.includes('const showB=!hoUserNo()&&('), '自住清單選「不符合」時，強制顯示也不列 B 方案');
  assert.ok(html.includes('function forceBWarn()'), '強制顯示但條件不足要提醒');
  assert.ok(html.includes('await askSwitch(nn,old)'), '地址換了社區要讓同仁選擇');
  assert.ok(html.includes('沒有自動替換'), '謄本辨識後自動查詢不可直接換掉社區');
  assert.ok(html.includes('OwnerReport.sinyiMatch({name:c.name'), '自動帶信義官網前要先比對社區');
  assert.ok(!html.includes('未滿6年'));
  assert.ok(html.includes('S.price.listings=(d.listings||[]).map('), '官網待售 0 筆時要清空，不可留上一個社區的');
  assert.ok(html.includes('if(S.basic.community&&d.name&&!sameName(S.basic.community,d.name))clearCommunity();'), '帶入不同社區要先清掉舊社區資料');
  assert.ok(html.includes('loadLvr(r.lvrAddress||r.address'), '官網地址沒門牌時改用對照表門牌');

  console.log('owner-report guard tests ok', bad.length ? `（對照待確認 ${bad.length} 筆）` : '');
})().catch((e) => { console.error(e); process.exit(1); });
