# 國尊公文附件自動歸檔器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自動登入國尊公文系統、抓收件夾未處理公文的附件，依 `簽呈編號_簽呈主旨` 建本機資料夾歸位，支援增量、手動與排程。

**Architecture:** Node.js ESM 獨立腳本 + Playwright（Chromium）。純函式（檔名清洗、狀態 diff、資料夾建立）用 TDD 與 `node:test` 完整測試；瀏覽器模組（login / listScraper / docHandler）把所有 selector 抽到 `src/selectors.js`，由一個**探勘任務**用真帳號實跑填入真實值，再以 `--dry-run` 對真實站台驗證。

**Tech Stack:** Node.js (ESM)、Playwright、dotenv、內建 `node:test` / `node:assert`。

---

## 檔案結構

| 檔案 | 職責 |
|------|------|
| `package.json` | ESM、deps、test/start script |
| `.env.example` | 環境變數範本（真值放 `.env`，已 gitignore） |
| `src/config.js` | 讀 `.env`、缺變數即報錯 |
| `src/selectors.js` | 所有 selector / URL（探勘任務填入真實值） |
| `src/fileManager.js` | 檔名清洗 `buildFolderName`、`ensureFolder` |
| `src/stateStore.js` | `loadProcessed` / `saveProcessed` / `filterNew` |
| `src/login.js` | Playwright 登入 |
| `src/listScraper.js` | 抓收件夾清單 |
| `src/docHandler.js` | 開公文、下載附件到指定資料夾 |
| `src/index.js` | orchestrator，含 `--dry-run` |
| `test/fileManager.test.js` | 檔名清洗 + 資料夾建立測試 |
| `test/stateStore.test.js` | 狀態 diff + 讀寫測試 |
| `run.bat` | 排程 / 雙擊用包裝 |
| `docs/selectors.md` | 探勘紀錄 |

---

## Task 1: 專案 scaffold

**Files:**
- Create: `package.json`
- Create: `.env.example`

- [ ] **Step 1: 建立 package.json**

```json
{
  "name": "gongwen-fetcher",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node src/index.js",
    "dry-run": "node src/index.js --dry-run",
    "test": "node --test"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "playwright": "^1.48.0"
  }
}
```

- [ ] **Step 2: 建立 .env.example**

```
GW_BASE_URL=https://公文系統網址/login
GW_ACCOUNT=你的帳號
GW_PASSWORD=你的密碼
GW_OUTPUT_DIR=D:\公文附件
GW_TIMEOUT=30000
GW_PROCESSED_FILE=processed.json
```

- [ ] **Step 3: 安裝依賴與 Chromium**

Run: `npm install` 然後 `npx playwright install chromium`
Expected: 安裝完成無錯誤

- [ ] **Step 4: Commit**

```bash
git add package.json .env.example package-lock.json
git commit -m "chore: 專案 scaffold 與依賴"
```

---

## Task 2: config 模組

**Files:**
- Create: `src/config.js`

- [ ] **Step 1: 寫 config.js**

```js
import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`缺少環境變數 ${name}，請在 .env 設定`);
  return v;
}

export const config = {
  baseUrl: required('GW_BASE_URL'),
  account: required('GW_ACCOUNT'),
  password: required('GW_PASSWORD'),
  outputDir: required('GW_OUTPUT_DIR'),
  timeout: Number(process.env.GW_TIMEOUT ?? 30000),
  processedFile: process.env.GW_PROCESSED_FILE ?? 'processed.json',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/config.js
git commit -m "feat: config 模組讀取 .env"
```

---

## Task 3: fileManager（檔名清洗 + 資料夾建立，TDD）

**Files:**
- Create: `src/fileManager.js`
- Test: `test/fileManager.test.js`

- [ ] **Step 1: 寫失敗測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFolderName, ensureFolder } from '../src/fileManager.js';

test('正常編號與主旨用底線串接', () => {
  assert.equal(
    buildFolderName('1130012345', '關於資訊設備採購案'),
    '1130012345_關於資訊設備採購案'
  );
});

test('非法字元換成底線', () => {
  assert.equal(buildFolderName('A1', 'a/b:c*d?e"f<g>h|i'), 'A1_a_b_c_d_e_f_g_h_i');
});

test('結尾空白與句點被移除', () => {
  assert.equal(buildFolderName('A1', '主旨...  '), 'A1_主旨');
});

test('過長主旨截斷到 150 字以內且不以空白句點結尾', () => {
  const name = buildFolderName('A1', '長'.repeat(300));
  assert.ok(name.length <= 150);
  assert.ok(!/[\s.]$/.test(name));
});

