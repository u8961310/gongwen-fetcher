# 圖形化安裝程式（離線 exe）— 設計文件

- 日期：2026-05-30（Asia/Taipei）
- 範圍：把現有 gongwen-fetcher 包成單一圖形化安裝程式 exe，供非技術同事/跨校離線安裝
- 狀態：設計待使用者確認

## 目標

產出單一檔 `公文附件下載器-安裝.exe`（離線、自帶所有依賴），同事雙擊即進入圖形安裝精靈：
顯示授權說明 → 圖形輸入網址/帳號/密碼/存放資料夾 → 安裝 → 建捷徑、（可選）設每日排程、
（可選）立即執行一次。完全不需連網、不需裝 Node、免系統管理員。

## 決策摘要

- 打包方式：**離線自帶全部**（Node + node_modules + Chromium 全進 exe），消除防火牆/連網風險。exe 約 250-300MB。
- 安裝工具：**Inno Setup**（免費、成熟、繁中、可自訂 GUI 頁、可跑安裝後指令、自動產生移除程式、CLI 編譯器 ISCC.exe）。
- 設定收集：安裝精靈內**圖形輸入頁**（網址/帳號/密碼遮蔽/資料夾含瀏覽鈕）。
- 安裝位置：`%LocalAppData%\Programs\公文附件下載器`，**免系統管理員**（Inno `PrivilegesRequired=lowest`）。
- 裝後設定：桌面 + 開始菜單捷徑、可勾「每天 08:00 自動下載」、可勾「立即執行一次」、提供移除程式。
- 介面語言：繁體中文。
- 程式碼簽章：**不做**（無付費憑證）→ 同事首次開啟可能跳 SmartScreen「Windows 已保護你的電腦」，需點「更多資訊 → 仍要執行」，README 說明。
- 密碼仍純文字存 `.env`；DPAPI 加密列後續選項。

## 一、離線自帶包（build 時組好，置於 exe 內）

安裝後 `{app}` 內含：
- `src\`、`package.json`、`package-lock.json`、`README.md`、`docs\selectors.md`
- `node_modules\`（build 時 `npm ci` 預裝）
- `runtime\node\`（可攜版 Node v20.18.0）
- `ms-playwright\`（Chromium，build 時以 `PLAYWRIGHT_BROWSERS_PATH=<stage>\ms-playwright npx playwright install chromium` 裝入）
- `run.bat`（執行啟動器，見三）
- `授權說明.txt`（授權全文）

關鍵：Chromium 可攜靠執行時設 `PLAYWRIGHT_BROWSERS_PATH` 指向 `{app}\ms-playwright`。

## 二、Inno Setup 安裝精靈（installer.iss）

- `[Setup]`：AppName、繁中、`PrivilegesRequired=lowest`、`DefaultDirName={localappdata}\Programs\公文附件下載器`、`LicenseFile=授權說明.txt`（授權頁，須按同意）、`OutputBaseFilename=公文附件下載器-安裝`、`Compression=lzma2/max`、`SolidCompression=yes`。
- `[Files]`：把整個 bundle 複製進 `{app}`（`recursesubdirs`）。
- 自訂輸入頁（`[Code]` `CreateInputQueryPage` + 一個資料夾選擇）：
  - 網址、帳號、密碼（`Edits[n].Password := True`）、存放資料夾（預設 `D:\公文附件`，附瀏覽）
- `CurStepChanged(ssPostInstall)`：用四欄值組出 `.env` 內容寫到 `{app}\.env`（沿用 setup.js 的 buildEnvContent 格式）。
- `[Tasks]`：`dailytask`（每天自動下載，預設勾）、`runnow`（立即執行一次）。
- `[Icons]`：桌面 + 開始菜單捷徑 → `{app}\執行.bat`（互動版，顯示結果並停住），命名「公文附件下載器」。排程則用靜默的 `run.bat`。
- `[Run]`：勾 runnow → 執行一次；勾 dailytask → `schtasks /Create /TN "公文附件下載器" /TR ""{app}\run.bat"" /SC DAILY /ST 08:00 /F`。
- `[UninstallRun]`：移除時 `schtasks /Delete /TN "公文附件下載器" /F`（`RunOnceId`，忽略錯誤）。

## 三、執行啟動器（run.bat，bundle 內）

```
@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
"runtime\node\node.exe" src\index.js >> run.log 2>&1
```

排程指向 `run.bat`（靜默、寫 log）；桌面/開始菜單捷徑指向 `執行.bat`（互動、顯示結果並 pause）。
**兩個啟動器都要在跑 node 前設 `PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright` 並改用 `runtime\node\node.exe`**（現有版本要更新）。

## 四、授權說明（授權說明.txt）

```
公文附件下載器 — 使用授權說明

作者：陳冠廷

一、本軟體開放全國公立、私立各級學校免費使用。
二、臺北市私立立人國際中小學不在本授權範圍內，未經作者另行書面同意，不得使用本軟體。
三、本軟體依「現況」提供，作者不對使用結果負擔任何明示或默示之擔保責任；
    使用者應自行確認帳號使用符合所屬學校及公文系統規範。
四、請勿散布內含個人帳號密碼（.env）的資料夾。
```

README 也加一段「使用授權」摘要指向此檔。

## 五、Build 流程（dev 機，`打包安裝程式.ps1`）

1. 前置一次性：`winget install JRSoftware.InnoSetup`（取得 `ISCC.exe`）。
2. 組 staging：複製 src/啟動器/docs/README/授權說明、`npm ci`、
   `PLAYWRIGHT_BROWSERS_PATH=<stage>\ms-playwright npx playwright install chromium`、放入可攜版 Node。
3. 呼叫 `ISCC.exe installer.iss` → 產出 `D:\code\公文附件下載器-安裝.exe`。

## 六、測試

- build 後在「無系統 Node 的乾淨環境」雙擊 exe，跑完整安裝（複用先前 no-Node 驗證法：移除 PATH 中 node）。
- 驗證：授權頁顯示且須同意、輸入頁寫出正確 `.env`、捷徑能跑並下載、勾排程後 `schtasks /Query` 有該工作、移除程式後檔案與排程都清除、全程零連網。

## 不做（YAGNI）

- 不做程式碼簽章（無憑證）。
- 不另做執行期 GUI 視窗（平常執行沿用 run.bat / 執行.bat）。
- 不支援多使用者/系統層安裝。

## 風險

- SmartScreen 警告（未簽章）→ README 教「更多資訊 → 仍要執行」。
- Inno 繁中：官方語言檔無 zh-TW，使用社群 `ChineseTraditional.isl` 或自訂訊息字串。
- bundle 內 Chromium 路徑必須靠 `PLAYWRIGHT_BROWSERS_PATH` 指對，否則執行期找不到瀏覽器（build 與 run 兩端都要設）。
