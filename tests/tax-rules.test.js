const assert = require('assert');
const t = require('../tax-rules.js');

function near(actual, expected, eps, label) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(label + ': got ' + actual + ', expected ' + expected);
  }
}

// 115年度：所得淨額 200萬。公報：超過138萬至277萬，課 122,900 + 超過138萬部分之20%。
// 122,900 + 620,000×20% = 246,900 元。
near(t.incomeTaxYuan(2000000), 246900, 0.01, '200萬稅額');
assert.strictEqual(t.incomeTaxRateLabel(200), '20%');

// 61萬整仍屬 5%：610,000 × 5% = 30,500。舊版誤把門檻寫成 59.4萬。
near(t.incomeTaxYuan(610000), 30500, 0.01, '61萬邊界');
near(t.incomeTaxYuan(610001), 30500 + 0.12, 0.02, '跨入12%');

// 單身預設：其他所得 80萬 + 財交 20萬，免稅 10.1、扣除 36.3。
// 淨額 53.6萬 × 5% = 26,800；不含財交 33.6萬 × 5% = 16,800；增加 10,000。
const exempt = 10.1;
const deduction = 13.6 + 22.7;
const withProp = t.incomeTaxWan(80 + 20 - exempt - deduction);
const without = t.incomeTaxWan(80 - exempt - deduction);
near(withProp - without, 1, 0.0001, '財交增加稅額（萬）');

// 土地稅法 §35。舊售 500、已繳 80、新購 450：餘額 30，退 30（部分）。
let land = t.landRepurchaseRefund(500, 80, 450);
assert.strictEqual(land.type, 'partial');
near(land.refundWan, 30, 0.001, '部分退');
near(land.balanceA, 30, 0.001, '餘額A');

// 新購 600：餘額 180 ≥ 80，全退 80。
land = t.landRepurchaseRefund(500, 80, 600);
assert.strictEqual(land.type, 'full');
near(land.refundWan, 80, 0.001, '全額退');

// 新購 400：餘額 -20，不退。
land = t.landRepurchaseRefund(500, 80, 400);
assert.strictEqual(land.type, 'none');
assert.strictEqual(land.refundWan, 0);

// 自住：利得 500萬，只就超過 400萬的 100萬課 10% = 10萬。舊版把 500 全數乘 10% = 50萬。
near(t.consolidatedHouseTaxWan(1500, 1000, 'selfuse'), 10, 0.001, '自住400萬免稅');
near(t.consolidatedHouseTaxWan(1500, 1000, '8'), 100, 0.001, '5到10年20%');
near(t.consolidatedHouseTaxWan(1200, 1000, 'selfuse'), 0, 0.001, '自住未過400萬');

// 114年度標準：臺中市未達 3,000萬，評定現值 80萬 × 南區 35% = 28萬。
let std = t.standardHouseIncome({
  assessedWan: 80, ratePercent: 35, saleWan: 1500, landWan: 400, regionLabel: '臺中市：南區 (35%)'
});
assert.strictEqual(std.mode, 'percent');
near(std.incomeWan, 28, 0.001, '南區標準比率');

// 達門檻：成交 3000、房屋現值 80、公告土地現值 320。房屋收入 600 × 20% = 120，不是 28。
std = t.standardHouseIncome({
  assessedWan: 80, ratePercent: 35, saleWan: 3000, landWan: 320, regionLabel: '臺中市：南區 (35%)'
});
assert.strictEqual(std.mode, 'luxury20');
assert.strictEqual(std.needsLand, false);
near(std.incomeWan, 120, 0.001, '豪宅20%');

std = t.standardHouseIncome({
  assessedWan: 80, ratePercent: 35, saleWan: 3000, landWan: 0, regionLabel: '臺中市：南區 (35%)'
});
assert.strictEqual(std.needsLand, true);

// 含車 30萬/坪 × 35.5坪 = 1065；服務費 4% = 42.6；實拿 1022.4。
let row = t.priceRow({ unitPrice: 30, totalArea: 35.5, commRate: 0.04, priceMode: 'with' });
near(row.grandTotal, 1065, 0.001, '含車總價');
near(row.commission, 42.6, 0.001, '4%服務費');
near(row.net, 1022.4, 0.001, '實拿');
assert.strictEqual(row.overLegalCap, false);

// 含車單價 30、總建坪 40、車位 150萬/8坪。拆車單價 = (1200-150)/32 = 32.8125。
row = t.priceRow({
  unitPrice: 30, totalArea: 40, parkPrice: 150, parkArea: 8, commRate: 0.04, priceMode: 'with'
});
near(row.grandTotal, 1200, 0.001, '含車含車位總價');
near(row.splitUnitPrice, 32.8125, 0.0001, '拆車單價');

// 扣車單價 30 × 32坪 + 車位 150 = 1110。
row = t.priceRow({
  unitPrice: 30, totalArea: 40, parkPrice: 150, parkArea: 8, commRate: 0.04, priceMode: 'without'
});
near(row.grandTotal, 1110, 0.001, '扣車總價');
near(row.splitUnitPrice, 30, 0.0001, '扣車模式拆回原單價');
near(row.withParkUnitPrice, 27.75, 0.0001, '反推含車單價');

row = t.priceRow({ unitPrice: 30, totalArea: 10, commRate: 0.07, priceMode: 'with' });
assert.strictEqual(row.overLegalCap, true);

// 800萬、2.5%、30年本息平均。月付約 31,610 元。
const loan = t.annuityMonthly(800, 30, 2.5);
near(loan.monthly, 31610, 2, '房貸月付');

console.log('tax-rules tests passed');
