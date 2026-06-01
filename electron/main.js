import './env-setup.js'; // 必須最先：在 playwright 載入前設好 PLAYWRIGHT_BROWSERS_PATH
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { runDownload } from '../src/runDownload.js';
import { hasSettings, saveSettings, loadConfig, appendHistory, loadHistory } from '../src/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERDATA = app.getPath('userData');
const LOG_FILE = join(USERDATA, 'run.log');
const TASK_NAME = '公文附件下載器';
const isAuto = process.argv.includes('--auto');

// 寫一行純文字到 run.log（診斷用，乾淨電腦卡關時這是唯一線索）
function log(msg) {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* log 失敗不影響主流程 */ }
}

// 把進度事件寫一行到 run.log；error 事件連同 stack 一起記
function logEvent(e) {
  const detail = e.message || e.outputDir || '';
  log(`[${e.type}] ${e.docNumber || ''} ${detail}`.trimEnd());
  if (e.type === 'error' && e.stack) log(`[error-stack] ${e.stack}`);
}

// 開機環境快照：乾淨電腦最常見死因是 Chromium 找不到 / 啟動失敗，先把路徑與是否存在記下來
function logEnvironment() {
  log('================ 啟動 ================');
  log(`mode=${isAuto ? 'auto' : 'gui'} isPackaged=${app.isPackaged} execPath=${process.execPath}`);
  log(`PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH || '(未設定)'}`);
  try {
    const exe = chromium.executablePath();
    log(`chromium.executablePath=${exe} exists=${existsSync(exe)}`);
  } catch (err) {
    log(`chromium.executablePath 解析失敗：${err.message}`);
  }
}

// 全域兜底：任何沒被 catch 的例外都進 log，避免乾淨電腦上靜默卡死
process.on('uncaughtException', (err) => log(`[uncaughtException] ${err.stack || err.message}`));
process.on('unhandledRejection', (reason) => log(`[unhandledRejection] ${reason && reason.stack ? reason.stack : reason}`));

function recordProgress(e) {
  logEvent(e);
  if (e.type === 'item-done' && e.status === 'downloaded') {
    appendHistory(USERDATA, { time: new Date().toISOString(), docNumber: e.docNumber, count: e.count });
  }
}

async function startDownload(win, force = false) {
  const send = (e) => {
    if (win && !win.isDestroyed()) win.webContents.send('progress', e);
    recordProgress(e);
  };
  try {
    log(`start-download force=${force}`);
    const config = loadConfig(USERDATA);
    log(`設定載入完成 baseUrl=${config.baseUrl} account=${config.account} outputDir=${config.outputDir}`);
    await runDownload({ config, force, onProgress: send });
  } catch (err) {
    // loadConfig 等發生在 runDownload 之外的錯誤，自己補一個 error 事件給 UI，否則畫面會卡在「登入中…」
    log(`[startDownload-catch] ${err.stack || err.message}`);
    send({ type: 'error', message: err.message, stack: err.stack });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900, height: 640, title: '公文附件下載器',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.loadFile(join(__dirname, 'renderer', 'index.html'));

  ipcMain.handle('get-state', () => ({ configured: hasSettings(USERDATA) }));
  ipcMain.handle('get-settings', () => {
    try { const c = loadConfig(USERDATA); return { baseUrl: c.baseUrl, account: c.account, password: c.password, outputDir: c.outputDir }; }
    catch { return { baseUrl: '', account: '', password: '', outputDir: 'D:\\公文附件' }; }
  });
  ipcMain.handle('save-settings', (_e, v) => { saveSettings(USERDATA, v); return true; });
  ipcMain.handle('start-download', (_e, opts) => startDownload(win, Boolean(opts && opts.force)));
  ipcMain.handle('open-folder', () => { try { return shell.openPath(loadConfig(USERDATA).outputDir); } catch { return 'no-config'; } });
  ipcMain.handle('get-history', () => loadHistory(USERDATA));
  ipcMain.handle('get-schedule', () => runTask(['/Query', '/TN', TASK_NAME]));
  ipcMain.handle('set-schedule', async (_e, on) => {
    if (on) return runTask(['/Create', '/TN', TASK_NAME, '/TR', `"${process.execPath}" --auto`, '/SC', 'HOURLY', '/MO', '1', '/F']);
    return runTask(['/Delete', '/TN', TASK_NAME, '/F']);
  });
}

async function runAutoAndQuit() {
  try {
    if (hasSettings(USERDATA)) {
      const config = loadConfig(USERDATA);
      log(`auto 設定載入完成 baseUrl=${config.baseUrl} account=${config.account} outputDir=${config.outputDir}`);
      await runDownload({ config, onProgress: recordProgress });
    } else {
      log('auto 模式但尚未設定，略過');
    }
  } catch (err) {
    log(`[runAutoAndQuit-catch] ${err.stack || err.message}`);
  } finally { app.quit(); }
}

app.whenReady().then(() => {
  logEnvironment();
  if (isAuto) runAutoAndQuit();
  else createWindow();
});
app.on('window-all-closed', () => { if (!isAuto) app.quit(); });
