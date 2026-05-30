// 國尊 Cyberhood 線上簽核系統 自動化定位地圖
// 由 2026-05-30 探勘 ljjhps.cyberhood.net.tw 得出（詳見 docs/selectors.md）。
// 跨校共用：同一套 Cyberhood 畫面與函式一致，各校僅 GW_BASE_URL 不同。
// 此系統為深層巢狀 frameset + JS 函式驅動，模組以 page.frames() 找 frame、
// frame.evaluate 呼叫頁面函式。

export const selectors = {
  // 登入表單（frame URL 含 login_3）
  login: {
    frameUrlIncludes: 'login_3',
    account: 'input[name="username"]',
    password: 'input[name="passwd"]',
    submitFn: 'login', // 頁面全域函式 login()
  },

  // 登入成功：公文模組 frame 出現
  loginSuccess: {
    frameUrlIncludes: 'workflow/folder_tree.htm',
  },

  // 左側資料夾樹
  tree: {
    frameUrlIncludes: 'workflow/folder_tree.htm',
    inboxNodeId: 'folder_0_@inbox', // 收件夾（來源）
    goingNodeId: 'folder_0_@going', // 進行中＝已處理（不抓）
  },

  // 公文清單
  list: {
    frameUrlIncludes: 'workflow/main.htm',
    docNumberPattern: /\d{8}_\d+/, // 簽呈編號 YYYYMMDD_NNN
    docNumberCellIndex: 2, // 列內第 3 欄
    subjectCellIndex: 3, // 列內第 4 欄
    openLinkSelector: 'a[href^="javascript:get_sheet"]',
  },

  // 公文詳情與附件
  doc: {
    frameUrlIncludes: 'workflow/sheet_detail.htm',
    attachLinkSelector: 'a[onclick^="dlAttach("]', // 單檔下載連結
    dlAttachFn: 'dlAttach', // (encodedPath, filename)
    dlAllAttachFn: 'dlAllAttach', // (docKey, host)
  },
};
