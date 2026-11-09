const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
  return blocks;
}

function visibleFaq(html) {
  const pairs = [];
  const re = /<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    pairs.push([m[1].replace(/<[^>]+>/g, '').trim(), m[2].replace(/<[^>]+>/g, '').trim()]);
  }
  return pairs;
}

function assertFaqMatches(file) {
  const html = read(file);
  const blocks = jsonLdBlocks(html).filter((b) => b['@type'] === 'FAQPage');
  assert.strictEqual(blocks.length, 1, file + ' FAQPage count');
  const faq = blocks[0];
  assert.strictEqual(faq['@context'], 'https://schema.org');
  const visible = visibleFaq(html);
  assert.ok(visible.length >= 4, file + ' visible FAQ');
  assert.strictEqual(faq.mainEntity.length, visible.length, file + ' FAQ count');
  faq.mainEntity.forEach((q, i) => {
    assert.strictEqual(q['@type'], 'Question');
    assert.strictEqual(q.name, visible[i][0], file + ' question ' + i);
    assert.strictEqual(q.acceptedAnswer['@type'], 'Answer');
    assert.strictEqual(q.acceptedAnswer.text, visible[i][1], file + ' answer ' + i);
    assert.ok(q.acceptedAnswer.text.length > 10);
  });
}

const home = read('yucheng.html');
assert.ok(home.includes('<title>房產找祐承｜台中南區、大里買房售屋｜信義房屋文心高工店</title>'));
assert.ok(home.includes('name="description" content="房產找祐承，信義房屋文心高工店店長李祐承。協助台中南區與大里買房、售屋、換屋，先把實價登錄和預算算清楚，再陪你看屋。"'));
assert.ok(home.includes('台中南區、大里買房售屋</span></h1>'));
assert.ok(home.includes('台中南區、大里買房或售屋，帶你看懂買賣眉角。'));
assert.ok(home.includes('在台中南區、大里買房或售屋，是家裡最大的一筆決定。'));
assert.strictEqual((home.match(/<h1[\s>]/g) || []).length, 1);
assert.ok(home.includes('name="twitter:card" content="summary_large_image"'));
assert.ok(home.includes('name="twitter:image" content="https://tcyucheng.com/og/yucheng.jpg?v=2"'));
assert.ok(home.includes('不動產經紀人證書 (101)中市字第 00879 號'));
assert.ok(home.includes('信義房屋股份有限公司文心高工店'));
assert.ok(!home.includes('○○'));
assert.ok(!home.includes('以下為範例'));
assert.ok(!home.includes('陳先生'));
assert.ok(!home.includes('林小姐'));
const cases = JSON.parse(home.match(/<script type="application\/json" id="cases-data">\s*([\s\S]*?)\s*<\/script>/)[1]);
assert.deepStrictEqual(cases, { deals: [], quotes: [] });

const agent = jsonLdBlocks(home).find((b) => b['@type'] === 'RealEstateAgent');
assert.ok(agent, 'homepage RealEstateAgent');
assert.strictEqual(agent['@context'], 'https://schema.org');
assert.strictEqual(agent.name, '李祐承');
assert.strictEqual(agent.alternateName, '房產找祐承');
assert.strictEqual(agent.url, 'https://tcyucheng.com/');
assert.strictEqual(agent.image, 'https://tcyucheng.com/images/yucheng.jpg');
assert.strictEqual(agent.telephone, '0933-317-625');
assert.strictEqual(agent.identifier.propertyID, 'LINE');
assert.strictEqual(agent.identifier.value, '@161cayoi');
assert.strictEqual(agent.sameAs, 'https://line.me/R/ti/p/@161cayoi');
assert.deepStrictEqual(agent.areaServed.map((a) => a.name), ['台中市南區', '台中市大里區']);
assert.strictEqual(agent.parentOrganization.name, '信義房屋文心高工店');
for (const key of ['address', 'openingHours', 'openingHoursSpecification', 'aggregateRating', 'review', 'priceRange']) {
  assert.ok(!(key in agent), 'schema should not invent ' + key);
}

assertFaqMatches('yucheng-communities.html');
assertFaqMatches('yucheng-location.html');

const communities = read('yucheng-communities.html');
assert.ok(communities.includes('<h4 class="nm">'));
assert.ok(communities.includes('class="abadge" href="/yucheng-a-'));
assert.ok(!communities.includes('class="abadge" href="yucheng-a-'));

const sample = read('yucheng-a-457623.html');
assert.ok(!sample.includes('FAQPage'));
assert.ok(!sample.includes('<details'));
const panda = read('yucheng-a-457647.html');
assert.ok(panda.includes('<h1>熊貓公園市</h1>'));
assert.ok(!panda.includes('FAQPage'));

const house = read('house-tax.html');
assert.ok(house.includes('rel="canonical" href="https://house-tax.s243355.workers.dev/house-tax"'));
assert.ok(house.includes('property="og:url" content="https://house-tax.s243355.workers.dev/house-tax"'));

let missingTwitter = 0;
for (const name of fs.readdirSync(root)) {
  if (!name.endsWith('.html')) continue;
  const html = read(name);
  if (!html.includes('property="og:image"')) continue;
  if (!html.includes('name="twitter:card"') || !html.includes('name="twitter:image"')) missingTwitter += 1;
}
assert.strictEqual(missingTwitter, 0, 'og:image pages missing twitter tags');

