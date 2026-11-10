// 屋主售屋建議報告書：可比案例、稅務優惠條件、用地址找社區、夜間預抓、LINE QR
// 執行：node tests/owner-report-calc.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const L = require(path.join(root, 'owner-report-logic.js'));
const near = (a, b, d = 0.005) => assert.ok(Math.abs(a - b) <= d, `${a} ≠ ${b}`);

// 泰鉅綠豐華近三年（內政部開放資料；7 樓、4 樓、12 樓的車位價為推估）
const GREEN = [
  { ym: '114/04', floor: '7樓', rooms: '2', ping: '32.27', pping: '4.9', pprice: '80', total: '1400' },
  { ym: '113/06', floor: '4樓', rooms: '3', ping: '43.3', pping: '9.8', pprice: '190', total: '1850' },
  { ym: '113/06', floor: '3樓', rooms: '2', ping: '31.83', pping: '4.9', pprice: '80', total: '1336' },
  { ym: '113/02', floor: '12樓', rooms: '2', ping: '26.53', pping: '9.8', pprice: '190', total: '1418' },
];

(async () => {
  // ---------- 拆車單價與坪數換算 ----------
  near(L.splitUnit('1400', '80', '32.27'), 40.90);
  near(L.splitUnit('1418', '190', '26.53'), 46.29);
  near((122.89 - 16.21) * 0.3025, 32.27, 0.01); // 16號七樓之1：建物 122.89㎡、車位 16.21㎡

  // ---------- 可比案例 ----------
  assert.strictEqual(L.roomsOf('3房／2廳／2衛'), 3);
  assert.strictEqual(L.roomsOf('2'), 2);
  assert.ok(Number.isNaN(L.roomsOf('')));
  assert.strictEqual(L.floorOf('12樓之1'), 12);
  assert.strictEqual(L.floorOf('１２樓'), 12);

  const m = L.tradeStats(GREEN, { recentN: 5, subject: { ping: 32.27, rooms: 2, floor: 9 } });
  assert.ok(m.comp, '綠豐華 9 樓 2 房應挑到可比案例');
  assert.strictEqual(m.comp.n, 3);
  assert.ok(m.comp.rule.includes('同2房'));
  assert.ok(!m.comp.keys.includes(L.rowKey(GREEN[1])), '3 房的 4 樓不算同格局');
  near(m.comp.avg, (40.90 + 39.46 + 46.29) / 3, 0.01);

  const withOne = GREEN.concat([{ ym: '114/05', floor: '1樓', rooms: '2', ping: '32', pping: '', pprice: '0', total: '1000' }]);
  const m1 = L.tradeStats(withOne, { recentN: 5, subject: { ping: 32.27, rooms: 2, floor: 9 } });
  assert.ok(!m1.comp.rows.some((r) => r.floor === '1樓'), '本戶不是 1 樓就不拿 1 樓比');

  assert.strictEqual(L.tradeStats(GREEN, { recentN: 5, subject: { ping: 80, rooms: 4, floor: 9 } }).comp, null, '沒有相近的就回 null');
  assert.strictEqual(L.tradeStats(GREEN, { recentN: 5 }).comp, null, '沒有本戶資料就不挑');
  const skipped = GREEN.map((r, i) => (i === 3 ? Object.assign({}, r, { skip: true }) : r));
  const ms = L.tradeStats(skipped, { recentN: 5, subject: { ping: 32.27, rooms: 2, floor: 9 } });
  assert.ok(!ms.comp || !ms.comp.keys.includes(L.rowKey(GREEN[3])), '勾「不列入」的不能當可比');
  const noRooms = GREEN.map((r) => Object.assign({}, r, { rooms: '' }));
  const mr = L.tradeStats(noRooms, { recentN: 5, subject: { ping: 32.27, rooms: 2, floor: 9 } });
  assert.ok(mr.comp && !mr.comp.rule.includes('房、'), '成交沒有房數時改用坪數挑');

  // ---------- 稅務優惠條件 ----------
  assert.strictEqual(L.lvtStatus({}), 'pending');
  assert.strictEqual(L.lvtStatus({ lvt1: 'y', lvt2: 'y', lvt3: 'y', lvtMode: 'once' }), 'ok');
  assert.strictEqual(L.lvtStatus({ lvt1: 'y', lvt2: 'y', lvt3: 'y', lvtMode: 'house' }), 'pending', '一生一屋還要再確認 4 項');
  assert.strictEqual(L.lvtStatus({ lvt1: 'y', lvt2: 'y', lvt3: 'y', lvtMode: 'house', lvt4: 'y', lvt5: 'y', lvt6: 'y', lvt7: 'y' }), 'ok');
  assert.strictEqual(L.lvtStatus({ lvt2: 'n' }), 'no');
  assert.strictEqual(L.hoStatus({ ho1: 'y', ho2: 'y', ho3: 'y' }, true), 'ok');
  assert.strictEqual(L.hoStatus({ ho1: 'y', ho2: 'y', ho3: 'y' }, false), 'no', '未滿 6 年一定不符合');
  assert.strictEqual(L.hoStatus({ ho1: 'y', ho2: 'n', ho3: 'y' }, true), 'no');
  assert.strictEqual(L.hoStatus({ ho1: 'y' }, true), 'pending');
  const auto = L.taxChkAuto({}, 5.74, false);
  assert.strictEqual(auto.lvt3, 'y', '土地持分 5.74 坪自動符合 3 公畝');
  assert.strictEqual(auto.lvt7, 'y', '也符合 1.5 公畝');
  assert.strictEqual(auto.ho1, 'n', '未滿 6 年自動判斷不符合');
  assert.strictEqual(L.taxChkAuto({}, 60, true).lvt7, undefined, '60 坪超過 1.5 公畝不自動勾');
  assert.strictEqual(L.taxChkAuto({ lvt3: 'n' }, 5.74, true).lvt3, 'n', '同仁手動選的不覆蓋');
  assert.strictEqual(L.TAX_CHK.ho.length, 3);

  // ---------- 網站後端：用地址找社區 ----------
  const worker = await import(pathToFileURL(path.join(root, '_worker.js')).href);
  const env = {
    ASSETS: {
      async fetch(req) {
        const f = path.join(root, decodeURIComponent(new URL(req.url).pathname));
        if (!fs.existsSync(f)) return new Response('not found', { status: 404 });
        return new Response(fs.readFileSync(f), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    },
  };
  const post = async (url, body) => (await worker.default.fetch(new Request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env)).json();

  if (fs.existsSync(path.join(root, 'data/lvr-idx/comm.json'))) {
    const r = await post('https://tcyucheng.com/api/lvr-community', { address: '台中市南區工學路155巷16號7樓之1' });
    assert.strictEqual(r.ok, true);
    assert.ok(r.addrs.includes('工學路155巷16號') && r.addrs.includes('工學路155巷18號'), '綠豐華 16、18 號要一起查');
    assert.ok(!r.addrs.includes('工學路155巷6號'), '建築完成日不同的隔壁社區不可併入');
    assert.strictEqual(r.community && r.community.name, '泰鉅綠豐華');
    assert.strictEqual(r.community.sinyiId, '0023097');
    assert.strictEqual(r.built, '105/03/28');
    assert.strictEqual(r.floors, '12樓');
    const r7 = r.rows.find((x) => x.ym === '114/04' && x.floor === '7樓');
    assert.strictEqual(r7.rooms, '2');
    assert.strictEqual(r7.pest, '80');
    assert.strictEqual(r7.pestSrc, 'community');
    r.rows.forEach((x) => assert.ok(!/親友|特殊關係/.test(x.note), '特殊交易要排除'));
  }

  // ---------- 夜間預抓：4 天內用預抓檔，過期就即時讀 ----------
  const cacheDir = path.join(root, 'data/sinyi-cache');
  const testId = 'TEST0001';
  const testFile = path.join(cacheDir, testId + '.json');
  fs.mkdirSync(cacheDir, { recursive: true });
  try {
    fs.writeFileSync(testFile, JSON.stringify({ ok: true, id: testId, name: '測試社區', fetchedAt: '2026-11-10', fetchedTs: Date.now() }));
    const fresh = await post('https://tcyucheng.com/api/sinyi-community', { id: testId });
    assert.strictEqual(fresh.source, 'nightly');
    assert.strictEqual(fresh.name, '測試社區');
    fs.writeFileSync(testFile, JSON.stringify({ ok: true, id: testId, name: '測試社區', fetchedTs: Date.now() - 5 * 864e5 }));
    const stale = await post('https://tcyucheng.com/api/sinyi-community', { id: testId });
    assert.notStrictEqual(stale.source, 'nightly', '超過 4 天不可再用');
  } finally {
    fs.rmSync(testFile, { force: true });
    try { fs.rmdirSync(cacheDir); } catch (e) { /* 資料夾裡還有正式預抓檔 */ }
  }

  // ---------- 頁面：QR、稅務條件、用地址找社區都有接上 ----------
  const html = fs.readFileSync(path.join(root, 'owner-report.html'), 'utf8');
  assert.ok(html.includes("url:'https://line.me/R/ti/p/@161cayoi'"), 'QR 要連到 LINE 官方帳號');
  assert.ok(html.includes('LINE 房價諮詢'));
  assert.ok(!html.replace('不可出現「免費估價」', '').includes('免費估價'), '不可出現禁用語（AI 撰寫指令裡的禁止句除外）');
  assert.ok(html.includes('id="taxChk"') && html.includes('drawTaxChk()'));
  assert.ok(html.includes('findByAddress(true)'), '謄本辨識後要自動用地址找社區');
  assert.ok(html.includes('subject:subjOf()'), '行情統計要帶本戶條件挑可比案例');

  console.log('owner-report calc tests ok', { comp: m.comp.n, compAvg: +m.comp.avg.toFixed(2) });
})().catch((e) => { console.error(e); process.exit(1); });
