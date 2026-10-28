// ================================================================
// 信義房屋物件比較 - Cloudflare Worker
//
// 正式站 workers.dev 只由 Cloudflare Workers Builds 部署。
// GitHub Actions 的 pages-build-deployment 只發佈 GitHub Pages，不會更新 workers.dev。
//
// /api/scrape-prop：Cache API（命中就不再開瀏覽器）→ Browser Rendering /content。
// 信義頁面與 sinyiwebapi 從 Cloudflare 出口會掛住，不要先打它們。
// 單筆硬逾時 25 秒。前端一次只打一筆，以符合免費方案 Quick Actions 約 1 次/10 秒。
// 金鑰只用環境變數 CF_ACCOUNT_ID、CF_API_TOKEN，不要寫進程式。
// /api/prop-img 只轉送 https://res.sinyi.com.tw/ 的圖。
// ================================================================
import logic from "./prop-compare-logic.js";

const SITEMAP_PATHS = [
  '/',
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
];

function notFoundHtml() {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>找不到頁面｜祐承店長 信義房屋 文心高工店</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{min-height:100vh;background:#f5f3f0;color:#1a1410;font-family:"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;display:flex;flex-direction:column;}
  header{background:#fff;border-bottom:3px solid #C00000;height:64px;display:flex;align-items:center;padding:0 24px;font-weight:700;color:#C00000;letter-spacing:.08em;}
  main{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px;}
  .box{max-width:460px;text-align:center;}
  h1{font-size:1.6rem;margin-bottom:12px;}
  p{color:#5a4e44;line-height:1.7;margin-bottom:22px;}
  a{display:inline-block;background:#C00000;color:#fff;text-decoration:none;padding:10px 22px;font-weight:600;}
  a:hover{background:#9a0000;}
</style>
</head>
<body>
<header>祐承店長 信義房屋 文心高工店</header>
<main>
  <div class="box">
    <h1>找不到這個頁面</h1>
    <p>這個網址沒有對應的內容。請回到首頁，選擇房地合一稅、舊制、重購退稅或其他試算工具。</p>
    <a href="/">回首頁</a>
  </div>
</main>
</body>
</html>`;
}

function notFoundResponse() {
  return new Response(notFoundHtml(), {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS headers（允許你的 house-tax 網站呼叫）──
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // ── 路由：POST /api/scrape-prop ──
    if (url.pathname === '/api/scrape-prop' && request.method === 'POST') {
      return handleScrapeProp(request, env, cors);
    }

    if (url.pathname === '/api/prop-img' && request.method === 'GET') {
      return handlePropImg(url);
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
      if (url.pathname !== '/' && !url.pathname.includes('.')) {
        const trimmed = url.pathname.replace(/\/+$/, '');
        const newUrl = new URL(request.url);
        newUrl.pathname = (trimmed || '/') + '.html';
        const res = await env.ASSETS.fetch(new Request(newUrl.toString(), request));
        if (res.status !== 404) return res;
        return notFoundResponse();
      }
      const res = await env.ASSETS.fetch(request);
      if (res.status === 404) return notFoundResponse();
      return res;
    }
    return notFoundResponse();
  }
};

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

