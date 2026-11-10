/**
 * 屋主售屋建議報告書：網站版資料庫與存檔（Google Apps Script 網頁應用程式）
 *
 * 權限：
 *   店長：指令碼屬性 ADMIN_CODE（店長管理碼），可在網站版「授權管理」新增、修改、停用同仁
 *   同仁：「授權名單」分頁一人一列，用 Google 帳號電子郵件＋個人存取碼登入
 *         讀取 = 開啟自己存過的報告；挑選社區 = 社區選單帶入；存檔 = 完成並存檔
 *
 * 所有請求都用 POST，密碼與存取碼只放在內容裡，不放在網址。
 */
const FOLDER_ID = '1IFVCbG3ETDYHNIuNndNupBTRZQARaV1G';           // 屋主售屋建議報告書存檔
const SHEET_ID = '1d7i5Zag3BzCG7f_VRN8jfvcimRtFQ0TF24Rpp8deaJk';  // 社區資料庫（屋主售屋建議報告書）
const COMM = '社區資料';
const REPORTS = '報告紀錄';
const AUTH = '授權名單';
const AUTH_HEAD = ['電子郵件', '姓名', '存取碼', '讀取', '挑選社區', '存檔', '狀態', '授權時間', '最後使用'];
const COL_COUNT = 18;  // 社區資料 R 欄：報告數
const COL_JSON = 21;   // 社區資料 U 欄：完整資料(JSON)
const REP_EMAIL = 19;  // 報告紀錄 S 欄：存檔帳號

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function authSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(AUTH);
  if (!sh) {
    sh = ss.insertSheet(AUTH);
    sh.getRange(1, 1, 1, AUTH_HEAD.length).setValues([AUTH_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function isAdmin_(body) {
  const code = PropertiesService.getScriptProperties().getProperty('ADMIN_CODE');
  return !!code && String(body.admin || '') === code;
}
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }

// 回傳 {email, name, read, pick, save} 或 null
function who_(body) {
  if (isAdmin_(body)) return { email: 'admin', name: '店長', read: true, pick: true, save: true, admin: true };
  const email = normEmail_(body.email), code = String(body.code || '').trim();
  if (!email || !code) return null;
  const sh = authSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, AUTH_HEAD.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (normEmail_(r[0]) === email && String(r[2]) === code && r[6] === '啟用') {
      sh.getRange(i + 2, 9).setValue(new Date());
      return { email: email, name: String(r[1] || ''), read: r[3] === true, pick: r[4] === true, save: r[5] === true };
    }
  }
  return null;
}

function doGet() { return out_({ ok: true, service: 'owner-report' }); }

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'json' }); }
  const action = body.action || 'save';
  if (action.indexOf('admin_') === 0) {
    if (!isAdmin_(body)) return out_({ ok: false, error: 'admin' });
    if (action === 'admin_list') return adminList_();
    if (action === 'admin_upsert') return adminUpsert_(body.user || {});
    return out_({ ok: false, error: 'action' });
  }
  const u = who_(body);
  if (!u) return out_({ ok: false, error: 'auth' });
  if (action === 'whoami') return out_({ ok: true, user: u });
  if (action === 'list') return u.pick ? list_() : out_({ ok: false, error: 'perm' });
  if (action === 'my_reports') return u.read ? myReports_(u) : out_({ ok: false, error: 'perm' });
  if (action === 'save') return u.save ? save_(body, u) : out_({ ok: false, error: 'perm' });
  return out_({ ok: false, error: 'action' });
}

/* ---------- 店長授權管理 ---------- */
function adminList_() {
  const sh = authSheet_();
  const last = sh.getLastRow();
  const users = last < 2 ? [] : sh.getRange(2, 1, last - 1, AUTH_HEAD.length).getValues().map(function (r) {
    return { email: r[0], name: r[1], code: String(r[2]), read: r[3] === true, pick: r[4] === true, save: r[5] === true, enabled: r[6] === '啟用', grantedAt: r[7] ? new Date(r[7]).toISOString() : '', lastUsed: r[8] ? new Date(r[8]).toISOString() : '' };
  });
  return out_({ ok: true, users: users });
}
function newCode_() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
function adminUpsert_(user) {
  const email = normEmail_(user.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return out_({ ok: false, error: 'email' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = authSheet_();
    const last = sh.getLastRow();
    const emails = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return normEmail_(r[0]); });
    const idx = emails.indexOf(email);
    const status = user.enabled === false ? '停用' : '啟用';
    if (idx >= 0) {
      const rowNo = idx + 2;
      const old = sh.getRange(rowNo, 1, 1, AUTH_HEAD.length).getValues()[0];
      const code = user.resetCode ? newCode_() : String(old[2]);
      sh.getRange(rowNo, 1, 1, 7).setValues([[email, user.name !== undefined ? user.name : old[1], code, !!user.read, !!user.pick, !!user.save, status]]);
      return out_({ ok: true, email: email, code: code, created: false });
    }
    const code = newCode_();
    sh.appendRow([email, user.name || '', code, user.read !== false, user.pick !== false, user.save !== false, status, new Date(), '']);
    // 讓同仁的 Google 帳號也能直接開雲端資料夾裡的報告
    try { DriveApp.getFolderById(FOLDER_ID).addViewer(email); } catch (err) {}
    return out_({ ok: true, email: email, code: code, created: true });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 社區清單 ---------- */
function list_() {
  const sh = ss_().getSheetByName(COMM);
  const last = sh.getLastRow();
  const communities = [];
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, COL_JSON).getValues().forEach(function (r) {
      if (!r[0]) return;
      let doc = null;
      try { doc = JSON.parse(r[COL_JSON - 1] || 'null'); } catch (err) {}
      if (!doc) doc = { basic: { address: r[2], built: r[3], use: r[4], type: r[5], floors: r[6], wall: r[7], guard: r[8], parking: r[9] }, features: String(r[10] || '').split('；').join('\n') };
      doc.name = String(r[0]);
      communities.push(doc);
    });
  }
  return out_({ ok: true, communities: communities });
}

