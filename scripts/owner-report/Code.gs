/**
 * 屋主售屋建議報告書：網站版存檔接收端（Google Apps Script 網頁應用程式）
 *
 * 做兩件事：
 *   GET  ?k=店內密碼        回傳「社區資料」分頁的社區清單，給網站版「選擇社區」使用
 *   POST {k, name, ...}    把報告檔案存進雲端硬碟資料夾，並更新「社區資料」與「報告紀錄」兩個分頁
 *
 * 設定：專案設定 → 指令碼屬性，新增 PASSCODE = 店內密碼
 */
const FOLDER_ID = '1IFVCbG3ETDYHNIuNndNupBTRZQARaV1G';           // 屋主售屋建議報告書存檔
const SHEET_ID = '1d7i5Zag3BzCG7f_VRN8jfvcimRtFQ0TF24Rpp8deaJk';  // 社區資料庫（屋主售屋建議報告書）
const COMM = '社區資料';
const REPORTS = '報告紀錄';
const COL_COUNT = 18;  // R 欄：報告數
const COL_JSON = 21;   // U 欄：完整資料(JSON)

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function passOk_(k) {
  const pass = PropertiesService.getScriptProperties().getProperty('PASSCODE');
  return !!pass && String(k || '') === pass;
}

function doGet(e) {
  if (!passOk_(e.parameter.k)) return out_({ ok: false, error: 'pass' });
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(COMM);
  const last = sh.getLastRow();
  const communities = [];
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, COL_JSON).getValues();
    vals.forEach(function (r) {
      if (!r[0]) return;
      let doc = null;
      try { doc = JSON.parse(r[COL_JSON - 1] || 'null'); } catch (err) {}
      if (!doc) doc = { name: String(r[0]), basic: { address: r[2], built: r[3], use: r[4], type: r[5], floors: r[6], wall: r[7], guard: r[8], parking: r[9] }, features: String(r[10] || '').split('；').join('\n') };
      doc.name = String(r[0]);
      communities.push(doc);
    });
  }
  return out_({ ok: true, communities: communities });
}

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

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'json' }); }
  if (!passOk_(body.k)) return out_({ ok: false, error: 'pass' });
  const name = String(body.name || '').trim();
  if (!name) return out_({ ok: false, error: 'name' });

  // 1. 檔案存進雲端硬碟資料夾
  const folder = DriveApp.getFolderById(FOLDER_ID);
  let firstUrl = '';
  (body.files || []).forEach(function (f) {
    const blob = Utilities.newBlob(Utilities.base64Decode(f.b64), f.mime, f.name);
    const file = folder.createFile(blob);
    if (!firstUrl) firstUrl = file.getUrl();
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);

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

    // 3. 報告紀錄：每次存檔新增一列，最後一欄放雲端檔案連結
    const rep = (body.repRow || []).slice();
    if (rep.length >= 18) rep[17] = firstUrl || rep[17];
    ss.getSheetByName(REPORTS).appendRow(rep);
  } finally {
    lock.releaseLock();
  }
  return out_({ ok: true, url: firstUrl });
}
