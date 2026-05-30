# 國尊 Cyberhood 線上簽核系統 — 探勘紀錄

- 探勘日期：2026-05-30
- 探勘站台：`https://*.cyberhood.net.tw/tw/`
- 系統：Cyberhood 電子公文／線上簽核（workflow 模組）
- 跨校：各校網址不同，但同一套 Cyberhood，畫面與函式一致 → selector / 函式可共用，
  僅 `GW_BASE_URL` 不同。**若某校為客製/舊版需重新探勘該校。**

## 關鍵特性：深層巢狀 frameset + JS 函式驅動

整套系統是 frameset 巢狀（top → cyber_main → ap_main → main…），且所有動作（登入、
開公文、下載附件）都是呼叫頁面內的**全域 JS 函式**，不是一般表單送出或連結。
因此自動化必須：

1. 用 `page.frames().find(f => f.url().includes('關鍵字'))` 找到對的 frame
2. 用 `frame.evaluate(() => 函式名(...))` 呼叫頁面函式
3. 下載用 `page.waitForEvent('download')` 攔截（已實測可攔截）

Playwright 的 `page.frames()` 會攤平所有層的 frame，不必手動逐層鑽。

## 一、登入

- 登入表單 frame：URL 含 `login_3.htm`
- 帳號欄：`input[name="username"]`
- 密碼欄：`input[name="passwd"]`
- 送出：表單 action 是 `javascript:void login()`；填完呼叫頁面全域函式 `login()`
- 登入成功判斷：出現 URL 含 `workflow/folder_tree.htm` 的 frame（公文模組載入）

## 二、進收件夾

- 資料夾樹 frame：URL 含 `workflow/folder_tree.htm`
- 收件夾節點：`<span id="folder_0_@inbox">`（id 編碼資料夾類型）
- 進行中文件夾：`<span id="folder_0_@going">`（= 已處理，**不抓**）
- 其他：`@closed` 結案夾、`@draft` 草稿夾、`@trash` 垃圾桶、退件夾
- 點 `folder_0_@inbox` → 公文清單載入到 main frame
- 探勘當下：收件夾 (1/2)、進行中 (0/8)、結案 1325

## 三、公文清單

- 清單 frame：URL 含 `workflow/main.htm`
- 表頭列 class `headTr`，欄序：（空）/ 序號 / **簽呈編號** / **簽呈主旨** / 送簽者 / 收件時間 / 期限 / 狀態
- 資料列：cell[2] = 簽呈編號（格式 `YYYYMMDD_NNN`，正則 `\d{8}_\d+`）
- cell[3] = 主旨，內含開啟連結：
  `<a href="javascript:get_sheet(idx,'docKey','host','...')">主旨全文</a>`
  - `docKey` 形如 `2026-05-28 13:44:20.215;1491090060`（時間戳;id）
  - `host` 形如 `ljjhps.cyberhood.net.tw@2`
- 開公文 = 點該 `<a>`（或呼叫 `get_sheet(...)`）→ main frame 換成 sheet_detail.htm

## 四、公文詳情與附件下載

- 詳情 frame：URL 含 `workflow/sheet_detail.htm`
- 顯示「簽呈編號 / 簽呈主旨（含 ［電子］ 前綴）/ 發文者 / 附加檔案」
- 附件區：`<span id="attachments">`，每個檔三個動作 `<a onclick=...>`：
  - 預覽：`viewAttach('<encodedPath>','<filename>')`
  - **下載單檔：`dlAttach('<encodedPath>','<filename>')`** ← 採用
  - 刪除：`delAttach(...)` ← 危險，絕不呼叫
- 「下載全部檔案」：`dlAllAttach('docKey','host')`（docKey/host 同清單 get_sheet 參數）
- 可用全域函式：`dlAttach`、`dlAllAttach`、`viewAttach`、`download_sheet`、`doDownloadSheet`
- 附件下載連結 selector：`a[onclick^="dlAttach("]`

### 下載實測（2026-05-30）

於 sheet_detail frame 呼叫
`dlAttach('dMTQvMi8...Uy5wZGY=','#1153004313_di.pdf')`
→ Playwright 觸發並攔截下載成功（檔名 `#1153004313_di.pdf`）。
證實：`page.waitForEvent('download')` + 呼叫 `dlAttach` 即可取得檔案。
注意：檔名可能含 `#` 等字元，存檔前需清洗（沿用 fileManager）。

## 自動化流程（據此設計）

```
login(page)                         # 填 username/passwd → login()
clickInbox(page)                    # 點 folder_0_@inbox
items = scrapeList(page)            # main.htm 抓 {docNumber, subject, getSheetArgs}
newItems = filterNew(items, 已處理)
for item of newItems:
  openDoc(page, item)               # 點 get_sheet 連結 → sheet_detail
  links = 附件 dlAttach 連結清單
  for link of links:
    waitForEvent('download') + 點 link → saveAs 到 簽呈編號_主旨/
  標記已處理
  clickInbox(page)                  # 回清單供下一件
```
