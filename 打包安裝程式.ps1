$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$bundle = Join-Path $root 'dist-build\bundle'
$iss = Join-Path $root 'installer\installer.iss'
$iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
  'C:\Program Files\Inno Setup 6\ISCC.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'ISCC.exe 找不到，請先安裝 Inno Setup（winget install JRSoftware.InnoSetup）' }
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
