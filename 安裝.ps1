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
    Write-Host '下載 Node 失敗，可能是網路或防火牆阻擋。請改用公司允許的網路，或聯絡資訊人員。' -ForegroundColor Red
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
Write-Host '安裝完成！接下來請雙擊「首次設定.bat」輸入帳號密碼與網址。' -ForegroundColor Green
Read-Host '按 Enter 結束'
