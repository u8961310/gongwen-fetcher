# 圖形化安裝程式（離線 exe）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 gongwen-fetcher 包成單一離線圖形化安裝程式 `公文附件下載器-安裝.exe`，含授權頁、圖形帳密輸入、捷徑、可選排程、移除程式，免連網免管理員。

**Architecture:** Inno Setup 編譯。Build 腳本先組「離線 bundle」（src + 可攜版 Node + node_modules + Chromium），再用 ISCC.exe 把 bundle 與安裝邏輯（授權頁、輸入頁、寫 .env、捷徑、排程）編成 exe。.env 由安裝精靈收集後交給 bundle 內 Node 腳本以 UTF-8 寫出（避免 CJK 路徑亂碼）。

**Tech Stack:** Inno Setup 6（Pascal Script）、PowerShell（build）、Node.js（writeEnvFromFile）、Playwright（PLAYWRIGHT_BROWSERS_PATH 做可攜瀏覽器）。

---

## 檔案結構

| 檔案 | 職責 |
|------|------|
| `執行.bat`（改） | 互動執行：設 PLAYWRIGHT_BROWSERS_PATH + 用 runtime node + pause |
| `run.bat`（改） | 排程靜默執行：同上但寫 log、無 pause |
| `src/writeEnvFromFile.js`（新） | 讀安裝精靈寫的輸入暫存檔，UTF-8 產生 .env，刪暫存 |
| `test/writeEnvFromFile.test.js`（新） | parseInput 去 BOM/切行測試 |
| `授權說明.txt`（新） | 授權全文（Inno 授權頁用） |
| `installer/installer.iss`（新） | Inno Setup 腳本：Setup/Files/Tasks/Icons/Run/UninstallRun/Code |
| `installer/ChineseTraditional.isl`（build 時取得） | 繁中介面語言 |
| `打包安裝程式.ps1`（新） | 組 bundle + 取語言檔 + 跑 ISCC → 產 exe |
| `README.md`（改） | 加「使用授權」「安裝程式安裝步驟」「SmartScreen」 |

---

## Task 1: 更新啟動器（PLAYWRIGHT_BROWSERS_PATH + runtime node）

**Files:**
- Modify: `執行.bat`
- Modify: `run.bat`

- [ ] **Step 1: 覆寫 `執行.bat`（用 Write 工具）**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" (
  echo 尚未設定帳號密碼，請重新執行安裝程式。
  pause
  exit /b 1
)
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
if exist "ms-playwright" set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
"%NODE%" src\index.js
echo.
pause
```

- [ ] **Step 2: 覆寫 `run.bat`（用 Write 工具）**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE=node"
if exist "runtime\node\node.exe" set "NODE=runtime\node\node.exe"
if exist "ms-playwright" set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
"%NODE%" src\index.js >> run.log 2>&1
```

- [ ] **Step 3: 轉成 CRLF（Write 工具寫的是 LF，cmd 需要 CRLF）**

Run（PowerShell）:
```
$enc = New-Object System.Text.UTF8Encoding($false)
foreach ($n in @('執行.bat','run.bat')) {
  $p = Join-Path 'D:\code\repos\gongwen-fetcher' $n
  $t = ([IO.File]::ReadAllText($p) -replace "`r`n","`n") -replace "`n","`r`n"
  [IO.File]::WriteAllText($p, $t, $enc)
}
```
Expected: 無輸出（成功）。

- [ ] **Step 4: Commit**

```bash
git add 執行.bat run.bat
git commit -m "feat: 啟動器支援可攜 Chromium（PLAYWRIGHT_BROWSERS_PATH）"
```

---

## Task 2: writeEnvFromFile（安裝精靈寫 .env 用，TDD）

> 安裝精靈把 4 個輸入值寫到暫存檔，再由此 Node 腳本以 UTF-8 產生 `.env`（CJK 路徑才不亂碼），並刪暫存。重用已測過的 `buildEnvContent`。

**Files:**
- Create: `src/writeEnvFromFile.js`
- Test: `test/writeEnvFromFile.test.js`

- [ ] **Step 1: 寫失敗測試**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/writeEnvFromFile.js';

