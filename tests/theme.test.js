// 工具站外觀要和個人網站「房產找祐承」一致：共用 tools-theme.css、同一組頁首、不再出現舊的信義紅主色。
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const theme = read('tools-theme.css');
const personal = read('yucheng.html');

for (const token of ['#fbfcfa', '#0a8a43', '#076b34', '#0b3d24', '#d8e2db', '#b8892f']) {
  assert.ok(personal.includes(token), 'personal site palette changed: ' + token);
  assert.ok(theme.includes(token), 'tools theme missing personal-site colour ' + token);
}
assert.ok(theme.includes('"Noto Serif TC"') && theme.includes('"Noto Sans TC"'), 'theme fonts');

const withHeader = ['index', 'house-tax', 'old-tax', 'repurchase-refund', 'refund-old-tax', 'refund-land-tax', 'holding-cost',
  'rental-tax', 'new-qingan', 'mortgage', 'home-buying', 'prop-compare', 'price-calculator', 'transaction-planner'];
const themed = withHeader.concat(['card', 'owner-report']);

for (const name of themed) {
  const html = read(name + '.html');
  const link = html.indexOf('<link rel="stylesheet" href="tools-theme.css">');
  assert.ok(link > 0, name + ' must load tools-theme.css');
  assert.ok(link > html.indexOf('</style>'), name + ' theme must load after the page styles');
  assert.ok(link < html.indexOf('</head>'), name + ' theme link belongs in <head>');
}
for (const name of withHeader) {
  const html = read(name + '.html');
  const outside = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  assert.strictEqual((outside.match(/<header\b/g) || []).length, 1, name + ' one header');
  assert.ok(outside.includes('<header class="yc-top">'), name + ' uses the shared header');
  assert.ok(outside.includes('href="https://tcyucheng.com/" aria-label="房產找祐承 首頁"'), name + ' brand links to the personal site');
  assert.ok(outside.includes('房產找<b>祐承</b>'), name + ' brand name');
  for (const href of ['https://tcyucheng.com/yucheng-listings', 'https://tcyucheng.com/yucheng-communities', 'https://tcyucheng.com/yucheng-location']) {
    assert.ok(outside.includes('href="' + href + '"'), name + ' menu link ' + href);
  }
  assert.ok(outside.includes('<a href="./" class="on" aria-current="page">試算工具</a>'), name + ' tools menu item');
  for (const id of ['hdr-phone', 'hdr-phone-label', 'hdr-line']) assert.ok(outside.includes('id="' + id + '"'), name + ' keeps #' + id);
  assert.ok(!/#c00000/i.test(html), name + ' still carries the old red brand colour');
}
for (const page of ['yucheng-listings', 'yucheng-communities', 'yucheng-location']) {
  assert.ok(fs.existsSync(path.join(root, page + '.html')), 'menu target missing: ' + page);
}
assert.ok(!/github\.io|workers\.dev/.test(read('card.html')), 'card must not point at the old domains');
assert.ok(read('card.html').includes('href="https://tcyucheng.com/tools/"'), 'card links to the unified domain');

// 新青安 3.0（財政部貸款原則，115/8/1 起）
const qingan = read('new-qingan.html');
assert.ok(qingan.includes('const capBase=Math.max(price,appraise);'), '房價上限看成交價與鑑價較高者');
assert.ok(qingan.includes('const principalWan=Math.min(needLoan,quota);'), '自備款較多時新青安本金要跟著降');
assert.ok(qingan.includes('value="1.775"'), '前 3 年 1.775%');
for (const v of ['value="1000"', 'value="1200"', 'value="1500"', 'value="2000"', 'value="2500"', 'value="3500"']) assert.ok(qingan.includes(v), 'new-qingan ' + v);

// 禁用語
// owner-report 的 AI 指令本身寫著「不可出現免費估價」，那一句不算。
for (const name of themed.concat(['admin', 'yucheng'])) {
  const text = read(name + '.html').replace(/不可出現「免費估價」/g, '');
  assert.ok(!text.includes('免費估價'), name + ' 含禁用語「免費估價」');
}
console.log('theme tests passed');

// LINE 一律用官方帳號 @161cayoi，不再出現個人 LINE 連結。
for (const file of fs.readdirSync(root).filter((f) => (/\.(html|js)$/.test(f)) && !/^yucheng-a-/.test(f))) {
  assert.ok(!read(file).includes('EfDsNa26Xw'), file + ' still links to the personal LINE');
}
for (const name of withHeader.concat(['card'])) {
  assert.ok(read(name + '.html').includes('https://line.me/R/ti/p/@161cayoi'), name + ' LINE must be the official account');
}
console.log('line tests passed');

// tools-theme.css 固定淺色、內文深色字；工具頁不可再有自己的深色模式，否則會變成深字配深底（屋主報告書 115/11/13 的問題）
for (const name of themed) {
  const html = read(name + '.html');
  assert.ok(!/prefers-color-scheme\s*:\s*dark/.test(html), name + ' must not switch to dark colours (tools theme keeps text dark)');
  assert.ok(!/\[data-theme="dark"\]/.test(html), name + ' must not define a dark data-theme');
}
