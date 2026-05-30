// 共用：在巢狀 frameset 中以 URL 片段定位 frame。
// Playwright 的 page.frames() 會攤平所有層級的 frame，故不必逐層鑽。

export function findFrame(page, urlIncludes) {
  return page.frames().find((f) => f.url().includes(urlIncludes));
}

export async function waitForFrame(page, urlIncludes, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const f = findFrame(page, urlIncludes);
    if (f) return f;
    if (Date.now() > deadline) throw new Error(`等不到頁面區塊（frame: ${urlIncludes}）`);
    await page.waitForTimeout(300);
  }
}
