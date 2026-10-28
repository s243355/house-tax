// 站上的 LINE 是 line.me/ti/p/… 個人物帳，不能預填指定對象。
// 官方帳號（網址含 /ti/p/@）才改走 oaMessage。
(function (root) {
  var STYLE_ID = 'youcheng-line-style';
  function friendHref() {
    var a = document.getElementById('hdr-line') || document.getElementById('footer-line');
    var href = a && a.getAttribute('href');
    return href || 'https://line.me/ti/p/EfDsNa26Xw';
  }
  function officialId(href) {
    var m = String(href || '').match(/line\.me\/(?:R\/)?(?:ti\/p|oaMessage)\/(@[^/?#]+)/i);
    return m ? m[1] : '';
  }
  function shareUrl(text) {
    var id = officialId(friendHref());
    if (id) return 'https://line.me/R/oaMessage/' + id + '/?' + encodeURIComponent(text);
    return 'https://line.me/R/msg/text/?' + encodeURIComponent(text);
  }
  function withPage(text) {
    var body = String(text || '').trim();
    if (body.indexOf('頁面：') < 0) body += '\n頁面：' + location.href;
    return body;
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = ''
      + '#youcheng-line-slot{margin:14px 0 4px;}'
      + '.youcheng-line-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;'
      + 'min-height:48px;padding:12px 16px;border:none;border-radius:2px;cursor:pointer;'
      + 'background:#0a8a43;color:#fff;font-family:inherit;font-size:1rem;font-weight:700;letter-spacing:.04em;}'
      + '.youcheng-line-btn:active{background:#087238;}'
      + '.youcheng-line-note{margin:8px 0 0;font-size:.75rem;line-height:1.55;color:#5a4e44;}'
      + '#youcheng-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);'
      + 'background:#1a1410;color:#fff;padding:10px 16px;border-radius:2px;font-size:.9rem;'
      + 'z-index:10000;box-shadow:0 6px 20px rgba(0,0,0,.2);}';
    document.head.appendChild(s);
  }
  function toast(message) {
    var el = document.getElementById('youcheng-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'youcheng-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._t);
    el._t = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2200);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (err) { reject(err); }
    });
  }
  function slotHtml() {
    return '<button type="button" class="youcheng-line-btn" id="youcheng-line-btn">傳給祐承</button>'
      + '<p class="youcheng-line-note" id="youcheng-line-note"></p>';
  }
  function ensureSlot(anchorId) {
    ensureStyle();
    var slot = document.getElementById('youcheng-line-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'youcheng-line-slot';
      slot.hidden = true;
      slot.innerHTML = slotHtml();
    }
    var anchor = anchorId ? document.getElementById(anchorId) : null;
    if (anchor && slot.parentElement !== anchor) anchor.appendChild(slot);
    return slot;
  }
  function publish(text, anchorId) {
    if (!String(text || '').trim()) return;
    var body = withPage(text);
    root._youchengText = body;
    var slot = ensureSlot(anchorId);
    var note = document.getElementById('youcheng-line-note');
    var official = !!officialId(friendHref());
    if (note) {
      note.textContent = official
        ? '會打開祐承的官方帳號，並帶入這次試算文字。'
        : '祐承是個人 LINE，無法預先指定收件人。按下去會先複製摘要，再打開 LINE 讓你選祐承。';
    }
    slot.hidden = false;
  }
  function hide() {
    var slot = document.getElementById('youcheng-line-slot');
    if (slot) slot.hidden = true;
    root._youchengText = '';
  }
  function send() {
    var text = root._youchengText;
    if (!text) return;
    var official = !!officialId(friendHref());
    var url = shareUrl(text);
    var done = function () { if (!official) toast('已複製試算內容'); };
    copyText(text).then(done).catch(done);
    window.open(url, '_blank', 'noopener');
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && (t.id === 'youcheng-line-btn' || (t.closest && t.closest('#youcheng-line-btn')))) send();
    });
  }
  root.YouchengLine = {
    publish: publish,
    hide: hide,
    send: send,
    shareUrl: shareUrl,
    officialId: officialId
  };
})(typeof window !== 'undefined' ? window : globalThis);
