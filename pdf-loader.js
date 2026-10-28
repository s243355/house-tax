// jsPDF 與 html2canvas 只在使用者按「下載 PDF／產生圖片」時才載入。
(function (root) {
  var pending = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  root.loadPdfLibs = function () {
    if (root.jspdf && root.html2canvas) return Promise.resolve();
    if (!pending) {
      pending = Promise.all([
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
      ]).then(function () {
        if (!root.jspdf || !root.html2canvas) throw new Error('pdf libs missing');
      }).catch(function (err) {
        pending = null;
        return Promise.reject(err);
      });
    }
    return pending;
  };
})(typeof window !== 'undefined' ? window : globalThis);
