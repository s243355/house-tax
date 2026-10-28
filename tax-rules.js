// 2026-10 可核對的稅務與議價純函式。金額單位在函式名稱標明。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.TaxRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // 財政部 114年11月27日台財稅字第11404664070號：115年度綜合所得稅（116年5月申報）。
  var INCOME_TAX_115 = {
    year: 115,
    exemptPerPerson: 101000,
    standardSingle: 136000,
    standardMarried: 272000,
    salarySpecial: 227000,
    brackets: [
      { max: 610000, rate: 0.05, base: 0, floor: 0 },
      { max: 1380000, rate: 0.12, base: 30500, floor: 610000 },
      { max: 2770000, rate: 0.20, base: 122900, floor: 1380000 },
      { max: 5190000, rate: 0.30, base: 400900, floor: 2770000 },
      { max: Infinity, rate: 0.40, base: 1126900, floor: 5190000 }
    ]
  };

  function incomeTaxYuan(netYuan) {
    var net = Math.round(+netYuan || 0);
    if (net <= 0) return 0;
    var list = INCOME_TAX_115.brackets;
    for (var i = 0; i < list.length; i++) {
      if (net <= list[i].max) {
        return list[i].base + Math.max(0, net - list[i].floor) * list[i].rate;
      }
    }
    return 0;
  }

  function incomeTaxWan(netWan) {
    return incomeTaxYuan(Math.round((+netWan || 0) * 10000)) / 10000;
  }

  function incomeTaxRateLabel(netWan) {
    var net = Math.round((+netWan || 0) * 10000);
    var list = INCOME_TAX_115.brackets;
    for (var i = 0; i < list.length; i++) {
      if (net <= list[i].max) return Math.round(list[i].rate * 100) + '%';
    }
    return '40%';
  }

  // 土地稅法第35條：餘額 = 新購申報移轉現值 − (舊售申報移轉現值 − 已納土增稅)。
  // 已納稅額不超過餘額者全額退；超過者退餘額；餘額 ≤ 0 不退。
  function landRepurchaseRefund(oldWan, taxWan, newWan) {
    var oldVal = +oldWan || 0;
    var tax = +taxWan || 0;
    var neu = +newWan || 0;
    var remainder = oldVal - tax;
    var balanceA = neu - remainder;
    if (balanceA <= 0) return { type: 'none', refundWan: 0, balanceA: balanceA, remainder: remainder };
    if (tax <= balanceA) return { type: 'full', refundWan: tax, balanceA: balanceA, remainder: remainder };
    return { type: 'partial', refundWan: balanceA, balanceA: balanceA, remainder: remainder };
  }

  // 財政部115年3月4日台財稅字第11400690240號令（114年度出售）。115年度標準令截至2026-10尚未發布。
  function luxurySaleThresholdWan(regionLabel) {
    var t = regionLabel || '';
    if (t.indexOf('臺北') >= 0 || t.indexOf('台北') >= 0) return 6000;
    if (t.indexOf('新北') >= 0) return 4000;
    if (/桃園|新竹|臺中|台中|臺南|台南|高雄/.test(t)) return 3000;
    return 2200;
  }

  function standardHouseIncome(opts) {
    var assessed = +opts.assessedWan || 0;
    var rate = +opts.ratePercent || 0;
    var sale = +opts.saleWan || 0;
    var land = +opts.landWan || 0;
    var threshold = luxurySaleThresholdWan(opts.regionLabel || '');
    var luxury = sale > 0 && sale >= threshold;
    if (!luxury) {
      return { mode: 'percent', incomeWan: assessed * rate / 100, thresholdWan: threshold, needsLand: false };
    }
    if (!(assessed > 0) || !(land > 0)) {
      return { mode: 'luxury20', incomeWan: 0, thresholdWan: threshold, needsLand: true };
    }
    var houseRevenue = sale * assessed / (assessed + land);
    return {
      mode: 'luxury20',
      incomeWan: houseRevenue * 0.2,
      houseRevenueWan: houseRevenue,
      thresholdWan: threshold,
      needsLand: false
    };
  }

  // 所得稅法第14條之4：自住為超過400萬部分課10%。其餘級距依持有年數鍵（2/4/8/15）。
  function consolidatedHouseTaxWan(priceWan, costWan, holdKey) {
    var gain = Math.max((+priceWan || 0) - (+costWan || 0), 0);
    if (holdKey === 'selfuse') return Math.max(gain - 400, 0) * 0.1;
    var years = +holdKey;
    var rate = years <= 2 ? 0.45 : years <= 5 ? 0.35 : years <= 10 ? 0.2 : 0.15;
    return gain * rate;
  }

  function annuityMonthly(loanWan, years, annualPercent) {
    var loan = (+loanWan || 0) * 10000;
    var n = (+years || 0) * 12;
    var r = (+annualPercent || 0) / 100 / 12;
    if (n <= 0 || loan <= 0) return { monthly: 0, totalInterestWan: 0 };
    if (r === 0) return { monthly: loan / n, totalInterestWan: 0 };
    var monthly = loan * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    return { monthly: monthly, totalInterestWan: (monthly * n - loan) / 10000 };
  }

  // 含車：總價 = 單價 × 總建坪。扣車：總價 = 單價 × (總建坪 − 車位坪) + 車位價。
  // 拆車單價 = (含車總價 − 車位價) / (總建坪 − 車位坪)。
  function priceRow(opts) {
    var unitPrice = +opts.unitPrice || 0;
    var totalArea = +opts.totalArea || 0;
    var parkPrice = +opts.parkPrice || 0;
    var parkArea = +opts.parkArea || 0;
    var commRate = +opts.commRate || 0;
    var landTax = +opts.landTax || 0;
    var realtyTax = +opts.realtyTax || 0;
    var otherCost = +opts.otherCost || 0;
    var mode = opts.priceMode === 'without' ? 'without' : 'with';
    var hasPark = parkPrice > 0 && parkArea > 0;
    var pureArea = hasPark ? totalArea - parkArea : totalArea;
    var grandTotal;
    if (mode === 'with') grandTotal = +(unitPrice * totalArea).toFixed(2);
    else grandTotal = +((unitPrice * pureArea) + (hasPark ? parkPrice : 0)).toFixed(2);
    var splitUnitPrice = hasPark && pureArea > 0
      ? +((grandTotal - parkPrice) / pureArea).toFixed(4)
      : unitPrice;
    var withParkUnitPrice = totalArea > 0 ? +(grandTotal / totalArea).toFixed(4) : unitPrice;
    var commission = +(grandTotal * commRate).toFixed(2);
    var net = +(grandTotal - commission - landTax - realtyTax - otherCost).toFixed(2);
    return {
      grandTotal: grandTotal,
      splitUnitPrice: splitUnitPrice,
      withParkUnitPrice: withParkUnitPrice,
      commission: commission,
      net: net,
      overLegalCap: commRate > 0.06
    };
  }

  return {
    INCOME_TAX_115: INCOME_TAX_115,
    incomeTaxYuan: incomeTaxYuan,
    incomeTaxWan: incomeTaxWan,
    incomeTaxRateLabel: incomeTaxRateLabel,
    landRepurchaseRefund: landRepurchaseRefund,
    luxurySaleThresholdWan: luxurySaleThresholdWan,
    standardHouseIncome: standardHouseIncome,
    consolidatedHouseTaxWan: consolidatedHouseTaxWan,
    annuityMonthly: annuityMonthly,
    priceRow: priceRow
  };
});
