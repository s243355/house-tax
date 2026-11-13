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

  // ---------- 周邊同類型行情（信義不動產行情資訊表，德富路60號實例）----------
  {
    const nb = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/nearby-defu60.json'), 'utf8'));
    const picked = L.nearbyAutoPick(nb.rows, 10);
    assert.deepStrictEqual(picked.filter((r) => r.pick).map((r) => r.seq), ['C01', 'C02', 'C03', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11'], '依表上順序取 10 筆、略過親友交易 C04');
    const st = L.nearbyStats(picked);
    assert.strictEqual(st.n, 10);
    assert.strictEqual(st.special, 1);
    const u = (seq) => st.rows.find((r) => r.seq === seq);
    // 和行情表上 ◆ 拆車單價一致
    assert.strictEqual(u('C01').split.toFixed(2), '50.52');
    assert.strictEqual(u('C03').split.toFixed(2), '39.91');
    assert.strictEqual(u('C09').split.toFixed(2), '17.56');
    assert.strictEqual(u('C10').split.toFixed(2), '30.92');
    assert.strictEqual(u('C02').split.toFixed(2), '30.79', '沒有車位＝總價÷建坪');
    assert.ok(u('C01').est && !u('C02').est);
    assert.ok(u('C06').noPark && u('C11').noPark, '有車位坪沒車位價＝無法拆車');
    assert.strictEqual(st.noPark, 2);
    assert.strictEqual(L.nearbyAddr('台中市南區德富路30號十四樓之5'), '南區德富路30號');
    assert.strictEqual(L.nearbyAddr('台中市南區德祥街15巷9號5樓之1'), '南區德祥街15巷9號');
    const html2 = fs.readFileSync(path.join(root, 'owner-report.html'), 'utf8');
    assert.ok(html2.includes('周邊同類型行情（近${m.n}筆）'), '要有自己的標題');
    assert.ok(html2.includes("if(hasNearby())out.push(['nearby',pNearby(no.nearby)])"), '有資料才加這一頁，放在社區實價登錄後面');
    assert.ok(html2.includes('「周邊同類型」區塊（序號 C 開頭）只放 nearby.rows'), '辨識時周邊成交不可混進社區實價登錄');
  }

  // ---------- 讀回編輯後的 PPT（工具下載 → 改 5 處 → LibreOffice 另存）----------
  {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ppt-edited-libreoffice.json'), 'utf8'));
    const read = L.pptxRead(fx.slides);
    assert.ok(read.meta && read.meta.community === '泰鉅綠豐華', '要讀到看不見的對照標記');
    assert.deepStrictEqual(read.meta.keys, ['114/04|7樓|1400', '113/06|4樓|1850', '113/06|3樓|1336']);
    const base = { basic: { community: '泰鉅綠豐華', address: '台中市南區工學路155巷16號9樓', floor: '9樓', layout: '2房2廳1衛', floors: '12樓', use: '住宅', type: '大樓', dark: '無', guard: '全天候' },
      area: { total: '37.17', parking: '4.9', land: '5.74' }, features: '近工學市場\n近樹義國小\n社區管理佳',
      market: { rows: [{ ym: '114/04', floor: '7樓', ping: '32.27', pping: '4.9', pprice: '80', total: '1400', est: 1 }, { ym: '113/06', floor: '4樓', ping: '43.3', pping: '9.8', pprice: '190', total: '1850' }, { ym: '113/06', floor: '3樓', ping: '31.83', pping: '4.9', pprice: '80', total: '1336' }], conclusion: '近三年 3 筆\n單價約 39～41 萬' },
      price: { online: '1500～1550萬', expect: '1380～1420萬', analysis: '樓層居中\n採光佳', summary: '建議先以 1520 萬開價', listings: [{ floor: '1樓', ping: '40.03', pping: '4.9', layout: '3房2廳2衛', price: '1850' }] } };
    const res = L.pptxApply(base, read);
    assert.deepStrictEqual(res.changes.map((c) => c.label), ['地址', '社區重點結論', '建議網路開價', '總結', '成交修改 114/04 7樓'], '只抓到真的改過的 5 處，沒改的不可誤判');
    assert.strictEqual(res.state.basic.address, '台中市南區工學路155巷16號9樓之2');
    assert.strictEqual(res.state.market.rows[0].total, '1410');
    assert.strictEqual(res.state.market.rows[0].est, 1, '只改總價，車位推估標記保留');
    assert.strictEqual(res.state.price.summary, '建議先以 1560 萬開價，兩週後檢討');
    assert.strictEqual(res.state.features, base.features, '特色沒改就不動');
    // 在 PPT 刪掉一列成交 → 報告也刪掉
    const cut = JSON.parse(JSON.stringify(read)); cut.tables.market.splice(3, 1);
    const r2 = L.pptxApply(base, cut);
    assert.ok(r2.changes.some((c) => c.label === '成交刪除'));
    assert.strictEqual(r2.state.market.rows.length, 2);
    const html3 = fs.readFileSync(path.join(root, 'owner-report.html'), 'utf8');
    assert.ok(html3.includes("objectName:'ormeta:'"), '下載的 PPT 要帶對照標記');
    assert.ok(html3.includes("（業務編輯版）.pptx"), '存檔時編輯版 PPT 要一起存');
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

  // ---------- 存檔、下載都存回分店資料庫；帶入社區可挑最近兩次 ----------
  {
    const day = Date.UTC(2026, 10, 13, 2); // 台灣 11/13 上午
    const old = { name: 'A', updatedAt: day - 86400e3, market: { rows: [1] }, prev: { name: 'A', updatedAt: day - 9 * 86400e3 }, id: 'x' };
    const p1 = L.commPrev(old, old.prev, day);
    assert.strictEqual(p1.updatedAt, day - 86400e3, '跨日存檔：舊的最新版變成前一次');
    assert.ok(!('prev' in p1) && !('id' in p1), '前一次不再往下巢狀');
    const same = { name: 'A', updatedAt: day - 3600e3 };
    assert.strictEqual(L.commPrev(same, { updatedAt: 5 }, day).updatedAt, 5, '同一天再存只更新最新版，前一次不變');
    assert.strictEqual(L.commPrev(null, null, day), null);
    // 台灣時間跨午夜（UTC 15:59 → 16:01）算不同天
    const nearMid = Date.UTC(2026, 10, 12, 15, 59);
    assert.ok(L.commPrev({ updatedAt: nearMid, market: {} }, null, nearMid + 2 * 60e3));
    const vs = L.commVersions({ name: 'A', id: 'a', updatedAt: day, market: {}, prev: { updatedAt: day - 86400e3, market: { rows: [] }, listings: [] } });
    assert.deepStrictEqual(vs.map((v) => v.key), ['cur', 'prev']);
    assert.strictEqual(vs[1].doc.name, 'A');
    assert.ok(!('prev' in vs[0].doc));
    assert.strictEqual(L.commVersions({ name: 'A', updatedAt: day, prev: { updatedAt: day - 60e3, market: {} } }).length, 1, '同一天的不重複列');
    assert.strictEqual(L.commVersions({ name: 'A' }).length, 1);
  }
  {
    const h = fs.readFileSync(path.join(root, 'owner-report.html'), 'utf8');
    assert.ok(h.includes('id="bSave"'), '上方要有「存檔」按鈕');
    assert.ok(/\$\('#bPdf'\)\.onclick=[\s\S]{0,300}saveBack\(\{pdf:b/.test(h), '下載 PDF 要存回資料庫，並沿用同一份 PDF');
    assert.ok(/async function exportPptx[\s\S]{0,500}saveBack\(\{pptx:blob/.test(h), '下載 PPTX 要存回資料庫，並沿用同一份 PPTX');
    assert.ok(h.includes('const pdf=pre.pdf||await makePdfBlob') && h.includes('pdfBlob=pre.pdf||await makePdfBlob'), '存檔沿用剛下載的 PDF，不重做');
    assert.ok(h.includes("SAVED_SIG===saveSig()"), '資料沒變不重複存');
    assert.ok(h.includes('id="webLibVer"') && h.includes('id="libVer"'), '帶入社區要能挑版本');
    assert.ok(h.includes("pickVer(c0,'#webLibVer')") && h.includes("pickVer(c0,'#libVer')"));
    const gs = fs.readFileSync(path.join(root, 'scripts/owner-report/Code.gs'), 'utf8');
    assert.ok(gs.includes('COL_PREV') && gs.includes('doc.prev = p') && gs.includes('prevDoc_(oldDoc'), 'Apps Script 存前一次並在清單回傳');
  }

  console.log('owner-report guard tests ok', bad.length ? `（對照待確認 ${bad.length} 筆）` : '');
})().catch((e) => { console.error(e); process.exit(1); });
