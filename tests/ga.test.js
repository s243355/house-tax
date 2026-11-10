const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const GA_ID = 'G-GF9EYGTLNG';
const page = `<!DOCTYPE html><html><head><title>t</title></head><body>
<p>手機 0933-317-625</p>
<footer><p>既有頁尾</p></footer>
<article class="card" id="sale-1234567"><h3>測試社區 A</h3>
  <a href="https://line.me/R/oaMessage/%40161cayoi/?%E5%95%8F%E9%80%99%E9%96%93">LINE 問這間</a>
  <a href="tel:0933317625">打電話</a>
  <a href="https://sinyi.in/o/1234567">信義官網看詳情</a>
</article>
<a href="https://market.591.com.tw/20404/overview?q=1">591</a>
<button class="btn-calc" onclick="calculate()">開始計算</button>
<button class="calc-btn" onclick="showLineShare()">LINE 分享</button>
<h4 class="nm">登陽大地悅章 <a class="abadge" href="/yucheng-a-614790">購屋分析</a></h4>
</body></html>`;

const wrangler = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
assert.ok(wrangler.includes('"GA_MEASUREMENT_ID": "G-GF9EYGTLNG"'), 'wrangler must carry the public measurement id');

const panda = fs.readFileSync(path.join(root, 'yucheng-a-457647.html'), 'utf8');
assert.ok(!panda.includes('googletagmanager.com/gtag/js'), 'frozen panda file stays untouched');
assert.ok(!panda.includes('本站使用 Google Analytics'));
const communities = fs.readFileSync(path.join(root, 'yucheng-communities.html'), 'utf8');
assert.ok(communities.includes('<h4 class="nm">登陽大地悅章 <a class="abadge" href="/yucheng-a-614790">購屋分析</a></h4>'));

