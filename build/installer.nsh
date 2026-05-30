; electron-builder 會自動引入此檔的巨集。
; 解除安裝時額外清掉：每小時排程 + 含帳號密碼的 userData。
!macro customUnInstall
  ; 刪除「每小時自動」排程（沒有也不影響）
  nsExec::Exec 'schtasks /Delete /TN "公文附件下載器" /F'
  ; 刪除設定/歷史/紀錄（settings.json 含帳密）
  RMDir /r "$APPDATA\gongwen-fetcher"
!macroend
