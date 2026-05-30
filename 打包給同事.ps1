# 打包一份乾淨的「給同事」zip：只含程式與腳本，排除帳密/狀態/依賴等。
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$stageRoot = Join-Path $env:TEMP 'gongwen-dist'
$stage = Join-Path $stageRoot 'gongwen-fetcher'
$zip = 'D:\code\gongwen-fetcher-給同事.zip'

if (Test-Path $stageRoot) { Remove-Item $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# 程式
Copy-Item (Join-Path $src 'src') -Destination $stage -Recurse
# 給技術人員的跨校參考
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'docs') | Out-Null
Copy-Item (Join-Path $src 'docs\selectors.md') -Destination (Join-Path $stage 'docs')
# 頂層檔案與啟動器
$files = @(
  'package.json', 'package-lock.json', '.env.example', 'README.md',
  '安裝.bat', '安裝.ps1', '首次設定.bat', '執行.bat', 'run.bat', '設定每日自動.bat'
)
foreach ($f in $files) { Copy-Item (Join-Path $src $f) -Destination $stage }

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $stage -DestinationPath $zip

Write-Host ("✅ 已打包：{0}" -f $zip)
Write-Host '內容（同事拿到的）：'
Get-ChildItem $stage -Recurse | ForEach-Object { '  ' + $_.FullName.Substring($stage.Length + 1) }
