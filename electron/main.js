import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { runDownload } from '../src/runDownload.js';
import { hasSettings, saveSettings, loadConfig, appendHistory, loadHistory } from '../src/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERDATA = app.getPath('userData');
const TASK_NAME = '公文附件下載器';
const isAuto = process.argv.includes('--auto');

// 打包後 Chromium 在 resources/ms-playwright
if (app.isPackaged) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(process.resourcesPath, 'ms-playwright');
}

function runTask(args) {
  return new Promise((resolve) => {
    execFile('schtasks', args, { windowsHide: true }, (err) => resolve(!err));
  });
}

// 把進度事件寫一行到 run.log（排程 --auto 失敗時可據此診斷）
function logEvent(e) {
  try {
    const line = `${new Date().toISOString()} [${e.type}] ${e.docNumber || ''} ${e.message || e.outputDir || ''}\n`;
    appendFileSync(join(USERDATA, 'run.log'), line);
  } catch { /* log 失敗不影響主流程 */ }
}

function recordProgress(e) {
  logEvent(e);
  if (e.type === 'item-done' && e.status === 'downloaded') {
    appendHistory(USERDATA, { time: new Date().toISOString(), docNumber: e.docNumber, count: e.count });
  }
}

async function startDownload(win, force = false) {
  const config = loadConfig(USERDATA);
  await runDownload({
    config,
    force,
    onProgress: (e) => {
      if (win && !win.isDestroyed()) win.webContents.send('progress', e);
      recordProgress(e);
    },
  });
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
    if (on) return runTask(['/Create', '/TN', TASK_NAME, '/TR', `"${process.execPath}" --auto`, '/SC', 'DAILY', '/ST', '08:00', '/F']);
    return runTask(['/Delete', '/TN', TASK_NAME, '/F']);
  });
}

async function runAutoAndQuit() {
  try {
    if (hasSettings(USERDATA)) {
      await runDownload({ config: loadConfig(USERDATA), onProgress: recordProgress });
    }
  } finally { app.quit(); }
}

app.whenReady().then(() => {
  if (isAuto) runAutoAndQuit();
  else createWindow();
});
app.on('window-all-closed', () => { if (!isAuto) app.quit(); });
