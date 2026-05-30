# 主程式 Electron GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 CLI 主程式改成 Electron 桌面 App：開啟即自動下載、表格即時顯示進度、含設定/開資料夾/每日自動/歷史，用 electron-builder 打包成含授權頁的安裝程式。

**Architecture:** core 抓檔模組重用，但 config 改為「參數傳入」；orchestrator 抽成 `runDownload({config,onProgress},deps)`（deps 可注入以便單元測試）。Electron main（Node）跑 runDownload、管設定/排程/開資料夾，透過 IPC 把進度事件送給 renderer 的 HTML 表格。設定存 `userData\settings.json`。

**Tech Stack:** Electron、electron-builder、Playwright、Node `node:test`。

---

## 檔案結構

| 檔案 | 職責 |
|------|------|
| `src/config.js`（改） | `loadConfigFromEnv()` 回傳 config 物件（取代會 throw 的全域單例） |
| `src/login.js` `listScraper.js` `docHandler.js`（改） | 函式改收 `config` 參數，不再 import 全域 config |
| `src/runDownload.js`（新） | `runDownload({config,onProgress}, deps?)`：orchestrator 迴圈，發進度事件 |
| `src/index.js`（改） | 薄 CLI：loadConfigFromEnv + console onProgress 呼叫 runDownload |
| `src/settings.js`（新） | Electron 設定/歷史：load/save settings.json、history.json（userData） |
| `electron/main.js`（新） | BrowserWindow、IPC、`--auto` 無視窗、PLAYWRIGHT_BROWSERS_PATH、schtasks、開資料夾 |
| `electron/preload.js`（新） | contextBridge 白名單 API |
| `electron/renderer/index.html`（新） | 設定畫面 + 主表格 + 工具列 + 歷史 |
| `electron/renderer/renderer.js`（新） | 畫面邏輯，呼叫 preload API、收進度事件更新表格 |
| `electron/renderer/styles.css`（新） | 樣式 |
| `package.json`（改） | electron deps、main、scripts、build（electron-builder）設定 |
| `test/runDownload.test.js` `test/settings.test.js`（新） | 單元測試 |

---

## Task 1: config 改回傳物件 + 各模組改收 config 參數

**Files:**
- Modify: `src/config.js`, `src/login.js`, `src/listScraper.js`, `src/docHandler.js`, `src/index.js`
- Test: `test/config.test.js`

- [ ] **Step 1: 寫 config 測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../src/config.js';

test('buildConfig 由 env-like 物件組出 config，套用預設值', () => {
  const c = buildConfig({ GW_BASE_URL: 'u', GW_ACCOUNT: 'a', GW_PASSWORD: 'p', GW_OUTPUT_DIR: 'd' });
  assert.equal(c.baseUrl, 'u');
  assert.equal(c.account, 'a');
  assert.equal(c.timeout, 30000);
  assert.equal(c.processedFile, 'processed.json');
});

