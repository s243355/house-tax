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
    askUnit: askUnit
  };
});