/* ---------- 自己存過的報告 ---------- */
function myReports_(u) {
  const sh = ss_().getSheetByName(REPORTS);
  const last = sh.getLastRow();
  if (last < 2) return out_({ ok: true, reports: [] });
  const rows = sh.getRange(2, 1, last - 1, REP_EMAIL).getValues();
  const mine = rows.filter(function (r) { return u.admin || normEmail_(r[REP_EMAIL - 1]) === u.email; }).map(function (r) {
    return { at: String(r[0]), agent: r[1], community: r[2], address: r[3], floor: r[4], online: r[14], expect: r[15], url: r[17] };
  }).reverse().slice(0, 200);
  return out_({ ok: true, reports: mine });
}

/* ---------- 存檔 ---------- */
function nz_(v, old) {
  return v !== null && v !== undefined && String(v).trim() !== '' && String(v) !== '—' ? v : (old === undefined ? '' : old);
}
function mergeDoc_(o, d) {
  if (!o) return d;
  const outDoc = Object.assign({}, o, d);
  outDoc.basic = Object.assign({}, o.basic || {});
  Object.keys(d.basic || {}).forEach(function (k) { outDoc.basic[k] = nz_(d.basic[k], o.basic && o.basic[k]); });
  outDoc.features = nz_(d.features, o.features);
  if (!(d.market && d.market.rows && d.market.rows.length)) outDoc.market = o.market;
  if (!(d.listings && d.listings.length)) outDoc.listings = o.listings;
  if (!(d.poi && d.poi.length)) { outDoc.poi = o.poi; outDoc.poiCenter = o.poiCenter; }
  return outDoc;
}
function save_(body, u) {
  const name = String(body.name || '').trim();
  if (!name) return out_({ ok: false, error: 'name' });

  // 1. 檔案存進雲端硬碟資料夾
  const folder = DriveApp.getFolderById(FOLDER_ID);
  let firstUrl = '';
  (body.files || []).forEach(function (f) {
    const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(f.b64), f.mime, f.name));
    if (!firstUrl) firstUrl = file.getUrl();
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ss_();
    // 2. 社區資料：同名就更新（空白欄位不覆蓋），沒有就新增
    const sh = ss.getSheetByName(COMM);
    const row = (body.commRow || []).slice(0, COL_JSON);
    while (row.length < COL_JSON) row.push('');
    const last = sh.getLastRow();
    const names = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
    const idx = names.indexOf(name);
    if (idx >= 0) {
      const rowNo = idx + 2;
      const old = sh.getRange(rowNo, 1, 1, COL_JSON).getValues()[0];
      for (let i = 0; i < COL_JSON; i++) row[i] = nz_(row[i], old[i]);
      row[COL_COUNT - 1] = (parseInt(old[COL_COUNT - 1], 10) || 0) + 1;
      let oldDoc = null;
      try { oldDoc = JSON.parse(old[COL_JSON - 1] || 'null'); } catch (err) {}
      row[COL_JSON - 1] = JSON.stringify(mergeDoc_(oldDoc, body.doc || { name: name }));
      sh.getRange(rowNo, 1, 1, COL_JSON).setValues([row]);
    } else {
      row[COL_COUNT - 1] = 1;
      row[COL_JSON - 1] = JSON.stringify(body.doc || { name: name });
      sh.appendRow(row);
    }
    // 3. 報告紀錄：每次存檔新增一列（R 欄雲端檔案、S 欄存檔帳號）
    const rep = (body.repRow || []).slice(0, 18);
    while (rep.length < 18) rep.push('');
    rep[17] = firstUrl || rep[17];
    rep.push(u.email);
    ss.getSheetByName(REPORTS).appendRow(rep);
  } finally {
    lock.releaseLock();
  }
  return out_({ ok: true, url: firstUrl });
}
