// 房地持有期間：所得稅法第14條之4，以曆年比較，不以天數 ÷ 365.25。
// 二年以內 / 超過二年未逾五年 / 超過五年未逾十年 / 超過十年。
// 「未逾」「以內」含屆滿當日；「超過」為屆滿日之次日。
// 自住優惠另須設籍並實際居住連續滿六年（屆滿當日即算滿）。
// 以年定期間而該月無相當日者，以該月末日為屆滿日（民法第121條，例如 2/29 → 非閏年 2/28）。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.HoldingPeriod = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function parseISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return { y: y, m: mo, d: d };
  }

  function cmp(a, b) {
    if (a.y !== b.y) return a.y - b.y;
    if (a.m !== b.m) return a.m - b.m;
    return a.d - b.d;
  }

  function addCalendarYears(date, years) {
    var y = date.y + years;
    var dim = daysInMonth(y, date.m);
    return { y: y, m: date.m, d: Math.min(date.d, dim) };
  }

  function completedYears(start, end) {
    var n = end.y - start.y;
    if (n < 0) return -1;
    if (cmp(addCalendarYears(start, n), end) > 0) n -= 1;
    return n < 0 ? 0 : n;
  }

  function monthsAndDays(from, end) {
    var months = (end.y - from.y) * 12 + (end.m - from.m);
    var days = end.d - from.d;
    if (days < 0) {
      months -= 1;
      var pm = end.m === 1 ? 12 : end.m - 1;
      var py = end.m === 1 ? end.y - 1 : end.y;
      days += daysInMonth(py, pm);
    }
    return { months: months, days: days };
  }

  function analyze(startIso, endIso) {
    var start = parseISO(startIso);
    var end = parseISO(endIso);
    if (!start || !end) return null;
    var sign = cmp(end, start);
    if (sign < 0) return { sign: -1, valid: false };

    var years = completedYears(start, end);
    var ann = addCalendarYears(start, years);
    var md = monthsAndDays(ann, end);
    var exact = cmp(end, ann) === 0;
    var bracketYears = exact ? years : years + Math.min(0.999, Math.max(0.001, (md.months + Math.max(md.days, 1) / 31) / 12));

    var tier, rate;
    if (cmp(end, addCalendarYears(start, 2)) <= 0) {
      tier = '2年以內';
      rate = 45;
    } else if (cmp(end, addCalendarYears(start, 5)) <= 0) {
      tier = '超過2年未逾5年';
      rate = 35;
    } else if (cmp(end, addCalendarYears(start, 10)) <= 0) {
      tier = '超過5年未逾10年';
      rate = 20;
    } else {
      tier = '超過10年';
      rate = 15;
    }

    return {
      valid: true,
      sign: sign,
      years: years,
      months: md.months,
      days: md.days,
      exact: exact,
      tier: tier,
      rate: rate,
      bracketYears: bracketYears,
      fullSix: cmp(end, addCalendarYears(start, 6)) >= 0
    };
  }

  // 重購退稅的「二年內」：先後不拘，較晚的那天在較早那天加 N 年以內（含屆滿當日）。
  function withinCalendarYears(isoA, isoB, years) {
    var a = parseISO(isoA);
    var b = parseISO(isoB);
    if (!a || !b) return false;
    var earlier, later;
    if (cmp(a, b) <= 0) { earlier = a; later = b; }
    else { earlier = b; later = a; }
    return cmp(later, addCalendarYears(earlier, years)) <= 0;
  }

  return {
    parseISO: parseISO,
    addCalendarYears: addCalendarYears,
    cmp: cmp,
    analyze: analyze,
    withinCalendarYears: withinCalendarYears
  };
});