test('ensureFolder 建立資料夾並回報是否為新', () => {
  const base = mkdtempSync(join(tmpdir(), 'gw-'));
  const first = ensureFolder(base, 'X1_主旨');
  assert.equal(first.isNew, true);
  assert.ok(existsSync(first.dir));
  const second = ensureFolder(base, 'X1_主旨');
  assert.equal(second.isNew, false);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/fileManager.test.js`
Expected: FAIL（`buildFolderName` / `ensureFolder` 未定義）

- [ ] **Step 3: 寫實作**

```js
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ILLEGAL = /[\\/:*?"<>|]/g;
const MAX_LEN = 150;

function trimTrailing(s) {
  return s.replace(/[\s.]+$/, '');
}

export function sanitizeSegment(s) {
  return trimTrailing(String(s).replace(ILLEGAL, '_')).trim();
}

export function buildFolderName(docNumber, subject) {
  const name = `${sanitizeSegment(docNumber)}_${sanitizeSegment(subject)}`;
  return trimTrailing(name.slice(0, MAX_LEN));
}

export function ensureFolder(outputDir, folderName) {
  const dir = join(outputDir, folderName);
  const isNew = !existsSync(dir);
  mkdirSync(dir, { recursive: true });
  return { dir, isNew };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/fileManager.test.js`
Expected: PASS（5 個測試全過）

- [ ] **Step 5: Commit**

```bash
git add src/fileManager.js test/fileManager.test.js
git commit -m "feat: fileManager 檔名清洗與資料夾建立"
```

---

## Task 4: stateStore（增量狀態，TDD）

**Files:**
- Create: `src/stateStore.js`
- Test: `test/stateStore.test.js`

- [ ] **Step 1: 寫失敗測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProcessed, saveProcessed, filterNew } from '../src/stateStore.js';

test('檔案不存在時回傳空 Set', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'gw-')), 'processed.json');
  assert.equal(loadProcessed(p).size, 0);
});

test('save 後 load 還原同一組編號', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'gw-')), 'processed.json');
  saveProcessed(p, new Set(['A1', 'B2']));
  const loaded = loadProcessed(p);
  assert.ok(loaded.has('A1') && loaded.has('B2'));
});

test('filterNew 只留下未處理過的件', () => {
  const items = [{ docNumber: 'A1' }, { docNumber: 'B2' }, { docNumber: 'C3' }];
  const result = filterNew(items, new Set(['B2']));
  assert.deepEqual(result.map((i) => i.docNumber), ['A1', 'C3']);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/stateStore.test.js`
Expected: FAIL（函式未定義）

- [ ] **Step 3: 寫實作**

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function loadProcessed(path) {
  if (!existsSync(path)) return new Set();
  return new Set(JSON.parse(readFileSync(path, 'utf8')));
}

export function saveProcessed(path, set) {
  writeFileSync(path, JSON.stringify([...set], null, 2), 'utf8');
}

export function filterNew(items, processed) {
  return items.filter((it) => !processed.has(it.docNumber));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/stateStore.test.js`
Expected: PASS（3 個測試全過）

- [ ] **Step 5: Commit**

```bash
git add src/stateStore.js test/stateStore.test.js
git commit -m "feat: stateStore 增量狀態管理"
```

---

## Task 5: 探勘任務（互動，需使用者在場）

> 此任務不走 TDD：目的是把國尊系統的真實 selector / URL 摸出來。需使用者在場用真帳號登入。
> 產出真實值填進 `src/selectors.js`，並把觀察記到 `docs/selectors.md`。

**Files:**
- Create: `src/selectors.js`（先建骨架，探勘後填真值）
- Create: `docs/selectors.md`

- [ ] **Step 1: 建立 selectors.js 骨架**

```js
// 探勘任務填入真實值；填完前瀏覽器模組無法運作
export const selectors = {
  login: {
    account: '',       // 帳號輸入框
    password: '',      // 密碼輸入框
    submit: '',        // 送出鈕
    successMarker: '', // 登入成功後必出現的元素
  },
  inbox: {
    url: '',     // 收件夾清單頁網址（或留空、改用 nav 點擊）
    nav: '',     // 若靠點擊導航，放導航連結 selector
    row: '',     // 清單每一列
    number: '',  // 列內「簽呈編號」
    subject: '', // 列內「主旨」
    link: '',    // 列內開啟公文的連結
  },
  doc: {
    numberDetail: '',  // 公文內頁的編號（list 抓不到時補抓）
    subjectDetail: '', // 公文內頁的主旨
    downloadBtn: '',   // 附件下載鈕（可能多個，用 locator.all 取）
  },
};
```

- [ ] **Step 2: 開有頭瀏覽器探勘**

用 Playwright 開 headed Chromium，導到 `GW_BASE_URL`，請使用者登入並走到收件夾、開一件有附件的公文。
逐一確認下列項目並記到 `docs/selectors.md`：

1. 登入表單三個欄位的 selector + 登入成功判斷元素
2. 收件夾清單頁網址；簽呈編號與主旨是否在清單列直接可見（決定 listScraper 能否直接抓，或要進公文補抓）
3. 開啟單一公文的方式（連結 href / 點列 / 新分頁）
4. 附件下載鈕 selector、是單檔或多檔、點擊後是否觸發瀏覽器 download 事件

- [ ] **Step 3: 把真實值填回 selectors.js，寫 docs/selectors.md**

依探勘結果填入所有非空 selector，並在 `docs/selectors.md` 記下每個選擇的依據與注意事項（例如清單抓不到主旨、需進內頁補）。

- [ ] **Step 4: Commit**

```bash
git add src/selectors.js docs/selectors.md
git commit -m "feat: 探勘國尊系統 selector 並記錄"
```

---

## Task 6: login 模組

**Files:**
- Create: `src/login.js`

> 驗證方式：探勘已確認 selector，本任務以真實登入驗證（非單元測試）。

- [ ] **Step 1: 寫 login.js**

```js
import { config } from './config.js';
import { selectors as S } from './selectors.js';

export async function login(page) {
  await page.goto(config.baseUrl, { timeout: config.timeout });
  await page.fill(S.login.account, config.account);
  await page.fill(S.login.password, config.password);
  await page.click(S.login.submit);
  await page.waitForSelector(S.login.successMarker, { timeout: config.timeout });
}
```

- [ ] **Step 2: 真實登入驗證**

寫一次性 `node -e` 或暫存腳本：啟動 headed browser → `login(page)` → 截圖。
Expected: 成功進入登入後首頁，無 timeout。驗證後刪除暫存腳本。

- [ ] **Step 3: Commit**

```bash
git add src/login.js
git commit -m "feat: login 模組自動登入"
```

---

## Task 7: listScraper 模組

**Files:**
- Create: `src/listScraper.js`

- [ ] **Step 1: 寫 listScraper.js**

```js
import { config } from './config.js';
import { selectors as S } from './selectors.js';

export async function scrapeInbox(page) {
  if (S.inbox.url) {
    await page.goto(S.inbox.url, { timeout: config.timeout });
  } else if (S.inbox.nav) {
    await page.click(S.inbox.nav);
  }
  await page.waitForSelector(S.inbox.row, { timeout: config.timeout });

  return page.$$eval(
    S.inbox.row,
    (rows, sel) =>
      rows.map((r) => ({
        docNumber: r.querySelector(sel.number)?.textContent?.trim() ?? '',
        subject: r.querySelector(sel.subject)?.textContent?.trim() ?? '',
        openHref: r.querySelector(sel.link)?.getAttribute('href') ?? '',
      })),
    S.inbox
  );
}
```

> 若探勘發現主旨/編號清單抓不到，`subject`/`docNumber` 可能為空，由 docHandler 進內頁補抓。

- [ ] **Step 2: 真實驗證**

暫存腳本：`login` → `scrapeInbox(page)` → `console.log`。
Expected: 印出收件夾每筆 `{ docNumber, subject, openHref }`，數量與畫面相符。驗證後刪暫存腳本。

- [ ] **Step 3: Commit**

```bash
git add src/listScraper.js
git commit -m "feat: listScraper 抓收件夾清單"
```

---

## Task 8: docHandler 模組

**Files:**
- Create: `src/docHandler.js`

- [ ] **Step 1: 寫 docHandler.js**

```js
import { join } from 'node:path';
import { config } from './config.js';
import { selectors as S } from './selectors.js';

// 開公文，必要時補抓編號/主旨，回傳 { docNumber, subject }
export async function openDoc(page, item) {
  await page.goto(new URL(item.openHref, config.baseUrl).href, { timeout: config.timeout });
  const docNumber =
    item.docNumber ||
    (S.doc.numberDetail
      ? (await page.locator(S.doc.numberDetail).first().textContent())?.trim()
      : '') ||
    '';
  const subject =
    item.subject ||
    (S.doc.subjectDetail
      ? (await page.locator(S.doc.subjectDetail).first().textContent())?.trim()
      : '') ||
    '';
  return { docNumber, subject };
}

async function clickAndDownload(page, button) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: config.timeout }),
    button.click(),
  ]);
  return download;
}

