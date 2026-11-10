const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const hp = require(path.join(root, 'holding-period.js'));
const logic = require(path.join(root, 'owner-report-logic.js'));

function iso(d) {
  return logic.toIso(d);
}

(async () => {
  const { lvrKey, selectLvrRows } = await import(pathToFileURL(path.join(root, 'lvr-addr.js')).href);

  const a = lvrKey('台中市南區復興路2段71巷55號');
  const b = lvrKey('台中市南區復興路二段７１巷５５號');
  const c = lvrKey('復興路二段71巷55號');
  assert.strictEqual(a, '復興路2段71巷55號');
  assert.strictEqual(b, a);
  assert.strictEqual(c, a);
  assert.strictEqual(lvrKey('台中市南區復興路二段71巷52之一號'), '復興路2段71巷52之1號');
  assert.strictEqual(lvrKey('南區某路一段10之2號'), lvrKey('某路1段10之２號'));

  const idx = JSON.parse(fs.readFileSync(path.join(root, 'data/lvr-idx/南區.json'), 'utf8'));
  const q1 = selectLvrRows(idx.data, '台中市南區復興路2段71巷55號', {});
  const q2 = selectLvrRows(idx.data, '台中市南區復興路二段71巷55號', {});
  assert.deepStrictEqual(q1.addrs, q2.addrs);
  assert.strictEqual(q1.rows.length, q2.rows.length);
  assert.ok(q1.rows.length >= 30, 'In House should return the indexed door set, got ' + q1.rows.length);
  // 索引重建後鍵會正規化成「2段」，舊索引是「二段」，兩種都接受
  const exact = (idx.data['復興路2段71巷55號'] || idx.data['復興路二段71巷55號'] || []).length;
  assert.strictEqual(exact, 30);
  assert.ok(q1.rows.length >= exact);

  const miss = selectLvrRows(idx.data, '台中市南區沒有這條路1號', {});
  assert.strictEqual(miss.rows.length, 0);
  assert.ok(/二段|之1|尚未/.test(miss.hint));

  const g1 = selectLvrRows(idx.data, '台中市南區工學路155巷32弄6號', {});
  const g2 = selectLvrRows(idx.data, '台中市南區工學路１５５巷３２弄６號', {});
  assert.deepStrictEqual(g1.addrs, g2.addrs);
  assert.ok(g1.rows.some((r) => r[0] === 1150723 && r[1] === 5 && r[2] === 18450000));

  function pingOf(m2) { return Math.round(m2 * 0.3025 * 100) / 100; }
  const inHouse = q1.rows.find((r) => r[0] === 1150525 && r[1] === 14);
  assert.ok(inHouse, 'missing 115/05 14F In House row');
  assert.strictEqual(Math.round(inHouse[2] / 1e4), 1400);
  const gross = pingOf(inHouse[3]);
  const park = pingOf(inHouse[4]);
  assert.strictEqual(gross, 34.96);
  assert.strictEqual(park, 9.91);
  assert.strictEqual(Math.round((inHouse[3] - inHouse[4]) * 0.3025 * 100) / 100, 25.05);

  const gong = g1.rows.find((r) => r[0] === 1150723 && r[1] === 5);
  assert.strictEqual(Math.round(gong[2] / 1e4), 1845);
  assert.strictEqual(pingOf(gong[3]), 47.81);

  assert.strictEqual(iso(logic.parseAcquireDate('105/01/01')), '2016-01-01');
  assert.strictEqual(iso(logic.parseAcquireDate('1050101')), '2016-01-01');
  assert.strictEqual(iso(logic.parseAcquireDate('2020/01/01')), '2020-01-01');
  assert.strictEqual(iso(logic.parseAcquireDate('2020-01-01')), '2020-01-01');
  assert.strictEqual(iso(logic.parseAcquireDate('20200101')), '2020-01-01');
  assert.notStrictEqual(logic.parseAcquireDate('2020/01/01').getFullYear(), 3931);

  assert.strictEqual(hp.analyze('2020-01-01', '2022-01-01').rate, 45);
  assert.strictEqual(hp.analyze('2019-03-01', '2024-03-01').rate, 35);
  assert.strictEqual(hp.analyze('2019-03-01', '2025-03-01').fullSix, true);

  assert.strictEqual(logic.stdRate('南區'), '35');
  assert.strictEqual(logic.stdRate('東區'), '32');
  assert.strictEqual(logic.stdRate('西區'), '32');
  assert.strictEqual(logic.stdRate('大里區'), '26');
  assert.strictEqual(logic.stdRate('南屯區'), '38');
  assert.strictEqual(logic.stdRate('不存在區'), '');
  assert.strictEqual(logic.STD_YEAR, '114');
  assert.ok(logic.STD_DECREE.includes('11400690240'));

  assert.strictEqual(logic.isExcludedTrade('預售屋、或土地及建物分件登記案件；'), true);
  assert.strictEqual(logic.isExcludedTrade(''), false);
  assert.ok(Math.abs(logic.splitUnit(1400, 190, 25.05) - (1400 - 190) / 25.05) < 1e-9);
  assert.ok(Math.abs(logic.grossUnit(1400, 25.05, 9.91) - 1400 / (25.05 + 9.91)) < 1e-9);
  assert.ok(Math.abs(logic.askUnit(1598, 190, 25) - (1598 - 190) / 25) < 1e-9);

  const html = fs.readFileSync(path.join(root, 'owner-report.html'), 'utf8');
  assert.ok(html.includes('holding-period.js'));
  assert.ok(html.includes('載入範例報告'));
  assert.ok(html.includes('0032737'));
  assert.ok(html.includes('查近三年實價'));
  assert.ok(html.includes('未扣土增稅與貸款'));
  assert.ok(html.includes('實拿'));
  assert.ok(html.includes('開價扣車單價'));
  assert.ok(html.includes('含車單價'));
  assert.ok(!html.includes("stdRate:'38'"));
  assert.ok(!html.includes('未滿5年'));
  assert.ok(!html.includes('未滿6年'));
  const workerSrc = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
  assert.ok(workerSrc.includes('selectLvrRows'));
  assert.ok(!/GAS|script\.google/.test(fs.readFileSync(path.join(root, 'lvr-addr.js'), 'utf8')));

  const worker = await import(pathToFileURL(path.join(root, '_worker.js')).href);
  const body = fs.readFileSync(path.join(root, 'data/lvr-idx/南區.json'));
  const env = {
    ASSETS: { async fetch() { return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }); } },
  };
  async function query(address) {
    const res = await worker.default.fetch(new Request('https://tcyucheng.com/api/lvr-community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    }), env);
    return res.json();
  }
  const api2 = await query('台中市南區復興路2段71巷55號');
  const apiCn = await query('台中市南區復興路二段71巷55號');
  assert.strictEqual(api2.ok, true);
  assert.strictEqual(api2.rows.length, apiCn.rows.length);
  assert.strictEqual(api2.rows.length, 30);
  assert.deepStrictEqual(api2.rows.map((r) => r.total + '|' + r.floor + '|' + r.ping), apiCn.rows.map((r) => r.total + '|' + r.floor + '|' + r.ping));
  const row14 = api2.rows.find((r) => r.ym === '115/05' && r.floor === '14樓' && r.total === '1400');
  assert.ok(row14);
  assert.strictEqual(row14.pping, '9.91');
  assert.strictEqual(Number(row14.ping) + Number(row14.pping), 34.96);
  const none = await query('台中市南區沒有這條路9號');
  assert.strictEqual(none.rows.length, 0);
  assert.ok(none.hint);

  const listingHtml = '<script id="__NEXT_DATA__">' + JSON.stringify({
    props: { initialReduxState: { communityReducer: {
      communityContentList: { name: '範例', commId: '1', address: '台中市南區復興路二段７１巷５５號' },
      tradeData: [],
      communityObj: { object: [{ commId: '1', floor: '8', areaBuilding: 34.96, parkingRange: 9.91, totalPrice: 1495, totalLayout: '2房2廳1衛', name: '附車' }] },
    } } },
  }) + '</script>';
  const parsed = worker.parseSinyiCommunity(listingHtml, '1');
  assert.strictEqual(parsed.listings[0].ping, '25.05');
  assert.strictEqual(parsed.listings[0].pping, '9.91');
  assert.strictEqual(parsed.listings[0].price, '1495');

  assert.strictEqual(api2.matchBy, 'exact');
  const lv = await query('台中市南區工學路155巷16號');
  assert.strictEqual(lv.ok, true);
  assert.strictEqual(lv.rows.length, 4, '綠豐華 16號含同棟 18號應為 4 筆');
  assert.strictEqual(lv.matchBy, 'building');
  const shaped = lv.rows.map((r) => ({
    ym: r.ym, floor: r.floor, ping: r.ping, pping: r.pping, total: r.total, note: r.note, ptype: r.ptype, addr: r.addr,
    est: !r.priced && !!r.pest,
    estSrc: r.pestSrc,
    pprice: (!r.priced && r.pest) ? r.pest : r.pprice,
  }));
  const estN = shaped.filter((r) => r.est).length;
  const st = logic.tradeStats(shaped, { now: new Date(2026, 10, 10), recentN: 5 });
  const odd = st.rows.find((r) => r.ym === '113/02' && r.floor === '12樓');
  assert.ok(odd, 'missing 113/02 12樓');
  assert.ok(Math.abs(odd.unit - 46.29) < 0.02, 'unit ' + odd.unit);
  assert.strictEqual(odd.outlier, true);
  assert.strictEqual(odd.est, true);
  assert.strictEqual(st.latest, '114/04');
  assert.strictEqual(st.months, 19);
  assert.strictEqual(st.count, 4);
  assert.ok(st.count < 5 && st.months > 12);

  const added = logic.tradeStats([
    { ym: '113/02', total: '100', ping: '10', pprice: '0', pping: '0' },
    { ym: '115/10', total: '200', ping: '10', pprice: '0', pping: '0' },
  ], { recentN: 1 });
  assert.strictEqual(added.rows.slice().sort(logic.byDateDesc)[0].ym, '115/10');
  assert.strictEqual(added.avg, 20);

  assert.strictEqual(logic.toIso(logic.parseAcquireDate('990601')), '2010-06-01');
  assert.strictEqual(logic.toIso(logic.parseAcquireDate('105.05.01')), '2016-05-01');
  assert.strictEqual(logic.toIso(logic.parseAcquireDate('2016/05/01')), '2016-05-01');
  assert.strictEqual(logic.ymKey('11306'), logic.ymKey('113-06'));
  assert.strictEqual(logic.ymKey('11306'), logic.ymKey('113年6月'));
  assert.strictEqual(logic.ymKey('11306'), logic.ymKey('2024/06'));
  assert.ok(logic.ymKey('115/10') > logic.ymKey('11306'));
  assert.strictEqual(logic.ymKey(''), 0);

  const bare = logic.tradeStats([{ ym: '115/01', total: '1000', ping: '20', pping: '5', pprice: '0' }]);
  assert.strictEqual(bare.noPark, 1);
  assert.strictEqual(bare.rows[0].noPark, true);
  const skipped = logic.tradeStats([
    { ym: '115/10', total: '300', ping: '10', pprice: '0', pping: '0', skip: true },
    { ym: '115/09', total: '100', ping: '10', pprice: '0', pping: '0' },
  ], { recentN: 5 });
  assert.strictEqual(skipped.avg, 10);
  assert.strictEqual(skipped.max, 10);

  const hint = selectLvrRows({
    '某路12號': [[1150101, 3, 100, 30, 0, 0, '', '', '', '', '', 1000101, 12]],
  }, '台中市南區某路8號', { floors: '12樓', age: '15' });
  assert.strictEqual(hint.matchBy, 'hint');
  assert.deepStrictEqual(hint.addrs, ['某路12號']);

  console.log('owner-report tests ok', { inHouse: q1.rows.length, addrs: q1.addrs, gong: g1.rows.length, gongAddrs: g1.addrs, lvfengEst: estN, odd: odd && odd.unit });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
