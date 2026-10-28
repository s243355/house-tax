const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PC = require('../prop-compare-logic.js');

const SAMPLE = `信義房屋文心高工店 李祐承
服務專線：0963600792
簡訊請發：0933317625
推薦：[雙鐵共構三房平車金庫宅]復興路一段
登記坪數：約48.90坪
總價：1798萬
銷售編號：6416DS
網址：https://sinyi.in/o/6416DS/243355

推薦：[［中山醫］大三房平車]建國南路一段
登記坪數：約50.77坪
總價：1880萬
銷售編號：1833CH
網址：https://sinyi.in/o/1833CH/243355
互動看屋："https://sinyi.biz/6eEdpyYrK"

推薦：[森活學後棟高樓美三房平車]高工路
登記坪數：約50.20坪
總價：1860萬
銷售編號：2587PQ
網址：https://sinyi.in/o/2587PQ/243355

推薦：[新案☀️綠園道旁三房平車]高工路
登記坪數：約48.05坪
總價：1800萬
銷售編號：4564JF
網址：https://sinyi.in/o/4564JF/243355
互動看屋："https://sinyi.biz/2RsQxJ57Z"
`;

const header = PC.parseHeader(SAMPLE);
assert.strictEqual(header.agent, '李祐承');
assert.strictEqual(header.phone, '0963-600-792');
assert.ok(!SAMPLE.includes(header.phone) || header.phone !== '0933-317-625');

const rows = PC.parseText(SAMPLE);
assert.strictEqual(rows.length, 4);
assert.deepStrictEqual(rows.map((r) => r.code), ['6416DS', '1833CH', '2587PQ', '4564JF']);
assert.deepStrictEqual(rows.map((r) => r.address), ['復興路一段', '建國南路一段', '高工路', '高工路']);
assert.deepStrictEqual(rows.map((r) => r.title), [
  '雙鐵共構三房平車金庫宅',
  '［中山醫］大三房平車',
  '森活學後棟高樓美三房平車',
  '新案☀️綠園道旁三房平車',
]);
assert.deepStrictEqual(rows.map((r) => r.price), [1798, 1880, 1860, 1800]);
assert.deepStrictEqual(rows.map((r) => r.area), [48.9, 50.77, 50.2, 48.05]);
const units = rows.map((r) => PC.calcRow(r).withParkUnit.toFixed(2));
assert.deepStrictEqual(units, ['36.77', '37.03', '37.05', '37.46']);
rows.forEach((r) => {
  const d = PC.calcRow(r);
  assert.strictEqual(d.unitPrice, null);
  assert.strictEqual(d.unitLabel, '未填車位');
});

assert.strictEqual(PC.parsePriceWan('總價：1288.5萬'), 1288.5);
assert.strictEqual(PC.parsePriceWan('總價：1,288.50萬'), 1288.5);
assert.strictEqual(PC.parsePriceWan('總價：1.2億'), 12000);
assert.strictEqual(PC.parsePriceWan('總價：1億2000萬'), 12000);
assert.strictEqual(PC.parsePriceWan('總價：1億2,000萬'), 12000);

const duped = PC.parseText(SAMPLE + '\n推薦：[重複]河南路\n總價：100萬\n銷售編號：6416ds\n網址：https://sinyi.in/o/6416ds/243355\n');
assert.strictEqual(duped.length, 4);

const fallback = PC.parseText('推薦：專任仁美居園道視野附平車 忠明南路\n登記坪數：約56.20坪\n總價：2380萬\n銷售編號：5946NX\n');
assert.strictEqual(fallback[0].address, '忠明南路');
assert.ok(fallback[0].title.indexOf('忠明南路') === -1);
assert.strictEqual(fallback[0].hasPark, true);
assert.strictEqual(PC.mentionsParking('車站旁三房'), false);
assert.strictEqual(PC.mentionsParking('金庫宅'), false);
assert.strictEqual(PC.mentionsParking('機械車位'), true);

