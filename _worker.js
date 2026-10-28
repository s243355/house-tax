// ================================================================
// 信義房屋物件比較 - Cloudflare Worker
//
// /api/scrape-prop：先查 Cache API（免費，不必開 KV，成功結果留 30 分鐘），
// 再打信義公開 JSON（getObjectContent，失敗退避重試），然後才讀物件頁 HTML。
// 以上都失敗、且有設定金鑰時，才用 Browser Rendering（一次容易撞上併發上限）。
// 不要把任何金鑰寫進程式。
//
// Browser Rendering 備援才需要（付費附加功能）：
//   CF_ACCOUNT_ID  → Cloudflare Account ID（純文字變數）
//   CF_API_TOKEN   → API Token，權限 Account > Browser Rendering > Edit（Secret）
// 程式沒有使用 ANTHROPIC_KEY。
// /api/prop-img 只轉送 https://res.sinyi.com.tw/ 的圖，並加上 CORS，供 PDF 使用。
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

async function withRetry(fn, tries, label) {
  for (let i = 0; i < tries; i++) {
    try {
      const value = await fn(i);
      if (value) return value;
    } catch (err) {
      console.error(label, 'attempt', i + 1, err && err.message);
    }
    if (i < tries - 1) await sleep(350 * (i + 1) + Math.floor(Math.random() * 250));
  }
  return null;
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

async function postSinyi(path, body, session) {
  const res = await fetch('https://sinyiwebapi.sinyi.com.tw/' + path, {
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
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error('sinyi api http ' + res.status);
  const data = await res.json();
  if (!data || String(data.retCode) !== '200' || !data.content) {
    throw new Error('sinyi api ' + (data && data.retCode));
  }
  return data.content;
}

async function getSinyiSession(origin, fresh) {
  const key = cacheRequest(origin, '/__cache/sinyi-session');
  if (!fresh) {
    const hit = await cacheMatch(key);
    if (hit) {
      try {
        const saved = await hit.json();
        if (saved && saved.sat && saved.sid) return saved;
      } catch (err) { /* 重新取得 */ }
    }
  }
  const setup = await postSinyi('appSetup.php', {}, null);
  const sat = String((setup && setup.accessCode) || '');
  if (!sat) throw new Error('no access code');
  const sess = await postSinyi('getSession.php', {}, { sat: sat, sid: '' });
  const sid = String((sess && sess.sid) || '');
  if (!sid) throw new Error('no session');
  const session = { sat: sat, sid: sid };
  await cachePut(key, new Response(JSON.stringify(session), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' },
  }));
  return session;
}

async function fetchListingApi(code, origin, freshSession) {
  const session = await getSinyiSession(origin, freshSession);
  const content = await postSinyi('getObjectContent.php', { houseNo: code }, session);
  const mapped = logic.listingFromContent(content, code);
  return mapped ? Object.assign({ source: 'api' }, mapped) : null;
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
    const cached = await cacheMatch(cacheRequest(origin, '/__cache/listing/' + code));
    if (cached) {
      const data = await cached.json();
      if (data && data.code) return json(Object.assign({}, data, { source: data.source || 'cache' }), 200, cors);
    }

    let listing = await withRetry((i) => fetchListingApi(code, origin, i > 0), 3, 'json');
    if (!listing) listing = await withRetry(() => fetchListingDirect(code), 2, 'html');
    if (!listing && env && env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
      listing = await withRetry(() => fetchViaBrowserRendering(code, env), 2, 'browser');
    }
    if (!listing) {
      return json({ error: '無法取得物件詳細資料', detailFailed: true, code }, 502, cors);
    }
    await cachePut(cacheRequest(origin, '/__cache/listing/' + code), new Response(JSON.stringify(listing), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
    }));
    return json(listing, 200, cors);
  } catch (err) {
    console.error('handleScrapeProp error:', err && err.message);
    return json({ error: '無法取得物件詳細資料', detailFailed: true, code }, 500, cors);
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

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: {
        Accept: 'image/avif,image/webp,image/*,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: 'https://www.sinyi.com.tw/',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
  } catch (err) {
    return new Response('圖片讀取失敗', { status: 502 });
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    const next = allowedSinyiImage(upstream.headers.get('Location'));
    if (!next) return new Response('圖片轉址不允許', { status: 502 });
    try {
      upstream = await fetch(next, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
    } catch (err) {
      return new Response('圖片讀取失敗', { status: 502 });
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
}

async function fetchListingDirect(code) {
  const pageUrl = `https://www.sinyi.com.tw/buy/house/${encodeURIComponent(code)}`;
  let res;
  try {
    res = await fetch(pageUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-TW,zh;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error('direct listing fetch failed', code, err && err.message);
    return null;
  }
  if (!res.ok) {
    console.error('direct listing status', code, res.status);
    return null;
  }
  const html = await res.text();
  const parsed = logic.parseListingHtml(html, code);
  if (!parsed) return null;
  return Object.assign({ source: 'html' }, parsed);
}

// 直接讀取失敗時才使用。需要帳號已開通 Browser Rendering，以及 CF_ACCOUNT_ID / CF_API_TOKEN。
async function fetchViaBrowserRendering(code, env) {
  const pageUrl = `https://www.sinyi.com.tw/buy/house/${encodeURIComponent(code)}`;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/content`;
  try {
    const contentRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: pageUrl,
        gotoOptions: { waitUntil: 'domcontentloaded', timeout: 20000 },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!contentRes.ok) {
      console.error('Browser Rendering content status', contentRes.status);
      return null;
    }
    const payload = await contentRes.json();
    const html = payload && (payload.result || payload.content || '');
    const parsed = typeof html === 'string' ? logic.parseListingHtml(html, code) : null;
    if (parsed) return Object.assign({ source: 'browser' }, parsed);
    const loose = logic.parseLooseDetail(typeof html === 'string' ? html.replace(/<[^>]+>/g, ' ').slice(0, 8000) : '', code);
    return loose ? Object.assign({ source: 'browser-text' }, loose) : null;
  } catch (err) {
    console.error('Browser Rendering failed', err && err.message);
    return null;
  }
}
