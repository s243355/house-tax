// ================================================================
// 信義房屋物件比較 - Cloudflare Worker
//
// 正式站由 Cloudflare Workers Builds 部署到 tcyucheng.com 與 workers.dev。
// 工具頁的正式網址是 https://tcyucheng.com/tools/ 。workers.dev 與 /house-tax 會 301 過去。
// GitHub Actions 的 pages-build-deployment 只發佈 GitHub Pages，不會更新 Worker。
//
// /api/scrape-prop：Cache API（命中就不再開瀏覽器）→ Browser Rendering /content。
// 信義頁面與 sinyiwebapi 從 Cloudflare 出口會掛住，不要先打它們。
// 單筆硬逾時 25 秒。前端一次只打一筆，以符合免費方案 Quick Actions 約 1 次/10 秒。
// 金鑰只用環境變數 CF_ACCOUNT_ID、CF_API_TOKEN，不要寫進程式。
// /yucheng：祐承店長個人品牌網站（yucheng.html）。
// /api/prop-img 只轉送 https://res.sinyi.com.tw/ 的圖。
// ================================================================
import logic from "./prop-compare-logic.js";
import { toHalf, lvrKey, selectLvrRows } from "./lvr-addr.js";

// 工具頁現在的正式網址是 https://tcyucheng.com/tools/...
// 這裡留的是舊路徑，用來 301，也讓測試能對到 '/house-tax' 這類字串。
const TOOL_PAGES = [
  '/house-tax',
  '/old-tax',
  '/repurchase-refund',
  '/refund-old-tax',
  '/refund-land-tax',
  '/holding-cost',
  '/rental-tax',
  '/new-qingan',
  '/mortgage',
  '/home-buying',
  '/price-calculator',
  '/transaction-planner',
  '/card',
  '/prop-compare',
  '/owner-report',
];
const QUIZ_PAGES = [
  '/不動產經紀人 考試練習',
  '/信義房仲模擬考練習',
  '/信義房仲考試練習',
];
const SITEMAP_PATHS = ['/', ...TOOL_PAGES];

// 先用 30 天，觀察沒問題再加長。不上 preload，也不加 includeSubDomains。
const HSTS = 'max-age=2592000';
const YC_HOST = 'tcyucheng.com';
const WORKERS_HOST = 'house-tax.s243355.workers.dev';

// GA4 評估 ID 只讀環境變數 GA_MEASUREMENT_ID（wrangler.jsonc 的 vars）。
// 留空或格式不對就不載入 gtag、不送事件、也不加頁尾說明。
function gaMeasurementId(env) {
  const id = String((env && env.GA_MEASUREMENT_ID) || '').trim();
  return /^G-[A-Za-z0-9]{4,16}$/.test(id) ? id : '';
}

