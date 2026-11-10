// 實價登錄門牌鍵：二段／2段、之一／之1、全形數字視為同一地址。
// 查詢時把索引裡的舊鍵也正規化，所以不必先重建 data/lvr-idx。
const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export function toHalf(v) {
  return String(v == null ? '' : v).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).trim();
}

function cnInt(raw) {
  const t = String(raw || '');
  if (/^\d+$/.test(t)) return String(Number(t));
  if (t === '十') return '10';
  if (t.includes('十')) {
    const [a, b] = t.split('十');
    const n = (a ? CN[a] : 1) * 10 + (b ? (CN[b] || 0) : 0);
    return Number.isFinite(n) ? String(n) : t;
  }
  if (t.length === 1 && CN[t] != null) return String(CN[t]);
  return t;
}

export function lvrKey(raw) {
  let s = toHalf(String(raw || '').replace(/[－—–]/g, '-')).replace(/臺/g, '台');
  s = s.replace(/^(台中市)/, '').replace(/^[^\d]{1,4}區/, '');
  s = s.replace(/([零〇一二三四五六七八九十兩]+)段/g, (_, cn) => cnInt(cn) + '段');
  s = s.replace(/之([零〇一二三四五六七八九十兩]+)/g, (_, cn) => '之' + cnInt(cn));
  const m = s.match(/^(.+?\d+(?:之\d+)?號)/);
  return m ? m[1] : '';
}

function splitDoor(k) {
  const m = String(k).match(/^(.*?)(\d+)(?:之\d+)?號$/);
  return m ? { pre: m[1], no: Number(m[2]) } : null;
}

const EMPTY_HINT = '沒有對到近三年實價。路段「二段／2段」、之號「之一／之1」已試過對齊；若仍是 0 筆，可能是門牌寫法不同，或這個地址還沒有登錄。';

// 同一社區：同路巷、門牌 ±10、建築完成年月與總樓層相同。
export function selectLvrRows(data, address, hints) {
  const key = lvrKey(address);
  const grouped = new Map();
  Object.keys(data || {}).forEach((raw) => {
    const nk = lvrKey(raw);
    if (!nk) return;
    if (!grouped.has(nk)) grouped.set(nk, []);
    grouped.get(nk).push(...data[raw]);
  });
  const me = splitDoor(key);
  const sig = new Set();
  ((me && grouped.get(key)) || []).forEach((r) => { if (r[11]) sig.add(r[11] + '|' + r[12]); });
  const hintFloors = parseInt(toHalf((hints && hints.floors) || ''), 10) || 0;
  const hintAge = parseInt(toHalf((hints && hints.age) || ''), 10) || 0;
  const rocNow = new Date().getFullYear() - 1911;
  const sameComm = (r) => {
    if (sig.size) return sig.has(r[11] + '|' + r[12]);
    if (!hintFloors || !hintAge || !r[11]) return false;
    return r[12] === hintFloors && Math.abs(Math.floor(r[11] / 10000) - (rocNow - hintAge)) <= 1;
  };
  const rows = [];
  const entries = [];
  const addrs = [];
  if (me) {
    grouped.forEach((list, k) => {
      const s = splitDoor(k);
      if (!s || s.pre !== me.pre || Math.abs(s.no - me.no) > 10) return;
      const hit = s.no === me.no && !sig.size && !hintFloors ? list : list.filter(sameComm);
      if (hit.length) {
        hit.forEach((row) => { rows.push(row); entries.push({ addr: k, row: row }); });
        addrs.push(k);
      }
    });
  }
  entries.sort((a, b) => b.row[0] - a.row[0]);
  rows.sort((a, b) => b[0] - a[0]);
  const exactCount = ((me && grouped.get(key)) || []).length;
  let matchBy = '';
  if (rows.length) matchBy = exactCount ? (addrs.length > 1 ? 'building' : 'exact') : 'hint';
  return { key, rows, entries, addrs: addrs.sort(), matchBy, hint: rows.length ? '' : EMPTY_HINT };
}
