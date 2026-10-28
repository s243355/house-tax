const assert = require('assert');
const hp = require('../holding-period.js');

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function oldYears(a, b) {
  return daysBetween(a, b) / 365.25;
}

const cases = [
  {
    name: '剛好 2 年（含閏日）仍屬 2年以內 45%',
    buy: '2023-03-01', sell: '2025-03-01',
    rate: 45, tier: '2年以內', years: 2, months: 0, fullSix: false
  },
  {
    name: '滿 2 年的次日進入 35%',
    buy: '2023-03-01', sell: '2025-03-02',
    rate: 35, tier: '超過2年未逾5年', years: 2, months: 0, fullSix: false
  },
  {
    name: '剛好 5 年仍未逾 5 年',
    buy: '2019-01-01', sell: '2024-01-01',
    rate: 35, tier: '超過2年未逾5年', years: 5, months: 0, fullSix: false
  },
  {
    name: '滿 5 年的次日進入 20%',
    buy: '2019-01-01', sell: '2024-01-02',
    rate: 20, tier: '超過5年未逾10年', years: 5, months: 0, fullSix: false
  },
  {
    name: '剛好 6 年符合自住滿 6 年',
    buy: '2021-01-01', sell: '2027-01-01',
    rate: 20, tier: '超過5年未逾10年', years: 6, months: 0, fullSix: true
  },
  {
    name: '差 1 天未滿 6 年',
    buy: '2021-01-01', sell: '2026-12-31',
    rate: 20, tier: '超過5年未逾10年', years: 5, months: 11, fullSix: false
  },
  {
    name: '剛好 10 年仍未逾 10 年',
    buy: '2015-06-15', sell: '2025-06-15',
    rate: 20, tier: '超過5年未逾10年', years: 10, months: 0, fullSix: true
  },
  {
    name: '滿 10 年的次日進入 15%',
    buy: '2015-06-15', sell: '2025-06-16',
    rate: 15, tier: '超過10年', years: 10, months: 0, fullSix: true
  },
  {
    name: '閏日取得，非閏年 2/28 為屆滿 2 年',
    buy: '2020-02-29', sell: '2022-02-28',
    rate: 45, tier: '2年以內', years: 2, months: 0, fullSix: false
  },
  {
    name: '閏日取得，屆滿次日 3/1 超過 2 年',
    buy: '2020-02-29', sell: '2022-03-01',
    rate: 35, tier: '超過2年未逾5年', years: 2, months: 0, fullSix: false
  },
  {
    name: '閏日取得，下一個閏年 2/29 剛好 4 年',
    buy: '2020-02-29', sell: '2024-02-29',
    rate: 35, tier: '超過2年未逾5年', years: 4, months: 0, fullSix: false
  },
  {
    name: '閏日取得滿 6 年（2026 非閏年，屆滿日為 2/28）',
    buy: '2020-02-29', sell: '2026-02-28',
    rate: 20, tier: '超過5年未逾10年', years: 6, months: 0, fullSix: true
  },
  {
    name: '閏日取得差 1 天未滿 6 年',
    buy: '2020-02-29', sell: '2026-02-27',
    rate: 20, tier: '超過5年未逾10年', years: 5, months: 11, fullSix: false
  }
];

let failed = 0;
for (const c of cases) {
  const info = hp.analyze(c.buy, c.sell);
  const problems = [];
  if (!info || !info.valid) problems.push('invalid');
  else {
    if (info.rate !== c.rate) problems.push('rate ' + info.rate + ' != ' + c.rate);
    if (info.tier !== c.tier) problems.push('tier ' + info.tier);
    if (info.years !== c.years) problems.push('years ' + info.years);
    if (info.months !== c.months) problems.push('months ' + info.months);
    if (info.fullSix !== c.fullSix) problems.push('fullSix ' + info.fullSix);
    if (c.rate === 45 && !(info.bracketYears <= 2)) problems.push('bracketYears should be <= 2, got ' + info.bracketYears);
    if (c.rate === 35 && !(info.bracketYears > 2 && info.bracketYears <= 5)) problems.push('bracketYears not in (2,5]: ' + info.bracketYears);
    if (c.rate === 20 && !(info.bracketYears > 5 && info.bracketYears <= 10)) problems.push('bracketYears not in (5,10]: ' + info.bracketYears);
    if (c.rate === 15 && !(info.bracketYears > 10)) problems.push('bracketYears should be > 10, got ' + info.bracketYears);
  }
  if (problems.length) {
    failed++;
    console.error('FAIL', c.name, problems.join('; '));
  } else {
    console.log('ok', c.name);
  }
}

// 舊算法在這兩個邊界會選錯級距，用來鎖住回歸。
assert.ok(oldYears('2023-03-01', '2025-03-01') > 2, 'old method treats exact 2 years as over 2');
assert.ok(daysBetween('2023-03-01', '2025-03-01') === 731);
assert.ok(oldYears('2021-01-01', '2027-01-01') < 6, 'old method treats exact 6 years as under 6');
assert.strictEqual(hp.analyze('2023-03-01', '2025-03-01').rate, 45);
assert.strictEqual(hp.analyze('2021-01-01', '2027-01-01').fullSix, true);

// 重購退稅「二年內」用曆年，不看 730 天。
assert.strictEqual(hp.withinCalendarYears('2023-03-01', '2025-03-01', 2), true);
assert.strictEqual(hp.withinCalendarYears('2025-03-01', '2023-03-01', 2), true);
assert.strictEqual(hp.withinCalendarYears('2023-03-01', '2025-03-02', 2), false);
assert.ok(daysBetween('2023-03-01', '2025-03-01') > 730);
assert.strictEqual(hp.withinCalendarYears('2020-02-29', '2022-02-28', 2), true);
assert.strictEqual(hp.withinCalendarYears('2020-02-29', '2022-03-01', 2), false);

// 出售早於取得
assert.strictEqual(hp.analyze('2025-03-01', '2023-03-01').valid, false);
assert.strictEqual(hp.analyze('not-a-date', '2023-03-01'), null);

if (failed) {
  console.error(failed + ' case(s) failed');
  process.exit(1);
}
console.log('holding-period tests passed');
