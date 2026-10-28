// 物件比較：貼上訊息解析、扣車單價、分享連結消毒、信義物件頁解析。
// 瀏覽器以 <script> 載入（window.PropCompare）；測試以 require 使用。
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.PropCompare = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PARK_HINT = /(平車|機械車|坡道|車位)/;
  var ROAD_TAIL = /([\u4e00-\u9fff]{1,12}[路街道巷](?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?)\s*$/;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(url, kind) {
    if (typeof url !== "string") return "";
    var u = url.trim();
    if (!u || /[\u0000-\u0020"'<>\\]/.test(u)) return "";
    if (kind === "img") return /^https:\/\/res\.sinyi\.com\.tw\//i.test(u) ? u : "";
    if (/^https:\/\/(www\.)?sinyi\.com\.tw\//i.test(u)) return u;
    if (/^https:\/\/sinyi\.in\//i.test(u)) return u;
    if (/^https:\/\/res\.sinyi\.com\.tw\//i.test(u)) return u;
    return "";
  }

  function mentionsParking(text) {
    return PARK_HINT.test(String(text || ""));
  }

  function toAsciiDigits(s) {
    return String(s || "").replace(/[０-９]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30);
    });
  }

  function formatPhone(raw) {
    var d = toAsciiDigits(raw).replace(/\D/g, "");
    if (/^09\d{8}$/.test(d)) return d.slice(0, 4) + "-" + d.slice(4, 7) + "-" + d.slice(7);
    return String(raw || "").replace(/\s+/g, " ").trim();
  }

  function parseHeader(text) {
    var src = String(text || "");
    var agent = "";
    var phone = "";
    var store = "";
    var am = src.match(/信義房屋([^\n]{0,30}?店)[ \t\u3000]+([^\s\d：:\n]{2,12})/);
    if (am) {
      store = am[1].trim();
      agent = am[2].trim();
    }
    if (!agent) {
      var am2 = src.match(/(?:業務員|經紀人員|經紀人)[：:\s]+([^\s\d：:\n]{2,12})/);
      if (am2) agent = am2[1].trim();
    }
    var pm = src.match(/服務專線[：:]\s*([0-9０-９\-–—\s]{8,20})/);
    if (pm) phone = formatPhone(pm[1]);
    return { agent: agent, phone: phone, store: store };
  }

  function parsePriceWan(block) {
    var m = String(block || "").match(/總價[：:]\s*([^\n]{1,48})/);
    if (!m) return 0;
    var s = toAsciiDigits(m[1]).replace(/[，,\s　]/g, "").replace(/．/g, ".");
    var yi = 0;
    var wan = 0;
    var saw = false;
    var ym = s.match(/([0-9]+(?:\.[0-9]+)?)億/);
    if (ym) { yi = parseFloat(ym[1]) * 10000; saw = true; }
    var wm = s.match(/([0-9]+(?:\.[0-9]+)?)萬/);
    if (wm) { wan = parseFloat(wm[1]); saw = true; }
    if (saw) return Math.round((yi + wan) * 100) / 100;
    var nm = s.match(/([0-9]+(?:\.[0-9]+)?)/);
    return nm ? parseFloat(nm[1]) : 0;
  }

  function parseArea(block) {
    var m = String(block || "").match(/登記坪數[：:]\s*約?\s*([0-9]+(?:\.[0-9]+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }

  function roadAtEnd(s) {
    var m = String(s || "").trim().match(ROAD_TAIL);
    return m ? m[1] : "";
  }

  function shortenRoad(address) {
    var s = String(address || "").trim();
    if (!s) return "";
    s = s.replace(/^[\u4e00-\u9fff]{2,3}[市縣]/, "");
    s = s.replace(/^[\u4e00-\u9fff]{1,4}[區鄉鎮市]/, "");
    var m = s.match(/([\u4e00-\u9fff]{1,12}[路街道巷](?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?)/);
    return m ? m[1] : s.trim();
  }

  function splitTitleRoad(firstLine) {
    var line = String(firstLine || "").replace(/^推薦[：:]\s*/, "").trim();
    var br = line.match(/^[\[【]([\s\S]*?)[\]】]\s*(.*)$/);
    if (br) {
      var title = br[1].trim();
      var road = roadAtEnd(br[2]) || roadAtEnd(String(br[2]).trim());
      return { title: title, road: road };
    }
    var road2 = roadAtEnd(line);
    var title2 = line;
    if (road2 && line.slice(-road2.length) === road2) {
      title2 = line.slice(0, line.length - road2.length).replace(/[\s\]】]+$/g, "").trim();
    }
    title2 = title2.replace(/^[\[【]+/g, "").replace(/[\]】]+$/g, "").trim();
    return { title: title2, road: road2 };
  }

  function extractCode(block) {
    var src = String(block || "");
    var m = src.match(/銷售編號[：:]\s*([A-Za-z0-9]{6})/i);
    if (m) return m[1].toUpperCase();
    var u = src.match(/sinyi\.in\/o\/([A-Za-z0-9]{6})/i);
    if (u) return u[1].toUpperCase();
    var u2 = src.match(/sinyi\.com\.tw\/buy\/house\/([A-Za-z0-9]{6})/i);
    if (u2) return u2[1].toUpperCase();
    return "";
  }

  function extractUrl(block, code) {
    var src = String(block || "");
    var m = src.match(/https:\/\/sinyi\.in\/o\/[A-Za-z0-9]{6}\/\d+/i);
    if (m && safeUrl(m[0])) return m[0];
    var m2 = src.match(/https:\/\/(?:www\.)?sinyi\.com\.tw\/buy\/house\/[A-Za-z0-9]{6}[^\s"'<>]*/i);
    if (m2) {
      var cleaned = m2[0].replace(/[),，。]+$/g, "");
      if (safeUrl(cleaned)) return cleaned;
    }
    return "https://www.sinyi.com.tw/buy/house/" + code;
  }

  function parseText(text) {
    var list = [];
    var seen = Object.create(null);
    String(text || "").split(/(?=推薦[：:])/).forEach(function (blk) {
      if (!blk || !String(blk).trim()) return;
      var code = extractCode(blk);
      if (!code || seen[code]) return;
      var first = String(blk).split(/\r?\n/)[0];
      var tr = splitTitleRoad(first);
      var title = tr.title || code;
      seen[code] = true;
      list.push({
        code: code,
        title: title,
        address: tr.road || "",
        area: parseArea(blk),
        price: parsePriceWan(blk),
        url: extractUrl(blk, code),
        rooms: "",
        age: 0,
        floor: 0,
        totalFloor: 0,
        community: "",
        parkType: "",
        hasPark: mentionsParking(title),
        parkArea: null,
        parkPrice: null,
        parkAreaKnown: false,
        parkPriceKnown: false,
        mgmtFee: 0,
        mainArea: 0,
        img: "https://res.sinyi.com.tw/buy/" + code + "/bigimg/A.JPG",
        detailFailed: false,
        detailError: ""
      });
    });
    return list;
  }

  function calcRow(p) {
    var area = Number(p && p.area);
    var price = Number(p && p.price);
    var withParkUnit = area > 0 && price > 0 ? price / area : null;
    var areaKnown = !!(p && p.parkAreaKnown) && p.parkArea != null && isFinite(Number(p.parkArea)) && Number(p.parkArea) >= 0;
    var priceKnown = !!(p && p.parkPriceKnown) && p.parkPrice != null && isFinite(Number(p.parkPrice)) && Number(p.parkPrice) >= 0;
    var parkArea = areaKnown ? Number(p.parkArea) : null;
    var parkPrice = priceKnown ? Number(p.parkPrice) : null;
    var unitPrice = null;
    var unitLabel = "";
    if (!(withParkUnit > 0)) {
      unitLabel = "—";
    } else if (areaKnown && priceKnown) {
      var pureArea = area - parkArea;
      var purePrice = price - parkPrice;
      if (pureArea > 0 && purePrice > 0) unitPrice = purePrice / pureArea;
      else unitLabel = "無法計算";
    } else if (!p.hasPark && !areaKnown && !priceKnown && !p.detailFailed) {
      unitPrice = withParkUnit;
    } else if (!priceKnown && !areaKnown) {
      unitLabel = p.hasPark ? "未填車位" : "未確認車位";
    } else if (!priceKnown) {
      unitLabel = "未填車位價";
    } else {
      unitLabel = "未填車位坪";
    }
    return {
      withParkUnit: withParkUnit,
      unitPrice: unitPrice,
      unitLabel: unitPrice != null ? "" : (unitLabel || "—"),
      pureArea: areaKnown ? area - parkArea : (area > 0 ? area : null)
    };
  }

  function sortValue(row, key) {
    var d = calcRow(row);
    var v = key === "price" || key === "area" || key === "age" || key === "floor" || key === "mgmtFee" || key === "withParkUnit" || key === "unitPrice"
      ? (key === "withParkUnit" || key === "unitPrice" ? d[key] : Number(row[key]))
      : null;
    if (key === "withParkUnit" || key === "unitPrice") v = d[key];
    if (typeof v !== "number" || !isFinite(v) || v <= 0) return null;
    return v;
  }

  function sortProps(list, key, asc) {
    return list.slice().sort(function (a, b) {
      var av = sortValue(a, key);
      var bv = sortValue(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return asc ? av - bv : bv - av;
    });
  }

  function cleanText(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001F\u007F]/g, "").slice(0, max);
  }

  function sanitizeProp(o) {
    if (!o || typeof o !== "object") return null;
    var code = String(o.code || "").toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    function num(v) {
      var n = Number(v);
      return isFinite(n) && n >= 0 && n < 1e9 ? n : 0;
    }
    var areaKnown = o.parkAreaKnown != null ? !!o.parkAreaKnown : Number(o.parkArea) > 0;
    var priceKnown = o.parkPriceKnown != null ? !!o.parkPriceKnown : Number(o.parkPrice) > 0;
    var parkArea = null;
    var parkPrice = null;
    if (areaKnown && isFinite(Number(o.parkArea)) && Number(o.parkArea) >= 0 && Number(o.parkArea) < 1e6) parkArea = Number(o.parkArea);
    else areaKnown = false;
    if (priceKnown && isFinite(Number(o.parkPrice)) && Number(o.parkPrice) >= 0 && Number(o.parkPrice) < 1e7) parkPrice = Number(o.parkPrice);
    else priceKnown = false;
    return {
      code: code,
      title: cleanText(o.title, 80) || code,
      community: cleanText(o.community, 40),
      address: cleanText(o.address, 40),
      price: num(o.price),
      area: num(o.area),
      url: safeUrl(o.url) || ("https://www.sinyi.com.tw/buy/house/" + code),
      rooms: cleanText(o.rooms, 24),
      age: num(o.age),
      floor: num(o.floor),
      totalFloor: num(o.totalFloor),
      parkType: cleanText(o.parkType, 24),
      hasPark: !!o.hasPark,
      parkArea: parkArea,
      parkPrice: parkPrice,
      parkAreaKnown: areaKnown,
      parkPriceKnown: priceKnown,
      mgmtFee: num(o.mgmtFee),
      mainArea: num(o.mainArea),
      img: safeUrl(o.img, "img") || ("https://res.sinyi.com.tw/buy/" + code + "/bigimg/A.JPG"),
      detailFailed: !!o.detailFailed,
      detailError: cleanText(o.detailError, 80)
    };
  }

  function encodeShare(payload) {
    return btoa(encodeURIComponent(JSON.stringify(payload)));
  }

  function decodeShare(raw) {
    if (!raw || typeof raw !== "string" || raw.length > 50000) return null;
    try {
      var pl = JSON.parse(decodeURIComponent(atob(String(raw).replace(/ /g, "+"))));
      if (!pl || typeof pl !== "object" || !Array.isArray(pl.props)) return null;
      var props = pl.props.map(sanitizeProp).filter(Boolean).slice(0, 12);
      if (!props.length) return null;
      return {
        props: props,
        agent: cleanText(pl.agent, 40),
        phone: cleanText(pl.phone, 24),
        client: cleanText(pl.client, 40),
        note: cleanText(pl.note, 80),
        store: cleanText(pl.store, 40)
      };
    } catch (e) {
      return null;
    }
  }

  function applyDetail(base, api) {
    var out = {};
    Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
    var failed = !api || api.detailFailed || api.error;
    if (failed) {
      out.detailFailed = true;
      out.detailError = cleanText((api && (api.error || api.detailError)) || "無法取得物件詳細資料", 80);
      return out;
    }
    out.detailFailed = false;
    out.detailError = "";
    if (api.title && !out.title) out.title = cleanText(api.title, 80);
    if (api.community) out.community = cleanText(api.community, 40);
    if ((!out.address || !out.address.trim()) && api.address) out.address = cleanText(api.address, 40);
    if (api.rooms) out.rooms = cleanText(api.rooms, 24);
    if (api.parkType) out.parkType = cleanText(api.parkType, 24);
    if (!(Number(out.price) > 0) && Number(api.price) > 0) out.price = Number(api.price);
    if (!(Number(out.area) > 0) && Number(api.area) > 0) out.area = Number(api.area);
    if (Number(api.mainArea) > 0) out.mainArea = Number(api.mainArea);
    if (Number(api.age) > 0) out.age = Number(api.age);
    if (Number(api.floor) > 0) out.floor = Number(api.floor);
    if (Number(api.totalFloor) > 0) out.totalFloor = Number(api.totalFloor);
    if (Number(api.mgmtFee) > 0) out.mgmtFee = Number(api.mgmtFee);
    if (api.hasPark != null) out.hasPark = !!api.hasPark;
    if (api.img && safeUrl(api.img, "img")) out.img = api.img;
    if (api.url && safeUrl(api.url)) out.url = safeUrl(api.url);
    if (api.parkArea != null && api.parkArea !== "" && isFinite(Number(api.parkArea)) && Number(api.parkArea) >= 0) {
      out.parkArea = Number(api.parkArea);
      out.parkAreaKnown = true;
    }
    if (api.parkPrice != null && api.parkPrice !== "" && isFinite(Number(api.parkPrice)) && Number(api.parkPrice) >= 0) {
      out.parkPrice = Number(api.parkPrice);
      out.parkPriceKnown = true;
    }
    return out;
  }

  function listingFromContent(content, code) {
    code = String(code || "").trim().toUpperCase();
    if (!content || typeof content !== "object") return null;
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    if (String(content.houseNo || "").toUpperCase() !== code) return null;
    var mapped = mapContent(content, code);
    if (!(mapped.price > 0) && !mapped.address && !mapped.title) return null;
    return mapped;
  }

  function extractContentData(html, code) {
    var m = String(html || "").match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return null;
    var data;
    try { data = JSON.parse(m[1]); } catch (e) { return null; }
    var direct = data && data.props && data.props.initialReduxState && data.props.initialReduxState.buyReducer && data.props.initialReduxState.buyReducer.contentData;
    if (direct && String(direct.houseNo || "").toUpperCase() === code) return direct;
    return null;
  }

  function mapContent(c, code) {
    var areaInfo = Array.isArray(c.areaInfo) ? c.areaInfo : [];
    var parkArea = null;
    for (var i = 0; i < areaInfo.length; i++) {
      var item = areaInfo[i] || {};
      if (/停車/.test(String(item.title || ""))) {
        var a = Number(item.area);
        if (isFinite(a) && a > 0) { parkArea = a; break; }
      }
    }
    var parkPrice = null;
    ["parkPrice", "parkingPrice", "priceParking"].forEach(function (k) {
      if (parkPrice != null) return;
      if (c[k] == null || c[k] === "" || !isFinite(Number(c[k]))) return;
      var n = Number(c[k]);
      if (n > 0 && n < 100000) parkPrice = n;
    });
    var parking = String(c.parking || "");
    var hasPark = c.isParking === true || c.isParking === 1 || mentionsParking(parking);
    if (c.isParking === false && !mentionsParking(parking)) hasPark = false;
    if (parkPrice == null) {
      var inType = parking.match(/車位總價[：:]\s*([0-9]+(?:\.[0-9]+)?)\s*萬/);
      if (inType) parkPrice = parseFloat(inType[1]);
    }
    var parkType = parking.replace(/[（(]\s*車位總價[^）)]*[）)]/g, "").trim();
    var mgmtM = String(c.monthlyFee || "").match(/([\d,]+)\s*元/);
    var ageM = String(c.age || "").match(/[\d.]+/);
    var address = shortenRoad(c.address || "") || String(c.address || "");
    var img = "";
    var imgs = Array.isArray(c.images) ? c.images : [];
    for (var j = 0; j < imgs.length; j++) {
      if (safeUrl(imgs[j], "img")) { img = imgs[j]; break; }
    }
    if (!img) img = "https://res.sinyi.com.tw/buy/" + code + "/bigimg/A.JPG";
    return {
      code: code,
      title: String(c.name || "").trim(),
      community: String(c.commName || "").trim(),
      address: address,
      price: Number(c.totalPrice) > 0 ? Number(c.totalPrice) : 0,
      area: Number(c.areaBuilding) > 0 ? Number(c.areaBuilding) : 0,
      mainArea: Number(c.pingUsed) > 0 ? Number(c.pingUsed) : 0,
      rooms: String(c.layout || c.totalLayout || ""),
      age: ageM ? parseFloat(ageM[0]) : 0,
      floor: parseInt(c.floor, 10) || 0,
      totalFloor: parseInt(c.floors, 10) || 0,
      hasPark: !!hasPark,
      parkType: (parkType || parking) && (parkType || parking) !== "無" ? (parkType || parking) : (hasPark ? "有車位" : "無"),
      parkArea: parkArea,
      parkPrice: parkPrice,
      parkAreaKnown: parkArea != null,
      parkPriceKnown: parkPrice != null,
      mgmtFee: mgmtM ? parseInt(mgmtM[1].replace(/,/g, ""), 10) : 0,
      img: img,
      detailFailed: false
    };
  }

  function parseListingHtml(html, code) {
    code = String(code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    var content = extractContentData(html, code);
    if (!content) return null;
    var mapped = mapContent(content, code);
    if (!(mapped.price > 0) && !mapped.address && !mapped.title) return null;
    return mapped;
  }

  function parseLooseDetail(text, code) {
    code = String(code || "").trim().toUpperCase();
    var src = String(text || "");
    if (!src.trim()) return null;
    var priceM = src.match(/總價\s*([0-9,.]+(?:\.[0-9]+)?)\s*(億|萬)/);
    var price = 0;
    if (priceM) price = parseFloat(priceM[1].replace(/,/g, "")) * (priceM[2] === "億" ? 10000 : 1);
    if (!(price > 0)) {
      var pm = src.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*萬/);
      if (pm) price = parseFloat(pm[1].replace(/,/g, ""));
    }
    var areaM = src.match(/建坪\s*([0-9]+(?:\.[0-9]+)?)\s*坪/);
    var area = areaM ? parseFloat(areaM[1]) : 0;
    var addrM = src.match(/(?:地址|位於)\s*([\u4e00-\u9fff]{2,3}[市縣][\u4e00-\u9fff]{1,4}[區鄉鎮市]?[\u4e00-\u9fff]{0,12}[路街道巷](?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?)/);
    var address = addrM ? shortenRoad(addrM[1]) : "";
    if (!address) {
      var addr2 = src.match(/([\u4e00-\u9fff]{1,12}[路街道巷](?:[一二三四五六七八九十\d]+段)?)/);
      if (addr2 && src.length < 8000) address = addr2[1];
    }
    if (!(price > 0) && !address) return null;
    var parkAreaM = src.match(/停車空間(?:（含公設）|\(含公設\))?\s*([0-9]+(?:\.[0-9]+)?)\s*坪/);
    var parkPriceM = src.match(/車位價[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)\s*萬/);
    var roomsM = src.match(/(\d+房\d+廳\d+衛)/);
    var ageM = src.match(/屋齡\s*([\d.]+)\s*年/) || src.match(/([\d.]+)\s*年/);
    var floorM = src.match(/(\d+)\s*樓\s*[/／]\s*(\d+)\s*樓/);
    var mgmtM = src.match(/管理費[^0-9]{0,12}([\d,]+)\s*元/);
    var parkM = src.match(/(坡道平面|坡道機械|平面式|機械式|升降機械|升降平面|平車|機械車|坡道|車位)/);
    var hasPark = !!(parkM && parkM[1] !== "無");
    return {
      code: code,
      title: "",
      community: "",
      address: address,
      price: price,
      area: area,
      mainArea: 0,
      rooms: roomsM ? roomsM[1] : "",
      age: ageM ? parseFloat(ageM[1]) : 0,
      floor: floorM ? parseInt(floorM[1], 10) : 0,
      totalFloor: floorM ? parseInt(floorM[2], 10) : 0,
      hasPark: hasPark,
      parkType: parkM ? parkM[1] : (hasPark ? "有車位" : "無"),
      parkArea: parkAreaM ? parseFloat(parkAreaM[1]) : null,
      parkPrice: parkPriceM ? parseFloat(parkPriceM[1]) : null,
      parkAreaKnown: !!parkAreaM,
      parkPriceKnown: !!parkPriceM,
      mgmtFee: mgmtM ? parseInt(mgmtM[1].replace(/,/g, ""), 10) : 0,
      img: "https://res.sinyi.com.tw/buy/" + code + "/bigimg/A.JPG",
      detailFailed: false
    };
  }

  return {
    esc: esc,
    safeUrl: safeUrl,
    mentionsParking: mentionsParking,
    formatPhone: formatPhone,
    parseHeader: parseHeader,
    parsePriceWan: parsePriceWan,
    shortenRoad: shortenRoad,
    parseText: parseText,
    calcRow: calcRow,
    sortProps: sortProps,
    sanitizeProp: sanitizeProp,
    encodeShare: encodeShare,
    decodeShare: decodeShare,
    applyDetail: applyDetail,
    parseListingHtml: parseListingHtml,
    parseLooseDetail: parseLooseDetail,
    listingFromContent: listingFromContent
  };
});