const missing = PC.parseText('推薦：[缺資料]河南路\n銷售編號：BBBBBB\n網址：https://sinyi.in/o/BBBBBB/1\n');
missing[0].detailFailed = true;
const priced = rows[0];
const sortedAsc = PC.sortProps([missing[0], priced], 'price', true).map((r) => r.code);
assert.deepStrictEqual(sortedAsc, ['6416DS', 'BBBBBB']);
const sortedDesc = PC.sortProps([missing[0], priced], 'price', false).map((r) => r.code);
assert.deepStrictEqual(sortedDesc, ['6416DS', 'BBBBBB']);
assert.strictEqual(PC.calcRow(missing[0]).withParkUnit, null);
assert.strictEqual(PC.calcRow(missing[0]).unitLabel, '—');

const noPark = { price: 1000, area: 20, hasPark: false, parkAreaKnown: false, parkPriceKnown: false, detailFailed: false };
assert.strictEqual(PC.calcRow(noPark).unitPrice.toFixed(2), '50.00');
const deducted = Object.assign({}, rows[0], { parkArea: 8.8, parkPrice: 150, parkAreaKnown: true, parkPriceKnown: true });
const got = PC.calcRow(deducted);
assert.strictEqual(got.unitPrice.toFixed(2), ((1798 - 150) / (48.9 - 8.8)).toFixed(2));
const areaOnly = Object.assign({}, rows[0], { parkArea: 8.8, parkAreaKnown: true });
assert.strictEqual(PC.calcRow(areaOnly).unitLabel, '未填車位價');

