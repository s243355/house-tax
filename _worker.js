// ================================================================
// 信義房屋物件比較 - Cloudflare Worker
//
// /api/scrape-prop 先直接讀取信義物件頁 HTML（頁內 __NEXT_DATA__ 已含
// 案名、路段、總價、建坪、屋齡、樓層、車位類型、停車空間坪數、管理費）。
// 不需要 Browser Rendering，也不要在程式裡寫入任何金鑰。
//
// 若直接讀取失敗（信義改版，或 Cloudflare 連線被擋），且 Worker 有設定
// 下列變數，才會改走 Browser Rendering /content：
//   CF_ACCOUNT_ID  → Cloudflare Account ID（純文字變數）
//   CF_API_TOKEN   → API Token，權限 Account > Browser Rendering > Edit（Secret）
// Browser Rendering 是付費附加功能，須在 Cloudflare 帳號另行開通。
// 程式沒有使用 ANTHROPIC_KEY，不必為這個工具建立 Anthropic 金鑰。
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

async function handleScrapeProp(request, env, cors) {
  let code = '';
  try {
    const body = await request.json();
    code = String((body && body.code) || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return json({ error: '無效的銷售編號', detailFailed: true }, 400, cors);
    }

    const direct = await fetchListingDirect(code);
    if (direct) return json(direct, 200, cors);

    if (env && env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
      const viaBrowser = await fetchViaBrowserRendering(code, env);
      if (viaBrowser) return json(viaBrowser, 200, cors);
    }

    return json({ error: '無法取得物件詳細資料', detailFailed: true, code }, 502, cors);
  } catch (err) {
    console.error('handleScrapeProp error:', err && err.message);
    return json({ error: '無法取得物件詳細資料', detailFailed: true, code }, 500, cors);
  }
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