test('buildConfig 缺必填丟錯', () => {
  assert.throws(() => buildConfig({ GW_BASE_URL: '', GW_ACCOUNT: 'a', GW_PASSWORD: 'p', GW_OUTPUT_DIR: 'd' }));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/config.test.js`
Expected: FAIL（buildConfig 未定義）

- [ ] **Step 3: 改寫 `src/config.js`**

```js
import 'dotenv/config';

export function buildConfig(env) {
  const required = (name) => {
    const v = env[name];
    if (!v) throw new Error(`缺少設定 ${name}`);
    return v;
  };
  return {
    baseUrl: required('GW_BASE_URL'),
    account: required('GW_ACCOUNT'),
    password: required('GW_PASSWORD'),
    outputDir: required('GW_OUTPUT_DIR'),
    timeout: Number(env.GW_TIMEOUT ?? 30000),
    processedFile: env.GW_PROCESSED_FILE ?? 'processed.json',
  };
}

export function loadConfigFromEnv() {
  return buildConfig(process.env);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/config.test.js`
Expected: PASS（2 tests）

- [ ] **Step 5: 改 `src/login.js`（收 config 參數）**

```js
import { selectors as S } from './selectors.js';
import { waitForFrame } from './frames.js';

export async function login(page, config) {
  await page.goto(config.baseUrl, { timeout: config.timeout, waitUntil: 'domcontentloaded' });
  const loginFrame = await waitForFrame(page, S.login.frameUrlIncludes, config.timeout);
  await loginFrame.fill(S.login.account, config.account);
  await loginFrame.fill(S.login.password, config.password);
  await loginFrame.evaluate((fn) => window[fn](), S.login.submitFn);
  await waitForFrame(page, S.loginSuccess.frameUrlIncludes, config.timeout);
}
```

- [ ] **Step 6: 改 `src/listScraper.js`（openInbox 收 config；scrapeInbox 不變動行為但加 config 參數備用）**

```js
import { selectors as S } from './selectors.js';
import { findFrame, waitForFrame } from './frames.js';

export async function openInbox(page, config) {
  const tree = await waitForFrame(page, S.tree.frameUrlIncludes, config.timeout);
  await tree.waitForFunction((id) => !!document.getElementById(id), S.tree.inboxNodeId, {
    timeout: config.timeout,
  });
  await tree.evaluate((id) => {
    const span = document.getElementById(id);
    if (!span) throw new Error('找不到收件夾節點');
    let el = span;
    for (let i = 0; i < 4 && el; i++) {
      if (el.click) el.click();
      el = el.parentElement;
    }
  }, S.tree.inboxNodeId);
  const listFrame = await waitForFrame(page, S.list.frameUrlIncludes, config.timeout);
  await listFrame.waitForSelector('tr.headTr', { timeout: config.timeout }).catch(() => {});
  await page.waitForTimeout(800);
}

export async function scrapeInbox(page) {
  const listFrame = findFrame(page, S.list.frameUrlIncludes);
  if (!listFrame) throw new Error('找不到公文清單區塊');
  return listFrame.evaluate(
    (cfg) => {
      const pat = new RegExp(cfg.pattern);
      const rows = [...document.querySelectorAll('tr')].filter(
        (tr) => tr.children[cfg.numIdx] && pat.test((tr.children[cfg.numIdx].innerText || '').trim())
      );
      return rows.map((tr) => {
        const c = tr.children;
        const subjCell = c[cfg.subjIdx];
        const link = subjCell.querySelector('a[href^="javascript:get_sheet"]');
        return {
          docNumber: (c[cfg.numIdx].innerText || '').trim(),
          subject: (subjCell.innerText || '').trim(),
          href: link ? link.getAttribute('href') : '',
        };
      });
    },
    { pattern: S.list.docNumberPattern.source, numIdx: S.list.docNumberCellIndex, subjIdx: S.list.subjectCellIndex }
  );
}
```

- [ ] **Step 7: 改 `src/docHandler.js`（各函式收 config 參數）**

```js
import { join } from 'node:path';
import { selectors as S } from './selectors.js';
import { findFrame, waitForFrame } from './frames.js';

const ILLEGAL = /[\\/:*?"<>|]/g;

export async function openDoc(page, item, config) {
  const listFrame = findFrame(page, S.list.frameUrlIncludes);
  if (!listFrame) throw new Error('開啟公文前找不到清單區塊');
  await listFrame.evaluate((href) => {
    const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href') === href);
    if (!a) throw new Error('找不到該公文的開啟連結');
    a.click();
  }, item.href);
  await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
}

export async function collectAttachments(page, config) {
  const docFrame = await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
  await docFrame.waitForSelector('#attachments', { timeout: config.timeout }).catch(() => {});
  await docFrame
    .waitForFunction((sel) => document.querySelectorAll(sel).length > 0, S.doc.attachLinkSelector, { timeout: 8000 })
    .catch(() => {});
  const onclicks = await docFrame.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((a) => a.getAttribute('onclick')),
    S.doc.attachLinkSelector
  );
  return onclicks
    .map((oc) => oc && oc.match(/dlAttach\('([^']*)','([^']*)'\)/))
    .filter(Boolean)
    .map((m) => ({ encoded: m[1], filename: m[2] }));
}

export async function downloadAttachments(page, destDir, config, atts) {
  const docFrame = await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
  const saved = [];
  for (const { encoded, filename } of atts) {
    let download;
    const fire = () =>
      Promise.all([
        page.waitForEvent('download', { timeout: config.timeout }),
        docFrame.evaluate(({ e, f }) => window.dlAttach(e, f), { e: encoded, f: filename }),
      ]);
    try {
      [download] = await fire();
    } catch {
      [download] = await fire();
    }
    const dest = join(destDir, filename.replace(ILLEGAL, '_'));
    await download.saveAs(dest);
    saved.push(dest);
  }
  return saved;
}
```

- [ ] **Step 8: 改 `src/index.js`（薄 CLI，先確保仍可編譯；orchestrator 邏輯下一個 Task 移到 runDownload）**

```js
import { loadConfigFromEnv } from './config.js';
import { runDownload } from './runDownload.js';

const dryRun = process.argv.includes('--dry-run');

function consoleProgress(e) {
  if (e.type === 'login') console.log('✅ 登入成功');
  else if (e.type === 'list') console.log(`收件夾 ${e.total} 件，其中新件 ${e.fresh} 件`);
  else if (e.type === 'item-done') console.log(`  ${e.docNumber}：${e.message}`);
  else if (e.type === 'done') console.log(`\n完成：新下載 ${e.downloaded} 件，失敗 ${e.failed}。存放：${e.outputDir}`);
  else if (e.type === 'error') console.error(`❌ ${e.message}`);
}

runDownload({ config: loadConfigFromEnv(), onProgress: consoleProgress, dryRun });
```

- [ ] **Step 9: node --check 全部**

Run: `node --check src/config.js && node --check src/login.js && node --check src/listScraper.js && node --check src/docHandler.js && node --check src/index.js`
Expected: 無輸出（語法 OK）。注意 index.js 會 import runDownload.js（下個 Task 建立），此步只查語法、先不執行。

- [ ] **Step 10: Commit**

```bash
git add src/config.js src/login.js src/listScraper.js src/docHandler.js src/index.js test/config.test.js
git commit -m "refactor: config 改回傳物件、模組改收 config 參數"
```

---

## Task 2: runDownload（orchestrator 抽出，可注入 deps，TDD）

**Files:**
- Create: `src/runDownload.js`
- Test: `test/runDownload.test.js`

- [ ] **Step 1: 寫測試（注入假 deps，驗證事件序列與不建空資料夾）**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDownload } from '../src/runDownload.js';

function makeDeps(overrides = {}) {
  const created = [];
  return {
    created,
    deps: {
      chromium: { launch: async () => ({ newPage: async () => ({}), close: async () => {} }) },
      login: async () => {},
      openInbox: async () => {},
      scrapeInbox: async () => [
        { docNumber: 'A1', subject: '主旨一', href: 'h1' },
        { docNumber: 'B2', subject: '主旨二', href: 'h2' },
      ],
      filterNew: (items) => items,
      loadProcessed: () => new Set(),
      saveProcessed: () => {},
      openDoc: async () => {},
      collectAttachments: async (page, cfg) => (cfg._n2 ? [] : [{ encoded: 'e', filename: 'f.pdf' }]),
      downloadAttachments: async () => ['x'],
      buildFolderName: (n, s) => `${n}_${s}`,
      ensureFolder: (out, name) => { created.push(name); return { dir: name, isNew: true }; },
      existsSync: () => false,
      ...overrides,
    },
  };
}

test('正常流程發出 login/list/item-done/done 事件', async () => {
  const events = [];
  const { deps } = makeDeps();
  await runDownload({ config: { outputDir: 'O', processedFile: 'p' }, onProgress: (e) => events.push(e.type) }, deps);
  assert.ok(events.includes('login'));
  assert.ok(events.includes('list'));
  assert.ok(events.includes('done'));
});

test('無附件不建資料夾', async () => {
  const { deps, created } = makeDeps({ collectAttachments: async () => [] });
  await runDownload({ config: { outputDir: 'O', processedFile: 'p' }, onProgress: () => {} }, deps);
  assert.equal(created.length, 0);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/runDownload.test.js`
Expected: FAIL（runDownload 未定義）

- [ ] **Step 3: 寫 `src/runDownload.js`**

```js
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { login } from './login.js';
import { openInbox, scrapeInbox } from './listScraper.js';
import { openDoc, collectAttachments, downloadAttachments } from './docHandler.js';
import { buildFolderName, ensureFolder } from './fileManager.js';
import { loadProcessed, saveProcessed, filterNew } from './stateStore.js';

const REAL = {
  chromium, login, openInbox, scrapeInbox, openDoc, collectAttachments,
  downloadAttachments, buildFolderName, ensureFolder, loadProcessed, saveProcessed, filterNew, existsSync,
};

export async function runDownload({ config, onProgress, dryRun = false }, deps = REAL) {
  const emit = (e) => { if (onProgress) onProgress(e); };
  const processed = deps.loadProcessed(config.processedFile);
  const browser = await deps.chromium.launch({ headless: true });
  const page = await browser.newPage();
  let downloaded = 0;
  let failed = 0;
  try {
    await deps.login(page, config);
    emit({ type: 'login' });

    await deps.openInbox(page, config);
    const items = await deps.scrapeInbox(page, config);
    const newItems = deps.filterNew(items, processed);
    emit({ type: 'list', total: items.length, fresh: newItems.length, items: newItems });

    for (const item of newItems) {
      const folderName = deps.buildFolderName(item.docNumber, item.subject);
      emit({ type: 'item-start', docNumber: item.docNumber });

      if (dryRun) { emit({ type: 'item-done', docNumber: item.docNumber, status: 'dry', message: `會建 ${folderName}` }); continue; }

      if (deps.existsSync(join(config.outputDir, folderName))) {
        processed.add(item.docNumber);
        emit({ type: 'item-done', docNumber: item.docNumber, status: 'skipped', message: '資料夾已存在' });
        continue;
      }
      try {
        await deps.openDoc(page, item, config);
        const atts = await deps.collectAttachments(page, config);
        if (atts.length === 0) {
          processed.add(item.docNumber);
          emit({ type: 'item-done', docNumber: item.docNumber, status: 'noattach', message: '無附件' });
        } else {
          const { dir } = deps.ensureFolder(config.outputDir, folderName);
          const saved = await deps.downloadAttachments(page, dir, config, atts);
          processed.add(item.docNumber);
          downloaded += 1;
          emit({ type: 'item-done', docNumber: item.docNumber, status: 'downloaded', count: saved.length, message: `下載 ${saved.length} 個附件` });
        }
        await deps.openInbox(page, config);
      } catch (err) {
        failed += 1;
        emit({ type: 'item-done', docNumber: item.docNumber, status: 'failed', message: err.message });
        try { await deps.openInbox(page, config); } catch { /* 回清單失敗，外層收尾 */ }
      }
    }
    if (!dryRun) deps.saveProcessed(config.processedFile, processed);
    emit({ type: 'done', downloaded, failed, outputDir: config.outputDir });
  } catch (err) {
    emit({ type: 'error', message: err.message });
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/runDownload.test.js`
Expected: PASS（2 tests）

- [ ] **Step 5: 全測試 + dry-run 驗證（需 .env）**

Run: `npm test` 然後 `npm run dry-run`
Expected: 全測試過；dry-run 登入成功並列出新件（CLI 仍可用）。

- [ ] **Step 6: Commit**

```bash
git add src/runDownload.js test/runDownload.test.js
git commit -m "feat: runDownload 抽出 orchestrator（可注入 deps，發進度事件）"
```

---

## Task 3: settings.js（Electron 設定/歷史，TDD）

**Files:**
- Create: `src/settings.js`
- Test: `test/settings.test.js`

- [ ] **Step 1: 寫測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasSettings, saveSettings, loadConfig, appendHistory, loadHistory } from '../src/settings.js';

test('無設定時 hasSettings 為 false', () => {
  const d = mkdtempSync(join(tmpdir(), 'gw-'));
  assert.equal(hasSettings(d), false);
});

test('save 後 loadConfig 還原並補預設與 userData 路徑', () => {
  const d = mkdtempSync(join(tmpdir(), 'gw-'));
  saveSettings(d, { baseUrl: 'u', account: 'a', password: 'p', outputDir: 'D:\\公文' });
  assert.equal(hasSettings(d), true);
  const c = loadConfig(d);
  assert.equal(c.baseUrl, 'u');
  assert.equal(c.timeout, 30000);
  assert.equal(c.processedFile, join(d, 'processed.json'));
});

test('appendHistory 後 loadHistory 取得紀錄（新在前）', () => {
  const d = mkdtempSync(join(tmpdir(), 'gw-'));
  appendHistory(d, { time: '2026-05-30T10:00', docNumber: 'A1', count: 2 });
  appendHistory(d, { time: '2026-05-30T11:00', docNumber: 'B2', count: 1 });
  const h = loadHistory(d);
  assert.equal(h[0].docNumber, 'B2');
  assert.equal(h.length, 2);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/settings.test.js`
Expected: FAIL（函式未定義）

- [ ] **Step 3: 寫 `src/settings.js`**

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const settingsPath = (dir) => join(dir, 'settings.json');
const historyPath = (dir) => join(dir, 'history.json');

export function hasSettings(dir) {
  if (!existsSync(settingsPath(dir))) return false;
  const s = JSON.parse(readFileSync(settingsPath(dir), 'utf8'));
  return Boolean(s.baseUrl && s.account && s.password && s.outputDir);
}

export function saveSettings(dir, { baseUrl, account, password, outputDir }) {
  writeFileSync(settingsPath(dir), JSON.stringify({ baseUrl, account, password, outputDir }, null, 2), 'utf8');
}

export function loadConfig(dir) {
  const s = JSON.parse(readFileSync(settingsPath(dir), 'utf8'));
  return {
    baseUrl: s.baseUrl,
    account: s.account,
    password: s.password,
    outputDir: s.outputDir,
    timeout: 30000,
    processedFile: join(dir, 'processed.json'),
  };
}

export function loadHistory(dir) {
  if (!existsSync(historyPath(dir))) return [];
  return JSON.parse(readFileSync(historyPath(dir), 'utf8'));
}

export function appendHistory(dir, record) {
  const list = loadHistory(dir);
  list.unshift(record);
  writeFileSync(historyPath(dir), JSON.stringify(list.slice(0, 500), null, 2), 'utf8');
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/settings.test.js`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add src/settings.js test/settings.test.js
git commit -m "feat: settings.js（userData 設定與歷史）"
```

---

## Task 4: Electron 依賴與 main 程序

**Files:**
- Modify: `package.json`
- Create: `electron/main.js`

- [ ] **Step 1: 裝 Electron 依賴**

Run: `npm install --save-dev electron@33 electron-builder@25`
Expected: 安裝成功，devDependencies 出現 electron、electron-builder。

- [ ] **Step 2: package.json 加 main 與 scripts**

把 `package.json` 的 `"main"` 設為 `"electron/main.js"`，scripts 加：
```json
"app": "electron .",
"dist": "electron-builder"
```
（保留既有 start/dry-run/test。）

- [ ] **Step 3: 寫 `electron/main.js`**

```js
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
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

async function startDownload(win) {
  const config = loadConfig(USERDATA);
  await runDownload({
    config,
    onProgress: (e) => {
      if (win && !win.isDestroyed()) win.webContents.send('progress', e);
      if (e.type === 'item-done' && e.status === 'downloaded') {
        appendHistory(USERDATA, { time: new Date().toISOString(), docNumber: e.docNumber, count: e.count });
      }
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
  ipcMain.handle('start-download', () => startDownload(win));
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
      await runDownload({ config: loadConfig(USERDATA), onProgress: (e) => {
        if (e.type === 'item-done' && e.status === 'downloaded') appendHistory(USERDATA, { time: new Date().toISOString(), docNumber: e.docNumber, count: e.count });
      } });
    }
  } finally { app.quit(); }
}

app.whenReady().then(() => {
  if (isAuto) runAutoAndQuit();
  else createWindow();
});
app.on('window-all-closed', () => { if (!isAuto) app.quit(); });
```

- [ ] **Step 4: 語法檢查**

Run: `node --check electron/main.js`
Expected: 無輸出。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron/main.js
git commit -m "feat: Electron main（IPC/排程/開資料夾/--auto 無視窗）"
```

---

## Task 5: preload

**Files:**
- Create: `electron/preload.cjs`

> 用 `.cjs` 副檔名：專案是 `"type":"module"`，preload 需 CommonJS（`require`），`.cjs` 強制 CJS 解析。main.js 的 `webPreferences.preload` 已指向 `preload.cjs`。

- [ ] **Step 1: 寫 `electron/preload.cjs`**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (v) => ipcRenderer.invoke('save-settings', v),
  startDownload: () => ipcRenderer.invoke('start-download'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  getSchedule: () => ipcRenderer.invoke('get-schedule'),
  setSchedule: (on) => ipcRenderer.invoke('set-schedule', on),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, data) => cb(data)),
});
```

> 註：preload 用 CommonJS `require`（Electron preload 預設 CJS），與專案其餘 ESM 不衝突，因副檔名邏輯由 Electron 處理；若 `"type":"module"` 導致 preload 被當 ESM，改檔名為 `preload.cjs` 並於 main 的 webPreferences.preload 對應。

- [ ] **Step 2: Commit**

```bash
git add electron/preload.cjs
git commit -m "feat: Electron preload（contextBridge 白名單 API）"
```

---

## Task 6: renderer（設定畫面 + 表格 + 工具列 + 歷史）

**Files:**
- Create: `electron/renderer/index.html`, `electron/renderer/renderer.js`, `electron/renderer/styles.css`

- [ ] **Step 1: 寫 `electron/renderer/index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
  <link rel="stylesheet" href="styles.css" />
  <title>公文附件下載器</title>
</head>
<body>
  <div id="setup" class="hidden">
    <h2>首次設定</h2>
    <label>公文系統登入網址<input id="s-url" placeholder="https://校名.cyberhood.net.tw/tw/" /></label>
    <label>帳號<input id="s-acc" /></label>
    <label>密碼<input id="s-pwd" type="password" /></label>
    <label>存放資料夾<input id="s-out" placeholder="D:\公文附件" /></label>
    <button id="s-save">儲存並開始</button>
  </div>

  <div id="main" class="hidden">
    <div class="toolbar">
      <button id="t-run">🔄 重新下載</button>
      <button id="t-folder">📂 開啟資料夾</button>
      <button id="t-settings">⚙️ 設定</button>
      <label class="sched">⏰ 每日自動 <input type="checkbox" id="t-sched" /></label>
      <button id="t-history">🕘 歷史</button>
    </div>
    <div id="summary" class="summary">準備中…</div>
    <table id="grid">
      <thead><tr><th>簽呈編號</th><th>主旨</th><th>狀態</th></tr></thead>
      <tbody></tbody>
    </table>
    <div id="history" class="hidden">
      <h3>下載歷史</h3>
      <table id="hgrid"><thead><tr><th>時間</th><th>編號</th><th>檔數</th></tr></thead><tbody></tbody></table>
    </div>
  </div>
  <script src="renderer.js"></script>
</body>
</html>
```

- [ ] **Step 2: 寫 `electron/renderer/styles.css`**

```css
* { box-sizing: border-box; font-family: "Microsoft JhengHei", "PingFang TC", sans-serif; }
body { margin: 0; padding: 12px; color: #222; }
.hidden { display: none; }
#setup label { display: block; margin: 10px 0; }
#setup input { width: 100%; padding: 6px; margin-top: 4px; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.toolbar button { padding: 6px 10px; cursor: pointer; }
.summary { padding: 6px 0; font-weight: bold; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 14px; }
th { background: #f4f4f4; }
.st-downloaded { color: #137333; }
.st-failed { color: #c5221f; }
.st-skipped, .st-noattach { color: #888; }
.st-downloading { color: #1a73e8; }
button { font-size: 14px; }
#s-save { padding: 8px 16px; margin-top: 8px; cursor: pointer; }
```

- [ ] **Step 3: 寫 `electron/renderer/renderer.js`**

```js
const $ = (id) => document.getElementById(id);
const rows = new Map(); // docNumber -> <tr>

function showSetup(values) {
  $('main').classList.add('hidden');
  $('setup').classList.remove('hidden');
  $('s-url').value = values.baseUrl || '';
  $('s-acc').value = values.account || '';
  $('s-pwd').value = values.password || '';
  $('s-out').value = values.outputDir || 'D:\\公文附件';
}

function showMain() {
  $('setup').classList.add('hidden');
  $('main').classList.remove('hidden');
}

function statusText(e) {
  if (e.status === 'downloaded') return { cls: 'st-downloaded', txt: `✅ ${e.message}` };
  if (e.status === 'failed') return { cls: 'st-failed', txt: `⚠️ ${e.message}` };
  if (e.status === 'skipped') return { cls: 'st-skipped', txt: `⏭️ ${e.message}` };
  if (e.status === 'noattach') return { cls: 'st-noattach', txt: 'ℹ️ 無附件' };
  if (e.status === 'dry') return { cls: 'st-skipped', txt: e.message };
  return { cls: '', txt: e.message || '' };
}

function buildRows(items) {
  const tb = $('grid').querySelector('tbody');
  tb.innerHTML = '';
  rows.clear();
  for (const it of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.docNumber}</td><td>${it.subject}</td><td class="st-downloading">等待中</td>`;
    tb.appendChild(tr);
    rows.set(it.docNumber, tr);
  }
}

async function start() {
  $('summary').textContent = '登入中…';
  buildRows([]);
  await window.api.startDownload();
}

window.api.onProgress((e) => {
  if (e.type === 'login') $('summary').textContent = '✅ 已登入，讀取收件夾…';
  else if (e.type === 'list') { $('summary').textContent = `收件夾 ${e.total} 件，新 ${e.fresh} 件`; buildRows(e.items); }
  else if (e.type === 'item-start') { const tr = rows.get(e.docNumber); if (tr) tr.children[2].textContent = '下載中…'; }
  else if (e.type === 'item-done') { const tr = rows.get(e.docNumber); if (tr) { const s = statusText(e); tr.children[2].textContent = s.txt; tr.children[2].className = s.cls; } }
  else if (e.type === 'done') $('summary').textContent = `完成：新下載 ${e.downloaded} 件${e.failed ? `，${e.failed} 件失敗` : ''}（${e.outputDir}）`;
  else if (e.type === 'error') $('summary').textContent = `❌ ${e.message}（請檢查設定）`;
});

$('s-save').onclick = async () => {
  const v = { baseUrl: $('s-url').value.trim(), account: $('s-acc').value.trim(), password: $('s-pwd').value.trim(), outputDir: $('s-out').value.trim() };
  if (!v.baseUrl || !v.account || !v.password || !v.outputDir) { alert('全部欄位都要填'); return; }
  await window.api.saveSettings(v);
  showMain(); start();
};
$('t-run').onclick = start;
$('t-folder').onclick = () => window.api.openFolder();
$('t-settings').onclick = async () => showSetup(await window.api.getSettings());
$('t-history').onclick = async () => {
  const h = $('history'); h.classList.toggle('hidden');
  if (!h.classList.contains('hidden')) {
    const list = await window.api.getHistory();
    const tb = $('hgrid').querySelector('tbody');
    tb.innerHTML = list.map((r) => `<tr><td>${r.time}</td><td>${r.docNumber}</td><td>${r.count}</td></tr>`).join('');
  }
};
$('t-sched').onchange = async (ev) => { await window.api.setSchedule(ev.target.checked); };

(async () => {
  const st = await window.api.getState();
  $('t-sched').checked = await window.api.getSchedule();
  if (st.configured) { showMain(); start(); }
  else showSetup(await window.api.getSettings());
})();
```

- [ ] **Step 4: 手動跑起來驗證**

Run: `npm run app`
Expected: 視窗開啟；已設定則自動跑、表格逐列更新；未設定先顯示設定畫面。設定/開資料夾/歷史/排程開關可用。

- [ ] **Step 5: Commit**

```bash
git add electron/renderer/index.html electron/renderer/renderer.js electron/renderer/styles.css
git commit -m "feat: Electron renderer（設定/表格/工具列/歷史）"
```

---

## Task 7: electron-builder 打包設定 + build + 測試

**Files:**
- Modify: `package.json`（加 `build` 區塊）

- [ ] **Step 1: 準備 ms-playwright（供 extraResources）**

Run（PowerShell，把 Chromium 裝到專案內 ms-playwright 供打包）:
```
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\code\repos\gongwen-fetcher\ms-playwright'
npm exec -- playwright install chromium
Remove-Item Env:\PLAYWRIGHT_BROWSERS_PATH
```
並在 `.gitignore` 加 `ms-playwright/` 與 `dist/`。

- [ ] **Step 2: package.json 加 `build` 區塊**

```json
"build": {
  "appId": "tw.gongwen.fetcher",
  "productName": "公文附件下載器",
  "directories": { "output": "dist" },
  "files": ["electron/**/*", "src/**/*", "package.json"],
  "asarUnpack": ["**/node_modules/playwright/**", "**/node_modules/playwright-core/**"],
  "extraResources": [{ "from": "ms-playwright", "to": "ms-playwright" }],
  "win": { "target": "nsis", "icon": "build/icon.ico" },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "license": "授權說明.txt",
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "公文附件下載器"
  }
}
```
> 若無 `build/icon.ico` 則移除 `"icon"` 行（electron-builder 會用預設圖示）。

- [ ] **Step 3: build**

Run: `npm run dist`
Expected: `dist\公文附件下載器 Setup <version>.exe` 產生（含 NSIS 授權頁）。

- [ ] **Step 4: 無 Node 乾淨環境安裝測試**

於另一台或乾淨資料夾安裝，驗證：
- NSIS 授權頁顯示授權說明、可選安裝路徑、免系統管理員
- 首次開啟顯示設定畫面 → 填網址/帳密/資料夾 → 儲存 → 自動開始、表格逐列更新並實際下載到設定資料夾
- 「開啟資料夾」開到正確位置；「每日自動」勾選後 `schtasks /Query /TN "公文附件下載器"` 存在、TR 指向 `<exe> --auto`
- 關閉再開：已下載者不重抓（增量）；歷史有紀錄
- `<exe> --auto` 手動執行：無視窗、跑完即結束、log 在 userData\run.log
- 移除程式後檔案清除

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "feat: electron-builder 打包設定（授權頁/extraResources/asarUnpack）"
```

---

## Task 8: 退役 Inno/.bat 過渡版（文件標註）

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README 更新**

在 README 標註：主程式已改為 Electron 桌面 App，安裝請用 `dist\公文附件下載器 Setup.exe`；舊的 Inno 安裝程式（`打包安裝程式.ps1` / `installer/`）與 `.bat` 啟動器為過渡版、保留參考但不再是主要交付。SmartScreen 說明沿用。

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: 標註 Electron 為主交付，Inno/.bat 退役為過渡"
```
