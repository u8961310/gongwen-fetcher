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

    let done = 0;
    let failed = 0;
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
        done += 1;
      } catch (err) {
        console.error(`⚠️ ${folderName} 失敗，跳過（下次重試）：${err.message}`);
        failed += 1;
      }
    }

    if (!dryRun) {
      saveProcessed(config.processedFile, processed);
      console.log(`\n========================================`);
      console.log(`完成：本次新下載 ${done} 件公文的附件` + (failed ? `，${failed} 件失敗（下次自動重試）` : ''));
      console.log(`存放位置：${config.outputDir}`);
      console.log(`========================================`);
    }
  } catch (err) {
    console.error(`\n❌ 執行中止：${err.message}`);
    console.error(`常見原因：帳號密碼或網址錯誤、公文系統暫時無法連線。`);
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

## Task 10: 設定精靈（src/setup.js，TDD）

> 非技術同事不編輯文字檔。此精靈用命令列問答收集「網址/帳號/密碼/存放資料夾」，自動寫 `.env`。
> 純函式 `buildEnvContent` 走 TDD；互動式問答是薄包裝。

**Files:**
- Create: `src/setup.js`
- Test: `test/setup.test.js`

- [ ] **Step 1: 寫失敗測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvContent } from '../src/setup.js';

test('buildEnvContent 產生正確 .env 文字', () => {
  const out = buildEnvContent({
    baseUrl: 'https://a.example/login',
    account: 'user1',
    password: 'pass1',
    outputDir: 'D:\\公文',
  });
  assert.match(out, /^GW_BASE_URL=https:\/\/a\.example\/login$/m);
  assert.match(out, /^GW_ACCOUNT=user1$/m);
  assert.match(out, /^GW_PASSWORD=pass1$/m);
  assert.match(out, /^GW_OUTPUT_DIR=D:\\公文$/m);
});

