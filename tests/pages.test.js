const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const pages = {
  'index.html': '/',
  'house-tax.html': '/house-tax',
  'old-tax.html': '/old-tax',
  'repurchase-refund.html': '/repurchase-refund',
  'refund-old-tax.html': '/refund-old-tax',
  'refund-land-tax.html': '/refund-land-tax',
  'holding-cost.html': '/holding-cost',
  'rental-tax.html': '/rental-tax',
  'new-qingan.html': '/new-qingan',
  'mortgage.html': '/mortgage',
  'home-buying.html': '/home-buying',
  'price-calculator.html': '/price-calculator',
  'transaction-planner.html': '/transaction-planner',
  'card.html': '/card',
};
const site = 'https://house-tax.s243355.workers.dev';

for (const [file, route] of Object.entries(pages)) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const outside = html.split(/(<script\b[^>]*>[\s\S]*?<\/script>)/gi).filter((p) => !/^<script\b/i.test(p)).join('');
  assert.strictEqual((outside.match(/<h1[\s>]/g) || []).length, 1, file + ' should have one h1');
  assert.ok(html.includes('rel="canonical" href="' + site + (route === '/' ? '/' : route) + '"'), file + ' canonical');
  assert.ok(html.includes('property="og:image"'), file + ' og:image');
  assert.ok(html.includes('property="og:url"'), file + ' og:url');
  assert.ok(html.includes('property="og:type"'), file + ' og:type');
  assert.ok(html.includes('name="twitter:card"'), file + ' twitter');
  assert.ok(html.includes('name="description"'), file + ' description');
  assert.ok(html.includes('rel="icon"'), file + ' favicon');
  assert.ok(html.includes('apple-touch-icon'), file + ' apple touch');
  assert.ok(html.includes('fonts.googleapis.com'), file + ' font preconnect or import');
  assert.ok(html.indexOf('rel="preconnect" href="https://fonts.googleapis.com"') < html.indexOf('@import url') || !html.includes('@import url'), file + ' preconnect order');
  assert.ok(!html.includes('jspdf.umd.min.js'), file + ' should not preload jsPDF');
  assert.ok(!html.includes('html2canvas.min.js'), file + ' should not preload html2canvas');
  assert.ok(!/href="[a-z0-9-]+\.html"/.test(outside), file + ' still links to .html');
  assert.ok(html.includes('｜祐承店長 信義房屋 文心高工店'), file + ' title brand');
  if (file !== 'index.html' && file !== 'card.html') {
    assert.ok(html.includes('/pdf-loader.js'), file + ' pdf loader');
  }
  const labeled = new Set([...outside.matchAll(/<label[^>]*\bfor="([^"]+)"/gi)].map((m) => m[1]));
  const ids = new Set([...outside.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const id of labeled) assert.ok(ids.has(id), file + ' label target missing ' + id);
  for (const m of outside.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = m[2];
    if (/type\s*=\s*"hidden"/i.test(attrs)) continue;
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const named = (id && labeled.has(id)) || /aria-label=/.test(attrs) || /aria-labelledby=/.test(attrs);
    assert.ok(named, file + ' unlabeled control ' + (id || m[0].slice(0, 40)));
  }
}

const house = fs.readFileSync(path.join(root, 'house-tax.html'), 'utf8');
assert.ok(!house.includes('365.25'), 'house-tax still divides by 365.25');
assert.ok(house.includes('HoldingPeriod.analyze'), 'house-tax uses calendar helper');
assert.ok(house.includes('設籍並實際居住連續滿 6 年'), 'self-use residency note');
assert.ok(house.includes('/holding-period.js'));

const refund = fs.readFileSync(path.join(root, 'repurchase-refund.html'), 'utf8');
const oldRefund = fs.readFileSync(path.join(root, 'refund-old-tax.html'), 'utf8');
assert.ok(refund.includes('withinCalendarYears'), 'repurchase uses calendar 2-year window');
assert.ok(oldRefund.includes('withinCalendarYears'), 'old-tax refund uses calendar 2-year window');
assert.ok(!refund.includes('daysDiff<=730'));
assert.ok(!oldRefund.includes('gapDays <= 730'));

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(index.includes('試算僅供參考，實際以稅捐機關核定為準'));
assert.ok(index.includes('"@type": "RealEstateAgent"'));
assert.ok(!index.includes('address'), 'JSON-LD must not invent an address');
assert.ok(index.includes('https://line.me/ti/p/EfDsNa26Xw'));
assert.ok(index.includes('0933-317-625'));

const worker = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
assert.ok(worker.includes("pathname === '/robots.txt'"));
assert.ok(worker.includes("pathname === '/sitemap.xml'"));
assert.ok(worker.includes('status: 404'));
for (const route of Object.values(pages)) {
  assert.ok(worker.includes("'" + route + "'"), 'sitemap missing ' + route);
}
const wrangler = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
assert.ok(wrangler.includes('"not_found_handling": "none"'));

for (const asset of ['og-image.png', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'holding-period.js', 'pdf-loader.js']) {
  assert.ok(fs.existsSync(path.join(root, asset)), 'missing ' + asset);
}

console.log('pages tests passed');