function gaSnippet(id) {
  const safe = JSON.stringify(id);
  const head = [
    '<script async src="https://www.googletagmanager.com/gtag/js?id=' + id + '"></script>',
    '<script>',
    'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}',
    "gtag('js', new Date());",
    "gtag('config', " + safe + ", {anonymize_ip:true, allow_google_signals:false, allow_ad_personalization_signals:false});",
    '</script>',
  ].join('');
  const tracker = `<script>
(function(){
  function send(name, params){
    try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {}
  }
  function path(){ var p = location.pathname || '/'; return p.length > 1 ? p.replace(/\\/$/, '') : p; }
  function text(node){ return ((node && node.textContent) || '').replace(/\\s+/g, ' ').trim().slice(0, 80); }
  function digits(value){ var m = String(value || '').match(/(\\d{4,})/); return m ? m[1] : ''; }
  var community = (path().match(/\\/yucheng-a-(\\d+)/) || [])[1] || '';
  if (community) send('view_community', { community_id: community, page_path: path() });
  var used = {};
  document.addEventListener('click', function(ev){
    var el = ev.target && ev.target.closest ? ev.target.closest('a, button') : null;
    if (!el) return;
    var href = el.getAttribute('href') || '';
    var abs = href;
    try { abs = new URL(href, location.href).href; } catch (e) {}
    var label = text(el);
    if (el.hasAttribute('data-tel') || /^tel:/i.test(href)) {
      send('click_phone', { page_path: path() });
      return;
    }
    if (el.hasAttribute('data-line') || el.hasAttribute('data-send') || /line\\.me|oaMessage|161cayoi/i.test(abs + ' ' + href)) {
      var line = { page_path: path() };
      if (community) line.community_id = community;
      var sendKind = el.getAttribute('data-send');
      if (sendKind && /^[a-z0-9_-]{1,20}$/i.test(sendKind)) line.tool = sendKind;
      if (/問這間/.test(label)) {
        var card = el.closest('article');
        var listing = digits(card && card.id);
        if (listing) line.listing_id = listing;
        var title = card && card.querySelector('h3');
        if (title) line.listing_name = text(title);
      }
      send('click_line', line);
      return;
    }
    var onclick = el.getAttribute('onclick') || '';
    var calc = /\\b(calculate|calcMortgage|calcCost|generate)\\s*\\(/.test(onclick) || (/\\bcalc\\s*\\(/.test(onclick) && !/showLineShare|generatePDF|generateImage/.test(onclick));
    if (calc || (el.classList && (el.classList.contains('btn-calc') || el.classList.contains('calc-btn')) && !/LINE|PDF|圖片/.test(label))) {
      var tool = path().indexOf('/tools/') === 0 ? path().slice('/tools/'.length) : 'home';
      send('use_tool', { tool: tool.slice(0, 40), page_path: path() });
      return;
    }
    var article = el.closest('article.card');
    if (article && /sinyi\\./i.test(abs)) {
      send('click_listing', { listing_id: digits(article.id), listing_name: text(article.querySelector('h3')), page_path: path() });
      return;
    }
    try {
      var host = new URL(abs).hostname;
      if (/(^|\\.)591\\.com\\.tw$/i.test(host)) send('click_591', { host: host, page_path: path() });
    } catch (e) {}
  }, true);
  document.addEventListener('change', function(ev){
    var pane = ev.target && ev.target.closest ? ev.target.closest('#tools [data-pane]') : null;
    if (!pane) return;
    var name = pane.getAttribute('data-pane') || '';
    if (!/^[a-z0-9_-]{1,20}$/i.test(name) || used[name]) return;
    used[name] = 1;
    send('use_tool', { tool: name, page_path: path() });
  }, true);
  document.addEventListener('submit', function(ev){
    if (path().indexOf('/tools/') !== 0) return;
    send('use_tool', { tool: path().slice('/tools/'.length).slice(0, 40), page_path: path() });
  }, true);
})();
</script>`;
  return { head: head, script: tracker };
}