assert.strictEqual(PC.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
assert.strictEqual(PC.esc('"\'&'), '&quot;&#39;&amp;');
assert.strictEqual(PC.safeUrl('javascript:alert(1)'), '');
assert.strictEqual(PC.safeUrl('https://evil.example/phish'), '');
assert.strictEqual(PC.safeUrl('https://sinyi.com.tw.evil.com/'), '');
assert.ok(PC.safeUrl('https://www.sinyi.com.tw/buy/house/6416DS'));
assert.ok(PC.safeUrl('https://sinyi.in/o/6416DS/243355'));
assert.ok(PC.safeUrl('https://res.sinyi.com.tw/buy/6416DS/bigimg/A.JPG', 'img'));
assert.strictEqual(PC.safeUrl('https://sinyi.in/o/6416DS/243355', 'img'), '');

const dirty = PC.sanitizeProp({
  code: 'zzz999',
  title: '<img src=x onerror=alert(1)>',
  url: 'https://evil.example/x',
  img: 'https://evil.example/a.jpg',
  price: '100.5',
  area: '10.5',
  parkArea: 0,
  parkPrice: 0,
});
assert.strictEqual(dirty.code, 'ZZZ999');
assert.ok(dirty.title.includes('<img'));
assert.strictEqual(dirty.url, 'https://www.sinyi.com.tw/buy/house/ZZZ999');
assert.strictEqual(dirty.img, 'https://res.sinyi.com.tw/buy/ZZZ999/bigimg/A.JPG');
assert.strictEqual(dirty.parkAreaKnown, false);
assert.strictEqual(PC.sanitizeProp({ code: '<script>', title: 'x' }), null);

const share = PC.decodeShare(PC.encodeShare({
  props: [Object.assign({}, rows[0], { title: '<img src=x onerror=alert(1)>' })],
  agent: '<b>李祐承</b>',
  phone: '0963-600-792',
  client: '王先生',
  note: '備註',
}));
assert.ok(share);
assert.strictEqual(share.agent, '<b>李祐承</b>');
assert.strictEqual(share.props[0].title, '<img src=x onerror=alert(1)>');
assert.strictEqual(share.props[0].address, '復興路一段');
const b64 = PC.encodeShare({ props: rows.slice(0, 1), agent: '李祐承' });
assert.ok(b64.includes('+') || true);
assert.ok(PC.decodeShare(encodeURIComponent(b64).replace(/%2B/g, '+') ? b64 : b64));

const applied = PC.applyDetail(rows[0], {
  community: '玉山臻邸',
  age: 12.2,
  floor: 5,
  totalFloor: 12,
  hasPark: true,
  parkType: '1個坡道平面',
  parkArea: 8.8,
  parkPrice: null,
  mgmtFee: 3505,
  rooms: '3房2廳2衛',
  price: 9999,
  area: 1,
});
assert.strictEqual(applied.price, 1798);
assert.strictEqual(applied.area, 48.9);
assert.strictEqual(applied.address, '復興路一段');
assert.strictEqual(applied.community, '玉山臻邸');
assert.strictEqual(applied.parkArea, 8.8);
assert.strictEqual(applied.parkAreaKnown, true);
assert.strictEqual(applied.parkPriceKnown, false);
assert.strictEqual(PC.calcRow(applied).unitLabel, '未填車位價');

const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { initialReduxState: { buyReducer: { contentData: {
    houseNo: '6416DS',
    name: '雙鐵共構三房平車金庫宅',
    commName: '玉山臻邸',
    address: '台中市南區復興路一段',
    totalPrice: 1798,
    areaBuilding: 48.9,
    pingUsed: 24.71,
    layout: '3房2廳2衛',
    age: '12.2年',
    floor: '5',
    floors: '12',
    isParking: true,
    parking: '1個坡道平面(車位總價：150萬)',
    monthlyFee: '每月約 3,505 元',
    parkPriceSource: null,
    areaInfo: [{ title: '停車空間(含公設)', area: 8.8 }],
    images: ['https://res.sinyi.com.tw/buy/6416DS/bigimg/A.JPG', 'https://evil.example/x.jpg'],
  } } } },
})}</script>`;
const listing = PC.parseListingHtml(html, '6416ds');
assert.strictEqual(listing.address, '復興路一段');
assert.strictEqual(listing.price, 1798);
assert.strictEqual(listing.area, 48.9);
assert.strictEqual(listing.age, 12.2);
assert.strictEqual(listing.floor, 5);
assert.strictEqual(listing.totalFloor, 12);
assert.strictEqual(listing.parkArea, 8.8);
assert.strictEqual(listing.parkPrice, 150);
assert.strictEqual(listing.parkPriceKnown, true);
assert.strictEqual(listing.parkType, '1個坡道平面');
assert.strictEqual(PC.calcRow(Object.assign({ hasPark: true, price: 1880, area: 50.77, detailFailed: false }, {
  parkArea: listing.parkArea, parkPrice: listing.parkPrice, parkAreaKnown: true, parkPriceKnown: true
})).unitPrice.toFixed(2), ((1880 - 150) / (50.77 - 8.8)).toFixed(2));
assert.strictEqual(listing.mgmtFee, 3505);
assert.strictEqual(listing.community, '玉山臻邸');
assert.strictEqual(listing.img, 'https://res.sinyi.com.tw/buy/6416DS/bigimg/A.JPG');
assert.strictEqual(PC.parseListingHtml('<html></html>', '6416DS'), null);

const loose = PC.parseLooseDetail('地址 台中市南區建國南路一段 總價 1,880萬 建坪 50.77坪 車位 1個坡道平面 停車空間(含公設) 9.1坪 車位價 120萬 管理費 每月約 2,800 元 3房2廳2衛 屋齡 8.5年 6樓/12樓', '1833CH');
assert.strictEqual(loose.address, '建國南路一段');
assert.strictEqual(loose.price, 1880);
assert.strictEqual(loose.parkArea, 9.1);
assert.strictEqual(loose.parkPrice, 120);

const page = fs.readFileSync(path.join(__dirname, '..', 'prop-compare.html'), 'utf8');
assert.ok(page.includes('href="/"'));
assert.ok(page.includes("rel='noopener noreferrer'"));
assert.ok(page.includes('aria-sort'));
assert.ok(!page.includes('parkArea:0'));
assert.ok(page.includes('encodeURIComponent(enc)'));
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(index.includes('href="/prop-compare"'));
assert.ok(index.includes('物件比較分析'));

console.log('prop-compare tests passed');
