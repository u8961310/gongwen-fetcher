# 主程式圖形化（Electron App）— 設計文件

- 日期：2026-05-30（Asia/Taipei）
- 範圍：把 CLI 主程式改成 Electron 桌面 App，表格化呈現下載進度/結果，含設定、開資料夾、每日自動開關、歷史
- 狀態：設計已與使用者確認，待寫實作計畫

## 目標

開啟 App 即自動開始下載收件夾新公文附件，以**表格即時呈現**每件進度/結果（取代黑視窗）；
提供改設定、開存放資料夾、每日自動下載開關、下載歷史。打包成 Windows 桌面安裝程式。

## 決策摘要

- 技術：**Electron**（使用者指定）。core 抓檔模組原封重用。
- 打包：**electron-builder**，產生含授權頁的安裝程式，**取代** Inno Setup 版（Inno + .bat 退役、保留在 repo 當參考）。
- 設定：**App 內設定畫面**，存 `userData\settings.json`（取代 .env）。
- 排程：每日自動下載走「無視窗模式」（見下）。
- 體積：~400MB+（Electron 自帶 Chromium + Playwright Chromium），離線可接受。
- 簽章：不做；SmartScreen 警告同前，README 說明。

## 功能（單一視窗）

1. **自動下載**：開啟即跑（若已設定）。首次無設定 → 先顯示設定畫面，存檔後開始。
2. **進度表格**：每列一件公文（簽呈編號／主旨／狀態）。狀態即時更新：
   `等待中 → 下載中 → ✅ 完成 N 檔 / ⏭️ 已處理 / ℹ️ 無附件 / ⚠️ 失敗`。頂部總結列（收件夾 X、新 Y、完成 Z）。
3. **工具列**：🔄 重新下載、📂 開啟存放資料夾、⚙️ 設定、⏰ 每日自動下載（開關 + 顯示目前狀態）。
4. **設定畫面**：網址 / 帳號 / 密碼（遮蔽）/ 存放資料夾（選擇鈕）；存檔寫 `settings.json`。
5. **歷史**：每次下載寫一筆紀錄（時間、編號、檔數），可切到「歷史」檢視。

## 架構

### 程序與通訊
- **main（Node 環境）**：建立 BrowserWindow；讀寫 `settings.json`；呼叫 `runDownload`；schtasks 開關；`shell.openPath` 開資料夾。
- **preload**：以 `contextBridge` 暴露安全 API（`getSettings/saveSettings/startDownload/onProgress/openFolder/getSchedule/setSchedule/getHistory`）。
- **renderer**：HTML/CSS/JS 表格與設定畫面，透過 preload API 與 main 溝通；`onProgress` 收事件即時更新表格。
- `nodeIntegration:false` + `contextIsolation:true`（安全預設）。

### 重用與重構
- 不動：`login.js` / `listScraper.js` / `docHandler.js` / `fileManager.js` / `stateStore.js` / `selectors.js` / `setup.js`（buildEnvContent 仍用於相容/匯出）。
- **重構**：把 `index.js` 的 orchestrator 迴圈抽成 `src/runDownload.js`：
  `runDownload({ config, onProgress })`，以 `onProgress(event)` 取代 `console.log`（event 形如
  `{type:'login'|'list'|'item'|'done', ...}`）。
- **config 改為參數傳入**：`config.js` 改提供 `loadConfigFromSettings(path)` 回傳 config 物件；
  `login/listScraper/docHandler` 由「import 全域 config 單例」改為「函式參數收 config」
  （`login(page, config)`、`scrapeInbox(page, config)`、`openInbox(page, config)`、
  `openDoc(page, item, config)`、`collectAttachments(page, config)`、`downloadAttachments(page, destDir, config)`）。
- CLI `index.js` 改為薄包裝：`loadConfigFromSettings` 或舊 `.env` → 呼叫 `runDownload` 配 console onProgress（保留命令列/排程可用）。

### settings.json（userData）
```json
{ "baseUrl": "...", "account": "...", "password": "...", "outputDir": "D:\\公文附件",
  "timeout": 30000, "processedFile": "<userData>\\processed.json" }
```
`processedFile` 與下載歷史 `history.json` 都放 userData，避免裝在 Program Files 時無寫入權。

### 排程（每日自動）
- 開關呼叫 `schtasks /Create|/Delete /TN "公文附件下載器"`，TR 指向 `<exe> --auto`。
- App 支援 `--auto`：**不建視窗**，直接 `runDownload`（log 到 userData\run.log）後 `app.quit()`。
- 開資料夾、Playwright 都需 `PLAYWRIGHT_BROWSERS_PATH` 指向打包內 Chromium（main 啟動時設定 `process.env`）。

## 資料流

```
App 啟動 → main 讀 settings.json
  ├─ 無設定 → renderer 顯示設定畫面 → saveSettings → 寫檔 → 進入主畫面
  └─ 有設定 → renderer 主畫面 → 自動 startDownload
       main: runDownload({config, onProgress: e => win.webContents.send('progress', e)})
         login → openInbox → scrapeInbox（送 list 事件，建表格列）
         逐件：openDoc → collectAttachments → 有附件才 ensureFolder + downloadAttachments
               每步送 item 事件（renderer 更新該列狀態）
         結束送 done 事件 + 寫 history.json
```

## 打包（electron-builder）

- `electron-builder` target：Windows `nsis`，`perMachine:false`（per-user，免管理員）。
- `license`：指向 `授權說明.txt`（NSIS 授權頁）。
- 捷徑：桌面 + 開始菜單（electron-builder 內建）。
- **Playwright Chromium**：以 `extraResources` 把 `ms-playwright` 打包進 `resources\`；main 啟動時
  `process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'ms-playwright')`。
- 產出 `公文附件下載器 Setup.exe` 到 `dist\`（再人工/腳本複製到 D:\code）。

## 安全
- 帳密純文字存 `userData\settings.json`；DPAPI 加密列後續選項。
- renderer 不開 nodeIntegration；只透過 preload 白名單 API。

## 測試
- 單元：`runDownload` 的事件序列（用假的 page/模組注入）可測 onProgress 形狀；`parseInput`/`buildFolderName`/`stateStore` 既有測試保留。
- 手動：`npm start`（electron）跑起來，表格即時更新、設定存取、開資料夾、排程開關。
- 打包：`electron-builder` 後在無 Node 乾淨環境安裝、首次設定、自動下載、--auto 排程跑、移除。

## YAGNI / 不做
- 不做程式碼簽章。
- 不做多帳號/多校切換 UI（單一 settings）。
- 不自建更新機制（electron updater 省略）。

## 風險
- 體積大（~400MB+）。
- electron-builder 與 Playwright Chromium 的路徑：打包後 `PLAYWRIGHT_BROWSERS_PATH` 必須指對 `resourcesPath\ms-playwright`，否則執行期找不到瀏覽器。
- asar 封裝：Playwright/部分模組需 `asarUnpack`（playwright 會以子程序啟動瀏覽器，需可存取實體檔）；node_modules 中 playwright 放 `asarUnpack`。
- SmartScreen 警告（未簽章）。
