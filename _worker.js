// ================================================================
// 信義房屋物件比較工具 - Cloudflare Worker
// 使用 Browser Rendering /snapshot 截圖 + Claude Vision OCR 解析
//
// 環境變數（Worker Settings → Variables）：
//   CF_ACCOUNT_ID  → Cloudflare Account ID
//   CF_API_TOKEN   → Browser Rendering API Token（Account > Browser Rendering > Edit）
//   ANTHROPIC_KEY  → Anthropic API Key（console.anthropic.com → API Keys）
// ================================================================

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

    // ── 其他路徑：serving static files（你原本的 Worker 邏輯）──
    // 如果你的 Worker 有處理靜態檔案，把原本的邏輯加在這裡
    return new Response('Not Found', { status: 404 });
  }
};

async function handleScrapeProp(request, env, cors) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
      return new Response(JSON.stringify({ error: '無效的銷售編號' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const pageUrl = `https://www.sinyi.com.tw/buy/house/${code}/243355?openExternalBrowser=1`;

    // ── 呼叫 Cloudflare Browser Rendering /scrape endpoint ──
    // 等待頁面 JS 完全執行後抓取特定 CSS selector 的文字內容
    const scrapeRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/scrape`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: pageUrl,
          // 等待屋齡元素出現（表示 JS 已渲染完成）
          waitForSelector: '[class*="HouseAge"], [class*="house-age"], .detail-info, [class*="detailInfo"]',
          // 逾時 20 秒
          gotoOptions: { waitUntil: 'networkidle0', timeout: 20000 },
          // 抓取這些元素
          elements: [
            // 標題、社區、路段
            { selector: 'h1' },
            { selector: '[class*="community"], [class*="Community"]' },
            { selector: '[class*="address"], [class*="Address"]' },
            // 基本資料
            { selector: '[class*="HouseAge"], [class*="houseAge"]' },
            { selector: '[class*="pattern"], [class*="Pattern"], [class*="layout"]' },
            { selector: '[class*="floor"], [class*="Floor"]' },
            { selector: '[class*="buildingArea"], [class*="BuildingArea"], [class*="building-area"]' },
            // 管理費
            { selector: '[class*="manage"], [class*="Manage"], [class*="mgmt"]' },
            // 車位
            { selector: '[class*="park"], [class*="Park"], [class*="parking"]' },
            // 價格
            { selector: '[class*="price"], [class*="Price"]' },
            // 備用：抓整個詳情區塊
            { selector: '[class*="detail"], [class*="Detail"]' },
          ]
        })
      }
    );

    if (!scrapeRes.ok) {
      const errText = await scrapeRes.text();
      console.error('Browser Rendering error:', errText);

      // fallback：改用 /content 拿完整 HTML，再用 regex 解析
      return fallbackContent(code, pageUrl, env, cors);
    }

    const scrapeData = await scrapeRes.json();

    // ── 從抓到的元素解析資料 ──
    const result = parseScrapedData(scrapeData, code);
    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('handleScrapeProp error:', err);
    return new Response(JSON.stringify({ error: err.message, code: '' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}

// ── fallback：用 /content 拿 HTML 後 regex 解析 ──
async function fallbackContent(code, pageUrl, env, cors) {
  try {
    const contentRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/content`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: pageUrl,
          waitForSelector: 'h1',
          gotoOptions: { waitUntil: 'networkidle0', timeout: 20000 },
        })
      }
    );

    if (!contentRes.ok) {
      return new Response(JSON.stringify({ error: 'Browser Rendering 無法存取', code }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const { content: html } = await contentRes.json();
    const result = parseHtml(html, code);
    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, code }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
}

// ── 解析 scrape 回傳的元素 ──
function parseScrapedData(data, code) {
  // 把所有元素的 innerText 合在一起方便 regex 解析
  const texts = (data.result?.results || [])
    .flatMap(r => r.results || [])
    .map(el => el.innerText || el.innerHTML || '')
    .join('\n');

  return parseText(texts, code);
}

// ── 解析 HTML 字串 ──
function parseHtml(html, code) {
  // 移除標籤，只保留文字
  const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ');
  return parseText(text, code);
}

// ── 核心解析邏輯：從文字中提取各欄位 ──
function parseText(text, code) {
  // og:title 格式：【案名】｜社區｜台中市...
  const titleM = text.match(/【([^】]+)】/);
  const title = titleM ? `【${titleM[1]}】` : '';

  // 社區名（｜之間）
  const commM = text.match(/｜([^｜\s]+(?:社區|大廈|花園|苑|閣|居|莊|廣場|M\d|[A-Z]\d))/);
  const community = commM ? commM[1] : '';

  // 路段
  const roadM = text.match(/位於[^\s，,]+([^\s，,]+[路街道巷弄])/);
  const address = roadM ? roadM[1] : '';

  // 總價（萬）
  const priceM = text.match(/(\d[\d,]+)\s*萬/);
  const price = priceM ? parseFloat(priceM[1].replace(/,/g, '')) : 0;

  // 建坪
  const areaM = text.match(/建坪\s*([\d.]+)\s*坪/);
  const area = areaM ? parseFloat(areaM[1]) : 0;

  // 主建物坪
  const mainAreaM = text.match(/主\+陽[^坪]*?([\d.]+)\s*坪/);
  const mainArea = mainAreaM ? parseFloat(mainAreaM[1]) : 0;

  // 格局
  const roomsM = text.match(/(\d+房\d+廳\d+衛)/);
  const rooms = roomsM ? roomsM[1] : '';

  // 屋齡（年）
  const ageM = text.match(/([\d.]+)\s*年/);
  const age = ageM ? parseFloat(ageM[1]) : 0;

  // 樓層：X樓/XX樓
  const floorM = text.match(/(\d+)\s*樓\s*[/／]\s*(\d+)\s*樓/);
  const floor = floorM ? parseInt(floorM[1]) : 0;
  const totalFloor = floorM ? parseInt(floorM[2]) : 0;

  // 車位
  const parkM = text.match(/(坡道平面|坡道機械|平面式|機械式|坡道|升降機械|升降平面)/);
  const parkType = parkM ? parkM[1] : (text.includes('平車') || text.includes('車位') ? '有車位' : '無');
  const hasPark = parkType !== '無';

  // 管理費（元/月）
  const mgmtM = text.match(/管理費[^0-9]*?([\d,]+)\s*元/);
  const mgmtFee = mgmtM ? parseInt(mgmtM[1].replace(/,/g, '')) : 0;

  return {
    code,
    title,
    community,
    address,
    price,
    area,
    mainArea,
    rooms,
    age,
    floor,
    totalFloor,
    hasPark,
    parkType,
    mgmtFee,
    img: `https://res.sinyi.com.tw/buy/${code}/bigimg/A.JPG`
  };
}
