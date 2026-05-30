# 國尊公文附件下載器

自動登入國尊 Cyberhood 公文系統，把「收件夾」未處理公文的附件下載到本機，
依「簽呈編號_簽呈主旨」建資料夾。Windows 桌面 App（Electron），免裝 Node、免連網、免系統管理員。

## 下載安裝（給同事）

到 [Releases](https://github.com/u8961310/gongwen-fetcher/releases/latest) 下載 `Setup.0.1.0.exe`，三步驟：

1. **雙擊安裝檔** → 同意授權 → 選安裝位置（預設使用者層、免管理員）
2. **首次開啟** → 填「公文系統登入網址 / 帳號 / 密碼 / 存放資料夾」→ 儲存
3. 之後**開啟即自動下載**，表格顯示每件進度與結果

> 第一次開啟若跳出 **「Windows 已保護你的電腦」**（SmartScreen）：點「更多資訊」→「仍要執行」。
> 這是因為未做付費程式碼簽章，屬正常情形。

## 功能

| 按鈕 | 作用 |
|------|------|
| 🔄 重新下載 | 強制重抓整個收件夾（忽略已下載紀錄與既有資料夾） |
| 📂 開啟資料夾 | 打開附件存放資料夾 |
| ⚙️ 設定 | 修改網址 / 帳號 / 密碼 / 存放資料夾 |
| ⏰ 每小時自動 | 開/關「每小時自動下載」（Windows 工作排程器，無視窗背景執行） |
| 🕘 歷史 | 檢視下載紀錄 |

- 一般開啟為**增量**：只抓還沒下載過的新公文。
- 無附件的公文不建空資料夾。

## 移除

Windows **設定 → 應用程式 → 公文附件下載器 → 解除安裝**。
解除安裝會**自動**清掉「每小時自動」排程與含帳密的設定資料夾（`%APPDATA%\gongwen-fetcher`）。
已下載的附件不會被刪。

## 使用授權

作者：陳冠廷

1. 本軟體開放全國公立、私立各級學校免費使用。
2. 臺北市私立立人國際中小學不在本授權範圍內，未經作者另行書面同意不得使用。
3. 本軟體依「現況」提供，作者不負擔任何明示或默示之擔保責任；使用者應自行確認帳號使用符合所屬學校及公文系統規範。
4. 請勿散布內含個人帳號密碼（`settings.json`）的資料夾。

授權全文見 `授權說明.txt`。

## 安全

帳號密碼以純文字存於本機 `%APPDATA%\gongwen-fetcher\settings.json`，請勿分享此資料夾。

---

## 給技術人員

- **架構**：Electron 桌面 App。`electron/main.js`（主程序，跑 Playwright 下載、IPC、排程）、
  `electron/preload.cjs`、`electron/renderer/`（HTML 介面）。核心抓檔模組在 `src/`
  （`login` / `listScraper` / `docHandler` / `fileManager` / `stateStore` / `runDownload`）。
- **跨校**：同一套 Cyberhood 可共用，各校只在 App 內填不同登入網址。若某校系統為客製/舊版、畫面不同，
  需依 `docs/selectors.md` 調整 `src/selectors.js` 的定位設定。
- **開發**：
  - `npm test`：單元測試（node:test）
  - `npm run dry-run`：CLI 以 `.env` 設定登入並列出收件夾（不下載）
  - `npm run app`：開發模式啟動 Electron
  - `npm run dist`：electron-builder 打包安裝程式到 `dist/`
- **打包前置**：把 Playwright 的 Chromium 放到專案 `ms-playwright/`（electron-builder 以 `extraResources`
  打包、執行時 `PLAYWRIGHT_BROWSERS_PATH` 指向 `resources/ms-playwright`）。需安裝 Inno Setup 之外的
  electron 工具鏈（`electron`、`electron-builder`，已在 devDependencies）。
- **過渡版（已退役，保留參考）**：早期的 Inno Setup 圖形安裝程式（`打包安裝程式.ps1`、`installer/`）與
  `.bat` 啟動器（`安裝.bat` / `首次設定.bat` / `執行.bat` / `run.bat`）。現以 Electron + electron-builder 為主交付。