(async () => {
  const worker = await import(pathToFileURL(path.join(root, '_worker.js')).href);
  function assetsFor(body, type) {
    return {
      async fetch() {
        return new Response(body, { status: 200, headers: { 'Content-Type': type } });
      },
    };
  }
  async function hit(url, env, init) {
    return worker.default.fetch(new Request(url, init), env);
  }

  const plain = await hit('https://tcyucheng.com/yucheng-a-457623', { ASSETS: assetsFor(page, 'text/html') });
  assert.strictEqual(await plain.text(), page, 'empty id injects nothing');

  const bad = await hit('https://tcyucheng.com/yucheng-a-457623', {
    ASSETS: assetsFor(page, 'text/html'),
    GA_MEASUREMENT_ID: 'not-an-id',
  });
  assert.strictEqual(await bad.text(), page, 'invalid id injects nothing');

  const json = await hit('https://tcyucheng.com/data.json', {
    ASSETS: assetsFor('{"ok":true}', 'application/json'),
    GA_MEASUREMENT_ID: GA_ID,
  });
  assert.strictEqual(await json.text(), '{"ok":true}');

  const tagged = await hit('https://tcyucheng.com/yucheng-a-457623', {
    ASSETS: assetsFor(page, 'text/html; charset=utf-8'),
    GA_MEASUREMENT_ID: GA_ID,
  });
  const html = await tagged.text();
  assert.ok(html.includes('https://www.googletagmanager.com/gtag/js?id=' + GA_ID));
  assert.ok(html.includes('async src="https://www.googletagmanager.com/gtag/js?id=' + GA_ID + '"'));
  assert.ok(html.includes('anonymize_ip:true'));
  assert.ok(html.includes('allow_google_signals:false'));
  assert.ok(html.includes('allow_ad_personalization_signals:false'));
  assert.ok(html.includes('<p class="ga-note">本站使用 Google Analytics 統計瀏覽數據。</p></footer>'));
  assert.ok(html.includes('gtag(\'event\', name, params || {})') || html.includes('gtag(\'event\', name, params || {});'));
  for (const name of ['click_line', 'click_phone', 'view_community', 'click_listing', 'use_tool', 'click_591']) {
    assert.ok(html.includes("'" + name + "'"), name);
  }
  assert.ok(html.includes('<h4 class="nm">登陽大地悅章 <a class="abadge" href="/yucheng-a-614790">購屋分析</a></h4>'));
  const script = html.match(/<script>\s*(\(function\(\)\{[\s\S]*?\}\)\(\);)\s*<\/script>/);
  assert.ok(script, 'tracker script');
  assert.ok(!script[1].includes('0933'), 'tracker must not embed the phone number');
  new Function(script[1]);

  const events = [];
  const listeners = {};
  function el(tag, attrs, children) {
    const node = {
      tag,
      attrs: attrs || {},
      children: children || [],
      classList: {
        contains(name) { return String(node.attrs.class || '').split(/\s+/).includes(name); },
      },
      get textContent() {
        return [node.attrs.text || '', ...node.children.map((child) => child.textContent || '')].join('');
      },
      get id() { return node.attrs.id || ''; },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(node.attrs, name); },
      getAttribute(name) { return node.hasAttribute(name) ? String(node.attrs[name]) : null; },
      closest(selector) {
        if (matches(node, selector)) return node;
        return null;
      },
      querySelector(selector) {
        const all = [];
        (function walk(n) { all.push(n); n.children.forEach(walk); })(node);
        return all.find((n) => n !== node && matches(n, selector)) || null;
      },
    };
    node.children.forEach((child) => { child.parent = node; });
    return node;
  }
  function matches(node, selector) {
    if (selector === 'a, button') return node.tag === 'a' || node.tag === 'button';
    if (selector === 'article') return node.tag === 'article';
    if (selector === 'article.card') return node.tag === 'article' && node.classList.contains('card');
    if (selector === 'h3') return node.tag === 'h3';
    if (selector === '#tools [data-pane]') return node.attrs.id === 'tools' ? false : node.hasAttribute('data-pane') && node.parent && node.parent.attrs.id === 'tools';
    return false;
  }
  const card = el('article', { class: 'card', id: 'sale-1234567' }, [el('h3', { text: '測試社區 A' })]);
  const line = el('a', { href: 'https://line.me/R/oaMessage/%40161cayoi/?hi', text: 'LINE 問這間' });
  line.parent = card;
  line.closest = (selector) => (matches(line, selector) ? line : (selector === 'article' || selector === 'article.card' ? card : null));
  const phone = el('a', { href: 'tel:0933317625', text: '打電話' });
  const listing = el('a', { href: 'https://sinyi.in/o/1234567', text: '信義官網看詳情' });
  listing.parent = card;
  listing.closest = (selector) => (matches(listing, selector) ? listing : (selector === 'article.card' ? card : null));
  const source = el('a', { href: 'https://market.591.com.tw/20404?q=secret', text: '來源' });
  const calc = el('button', { class: 'btn-calc', onclick: 'calculate()', text: '開始計算' });
  const tools = el('section', { id: 'tools' });
  const pane = el('div', { 'data-pane': 'loan' });
  pane.parent = tools;
  const input = el('input', {});
  input.parent = pane;
  input.closest = (selector) => (selector === '#tools [data-pane]' ? pane : null);
  const document = {
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const location = { pathname: '/yucheng-a-457623', href: 'https://tcyucheng.com/yucheng-a-457623' };
  const gtag = (kind, name, params) => { if (kind === 'event') events.push({ name, params }); };
  new Function('document', 'location', 'gtag', 'URL', script[1])(document, location, gtag, URL);
  assert.deepStrictEqual(events.map((event) => event.name), ['view_community']);
  assert.strictEqual(events[0].params.community_id, '457623');
  listeners.click.forEach((fn) => fn({ target: line }));
  listeners.click.forEach((fn) => fn({ target: phone }));
  listeners.click.forEach((fn) => fn({ target: listing }));
  listeners.click.forEach((fn) => fn({ target: source }));
  listeners.click.forEach((fn) => fn({ target: calc }));
  listeners.change.forEach((fn) => fn({ target: input }));
  const names = events.map((event) => event.name);
  assert.ok(names.includes('click_line'));
  assert.ok(names.includes('click_phone'));
  assert.ok(names.includes('click_listing'));
  assert.ok(names.includes('click_591'));
  assert.ok(names.includes('use_tool'));
  const lineEvent = events.find((event) => event.name === 'click_line');
  assert.strictEqual(lineEvent.params.listing_id, '1234567');
  assert.strictEqual(lineEvent.params.listing_name, '測試社區 A');
  assert.ok(!JSON.stringify(lineEvent.params).includes('0933'));
  assert.ok(!JSON.stringify(events.find((event) => event.name === 'click_phone').params).includes('0933'));
  const outbound = events.find((event) => event.name === 'click_591');
  assert.strictEqual(outbound.params.host, 'market.591.com.tw');
  assert.ok(!JSON.stringify(outbound.params).includes('secret'));
  assert.strictEqual(events.find((event) => event.name === 'use_tool' && event.params.tool === 'loan').params.tool, 'loan');
  console.log('ga tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
