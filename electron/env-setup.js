// 必須在「import playwright」之前執行。
// playwright-core 在模組載入當下就把瀏覽器 registry 路徑（讀 PLAYWRIGHT_BROWSERS_PATH）凍結，
// 若等到 main.js 本體才設定 process.env，已經太晚——playwright 會 fallback 到
// %LOCALAPPDATA%\ms-playwright（乾淨電腦上不存在 → chromium.launch 失敗 → UI 卡在「登入中…」）。
// 故把設定獨立成這支、放在 main.js 的第一個 import，確保早於 playwright 載入。
import { app } from 'electron';
import { join } from 'node:path';

if (app.isPackaged) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(process.resourcesPath, 'ms-playwright');
}
