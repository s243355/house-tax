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
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === '/api/scrape-prop' && request.method === 'POST') {
      return handleScrapeProp(request, env, cors);
    }

return env.ASSETS.fetch(request);
  }
};

async function handleScrapeProp(request, env, cors) {
  let code = '';
  try {
    const body = await request.json();
    code = body.code || '';

    if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
      return json({ error: '無效的銷售編號' }, 400, cors);
    }

    const pageUrl = `https://www.sinyi.com.tw/buy/house/${code}/243355?openExternalBrowser=1`;

    // ── Step 1：用 Browser Rendering 截圖 ──
    console.log(`[${code}] 開始截圖...`);
    const snapRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/snapshot`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: pageUrl,
          screenshotOptions: {
            type: 'jpeg',
            quality: 80,
            fullPage: false,   // 只截可視區域（物件資訊在上方）
          },
          viewport: { width: 1280, height: 900 },
          // 等待屋齡相關元素出現（JS 渲染完成）
          gotoOptions: {
            waitUntil: 'networkidle0',
            timeout: 25000,
          },
        })
      }
    );

    if (!snapRes.ok) {
      const err = await snapRes.text();
      console.error(`[${code}] snapshot 失敗:`, err);
      // fallback：改用 HTML content 解析 meta
      return fallbackMeta(code, pageUrl, env, cors);
    }

    const snapData = await snapRes.json();

    // snapshot 回傳的截圖是 base64
    const screenshotB64 = snapData.screenshot;
    const htmlContent   = snapData.content || '';

    if (!screenshotB64) {
      console.warn(`[${code}] 無截圖，改用 HTML 解析`);
      return fallbackMeta(code, pageUrl, env, cors);
    }

    // ── Step 2：把截圖送給 Claude Vision OCR ──
    console.log(`[${code}] 截圖完成，送 OCR...`);
    const ocrResult = await claudeOCR(screenshotB64, htmlContent, code, env);

    return json(ocrResult, 200, cors);

  } catch (err) {
    console.error(`[${code}] 錯誤:`, err.message);
    return json({ error: err.message, code }, 500, cors);
  }
}

// ── Claude Vision OCR：辨識截圖中的物件資料 ──
async function claudeOCR(screenshotB64, htmlContent, code, env) {
  // 從 HTML meta 先拿到部分資料（title、路段、格局、總價）
  const metaData = parseMeta(htmlContent, code);

  const prompt = `這是信義房屋物件頁面的截圖（銷售編號：${code}）。
請從截圖中辨識並提取以下資料，只回傳 JSON 不要任何說明：

{
  "title": "物件案名（例如【專任】近中山醫三房平車）",
  "community": "社區名稱（例如親家M3）",
  "address": "路段（只要路名，例如工學北路）",
  "price": 數字（萬元，例如1938）,
  "area": 數字（建坪坪數，例如50.4）,
  "mainArea": 數字（主+陽坪數，例如28.52）,
  "rooms": "格局（例如3房2廳2衛）",
  "age": 數字（屋齡年，例如11.5）,
  "floor": 數字（所在樓層，例如4）,
  "totalFloor": 數字（總樓層，例如26）,
  "hasPark": true或false,
  "parkType": "車位類型（例如坡道平面、機械、無）",
  "mgmtFee": 數字（管理費元/月，例如3500，沒有填0）
}

已知資訊（可輔助確認）：${JSON.stringify(metaData)}
截圖中應能看到：屋齡、樓層（X樓/XX樓）、管理費（元/月）、車位類型等。`;

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: screenshotB64,
            }
          },
          {
            type: 'text',
            text: prompt,
          }
        ]
      }]
    })
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    console.error('Claude API 錯誤:', err);
    // fallback 用 meta 資料
    return metaData;
  }

  const claudeData = await claudeRes.json();
  const rawText = claudeData.content?.find(b => b.type === 'text')?.text || '{}';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return metaData;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // 合併：OCR 結果優先，meta 補缺漏
    return {
      code,
      title:      parsed.title      || metaData.title,
      community:  parsed.community  || metaData.community,
      address:    parsed.address    || metaData.address,
      price:      parsed.price      || metaData.price,
      area:       parsed.area       || metaData.area,
      mainArea:   parsed.mainArea   || metaData.mainArea,
      rooms:      parsed.rooms      || metaData.rooms,
      age:        parsed.age        || 0,
      floor:      parsed.floor      || 0,
      totalFloor: parsed.totalFloor || 0,
      hasPark:    parsed.hasPark    ?? metaData.hasPark,
      parkType:   parsed.parkType   || metaData.parkType,
      mgmtFee:    parsed.mgmtFee    || 0,
      img: `https://res.sinyi.com.tw/buy/${code}/bigimg/A.JPG`,
    };
  } catch (e) {
    console.error('JSON 解析失敗:', e.message, rawText.slice(0, 200));
    return metaData;
  }
}

// ── fallback：只用 HTML meta 解析（無截圖時）──
async function fallbackMeta(code, pageUrl, env, cors) {
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
          gotoOptions: { waitUntil: 'domcontentloaded', timeout: 15000 },
        })
      }
    );
    const { content: html } = await contentRes.json();
    return json(parseMeta(html, code), 200, cors);
  } catch (e) {
    return json({ error: e.message, code }, 500, cors);
  }
}

// ── 從 HTML 解析 meta 資料（title、路段、格局、總價等）──
function parseMeta(html, code) {
  const get = (re) => { const m = (html||'').match(re); return m ? m[1].trim() : ''; };

  // og:title：【案名】｜社區｜...
  const ogTitle = get(/og:title[^>]*content="([^"]+)"/i) ||
                  get(/<title>([^<]+)<\/title>/i);
  const titleM  = ogTitle.match(/^([^｜]+)/);
  const title   = titleM ? titleM[1].trim() : '';
  const commM   = ogTitle.match(/｜([^｜]+)｜/);
  const community = commM ? commM[1].trim() : '';

  // meta-description
  const desc = get(/meta-description:\s*([^\n]+)/) ||
               get(/og:description[^>]*content="([^"]+)"/i);

  const roadM = desc.match(/位於[^\s，,]+([^\s，,]+[路街道巷弄])/);
  const address = roadM ? roadM[1] : '';

  const priceM = desc.match(/總價\s*([\d,]+)\s*萬/);
  const price  = priceM ? parseFloat(priceM[1].replace(/,/g,'')) : 0;

  const areaM = desc.match(/建坪\s*([\d.]+)/);
  const area  = areaM ? parseFloat(areaM[1]) : 0;

  const mainAreaM = desc.match(/主\+陽[^坪]*([\d.]+)\s*坪/);
  const mainArea  = mainAreaM ? parseFloat(mainAreaM[1]) : 0;

  const roomsM = desc.match(/(\d+房\d+廳\d+衛)/);
  const rooms  = roomsM ? roomsM[1] : '';

  const hasPark = title.includes('平車') || title.includes('車位') || desc.includes('車位');
  const parkType = title.includes('坡道') ? '坡道平面' :
                   title.includes('機械') ? '機械式' :
                   hasPark ? '有車位' : '無';

  return {
    code, title, community, address,
    price, area, mainArea, rooms,
    age: 0, floor: 0, totalFloor: 0,
    hasPark, parkType, mgmtFee: 0,
    img: `https://res.sinyi.com.tw/buy/${code}/bigimg/A.JPG`,
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
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