function element(tag) {
  const node = {
    tag,
    className: '',
    id: '',
    style: {},
    children: [],
    text: '',
    html: '',
    append(...kids) { this.children.push(...kids); },
    set textContent(value) { this.text = String(value); },
    get textContent() { return this.text; },
    set innerHTML(value) { this.html = String(value); },
    replaceWith(next) { node.replaced = next; },
  };
  return node;
}

function renderCases(json) {
  const html = home.replace(
    /<script type="application\/json" id="cases-data">[\s\S]*?<\/script>/,
    '<script type="application/json" id="cases-data">' + JSON.stringify(json) + '</script>'
  );
  const nodes = { 'cases-data': { textContent: JSON.stringify(json) }, 'cases-mount': element('div') };
  const document = {
    getElementById(id) { return nodes[id]; },
    createElement: element,
    createTextNode(text) { return { tag: '#text', text: String(text), children: [] }; },
  };
  const script = html.match(/\/\* 成交實績／客戶見證[\s\S]*?\}\)\(\);/)[0];
  new Function('document', script)(document);
  return nodes['cases-mount'];
}

const emptyMount = renderCases({ deals: [], quotes: [] });
assert.ok(!emptyMount.replaced, 'empty data stays off the page');
const filled = renderCases({
  deals: [{ title: '  實測社區・2 房 ', when: ' 115 年 1 月 ' }, { title: '', when: 'x' }],
  quotes: [{ text: '同意刊登的句子', cite: '屋主' }],
});
assert.strictEqual(filled.replaced.tag, 'section');
assert.strictEqual(filled.replaced.id, 'cases');
const flat = JSON.stringify(filled.replaced);
assert.ok(flat.includes('實測社區・2 房'));
assert.ok(flat.includes('115 年 1 月'));
assert.ok(flat.includes('同意刊登的句子'));
assert.ok(!flat.includes('○○'));

(async () => {
  const worker = await import(pathToFileURL(path.join(root, '_worker.js')).href);
  const assets = {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/yucheng') return new Response('home', { status: 200, headers: { 'Content-Type': 'text/html' } });
      if (url.pathname === '/404.html') return new Response('missing', { status: 200 });
      return new Response('nope', { status: 404 });
    },
  };
  async function hit(url, init) {
    return worker.default.fetch(new Request(url, init), { ASSETS: assets });
  }
  const casesToCheck = [
    ['http://tcyucheng.com/', 'https://tcyucheng.com/'],
    ['http://tcyucheng.com/robots.txt', 'https://tcyucheng.com/robots.txt'],
    ['http://tcyucheng.com/yucheng-communities', 'https://tcyucheng.com/yucheng-communities'],
    ['http://www.tcyucheng.com/yucheng-communities?x=1&y=2', 'https://tcyucheng.com/yucheng-communities?x=1&y=2'],
    ['http://www.tcyucheng.com/house-tax', 'https://tcyucheng.com/house-tax'],
    ['https://www.tcyucheng.com/yucheng-a-457623', 'https://tcyucheng.com/yucheng-a-457623'],
    ['http://house-tax.s243355.workers.dev/yucheng', 'https://tcyucheng.com/'],
    ['http://house-tax.s243355.workers.dev/yucheng-communities', 'https://tcyucheng.com/yucheng-communities'],
  ];
  for (const [from, to] of casesToCheck) {
    const res = await hit(from);
    assert.strictEqual(res.status, 301, from);
    assert.strictEqual(res.headers.get('location'), to, from);
    if (from.startsWith('https://')) assert.strictEqual(res.headers.get('strict-transport-security'), 'max-age=2592000');
    else assert.strictEqual(res.headers.get('strict-transport-security'), null);
    assert.ok(!String(res.headers.get('strict-transport-security') || '').includes('preload'));
  }
  const robots = await hit('https://tcyucheng.com/robots.txt');
  assert.strictEqual(robots.status, 200);
  assert.ok((await robots.text()).includes('Sitemap: https://tcyucheng.com/sitemap-yucheng.xml'));
  assert.strictEqual(robots.headers.get('strict-transport-security'), 'max-age=2592000');
  const homeRes = await hit('https://tcyucheng.com/');
  assert.strictEqual(homeRes.status, 200);
  assert.strictEqual(await homeRes.text(), 'home');
  assert.strictEqual(homeRes.headers.get('strict-transport-security'), 'max-age=2592000');
  const tool = await hit('https://house-tax.s243355.workers.dev/robots.txt');
  assert.strictEqual(tool.status, 200);
  assert.ok((await tool.text()).includes('https://house-tax.s243355.workers.dev/sitemap.xml'));
  assert.strictEqual(tool.headers.get('strict-transport-security'), 'max-age=2592000');
  const toolHttp = await hit('http://house-tax.s243355.workers.dev/house-tax');
  assert.notStrictEqual(toolHttp.status, 301);
  const missing = await hit('https://tcyucheng.com/no-such-page');
  assert.strictEqual(missing.status, 404);
  assert.strictEqual(missing.headers.get('strict-transport-security'), 'max-age=2592000');
  console.log('seo tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