test('parseInput 去除 BOM 並切成四欄', () => {
  const r = parseInput('﻿https://a/login\r\nuser1\r\npass1\r\nD:\\公文');
  assert.deepEqual(r, {
    baseUrl: 'https://a/login',
    account: 'user1',
    password: 'pass1',
    outputDir: 'D:\\公文',
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/writeEnvFromFile.test.js`
Expected: FAIL（parseInput 未定義）

- [ ] **Step 3: 寫實作**

```js
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import { buildEnvContent } from './setup.js';

export function parseInput(raw) {
  let s = raw;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // 去 BOM
  const [baseUrl = '', account = '', password = '', outputDir = ''] = s.split(/\r?\n/);
  return {
    baseUrl: baseUrl.trim(),
    account: account.trim(),
    password: password.trim(),
    outputDir: outputDir.trim(),
  };
}

function main() {
  const inputPath = argv[2] || '.setup-input.txt';
  const values = parseInput(readFileSync(inputPath, 'utf8'));
  writeFileSync('.env', buildEnvContent(values), 'utf8');
  if (existsSync(inputPath)) unlinkSync(inputPath);
  console.log('.env 已建立');
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main();
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/writeEnvFromFile.test.js`
Expected: PASS（1 test）

- [ ] **Step 5: Commit**

```bash
git add src/writeEnvFromFile.js test/writeEnvFromFile.test.js
git commit -m "feat: writeEnvFromFile 由安裝輸入產生 UTF-8 .env"
```

---

## Task 3: 授權說明.txt

**Files:**
- Create: `授權說明.txt`

- [ ] **Step 1: 寫 `授權說明.txt`（用 Write 工具，繁體中文）**

```
公文附件下載器 — 使用授權說明

作者：陳冠廷

一、本軟體開放全國公立、私立各級學校免費使用。

二、臺北市私立立人國際中小學不在本授權範圍內，未經作者另行書面同意，不得使用本軟體。

三、本軟體依「現況」提供，作者不對使用結果負擔任何明示或默示之擔保責任；使用者應自行
    確認帳號使用符合所屬學校及公文系統規範。

四、請勿散布內含個人帳號密碼（.env）的資料夾。
```

- [ ] **Step 2: 轉 CRLF（Inno 授權頁顯示較穩）**

Run（PowerShell）:
```
$enc = New-Object System.Text.UTF8Encoding($true)
$p = 'D:\code\repos\gongwen-fetcher\授權說明.txt'
$t = ([IO.File]::ReadAllText($p) -replace "`r`n","`n") -replace "`n","`r`n"
[IO.File]::WriteAllText($p, $t, $enc)
```
（此檔用 UTF-8 含 BOM，Inno LicenseFile 對 BOM 顯示中文較正確。）
Expected: 無輸出。

- [ ] **Step 3: Commit**

```bash
git add 授權說明.txt
git commit -m "docs: 使用授權說明（全國學校，排除立人）"
```

---

## Task 4: installer.iss（Inno Setup 腳本）

**Files:**
- Create: `installer/installer.iss`

- [ ] **Step 1: 寫 `installer/installer.iss`（用 Write 工具）**

> `{#Bundle}` 由 build 腳本以 `/DBundle=<路徑>` 傳入。語言檔 `ChineseTraditional.isl` 與本檔同目錄。

```iss
#define MyAppName "公文附件下載器"

[Setup]
AppName={#MyAppName}
AppVersion=1.0.0
AppPublisher=陳冠廷
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
LicenseFile={#Bundle}\授權說明.txt
OutputDir=D:\code
OutputBaseFilename=公文附件下載器-安裝
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "zhhant"; MessagesFile: "ChineseTraditional.isl"

[Files]
Source: "{#Bundle}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Tasks]
Name: "dailytask"; Description: "每天早上 08:00 自動下載新公文附件"
Name: "runnow"; Description: "安裝完成後立即執行一次"

[Icons]
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\執行.bat"; WorkingDir: "{app}"
Name: "{userprograms}\{#MyAppName}\{#MyAppName}"; Filename: "{app}\執行.bat"; WorkingDir: "{app}"
Name: "{userprograms}\{#MyAppName}\移除 {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\runtime\node\node.exe"; Parameters: "src\writeEnvFromFile.js .setup-input.txt"; WorkingDir: "{app}"; Flags: runhidden
Filename: "{cmd}"; Parameters: "/c schtasks /Create /TN ""公文附件下載器"" /TR ""\""{app}\run.bat\"""" /SC DAILY /ST 08:00 /F"; Flags: runhidden; Tasks: dailytask
Filename: "{app}\執行.bat"; Description: "立即執行一次"; Flags: postinstall nowait skipifsilent; Tasks: runnow

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c schtasks /Delete /TN ""公文附件下載器"" /F"; Flags: runhidden; RunOnceId: "DelGongwenTask"

[Code]
var
  InputPage: TInputQueryWizardPage;
  DirPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  InputPage := CreateInputQueryPage(wpSelectDir,
    '公文系統設定', '請輸入你的公文系統登入資訊',
    '這些資料只會存在你這台電腦，用來自動登入下載附件。');
  InputPage.Add('登入網址（例 https://校名.cyberhood.net.tw/tw/）：', False);
  InputPage.Add('帳號：', False);
  InputPage.Add('密碼：', True);

  DirPage := CreateInputDirPage(InputPage.ID,
    '存放資料夾', '附件要下載到哪個資料夾',
    '可按「瀏覽」選擇：', False, '');
  DirPage.Add('');
  DirPage.Values[0] := 'D:\公文附件';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = InputPage.ID then
  begin
    if (Trim(InputPage.Values[0]) = '') or (Trim(InputPage.Values[1]) = '')
       or (Trim(InputPage.Values[2]) = '') then
    begin
      MsgBox('網址、帳號、密碼都必須填寫。', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Lines: TArrayOfString;
begin
  if CurStep = ssPostInstall then
  begin
    SetArrayLength(Lines, 4);
    Lines[0] := InputPage.Values[0];
    Lines[1] := InputPage.Values[1];
    Lines[2] := InputPage.Values[2];
    Lines[3] := DirPage.Values[0];
    SaveStringsToUTF8File(ExpandConstant('{app}\.setup-input.txt'), Lines, False);
  end;
end;
```

- [ ] **Step 2: Commit**

```bash
git add installer/installer.iss
git commit -m "feat: Inno Setup 安裝腳本（授權頁/輸入頁/捷徑/排程/移除）"
```

---

## Task 5: 取得 Inno Setup（一次性前置）

**Files:** 無（環境前置）

- [ ] **Step 1: 安裝 Inno Setup**

Run（PowerShell）: `winget install --id JRSoftware.InnoSetup --accept-source-agreements --accept-package-agreements`
Expected: 安裝成功；`ISCC.exe` 位於 `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`。

- [ ] **Step 2: 驗證**

Run: `& 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' /?`
Expected: 印出 ISCC 用法說明（代表可用）。

---

## Task 6: 打包安裝程式.ps1（build 腳本）

**Files:**
- Create: `打包安裝程式.ps1`

- [ ] **Step 1: 寫 `打包安裝程式.ps1`（用 Write 工具）**

```powershell
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$bundle = Join-Path $root 'dist-build\bundle'
$iss = Join-Path $root 'installer\installer.iss'
$iscc = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
$nodeVersion = 'v20.18.0'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# 1) 清空 bundle
if (Test-Path (Join-Path $root 'dist-build')) { Remove-Item (Join-Path $root 'dist-build') -Recurse -Force }
New-Item -ItemType Directory -Force -Path $bundle | Out-Null

# 2) 複製程式與啟動器
Copy-Item (Join-Path $root 'src') -Destination $bundle -Recurse
New-Item -ItemType Directory -Force -Path (Join-Path $bundle 'docs') | Out-Null
Copy-Item (Join-Path $root 'docs\selectors.md') -Destination (Join-Path $bundle 'docs')
foreach ($f in @('package.json','package-lock.json','README.md','授權說明.txt','執行.bat','run.bat')) {
  Copy-Item (Join-Path $root $f) -Destination $bundle
}

# 3) bundle 內 .bat 轉 CRLF（cmd 需要）
foreach ($b in (Get-ChildItem $bundle -Filter *.bat)) {
  $t = ([IO.File]::ReadAllText($b.FullName) -replace "`r`n","`n") -replace "`n","`r`n"
  [IO.File]::WriteAllText($b.FullName, $t, $utf8)
}

# 4-5) 裝依賴 + 把 Chromium 裝進 bundle\ms-playwright（可攜）
#      先設 PLAYWRIGHT_BROWSERS_PATH，連 npm ci 的 postinstall 都直接落在 bundle，避免重複下載到預設快取
Push-Location $bundle
$env:PLAYWRIGHT_BROWSERS_PATH = (Join-Path $bundle 'ms-playwright')
& npm ci
& npm exec -- playwright install chromium
Remove-Item Env:\PLAYWRIGHT_BROWSERS_PATH
Pop-Location

# 6) 下載可攜版 Node 放進 bundle\runtime\node
$zip = Join-Path $env:TEMP 'node-portable.zip'
$ex = Join-Path $env:TEMP 'node-portable-ex'
Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip" -OutFile $zip -UseBasicParsing
if (Test-Path $ex) { Remove-Item $ex -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $ex -Force
$inner = Get-ChildItem $ex -Directory | Select-Object -First 1
$nodeDir = Join-Path $bundle 'runtime\node'
New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
Copy-Item (Join-Path $inner.FullName '*') -Destination $nodeDir -Recurse -Force

# 7) 取得繁中語言檔
$isl = Join-Path $root 'installer\ChineseTraditional.isl'
if (-not (Test-Path $isl)) {
  Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/jrsoftware/issrc/main/Files/Languages/Unofficial/ChineseTraditional.isl' -OutFile $isl -UseBasicParsing
}

# 8) 編譯安裝程式
& $iscc "/DBundle=$bundle" $iss
Write-Host "✅ 完成：D:\code\公文附件下載器-安裝.exe"
```

- [ ] **Step 2: 加入 .gitignore（不追蹤 build 產物與語言檔）**

在 `.gitignore` 末尾加：
```
dist-build/
installer/ChineseTraditional.isl
```

- [ ] **Step 3: Commit**

```bash
git add 打包安裝程式.ps1 .gitignore
git commit -m "feat: 安裝程式 build 腳本（bundle + 可攜 Node/Chromium + ISCC）"
```

---

## Task 7: README 更新（授權 + 安裝程式 + SmartScreen）

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在 README.md 加三段**

1. **## 使用授權**：摘要授權說明（全國公私立學校免費使用；排除臺北市私立立人國際中小學；依現況提供；勿散布含密碼的資料夾），並註明全文見 `授權說明.txt`。
2. **## 安裝（給同事）**：雙擊 `公文附件下載器-安裝.exe` → 同意授權 → 填網址/帳號/密碼/資料夾 → 完成（可勾每日自動、立即執行）→ 桌面捷徑「公文附件下載器」雙擊即下載。免裝 Node、免連網。
3. **## 第一次開啟出現「Windows 已保護你的電腦」**：因未做程式碼簽章，屬正常 → 點「更多資訊」→「仍要執行」。

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README 加使用授權、安裝程式步驟、SmartScreen 說明"
```

---

## Task 8: Build 並端對端測試

- [ ] **Step 1: 全單元測試**

Run: `npm test`
Expected: 既有測試 + writeEnvFromFile 測試全過。

- [ ] **Step 2: 執行 build**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File "D:\code\repos\gongwen-fetcher\打包安裝程式.ps1"`
Expected: 產出 `D:\code\公文附件下載器-安裝.exe`（約 250-300MB）。

- [ ] **Step 3: 無 Node 乾淨環境安裝測試**

於另一資料夾雙擊 exe（或 silent 安裝），驗證：
- 授權頁顯示繁中且須同意才能繼續
- 輸入頁可填網址/帳號/密碼（遮蔽）/資料夾
- 裝到 `%LocalAppData%\Programs\公文附件下載器`，內含 runtime\node、ms-playwright、node_modules
- 安裝後 `{app}\.env` 為 UTF-8、GW_OUTPUT_DIR 中文路徑正確、無亂碼、無 `.setup-input.txt` 殘留
- 桌面捷徑雙擊 → 成功登入並下載（用 bundle 的可攜 Node + 可攜 Chromium，全程無系統 Node、無連網）

Run（驗證 .env 編碼，把 <APP> 換成安裝路徑）:
```
$b=[IO.File]::ReadAllBytes('<APP>\.env'); 'BOM? '+($b[0]-eq239); Get-Content '<APP>\.env'
```
Expected: BOM? False；四個 GW_ 變數正確、中文路徑正常。

- [ ] **Step 4: 排程與移除測試**

- 勾「每天自動下載」安裝後 Run: `schtasks /Query /TN "公文附件下載器"` → 應存在。
- 從「設定→應用程式」或開始菜單移除 → 檔案清除、`schtasks /Query /TN "公文附件下載器"` → 已不存在。

- [ ] **Step 5: 重新打包給同事的最終檔**

確認 exe 可用後，`公文附件下載器-安裝.exe` 即為發給同事的單一檔（取代舊 zip 流程）。
