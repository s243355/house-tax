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
      noPark: annotated.filter(function (r) { return r.noPark; }).length,
      skipped: annotated.filter(function (r) { return isFinite(splitUnit(r.total, r.pprice, r.ping)) && excludePresale && isExcludedTrade(r.note); }).length
    };
  }

  return {
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
    tradeStats: tradeStats
  };
});