// 下載附件到 destDir，回傳已存檔路徑陣列；逾時重試一次
export async function downloadAttachments(page, destDir) {
  const buttons = page.locator(S.doc.downloadBtn);
  const count = await buttons.count();
  const saved = [];
  for (let i = 0; i < count; i++) {
    let download;
    try {
      download = await clickAndDownload(page, buttons.nth(i));
    } catch {
      download = await clickAndDownload(page, buttons.nth(i)); // 重試一次
    }
    const dest = join(destDir, download.suggestedFilename());
    await download.saveAs(dest);
    saved.push(dest);
  }
  return saved;
}

// 只數附件數量，不下載（dry-run 用）
export async function countAttachments(page) {
  return page.locator(S.doc.downloadBtn).count();
}
```

- [ ] **Step 2: 真實驗證**

暫存腳本：`login` → `scrapeInbox` → 取一件 → `openDoc` → `downloadAttachments(page, tmpDir)`。
Expected: 附件實際存到 tmpDir，檔名正確。驗證後刪暫存腳本。

- [ ] **Step 3: Commit**

```bash
git add src/docHandler.js
git commit -m "feat: docHandler 開公文與下載附件"
```

---

## Task 9: orchestrator（index.js，含 --dry-run）

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: 寫 index.js**

```js
import { chromium } from 'playwright';
import { config } from './config.js';
import { login } from './login.js';
import { scrapeInbox } from './listScraper.js';
import { openDoc, downloadAttachments, countAttachments } from './docHandler.js';
import { buildFolderName, ensureFolder } from './fileManager.js';
import { loadProcessed, saveProcessed, filterNew } from './stateStore.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const processed = loadProcessed(config.processedFile);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await login(page);
    console.log('✅ 登入成功');

    const items = await scrapeInbox(page);
    const newItems = filterNew(items, processed);
    console.log(`收件夾 ${items.length} 件，其中新件 ${newItems.length} 件`);

    for (const item of newItems) {
      const meta = await openDoc(page, item);
      const folderName = buildFolderName(meta.docNumber, meta.subject);

      if (dryRun) {
        const n = await countAttachments(page);
        console.log(`[dry-run] ${folderName}（附件 ${n} 個，不下載）`);
        continue;
      }

      const { dir, isNew } = ensureFolder(config.outputDir, folderName);
      if (!isNew) {
        console.log(`⏭️ ${folderName} 資料夾已存在，視為已處理`);
        processed.add(meta.docNumber);
        continue;
      }

      try {
        const saved = await downloadAttachments(page, dir);
        console.log(`✅ ${folderName}：下載 ${saved.length} 個附件`);
        processed.add(meta.docNumber);
      } catch (err) {
        console.error(`⚠️ ${folderName} 失敗，跳過（下次重試）：${err.message}`);
      }
    }

    if (!dryRun) saveProcessed(config.processedFile, processed);
  } catch (err) {
    console.error(`❌ 中止：${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
```

- [ ] **Step 2: dry-run 驗證**

Run: `npm run dry-run`
Expected: 登入成功、列出收件夾件數與每件「會建的資料夾名 + 附件數」，不下載、不建檔、不寫 processed.json。

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: orchestrator 串接流程與 dry-run"
```

---

## Task 10: 排程包裝（run.bat + 工作排程器）

**Files:**
- Create: `run.bat`

- [ ] **Step 1: 寫 run.bat**

```bat
@echo off
cd /d "%~dp0"
node src\index.js >> run.log 2>&1
```

- [ ] **Step 2: 提供 Windows 工作排程器設定指令**

在 `docs/selectors.md` 或 README 記下（每天 08:00 執行範例）：

```powershell
schtasks /Create /TN "GongwenFetcher" /TR "D:\code\repos\gongwen-fetcher\run.bat" /SC DAILY /ST 08:00 /F
```

- [ ] **Step 3: Commit**

```bash
git add run.bat
git commit -m "feat: run.bat 與排程指令"
```

---

## Task 11: 端對端驗證

- [ ] **Step 1: 全測試**

Run: `npm test`
Expected: fileManager + stateStore 測試全過。

- [ ] **Step 2: dry-run**

Run: `npm run dry-run`
Expected: 正確列出新件與資料夾名。

- [ ] **Step 3: 真實跑一次**

Run: `npm start`
Expected: 收件夾新件附件下載到 `GW_OUTPUT_DIR` 下對應 `簽呈編號_主旨` 資料夾；`processed.json` 寫入已處理編號。

- [ ] **Step 4: 增量驗證**

再跑 `npm start` 一次。
Expected: 已處理件不重抓，輸出「新件 0 件」或只剩真正新增的。
