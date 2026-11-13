// 屋主報告書：取得日（民國或西元）、114 年度舊制標準、單價。
// 持有期間用 holding-period.js 的曆年比較，不在這裡重算。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.OwnerReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // 財政部 115 年 3 月 4 日台財稅字第11400690240號令，114 年度臺中市一般標準（房屋評定現值之比例）。
  var STD_114 = {
    西屯區: '40', 南屯區: '38', 南區: '35', 北屯區: '34', 西區: '32', 東區: '32', 北區: '30',
    太平區: '29', 中區: '28', 烏日區: '26', 大里區: '26', 豐原區: '24', 潭子區: '23', 沙鹿區: '23',
    大雅區: '22', 龍井區: '21', 大肚區: '21', 霧峰區: '21', 后里區: '20', 神岡區: '20', 大甲區: '19',
    梧棲區: '18', 清水區: '17', 東勢區: '15', 外埔區: '14', 新社區: '12', 大安區: '12', 石岡區: '10', 和平區: '8'
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function toIso(d) {
    if (!d || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // 105/01/01、1050101 為民國；2020/01/01、2020-01-01、20200101 為西元（不再一律加 1911）。
  function parseAcquireDate(raw) {
    var s = String(raw || '').trim().replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[．。]/g, '.').replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '');
    if (!s) return null;
    var y, m, d, hit;
    if ((hit = s.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
    else if ((hit = s.match(/^(\d{3})(\d{2})(\d{2})$/))) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
    else if ((hit = s.match(/^(\d{2})(\d{2})(\d{2})$/))) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
    else if ((hit = s.match(/^(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})/))) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
    else return null;
    if (y < 1912) y += 1911;
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function stdRate(district) { return STD_114[district] || ''; }

  function districtOf(addr) {
    var m = String(addr || '').match(/(?:臺中市|台中市)?\s*([^\d\s]{1,3}區)/);
    return m ? m[1] : '';
  }

  function isExcludedTrade(note) {
    return /預售屋|分件登記/.test(String(note || ''));
  }

  function splitUnit(total, park, ping) {
    var t = Number(total), p = Number(park) || 0, g = Number(ping);
    if (!isFinite(t) || !isFinite(g) || g <= 0) return NaN;
    return (t - p) / g;
  }

  function grossUnit(total, ping, pping) {
    var t = Number(total), g = Number(ping) || 0, k = Number(pping) || 0;
    if (!isFinite(t) || g + k <= 0) return NaN;
    return t / (g + k);
  }

  function askUnit(price, park, ping) {
    var t = Number(price), p = Number(park) || 0, g = Number(ping);
    if (!isFinite(t) || !isFinite(g) || g <= 0) return NaN;
    return (t - p) / g;
  }

  function half(raw) {
    return String(raw || '').replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).trim();
  }

  // 11306、113-06、113年6月、2024/06 都變成民國年月，方便由新到舊排。空白是 0。
  function ymKey(raw) {
    var s = half(raw);
    if (!s) return 0;
    var y, mo, hit;
    if ((hit = s.match(/^(\d{2,4})\s*年\s*(\d{1,2})/))) { y = +hit[1]; mo = +hit[2]; }
    else if ((hit = s.match(/^(\d{4})(\d{2})$/))) { y = +hit[1]; mo = +hit[2]; }
    else if ((hit = s.match(/^(\d{2,3})(\d{2})$/))) { y = +hit[1]; mo = +hit[2]; }
    else if ((hit = s.match(/^(\d{2,4})\D+(\d{1,2})/))) { y = +hit[1]; mo = +hit[2]; }
    else return 0;
    if (mo < 1 || mo > 12) return 0;
    if (y >= 1912) y -= 1911;
    return y * 100 + mo;
  }

  function monthsSinceYm(raw, now) {
    var k = ymKey(raw);
    if (!k) return null;
    var y = Math.floor(k / 100) + 1911;
    var m = k % 100;
    var ref = now || new Date();
    return (ref.getFullYear() - y) * 12 + (ref.getMonth() + 1 - m);
  }

  function median(nums) {
    var a = (nums || []).filter(function (n) { return isFinite(n); }).slice().sort(function (x, y) { return x - y; });
    if (!a.length) return NaN;
    var i = Math.floor(a.length / 2);
    return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
  }

  function byDateDesc(a, b) {
    var ka = ymKey(a.ym), kb = ymKey(b.ym);
    if (!ka && !kb) return 0;
    if (!ka) return 1;
    if (!kb) return -1;
    return kb - ka;
  }

  // 車位坪 > 0 但車位價空白或 0：單價等於總價÷房屋坪，沒有扣車位。
  function noPark(r) {
    return Number(r && r.pping) > 0 && !(Number(r.pprice) > 0);
  }

  function tradeStats(rows, opts) {
    opts = opts || {};
    var excludePresale = opts.excludePresale !== false;
    var recentN = Math.max(1, parseInt(opts.recentN, 10) || 5);
    var areas = {};
    (rows || []).forEach(function (r) {
      if (Number(r.pprice) > 0 && !r.est && Number(r.pping) > 0) {
        var t = r.ptype || '';
        (areas[t] = areas[t] || []).push(Number(r.pping));
      }
    });
    var annotated = (rows || []).map(function (r) {
      var unit = splitUnit(r.total, r.pprice, r.ping);
      var gross = grossUnit(r.total, r.ping, r.pping);
      var missing = noPark(r);
      var multi = false;
      if (r.est && Number(r.pping) > 0) {
        var pool = areas[r.ptype || ''];
        if (pool && pool.length) multi = Number(r.pping) > median(pool) * 1.5;
      }
      return Object.assign({}, r, { unit: unit, gross: gross, noPark: missing, multiPark: multi, outlier: false, _src: r });
    });
    var pool = annotated.filter(function (r) {
      if (r.skip) return false;
      if (excludePresale && isExcludedTrade(r.note)) return false;
      return isFinite(r.unit);
    }).slice().sort(byDateDesc);
    var med = median(pool.map(function (r) { return r.unit; }));
    annotated.forEach(function (r) {
      r.outlier = !r.skip && isFinite(r.unit) && isFinite(med) && med > 0 && Math.abs(r.unit - med) / med > 0.15
        && (excludePresale ? !isExcludedTrade(r.note) : true);
    });
    var rec = pool.slice(0, recentN);
    var comp = opts.subject ? pickComps(pool, opts.subject, recentN) : null;
    var dated = annotated.filter(function (r) { return ymKey(r.ym); }).slice().sort(byDateDesc);
    var latest = dated[0] ? dated[0].ym : '';
    return {
      rows: annotated,
      max: pool.length ? Math.max.apply(null, pool.map(function (r) { return r.unit; })) : NaN,
      min: pool.length ? Math.min.apply(null, pool.map(function (r) { return r.unit; })) : NaN,
      avg: rec.length ? rec.reduce(function (a, r) { return a + r.unit; }, 0) / rec.length : NaN,
      n: rec.length,
      med: med,
      latest: latest,
      months: latest ? monthsSinceYm(latest, opts.now) : null,
      count: dated.length,
      comp: comp,
      noPark: annotated.filter(function (r) { return r.noPark; }).length,
      skipped: annotated.filter(function (r) { return isFinite(splitUnit(r.total, r.pprice, r.ping)) && excludePresale && isExcludedTrade(r.note); }).length
    };
  }

  // ---------- 可比案例 ----------
  function roomsOf(x) {
    var m = String(x == null ? '' : x).match(/(\d+)\s*房/);
    if (m) return +m[1];
    var v = parseInt(x, 10);
    return v > 0 && v < 10 ? v : NaN;
  }
  function floorOf(x) {
    var s = half(x);
    var m = s.match(/(\d+)\s*[樓Ff]/) || s.match(/^(\d+)/);
    return m ? +m[1] : NaN;
  }
  function rowKey(r) { return [r.ym, r.floor, r.total].join('|'); }
  // 同房數、房屋坪相差 15% 以內；不足 3 筆放寬到 25%，再不足才不分房數。本戶不是 1 樓就不拿 1 樓比。
  // rows 需已算好 unit，並依日期新到舊排序（tradeStats 的 pool）。
  function pickComps(rows, subj, n) {
    if (!subj || !(subj.ping > 0)) return null;
    var fl = subj.floor, rm = subj.rooms;
    var base = (rows || []).filter(function (r) { var f = floorOf(r.floor); return !(isFinite(fl) && fl > 1 && f === 1); });
    var tiers = [[0.15, true], [0.25, true], [0.15, false], [0.25, false]];
    for (var i = 0; i < tiers.length; i++) {
      var tol = tiers[i][0], useRm = tiers[i][1];
      if (useRm && !isFinite(rm)) continue;
      var c = base.filter(function (r) {
        return Math.abs(Number(r.ping) - subj.ping) / subj.ping <= tol + 1e-9 && (!useRm || roomsOf(r.rooms) === rm);
      });
      if (c.length >= 3) {
        var k = c.slice(0, Math.max(3, n || 5));
        return {
          rows: k, keys: k.map(rowKey), n: k.length,
          avg: k.reduce(function (a, r) { return a + r.unit; }, 0) / k.length,
          rule: (useRm ? '同' + rm + '房、' : '') + '房屋坪相差' + Math.round(tol * 100) + '%以內' + (isFinite(fl) && fl > 1 ? '、不含1樓' : '')
        };
      }
    }
    return null;
  }

  // ---------- 稅務優惠條件（值：'' 未確認、'y' 符合、'n' 不符合）----------
  // 土地稅法第 9、34 條；所得稅法第 14-4 條第 3 項。
  var TAX_CHK = {
    lvt: [['lvt1', '屋主或配偶、直系親屬已在這戶辦好戶籍登記'], ['lvt2', '出售前 1 年內沒有出租或營業使用'], ['lvt3', '都市土地持分未超過 3 公畝（約 90.75 坪）']],
    lvtHouse: [['lvt4', '出售時本人、配偶及未成年子女只有這一戶房屋'], ['lvt5', '本人、配偶或未成年子女設籍，且持有這戶連續滿 6 年'], ['lvt6', '出售前 5 年內沒有出租或營業使用'], ['lvt7', '都市土地持分未超過 1.5 公畝（約 45.38 坪）']],
    ho: [['ho1', '本人、配偶或未成年子女在這戶設籍，並實際居住連續滿 6 年'], ['ho2', '這 6 年內沒有出租、營業或執行業務使用'], ['ho3', '本人、配偶及未成年子女交易前 6 年內沒用過這項優惠']]
  };
  // 能從資料判斷的先自動判斷：土地持分面積、是否持有滿 6 年；同仁手動選的不覆蓋。
  function taxChkAuto(chk, landPing, fullSix) {
    var c = Object.assign({}, chk || {});
    if (!c.lvt3 && landPing > 0 && landPing <= 90.75) c.lvt3 = 'y';
    if (!c.lvt7 && landPing > 0 && landPing <= 45.38) c.lvt7 = 'y';
    if (fullSix === false) { c.lvt5 = 'n'; c.ho1 = 'n'; }
    return c;
  }
  function chkStatus(c, ids) {
    var v = ids.map(function (i) { return (c || {})[i] || ''; });
    if (v.indexOf('n') >= 0) return 'no';
    return v.every(function (x) { return x === 'y'; }) ? 'ok' : 'pending';
  }
  function lvtStatus(c) {
    c = c || {};
    var base = ['lvt1', 'lvt2', 'lvt3'];
    if (!c.lvtMode) return chkStatus(c, base) === 'no' ? 'no' : 'pending';
    return chkStatus(c, c.lvtMode === 'house' ? base.concat(['lvt4', 'lvt5', 'lvt6', 'lvt7']) : base);
  }
  function hoStatus(c, fullSix) {
    if (fullSix === false) return 'no';
    return chkStatus(c, ['ho1', 'ho2', 'ho3']);
  }

  // ---------- 信義社區對照檢查：社區名稱或門牌要對得上，才自動帶入官網資料 ----------
  var CN_NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  function normAddr(a) {
    return half(a).replace(/^(台中市|臺中市)/, '').replace(/^[^\d,，、]{1,3}?區/, '')
      .replace(/([一二三四五六七八九十])段/g, function (m, c) { return CN_NUM[c] + '段'; })
      .replace(/[－-]/g, '之').replace(/\s/g, '');
  }
  // 門牌比對到「號」為止，忽略「之幾」與樓層（同一棟的不同戶仍算同一個門牌）
  function doorOf(a) {
    var m = normAddr(a).match(/^(.*?\d+)(?:之\d+)?號/);
    return m ? m[1] + '號' : '';
  }
  function nameVariants(n) {
    var s = half(n).replace(/\s/g, '');
    var out = [s.replace(/[（(][^）)]*[）)]/g, '')];
    var inner = s.match(/[（(]([^）)]+)[）)]/g) || [];
    inner.forEach(function (x) { out.push(x.replace(/[（()）]/g, '')); });
    return out.filter(function (x) { return x.length >= 2; });
  }
  // expect：{ name, keys: [本社區門牌] }；sinyi：信義官網社區資料 { name, address }
  function sinyiMatch(expect, sinyi) {
    if (!expect || !sinyi) return { ok: false, by: '' };
    var a = nameVariants(expect.name || ''), b = nameVariants(sinyi.name || '');
    var byName = a.some(function (x) { return b.some(function (y) { return x.indexOf(y) >= 0 || y.indexOf(x) >= 0; }); });
    if (byName) return { ok: true, by: 'name' };
    var mine = (expect.keys || []).map(doorOf).filter(Boolean);
    var theirs = String(sinyi.address || '').split(/[,，、]/).map(doorOf).filter(Boolean);
    var byAddr = theirs.some(function (d) { return mine.indexOf(d) >= 0; });
    return { ok: byAddr, by: byAddr ? 'address' : '' };
  }

  // ---------- 周邊同類型行情（信義市場行情系統「不動產行情資訊表」）----------
  var NEAR_SPECIAL = /親友|員工|共有人|特殊關係|二親等|關係人|債權債務|法拍|政府機關/;
  function nnum(v) { var n = parseFloat(half(v).replace(/[,，萬元坪\s◆]/g, '')); return isFinite(n) ? n : NaN; }
  function nearbySpecial(r) { return NEAR_SPECIAL.test(String((r && r.note) || '')); }
  // 依行情表原本順序（距離近到遠、近期優先）挑前 n 筆，略過親友、特殊關係等交易
  function nearbyAutoPick(rows, n) {
    var k = 0, lim = n || 10;
    return (rows || []).map(function (r) {
      var pick = !nearbySpecial(r) && k < lim && isFinite(nnum(r.total)) && nnum(r.ping) > 0;
      if (pick) k += 1;
      return Object.assign({}, r, { pick: pick });
    });
  }
  // 拆車單價＝（總價－車位價）÷（建坪－車位坪）；沒有車位＝總價÷建坪；有車位坪卻沒有車位價＝無法拆車
  function nearbyUnit(r) {
    var t = nnum(r.total), pg = nnum(r.ping), pp = nnum(r.pping), pr = nnum(r.pprice);
    var gross = isFinite(t) && pg > 0 ? t / pg : NaN;
    if (!(pp > 0)) return { split: gross, gross: gross, noPark: false, est: false };
    if (pr > 0 && pg - pp > 0) return { split: (t - pr) / (pg - pp), gross: gross, noPark: false, est: !!r.pest && r.pest !== 'false' };
    return { split: NaN, gross: gross, noPark: true, est: false };
  }
  function nearbyStats(rows) {
    var all = rows || [];
    var picked = all.filter(function (r) { return r.pick; }).map(function (r) { return Object.assign({}, r, nearbyUnit(r)); });
    var us = picked.map(function (r) { return r.split; }).filter(isFinite);
    return {
      rows: picked, n: picked.length, total: all.length,
      special: all.filter(nearbySpecial).length,
      avg: us.length ? us.reduce(function (a, b) { return a + b; }, 0) / us.length : NaN,
      max: us.length ? Math.max.apply(null, us) : NaN,
      min: us.length ? Math.min.apply(null, us) : NaN,
      est: picked.filter(function (r) { return r.est; }).length,
      noPark: picked.filter(function (r) { return r.noPark; }).length
    };
  }
  // 報告上的地址：去掉縣市與樓層（樓層另一欄），例「台中市南區德富路30號十四樓之5」→「南區德富路30號」
  function nearbyAddr(a) {
    var s = half(a).replace(/\s/g, '').replace(/^(台中市|臺中市)/, '');
    var m = s.match(/^(.*?\d+(?:之\d+)?號)/);
    return m ? m[1] : s;
  }

  // ---------- 讀回編輯過的 PPTX：依物件名稱（f:欄位、t:表格、ormeta:對照）把文字對回欄位 ----------
  function xmlText(s) {
    return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&');
  }
  // 一個文字框或儲存格：段落之間換行，<a:br/> 也換行
  function paraText(xml) {
    var ps = String(xml || '').match(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>|<a:p\s*\/>/g) || [];
    return ps.map(function (p) {
      return (p.match(/<a:t(?:\s[^>]*)?>[^<]*<\/a:t>|<a:br\b[^>]*\/>/g) || []).map(function (t) {
        return /^<a:br/.test(t) ? '\n' : xmlText(t.replace(/<[^>]+>/g, ''));
      }).join('');
    }).join('\n').replace(/\n+$/, '');
  }
  function shapeName(xml) { var m = String(xml).match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/); return m ? xmlText(m[1]) : ''; }
  function pptxRead(slideXmls) {
    var out = { fields: {}, tables: {}, meta: null };
    (slideXmls || []).forEach(function (xml) {
      (String(xml).match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || []).forEach(function (sp) {
        var n = shapeName(sp);
        if (/^ormeta:/.test(n)) { try { out.meta = JSON.parse(n.slice(7)); } catch (e) { /* 對照資料壞掉就略過 */ } }
        else if (/^f:/.test(n) && !(n.slice(2) in out.fields)) out.fields[n.slice(2)] = paraText(sp);
      });
      (String(xml).match(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g) || []).forEach(function (gf) {
        var n = shapeName(gf);
        if (!/^t:/.test(n)) return;
        out.tables[n.slice(2)] = (gf.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) || []).map(function (tr) {
          return (tr.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || []).map(paraText);
        });
      });
    });
    return out;
  }
  var PPT_BASIC = { '社區名稱': 'community', '總樓高': 'floors', '地址': 'address', '本戶樓層': 'floor', '建築完成日': 'built', '格局': 'layout', '用途': 'use', '朝向': 'facing', '房屋類型': 'type', '外牆材質': 'wall', '車位': 'parking', '車位資料': 'parkingNo', '邊間': 'corner', '暗房': 'dark', '警衛管理': 'guard' };
  var PPT_AREA = { '建物登記坪數': 'total', '主建物': 'main', '公共設施': 'public', '防空避難室兼車位': 'parking', '陽台': 'balcony', '雨遮': 'canopy', '土地登記坪數': 'land' };
  var PPT_LABEL = { 'market.conclusion': '社區重點結論', 'features': '本案特色', 'price.online': '建議網路開價', 'price.expect': '客戶期望價位', 'price.analysis': '分析與建議', 'price.summary': '總結' };
  function cleanCell(v) { var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return s === '—' ? '' : s; }
  function numCell(v) { var m = half(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? m[0] : ''; }
  // 依 PPT 讀回的內容更新報告；回傳新狀態與改了哪些（給同仁確認）
  function pptxApply(state, read) {
    var S = JSON.parse(JSON.stringify(state || {}));
    var ch = [];
    var set = function (obj, key, val, label) {
      var old = String(obj[key] == null ? '' : obj[key]);
      if (old.trim() !== String(val).trim()) { ch.push({ label: label, from: old, to: String(val) }); obj[key] = val; }
    };
    S.basic = S.basic || {}; S.area = S.area || {}; S.market = S.market || {}; S.price = S.price || {};
    var tb = read.tables || {};
    (tb.basic || []).forEach(function (r) {
      [[r[0], r[1]], [r[2], r[3]]].forEach(function (kv) {
        var k = PPT_BASIC[cleanCell(kv[0])];
        if (k) set(S.basic, k, cleanCell(kv[1]), cleanCell(kv[0]));
      });
    });
    if (tb.area && tb.area.length >= 2) tb.area[0].forEach(function (lab, i) {
      var k = PPT_AREA[cleanCell(lab)];
      if (k) set(S.area, k, numCell(tb.area[1][i]), cleanCell(lab) + '（坪）');
    });
    var f = read.fields || {};
    if ('basic.community' in f && !tb.basic) set(S.basic, 'community', cleanCell(f['basic.community']), '社區名稱');
    if ('features' in f) {
      var old = String(S.features || '').split('\n').filter(function (x) { return x.trim(); });
      var neu = f.features.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      set(S, 'features', neu.concat(old.slice(5)).join('\n'), '本案特色');
    }
    ['market.conclusion', 'price.online', 'price.expect', 'price.analysis', 'price.summary'].forEach(function (k) {
      if (!(k in f)) return;
      var parts = k.split('.');
      var v = /online|expect/.test(k) ? cleanCell(f[k]) : f[k].split('\n').map(function (x) { return x.trim(); }).filter(Boolean).join('\n');
      set(S[parts[0]], parts[1], v, PPT_LABEL[k]);
    });
    // 成交表：第 i 列對應 meta.keys[i] 那一筆；PPT 刪掉的列從報告刪掉，多出來的列新增
    if (tb.market) {
      var rows = tb.market.slice(1).filter(function (r) { return cleanCell(r[0]) || numCell(r[5]); })
        .filter(function (r) { return !/請輸入社區成交紀錄/.test(r[0]); });
      var keys = (read.meta && read.meta.keys) || [];
      var list = (S.market.rows || []).slice();
      var used = {};
      rows.forEach(function (r, i) {
        var nr = { ym: cleanCell(r[0]).replace(/[※（(].*$/, ''), floor: cleanCell(r[1]), ping: numCell(r[2]), pping: numCell(r[3]), pprice: numCell(r[4]) || '0', total: numCell(r[5]) };
        var idx = keys[i] ? list.findIndex(function (x) { return rowKey(x) === keys[i]; }) : -1;
        if (idx < 0) { list.push(nr); used[list.length - 1] = 1; ch.push({ label: '成交新增', from: '', to: [nr.ym, nr.floor, nr.total + '萬'].join(' ') }); return; }
        used[idx] = 1;
        var o = list[idx], diff = [];
        ['ym', 'floor', 'ping', 'pping', 'pprice', 'total'].forEach(function (k) { if (String(o[k] || '').trim() !== nr[k] && !(k === 'pprice' && !o[k] && nr[k] === '0')) diff.push(k); });
        if (diff.length) {
          ch.push({ label: '成交修改 ' + keys[i].split('|').slice(0, 2).join(' '), from: diff.map(function (k) { return o[k]; }).join('／'), to: diff.map(function (k) { return nr[k]; }).join('／') });
          var upd = Object.assign({}, o, nr);
          if (diff.indexOf('pprice') >= 0) delete upd.est;
          list[idx] = upd;
        }
      });
      keys.slice(rows.length).forEach(function (k) {
        var idx = list.findIndex(function (x) { return rowKey(x) === k; });
        if (idx >= 0 && !used[idx]) { ch.push({ label: '成交刪除', from: k.split('|').join(' '), to: '' }); list.splice(idx, 1); }
      });
      S.market.rows = list;
    }
    if (tb.listing) {
      var ls = tb.listing.slice(1).filter(function (r) { return !/目前無同社區待售/.test(r[0]) && (cleanCell(r[0]) || numCell(r[4])); }).map(function (r, i) {
        var o = (S.price.listings || [])[i] || {};
        return Object.assign({}, o, { floor: cleanCell(r[0]).replace(/（樓層特殊）$/, ''), ping: numCell(r[1]), pping: numCell(r[2]), layout: cleanCell(r[3]), price: numCell(r[4]) });
      });
      var a = JSON.stringify((S.price.listings || []).map(function (x) { return [x.floor, x.ping, x.layout, x.price]; }));
      var b = JSON.stringify(ls.map(function (x) { return [x.floor, x.ping, x.layout, x.price]; }));
      if (a !== b) { ch.push({ label: '待售物件', from: (S.price.listings || []).length + ' 筆', to: ls.length + ' 筆（有修改）' }); S.price.listings = ls; S.market.listing = String(ls.length); }
    }
    return { state: S, changes: ch };
  }

  // 社區資料兩個版本：同一天（台灣時間）再存只更新最新版；跨日存檔時，舊的最新版變成「前一版」
  function twDay(t) { return Math.floor(((+t || 0) + 8 * 3600e3) / 86400e3); }
  function commPrev(old, oldPrev, now) {
    if (!old) return oldPrev || null;
    if (old.updatedAt && twDay(old.updatedAt) === twDay(now)) return oldPrev || old.prev || null;
    var p = {}; for (var k in old) if (k !== 'prev' && k !== 'id') p[k] = old[k];
    return p;
  }
  // 選單用：一個社區的可選版本（最新、前一版），日期相同的不重複列
  function commVersions(c) {
    if (!c) return [];
    var cur = {}; for (var k in c) if (k !== 'prev') cur[k] = c[k];
    var out = [{ key: 'cur', label: '最新', doc: cur }];
    var p = c.prev;
    if (p && (p.market || p.listings || p.features) && !(p.updatedAt && c.updatedAt && twDay(p.updatedAt) === twDay(c.updatedAt))) {
      var pd = {}; for (var j in p) pd[j] = p[j]; pd.name = c.name; if (c.id) pd.id = c.id;
      out.push({ key: 'prev', label: '前一次', doc: pd });
    }
    return out;
  }

  return {
    commPrev: commPrev,
    commVersions: commVersions,
    twDay: twDay,
    STD_114: STD_114,
    STD_YEAR: '114',
    STD_DECREE: '台財稅字第11400690240號令',
    parseAcquireDate: parseAcquireDate,
    toIso: toIso,
    stdRate: stdRate,
    districtOf: districtOf,
    isExcludedTrade: isExcludedTrade,
    splitUnit: splitUnit,
    grossUnit: grossUnit,
    askUnit: askUnit,
    ymKey: ymKey,
    monthsSinceYm: monthsSinceYm,
    median: median,
    byDateDesc: byDateDesc,
    noPark: noPark,
    tradeStats: tradeStats,
    roomsOf: roomsOf,
    floorOf: floorOf,
    rowKey: rowKey,
    pickComps: pickComps,
    TAX_CHK: TAX_CHK,
    taxChkAuto: taxChkAuto,
    lvtStatus: lvtStatus,
    hoStatus: hoStatus,
    normAddr: normAddr,
    doorOf: doorOf,
    sinyiMatch: sinyiMatch,
    nearbySpecial: nearbySpecial,
    nearbyAutoPick: nearbyAutoPick,
    nearbyUnit: nearbyUnit,
    nearbyStats: nearbyStats,
    nearbyAddr: nearbyAddr,
    pptxRead: pptxRead,
    pptxApply: pptxApply
  };
});
