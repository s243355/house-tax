// 分享預覽圖的字型解析：不依賴機器上真的裝了哪一版 Noto。
const { execFileSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, '..', 'scripts', 'yucheng', 'test_og_font.py');
const out = execFileSync('python3', [script], { encoding: 'utf8' });
if (!out.includes('\nok\n') && !out.endsWith('ok\n')) {
  throw new Error('og font check did not pass:\n' + out);
}