async function withAnalytics(response, id) {
  if (!id || !response) return response;
  const type = response.headers.get('content-type') || '';
  if (!/text\/html/i.test(type)) return response;
  const html = await response.text();
  if (!/<\/head>/i.test(html) || /googletagmanager\.com\/gtag\/js/i.test(html)) {
    return new Response(html, response);
  }
  const snippet = gaSnippet(id);
  const note = '<p class="ga-note">本站使用 Google Analytics 統計瀏覽數據。</p>';
  let next = html.replace(/<\/head>/i, snippet.head + '</head>');
  const hasFooter = /<\/footer>/i.test(html);
  if (hasFooter) next = next.replace(/<\/footer>/i, note + '</footer>');
  if (/<\/body>/i.test(next)) {
    next = next.replace(/<\/body>/i, (hasFooter ? '' : note) + snippet.script + '</body>');
  } else {
    next += (hasFooter ? '' : note) + snippet.script;
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(next, { status: response.status, statusText: response.statusText, headers });
}

function decodePath(pathname) {
  try { return decodeURIComponent(pathname); }
  catch (err) { return pathname; }
}

function isApiPath(pathname) {
  let path = decodePath(pathname);
  if (path.startsWith('/tools/')) path = path.slice('/tools'.length);
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path === '/api/scrape-prop' || path === '/api/prop-img' || path === '/api/sinyi-community' || path === '/api/lvr-community';
}

function isYuchengPath(pathname) {
  const path = decodePath(pathname).toLowerCase();
  return path === '/yucheng' || path === '/yucheng.html' || path.startsWith('/yucheng-') || path === '/sitemap-yucheng.xml';
}

function withoutHtml(pathname) {
  const path = decodePath(pathname);
  return path.toLowerCase().endsWith('.html') ? path.slice(0, -5) : path;
}

// 工具首頁必須以 /tools/ 結尾，相對連結 house-tax 才會落在 /tools/ 底下。
// 內頁不要結尾斜線，holding-period.js 這類相對路徑才不會變成 /tools/house-tax/holding-period.js。
function preferredToolPath(url) {
  const host = url.hostname.toLowerCase();
  const onWorkers = host === WORKERS_HOST;
  const onYc = host === YC_HOST || host === 'www.' + YC_HOST;
  if (!onWorkers && !onYc) return null;
  if (isApiPath(url.pathname) || isYuchengPath(url.pathname)) return null;
  const path = withoutHtml(url.pathname);
  if (path === '/tools' || path === '/tools/') return '/tools/';
  if (path.startsWith('/tools/')) {
    let rest = path.slice('/tools'.length);
    if (rest.length > 1 && rest.endsWith('/')) rest = rest.slice(0, -1);
    if (rest === '/index') return '/tools/';
    return '/tools' + rest;
  }
  const bare = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  if ((onWorkers && (bare === '/' || bare === '/index')) || (!onWorkers && bare === '/index')) return '/tools/';
  if (onWorkers && bare === '/robots.txt') return '/robots.txt';
  if (onWorkers && (bare === '/sitemap.xml' || bare === '/sitemap-tools.xml')) return '/sitemap-tools.xml';
  if (TOOL_PAGES.includes(bare) || QUIZ_PAGES.includes(bare)) return '/tools' + bare;
  return null;
}

function toolMovedTo(url) {
  const destPath = preferredToolPath(url);
  if (!destPath) return null;
  const dest = new URL('https://' + YC_HOST);
  dest.pathname = destPath;
  dest.search = url.search;
  const here = decodePath(url.pathname);
  const samePath = here === destPath || (destPath === '/tools/' && (here === '/tools' || here === '/tools/'));
  if (url.protocol === 'https:' && url.hostname.toLowerCase() === YC_HOST && samePath && here === destPath && url.search === dest.search) {
    return null;
  }
  return dest.toString();
}

function toolSitemapXml() {
  const paths = ['/tools/', ...TOOL_PAGES.map((page) => '/tools' + page), ...QUIZ_PAGES.map((page) => '/tools' + page)];
  const urls = paths.map((p) => {
    const loc = 'https://' + YC_HOST + p.split('/').map((part, i) => (i === 0 ? '' : encodeURIComponent(part))).join('/');
    return '  <url><loc>' + loc.replace(/&/g, '&amp;') + '</loc></url>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n';
}

function sitemapIndexXml() {
  const body = ['sitemap-yucheng.xml', 'sitemap-tools.xml'].map((name) => {
    return '  <sitemap><loc>https://' + YC_HOST + '/' + name + '</loc></sitemap>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</sitemapindex>\n';
}

function requestScheme(url) {
  return url.protocol === 'http:' ? 'http' : 'https';
}

function withHsts(response, scheme) {
  if (scheme !== 'https' || !response) return response;
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', HSTS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function notFoundResponse(request, env) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  };
  if (env && env.ASSETS) {
    const fileUrl = new URL(request.url);
    fileUrl.search = '';
    for (const path of ['/404.html', '/404']) {
      fileUrl.pathname = path;
      const res = await env.ASSETS.fetch(new Request(fileUrl.toString(), { method: 'GET', redirect: 'manual' }));
      if (res.ok) return new Response(res.body, { status: 404, headers });
    }
  }
  return new Response('找不到這個頁面', { status: 404, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const scheme = requestScheme(url);
    const host = url.hostname.toLowerCase();
    // API 不轉址，舊網址的 POST／取圖還能用。
    if (!isApiPath(url.pathname)) {
      const moved = toolMovedTo(url);
      if (moved) return withHsts(Response.redirect(moved, 301), scheme);
      // tcyucheng.com / www 的 http，以及 www 的 https，一次 301 到 https://tcyucheng.com 的同一路徑。
      if ((host === YC_HOST || host === 'www.' + YC_HOST) && (scheme === 'http' || host !== YC_HOST)) {
        const dest = new URL(url.toString());
        dest.protocol = 'https:';
        dest.hostname = YC_HOST;
        dest.port = '';
        return withHsts(Response.redirect(dest.toString(), 301), scheme);
      }
    }
    return withHsts(await withAnalytics(await route(request, env, url), gaMeasurementId(env)), scheme);
  },
};

async function route(request, env, url) {
    // ── CORS headers（允許你的 house-tax 網站呼叫）──
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ── 祐承個人網域 tcyucheng.com ──
    // www 與 http 已在入口轉到 https 主網域。這裡只處理首頁與舊 workers.dev 的祐承頁面。
    const onYc = url.hostname === YC_HOST;
    if (!onYc && /^\/yucheng(-|$|\.html$)/.test(url.pathname)) {
      const to = new URL(url.toString());
      to.protocol = 'https:';
      to.hostname = YC_HOST;
      to.port = '';
      to.pathname = to.pathname === '/yucheng' || to.pathname === '/yucheng.html' ? '/' : to.pathname;
      return Response.redirect(to.toString(), 301);
    }
    if (onYc) {
      if (url.pathname === '/robots.txt') {
        return new Response(`User-agent: *\nAllow: /\n\nSitemap: https://${YC_HOST}/sitemap-yucheng.xml\nSitemap: https://${YC_HOST}/sitemap-tools.xml\n`, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      if (url.pathname === '/sitemap.xml') {
        return new Response(sitemapIndexXml(), {
          headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      if (url.pathname === '/sitemap-tools.xml') {
        return new Response(toolSitemapXml(), {
          headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      if (url.pathname === '/' || url.pathname === '/yucheng' || url.pathname === '/yucheng.html') {
        if (url.pathname !== '/') return Response.redirect(`https://${YC_HOST}/`, 301);
        return env.ASSETS.fetch(new Request(new URL('/yucheng', url).toString(), request));
      }
    }

    const apiPath = (() => {
      let path = decodePath(url.pathname);
      if (path.startsWith('/tools/')) path = path.slice('/tools'.length);
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
      return path;
    })();
    // ── 路由：POST /api/scrape-prop（/tools/api/... 也收，頁面相對路徑才不會斷）──
    if (apiPath === '/api/scrape-prop' && request.method === 'POST') {
      return handleScrapeProp(request, env, cors);
    }

    if (apiPath === '/api/prop-img' && request.method === 'GET') {
      return handlePropImg(url);
    }

    // ── 屋主售屋建議報告書：從信義官網社區頁帶入社區資料、實價登錄、待售、生活機能 ──
    if (apiPath === '/api/sinyi-community' && request.method === 'POST') {
      return handleSinyiCommunity(request, env, cors);
    }
    if (apiPath === '/api/lvr-community' && request.method === 'POST') {
      return handleLvrCommunity(request, env, cors);
    }

    if ((decodePath(url.pathname) === '/tools' || decodePath(url.pathname).startsWith('/tools/')) && env.ASSETS) {
      const decoded = decodePath(url.pathname);
      const assetUrl = new URL(url.toString());
      assetUrl.pathname = decoded === '/tools' || decoded === '/tools/' ? '/' : decoded.slice('/tools'.length);
      const res = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      if (res.status === 404) return notFoundResponse(request, env);
      return res;
    }

    if (url.pathname === '/robots.txt') {
      const body = `User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`;
      return new Response(body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    if (url.pathname === '/sitemap.xml') {
      const urls = SITEMAP_PATHS.map((p) => `  <url><loc>${url.origin}${p === '/' ? '/' : p}</loc></url>`).join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
      return new Response(xml, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // 靜態資產：無副檔名時補 .html（/house-tax → house-tax.html）。
    // 找不到就回 404，不要落到首頁。
    if (env.ASSETS) {
      // html_handling 會自動把 /house-tax 對到 house-tax.html，不要自己補 .html（會和自動轉址互相打轉）。
      // 有結尾斜線時平台會轉回沒有斜線的網址，相對路徑才不會變成 /foo/line-share.js。
      const res = await env.ASSETS.fetch(request);
      if (res.status === 404) return notFoundResponse(request, env);
      return res;
    }
    return notFoundResponse(request, env);
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheRequest(origin, path) {
  return new Request(origin.replace(/\/$/, '') + path, { method: 'GET' });
}

async function cacheMatch(request) {
  try {
    return await caches.default.match(request);
  } catch (err) {
    return null;
  }
}

async function cachePut(request, response) {
  try {
    await caches.default.put(request, response);
  } catch (err) {
    console.error('cache put', err && err.message);
  }
}

const SINYI_DEVICE = {
  machineNo: '',
  ipAddress: '127.0.0.1',
  osType: 4,
  model: 'web',
  deviceVersion: '',
  appVersion: '1',
  deviceType: 3,
  apType: 3,
  browser: 1,
  memberId: '',
  domain: 'www.sinyi.com.tw',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmCode: '',
  requestor: 1,
  utmContent: '',
  utmTerm: '',
  sinyiGroup: 1,
};

// 每段上游連線都用 AbortController 切斷。正式環境對 sinyiwebapi 會掛到逾時，
// 不能只靠 AbortSignal.timeout 再疊 3 次重試。
// fetch() 在收到標頭就結束，本體還可能繼續掛住，所以計時器要蓋到讀完本體。
function openUpstream(url, init, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(200, ms));
  const response = fetch(url, Object.assign({}, init, { signal: ctrl.signal }));
  return { response: response, done: () => clearTimeout(timer) };
}

function within(ms, fn) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    Promise.resolve()
      .then(fn)
      .then((value) => { clearTimeout(timer); resolve(value || null); })
      .catch(() => { clearTimeout(timer); resolve(null); });
  });
}

async function postSinyi(path, body, session, ms) {
  const gate = openUpstream('https://sinyiwebapi.sinyi.com.tw/' + path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: 'https://www.sinyi.com.tw',
      Referer: 'https://www.sinyi.com.tw/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      code: '0',
      sat: (session && session.sat) || '',
      sid: (session && session.sid) || '',
    },
    body: JSON.stringify(Object.assign({}, SINYI_DEVICE, body || {})),
  }, ms);
  try {
    const res = await gate.response;
    if (!res.ok) throw new Error('sinyi api http ' + res.status);
    const data = await res.json();
    if (!data || String(data.retCode) !== '200' || !data.content) {
      throw new Error('sinyi api ' + (data && data.retCode));
    }
    return data.content;
  } finally {
    gate.done();
  }
}

async function getSinyiSession(origin, deadline) {
  const key = cacheRequest(origin, '/__cache/sinyi-session');
  const hit = await cacheMatch(key);
  if (hit) {
    try {
      const saved = await hit.json();
      if (saved && saved.sat && saved.sid) return saved;
    } catch (err) { /* 重新取得 */ }
  }
  const hop = Math.max(400, deadline - Date.now());
  const setup = await postSinyi('appSetup.php', {}, null, hop);
  const sat = String((setup && setup.accessCode) || '');
  if (!sat || Date.now() >= deadline) return null;
  const sess = await postSinyi('getSession.php', {}, { sat: sat, sid: '' }, Math.max(400, deadline - Date.now()));
  const sid = String((sess && sess.sid) || '');
  if (!sid) return null;
  const session = { sat: sat, sid: sid };
  await cachePut(key, new Response(JSON.stringify(session), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' },
  }));
  return session;
}

async function fetchListingApi(code, origin, deadline) {
  const session = await getSinyiSession(origin, deadline);
  if (!session || Date.now() >= deadline) return null;
  const content = await postSinyi('getObjectContent.php', { houseNo: code }, session, Math.max(400, deadline - Date.now()));
  const mapped = logic.listingFromContent(content, code);
  return mapped ? Object.assign({ source: 'api' }, mapped) : null;
}

function failed(code, cors, reason) {
  const messages = {
    'no-browser-credentials': '尚未設定 Browser Rendering 金鑰',
    'browser-429': '瀏覽器額度或速率已滿，請稍後再試',
    'browser-timeout': '讀取逾時',
    budget: '讀取逾時',
  };
  const body = {
    error: messages[reason] || '無法取得物件詳細資料',
    detailFailed: true,
    code: code || '',
  };
  if (reason) body.reason = reason;
  return json(body, 502, cors);
}

async function fetchViaBrowser(code, env) {
  if (!env || !env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return { reason: 'no-browser-credentials' };
  const pageUrl = 'https://www.sinyi.com.tw/buy/house/' + encodeURIComponent(code);
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + '/browser-rendering/content';
  const gate = openUpstream(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.CF_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: pageUrl,
      gotoOptions: { waitUntil: 'domcontentloaded', timeout: 20000 },
    }),
  }, 25000);
  try {
    const res = await gate.response;
    if (!res.ok) {
      console.error('browser status', res.status);
      return { reason: 'browser-' + res.status };
    }
    const payload = await res.json();
    let html = '';
    if (payload && typeof payload.result === 'string') html = payload.result;
    else if (payload && payload.result && typeof payload.result.content === 'string') html = payload.result.content;
    else if (payload && typeof payload.content === 'string') html = payload.content;
    if (!html) return { reason: 'browser-empty' };
    const parsed = logic.parseListingHtml(html, code);
    if (parsed) return Object.assign({ source: 'browser' }, parsed);
    const loose = logic.parseLooseDetail(html.replace(/<[^>]+>/g, ' ').slice(0, 8000), code);
    if (loose && (loose.address || loose.age || loose.price > 0)) return Object.assign({ source: 'browser-text' }, loose);
    return { reason: 'browser-unparsed' };
  } catch (err) {
    const name = (err && (err.name || err.message)) || '';
    console.error('browser failed', code, name);
    return { reason: /abort/i.test(String(name)) ? 'browser-timeout' : 'browser-error' };
  } finally {
    gate.done();
  }
}

async function handleScrapeProp(request, env, cors) {
  let code = '';
  try {
    const body = await request.json();
    code = String((body && body.code) || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return json({ error: '無效的銷售編號', detailFailed: true }, 400, cors);
    }
    const origin = new URL(request.url).origin;
    const BUDGET_MS = 26000;
    const run = async () => {
      const cached = await cacheMatch(cacheRequest(origin, '/__cache/listing/' + code));
      if (cached) {
        try {
          const data = await cached.json();
          if (data && data.code) return Object.assign({}, data, { source: 'cache' });
        } catch (err) { /* 繼續向上游要 */ }
      }
      return fetchViaBrowser(code, env);
    };
    const listing = await Promise.race([
      run(),
      sleep(BUDGET_MS).then(() => ({ detailFailed: true, reason: 'budget' })),
    ]);
    if (!listing || !listing.code) return failed(code, cors, listing && listing.reason);
    await cachePut(cacheRequest(origin, '/__cache/listing/' + code), new Response(JSON.stringify(listing), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    }));
    return json(listing, 200, cors);
  } catch (err) {
    console.error('handleScrapeProp error:', err && err.message);
    return failed(code, cors);
  }
}

function allowedSinyiImage(raw) {
  let parsed;
  try { parsed = new URL(String(raw || '')); } catch (err) { return ''; }
  if (parsed.protocol !== 'https:') return '';
  if (parsed.hostname !== 'res.sinyi.com.tw') return '';
  if (parsed.username || parsed.password) return '';
  if (parsed.pathname.includes('..')) return '';
  return parsed.toString();
}

async function handlePropImg(url) {
  const target = allowedSinyiImage(url.searchParams.get('u'));
  if (!target) return new Response('不允許的圖片網址', { status: 400 });
  const key = cacheRequest(url.origin, '/__cache/img?u=' + encodeURIComponent(target));
  const hit = await cacheMatch(key);
  if (hit) return hit;

  const gate = openUpstream(target, {
    headers: {
      Accept: 'image/avif,image/webp,image/*,*/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: 'https://www.sinyi.com.tw/',
    },
    redirect: 'manual',
  }, 8000);
  let upstream;
  try {
    upstream = await gate.response;
    if (upstream.status >= 300 && upstream.status < 400) {
      const next = allowedSinyiImage(upstream.headers.get('Location'));
      if (!next) return new Response('圖片轉址不允許', { status: 502 });
      gate.done();
      const again = openUpstream(next, { redirect: 'manual' }, 8000);
      try {
        upstream = await again.response;
        if (!upstream.ok) return new Response('圖片不存在', { status: 502 });
        const redirectedType = String(upstream.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        if (!redirectedType.startsWith('image/')) return new Response('不是圖片', { status: 502 });
        const redirectedBytes = await upstream.arrayBuffer();
        if (redirectedBytes.byteLength > 8 * 1024 * 1024) return new Response('圖片過大', { status: 502 });
        const redirected = new Response(redirectedBytes, {
          headers: {
            'Content-Type': redirectedType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff',
          },
        });
        await cachePut(key, redirected.clone());
        return redirected;
      } finally {
        again.done();
      }
    }
    if (!upstream.ok) return new Response('圖片不存在', { status: 502 });
    const type = String(upstream.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) return new Response('不是圖片', { status: 502 });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) return new Response('圖片過大', { status: 502 });
    const res = new Response(bytes, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    await cachePut(key, res.clone());
    return res;
  } catch (err) {
    return new Response('圖片讀取失敗', { status: 502 });
  } finally {
    gate.done();
  }
}

async function fetchListingDirect(code, ms) {
  const pageUrl = `https://www.sinyi.com.tw/buy/house/${encodeURIComponent(code)}`;
  const gate = openUpstream(pageUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    },
  }, ms || 6000);
  try {
    const res = await gate.response;
    if (!res.ok) {
      console.error('direct listing status', code, res.status);
      return { reason: 'html-' + res.status };
    }
    const html = await res.text();
    const parsed = logic.parseListingHtml(html, code);
    if (!parsed) {
      return { reason: (html.includes('__NEXT_DATA__') ? 'html-unparsed-' : 'html-no-data-') + html.length };
    }
    return Object.assign({ source: 'html' }, parsed);
  } catch (err) {
    const name = err && (err.name || err.message) || '';
    console.error('direct listing fetch failed', code, name);
    return { reason: /abort/i.test(name) ? 'html-timeout' : 'html-error' };
  } finally {
    gate.done();
  }
}


// ================================================================
// /api/sinyi-community：讀信義官網社區頁（Browser Rendering /content），取 __NEXT_DATA__ 的社區資料。
// 輸入 {id} 或 {url}，回傳精簡後的社區資料。快取 6 小時。
// ================================================================
const r2 = (v) => Math.round(Number(v) * 100) / 100;

export function parseSinyiCommunity(html, id) {
  const m = String(html || '').match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch (err) { return null; }
  const st = (data && data.props && data.props.initialReduxState) || {};
  const c = st.communityReducer || {};
  const cc = c.communityContentList || {};
  if (!cc.name) return null;
  const trades = (Array.isArray(c.tradeData) ? c.tradeData : []).map((t) => {
    const sd = String(t.soldDate || '');
    const pping = Number(t.refparkingping || t.parkingRange || 0) || 0;
    const pprice = Number(t.parkingprice || t.refparkingprice || 0) || 0;
    const area = Number(t.areaBuilding) || 0;
    return {
      ym: sd.length >= 5 ? sd.slice(0, sd.length - 2) + '/' + sd.slice(-2) : sd,
      floor: t.floor ? String(t.floor) + '樓' : '',
      totalFloor: t.totalfloor ? String(t.totalfloor) : '',
      ping: area ? String(r2(area - pping)) : '',
      pping: pping ? String(r2(pping)) : '',
      pprice: String(Math.round(pprice)),
      total: t.totalPrice != null ? String(t.totalPrice) : '',
      layout: t.layout || '',
      special: t.special || null,
    };
  }).filter((t) => t.total && t.ping);
  const myId = String(cc.commId || id);
  const listings = (c.communityObj && Array.isArray(c.communityObj.object) ? c.communityObj.object : []).filter((o) => String(o.commId || '') === myId).map((o) => {
    const gross = Number(o.areaBuilding) || 0;
    const pping = Number(o.parkingRange || o.areaParking || o.refparkingping || 0) || 0;
    const house = gross ? r2(Math.max(0, gross - pping)) : 0;
    return {
      floor: o.floor ? String(o.floor) + '樓' : '',
      ping: house ? String(house) : (gross ? String(r2(gross)) : ''),
      pping: pping ? String(r2(pping)) : '',
      layout: o.totalLayout || o.layout || '',
      price: o.totalPrice != null ? String(o.totalPrice) : '',
      title: o.name || '',
    };
  });
  const typeOf = { A: 'mrt', B: 'school', C: 'shop', D: 'hospital', E: 'park', F: 'pet' };
  const life = [];
  const groups = (c.communityDetailList && Array.isArray(c.communityDetailList.utilitylifeInfo)) ? c.communityDetailList.utilitylifeInfo : [];
  groups.forEach((g) => (g.poiList || []).forEach((sub) => (sub.pois || []).slice(0, 2).forEach((p) => {
    life.push({ name: p.title, type: typeOf[g.utilityType] || 'other', d: Math.round(Number(p.distance) || 0), lat: p.poiLatitude, lng: p.poiLongitude });
  })));
  life.sort((a, b) => a.d - b.d);
  return {
    ok: true,
    id: cc.commId || id,
    name: cc.name,
    address: toHalf(cc.address),
    district: cc.zipName || '',
    age: cc.age || '',
    floors: cc.floorRange ? toHalf(cc.floorRange) + '樓' : '',
    houseCount: cc.houseCount || '',
    layout: cc.layout || '',
    publicPercent: cc.publicpercent || '',
    amenities: cc.publicDesc || '',
    developer: cc.constructCompany || '',
    structure: cc.buildingStructure || '',
    wall: cc.wallStructure || '',
    guard: cc.hasmanager || '',
    typeCode: cc.houselandtype || '',
    lat: cc.latitude || null,
    lng: cc.longitude || null,
    images: (Array.isArray(cc.images) ? cc.images : []).filter((u) => typeof u === 'string').slice(0, 6),
    tradeCount: c.tradeCount || trades.length,
    trades: trades,
    listings: listings,
    life: life.slice(0, 12),
    url: 'https://www.sinyi.com.tw/communitylist/communityinfo/' + (cc.commId || id),
  };
}

async function handleSinyiCommunity(request, env, cors) {
  let id = '';
  try {
    const body = await request.json();
    const raw = String((body && (body.id || body.url)) || '').trim();
    const m = raw.match(/communityinfo\/([A-Za-z0-9]{5,12})/) || raw.match(/^([A-Za-z0-9]{5,12})$/);
    id = m ? m[1].toUpperCase() : '';
    if (!id) return json({ ok: false, error: '請貼上信義房屋社區頁的連結或社區編號' }, 400, cors);
    const origin = new URL(request.url).origin;
    const key = cacheRequest(origin, '/__cache/sinyi-community-v2/' + id);
    const hit = await cacheMatch(key);
    if (hit) {
      try { const data = await hit.json(); if (data && data.ok) return json(Object.assign({}, data, { source: 'cache' }), 200, cors); } catch (err) { /* 重新讀取 */ }
    }
    if (!env || !env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return json({ ok: false, error: '尚未設定 Browser Rendering 金鑰' }, 502, cors);
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + '/browser-rendering/content';
    const gate = openUpstream(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.CF_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.sinyi.com.tw/communitylist/communityinfo/' + encodeURIComponent(id), gotoOptions: { waitUntil: 'domcontentloaded', timeout: 20000 } }),
    }, 25000);
    let html = '';
    try {
      const res = await gate.response;
      if (!res.ok) return json({ ok: false, error: res.status === 429 ? '讀取次數太頻繁，請稍後再試' : '信義官網暫時讀不到' }, 502, cors);
      const payload = await res.json();
      if (payload && typeof payload.result === 'string') html = payload.result;
      else if (payload && payload.result && typeof payload.result.content === 'string') html = payload.result.content;
    } finally {
      gate.done();
    }
    const data = parseSinyiCommunity(html, id);
    if (!data) return json({ ok: false, error: '讀不到這個社區的資料，請確認連結是信義房屋社區頁' }, 502, cors);
    data.fetchedAt = new Date().toISOString().slice(0, 10);
    await cachePut(key, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600' } }));
    return json(data, 200, cors);
  } catch (err) {
    console.error('handleSinyiCommunity error:', id, err && (err.name || err.message));
    return json({ ok: false, error: /abort/i.test(String(err && (err.name || err.message))) ? '讀取逾時，請再試一次' : '讀取失敗，請稍後再試' }, 502, cors);
  }
}

// ================================================================
// /api/lvr-community：用門牌查近 3 年實價登錄（內政部開放資料，data/lvr-idx/<行政區>.json）。
// ================================================================
async function handleLvrCommunity(request, env, cors) {
  try {
    const body = await request.json();
    const address = String((body && body.address) || '');
    const tm = toHalf(address).match(/(?:臺中市|台中市)?\s*([^\s\d市]{1,3}?區)/);
    const town = tm ? tm[1] : '';
    if (!town || !lvrKey(address)) return json({ ok: false, error: '地址要包含行政區與門牌號碼' }, 400, cors);
    if (!env || !env.ASSETS) return json({ ok: false, error: '資料暫時讀不到' }, 502, cors);
    const res = await env.ASSETS.fetch(new Request(new URL('/data/lvr-idx/' + encodeURIComponent(town) + '.json', request.url).toString()));
    if (!res.ok) return json({ ok: false, error: town + '的實價登錄資料尚未建立', town: town, covered: false }, 404, cors);
    const idx = await res.json();
    const found = selectLvrRows(idx.data || {}, address, body || {});
    const rows = found.rows;
    // 車位沒分開計價時的推估：先用同社區有分開計價的同類車位，沒有再用當區近 3 年同類車位中位數
    const commPark = {};
    rows.forEach((r) => { if (r[5] > 0 && r[6]) (commPark[r[6]] = commPark[r[6]] || []).push(r[5]); });
    const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const townPark = idx.park || {};
    const out = rows.map((r) => {
      const d = String(r[0]);
      const pingAll = r[3] * 0.3025, pp = r[4] * 0.3025;
      let pest = '', pestSrc = '';
      if (!(r[5] > 0) && pp > 0) {
        if (commPark[r[6]]) { pest = String(Math.round(med(commPark[r[6]]) / 1e4)); pestSrc = 'community'; }
        else if (townPark[r[6]]) { pest = String(Math.round(townPark[r[6]][0] / 1e4)); pestSrc = 'town'; }
      }
      return {
        ym: d.slice(0, d.length - 4) + '/' + d.slice(-4, -2),
        floor: r[1] ? r[1] + '樓' : '',
        total: String(Math.round(r[2] / 1e4)),
        ping: String(Math.round((pingAll - pp) * 100) / 100),
        pping: pp ? String(Math.round(pp * 100) / 100) : '',
        pprice: String(Math.round(r[5] / 1e4)),
        priced: r[5] > 0 || !pp,
        pest: pest,
        pestSrc: pestSrc,
        ptype: r[6] || '',
        layout: r[7] !== '' ? r[7] + '房' + r[8] + '廳' + r[9] + '衛' : '',
        note: r[10] || '',
      };
    });
    return json({ ok: true, town: town, key: found.key, addrs: found.addrs, latest: idx.latest, hint: found.hint, rows: out }, 200, cors);
  } catch (err) {
    console.error('handleLvrCommunity error:', err && err.message);
    return json({ ok: false, error: '讀取失敗，請稍後再試' }, 502, cors);
  }
}