test('buildEnvContent 對缺值丟錯', () => {
  assert.throws(() => buildEnvContent({ baseUrl: '', account: 'a', password: 'b', outputDir: 'c' }));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/setup.test.js`
Expected: FAIL（`buildEnvContent` 未定義）

- [ ] **Step 3: 寫實作**

```js
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export function buildEnvContent({ baseUrl, account, password, outputDir }) {
  for (const [k, v] of Object.entries({ baseUrl, account, password, outputDir })) {
    if (!v) throw new Error(`設定值 ${k} 不可空白`);
  }
  return [
    `GW_BASE_URL=${baseUrl}`,
    `GW_ACCOUNT=${account}`,
    `GW_PASSWORD=${password}`,
    `GW_OUTPUT_DIR=${outputDir}`,
    `GW_TIMEOUT=30000`,
    `GW_PROCESSED_FILE=processed.json`,
    '',
  ].join('\n');
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log('===== 國尊公文附件下載器 首次設定 =====\n');
  const baseUrl = (await rl.question('公文系統登入網址（例 https://校名.gov.tw/login）：')).trim();
  const account = (await rl.question('你的公文系統帳號：')).trim();
  const password = (await rl.question('你的公文系統密碼：')).trim();
  const outputDir = (await rl.question('附件要存到哪個資料夾（例 D:\\公文附件）：')).trim();
  rl.close();

  writeFileSync('.env', buildEnvContent({ baseUrl, account, password, outputDir }), 'utf8');
  console.log('\n✅ 設定完成，已寫入 .env。現在可以雙擊「執行.bat」開始下載。');
  console.log('⚠️ 提醒：密碼以純文字存在此電腦的 .env，請勿把此資料夾分享給他人。');
}

// 直接執行才跑問答（被 import 測試時不觸發）
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/setup.test.js`
Expected: PASS（2 個測試全過）

- [ ] **Step 5: Commit**

```bash
git add src/setup.js test/setup.test.js
git commit -m "feat: 首次設定精靈寫入 .env"
```

---

## Task 11: 一鍵安裝（安裝.ps1 + 安裝.bat）

> 同事電腦無 Node。此腳本偵測無 Node 就下載可攜版 Node 到專案內 `runtime\`，再裝依賴與瀏覽器。
> 採送達方式 B：需連外網。腳本要對「下載失敗 / 被防火牆擋」給清楚訊息。

**Files:**
- Create: `安裝.ps1`
- Create: `安裝.bat`
- Modify: `.gitignore`（加入 `runtime/`）

- [ ] **Step 1: .gitignore 加 runtime/**

在 `.gitignore` 末尾加一行：
```
runtime/
```

- [ ] **Step 2: 寫 安裝.ps1**

```powershell
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$NodeVersion = 'v20.18.0'
$NodeDir = Join-Path $PSScriptRoot 'runtime\node'
$NodeExe = Join-Path $NodeDir 'node.exe'

function Get-NodeCmd {
  if (Test-Path $NodeExe) { return $NodeExe }
  $sys = Get-Command node -ErrorAction SilentlyContinue
  if ($sys) { return $sys.Source }
  return $null
}

if (-not (Get-NodeCmd)) {
  Write-Host '未偵測到 Node，正在下載可攜版 Node（約 30MB）…'
  $zipUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
  $zipPath = Join-Path $env:TEMP 'node-portable.zip'
  try {
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
  } catch {
    Write-Host '❌ 下載 Node 失敗，可能是網路或防火牆阻擋。請改用公司允許的網路，或聯絡資訊人員。' -ForegroundColor Red
    Read-Host '按 Enter 結束'; exit 1
  }
  $extractTmp = Join-Path $env:TEMP 'node-portable-extract'
  if (Test-Path $extractTmp) { Remove-Item $extractTmp -Recurse -Force }
  Expand-Archive -Path $zipPath -DestinationPath $extractTmp -Force
  $inner = Get-ChildItem $extractTmp -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force -Path $NodeDir | Out-Null
  Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $NodeDir -Recurse -Force
}

$node = Get-NodeCmd
$nodeBin = Split-Path $node -Parent
$env:Path = "$nodeBin;$env:Path"
$npm = Join-Path $nodeBin 'npm.cmd'

Write-Host '正在安裝程式依賴…'
& $npm ci
Write-Host '正在下載瀏覽器（約 180MB，請稍候）…'
& $npm exec -- playwright install chromium

Write-Host ''
Write-Host '✅ 安裝完成！接下來請雙擊「首次設定.bat」輸入帳號密碼與網址。' -ForegroundColor Green
Read-Host '按 Enter 結束'
```

- [ ] **Step 3: 寫 安裝.bat**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "安裝.ps1"
```

- [ ] **Step 4: 語法驗證**

Run: `powershell -NoProfile -Command "$null = [ScriptBlock]::Create((Get-Content -Raw '安裝.ps1')); 'PARSE_OK'"`
Expected: 印出 `PARSE_OK`（僅驗證 PowerShell 語法，不實際執行下載）。

- [ ] **Step 5: Commit**

```bash
git add 安裝.ps1 安裝.bat .gitignore
git commit -m "feat: 一鍵安裝腳本（可攜版 Node + 依賴 + 瀏覽器）"
```

---

## Task 12: 傻瓜啟動器（首次設定 / 執行 / 排程 bat）

> 全部用專案內 `runtime\node`（若存在）或系統 node。視窗執行完 `pause` 停住讓同事看結果。

**Files:**
- Create: `首次設定.bat`
- Create: `執行.bat`
- Create: `run.bat`（排程用，無視窗、寫 log）
- Create: `設定每日自動.bat`

- [ ] **Step 1: 共用 node 解析寫進每個 bat**

每個互動 bat 開頭用此片段挑 node（專案內優先）：
```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
```

- [ ] **Step 2: 寫 首次設定.bat**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
"%NODE%" src\setup.js
pause
```

- [ ] **Step 3: 寫 執行.bat**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" (
  echo 尚未設定，請先雙擊「首次設定.bat」輸入帳號密碼與網址。
  pause
  exit /b 1
)
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
"%NODE%" src\index.js
echo.
pause
```

- [ ] **Step 4: 寫 run.bat（排程用，無 pause、輸出寫 log）**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
"%NODE%" src\index.js >> run.log 2>&1
```

- [ ] **Step 5: 寫 設定每日自動.bat**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
schtasks /Create /TN "公文附件下載器" /TR "\"%~dp0run.bat\"" /SC DAILY /ST 08:00 /F
if %errorlevel%==0 (
  echo ✅ 已設定每天早上 08:00 自動下載。
) else (
  echo ❌ 設定排程失敗，請以系統管理員身分再試一次。
)
pause
```

- [ ] **Step 6: 語法檢查（bat 無內建 linter，逐一目視 + 確認檔案 UTF-8）**

Run: `powershell -NoProfile -Command "Get-ChildItem *.bat | ForEach-Object { $_.Name }"`
Expected: 列出四個 bat 檔。

- [ ] **Step 7: Commit**

```bash
git add 首次設定.bat 執行.bat run.bat 設定每日自動.bat
git commit -m "feat: 傻瓜啟動器與排程 bat"
```

---

## Task 13: 同事使用說明（README）

**Files:**
- Create: `README.md`

- [ ] **Step 1: 寫 README.md**

內容須包含（給非技術同事看的白話步驟）：
1. 三步驟：① 雙擊「安裝.bat」→ ② 雙擊「首次設定.bat」填網址/帳號/密碼/存放位置 → ③ 雙擊「執行.bat」
2. 想每天自動：雙擊「設定每日自動.bat」
3. 常見問題：安裝.bat 下載失敗（網路/防火牆）、登入失敗（帳密或網址錯）、找不到附件（公文無附件）
4. 安全提醒：密碼存在本機 .env，勿分享整個資料夾
5. **給技術端的一段**：跨校時各校網址在「首次設定」輸入即可；若某校系統畫面與預設不同，需調整 `src/selectors.js`（附 selector 對照來源 `docs/selectors.md`）

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: 同事使用說明 README"
```

---

## Task 14: 端對端驗證

- [ ] **Step 1: 全測試**

Run: `npm test`
Expected: fileManager + stateStore + setup 測試全過。

- [ ] **Step 2: 設定精靈 → dry-run**

手動跑 `node src/setup.js` 填入真實網址/帳密/輸出夾，再 `npm run dry-run`。
Expected: 登入成功、列出新件與會建的資料夾名，不下載。

- [ ] **Step 3: 真實跑一次**

Run: `執行.bat`（或 `npm start`）
Expected: 收件夾新件附件下載到設定的資料夾下對應 `簽呈編號_主旨` 資料夾；視窗顯示完成摘要；`processed.json` 寫入。

- [ ] **Step 4: 增量驗證**

再跑一次。
Expected: 已處理件不重抓，摘要顯示「新下載 0 件」或只剩真正新增。

- [ ] **Step 5: 全新環境模擬（建議在另一台無 Node 的電腦或乾淨資料夾）**

把專案（不含 node_modules / runtime / .env）複製到乾淨位置，依 README 三步驟走一遍。
Expected：安裝→設定→執行皆可由非技術流程完成。若無第二台機器，至少模擬刪除 runtime/ 後重跑安裝.bat 成功。
