import { join } from 'node:path';
import { config } from './config.js';
import { selectors as S } from './selectors.js';
import { findFrame, waitForFrame } from './frames.js';

const ILLEGAL = /[\\/:*?"<>|]/g;

// 點清單中某件公文的開啟連結（以 href 字串比對），等詳情頁載入。
export async function openDoc(page, item) {
  const listFrame = findFrame(page, S.list.frameUrlIncludes);
  if (!listFrame) throw new Error('開啟公文前找不到清單區塊');
  await listFrame.evaluate((href) => {
    const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href') === href);
    if (!a) throw new Error('找不到該公文的開啟連結');
    a.click();
  }, item.href);
  await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
}

// 下載目前開啟公文的所有附件到 destDir，回傳已存檔路徑陣列。
export async function downloadAttachments(page, destDir) {
  const docFrame = await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);

  // 取出每個附件 dlAttach 連結的 onclick 字串
  const onclicks = await docFrame.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((a) => a.getAttribute('onclick')),
    S.doc.attachLinkSelector
  );

  const saved = [];
  for (const onclick of onclicks) {
    const m = onclick && onclick.match(/dlAttach\('([^']*)','([^']*)'\)/);
    if (!m) continue;
    const [, encoded, filename] = m;

    let download;
    try {
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: config.timeout }),
        docFrame.evaluate(({ e, f }) => window.dlAttach(e, f), { e: encoded, f: filename }),
      ]);
    } catch {
      // 逾時重試一次
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: config.timeout }),
        docFrame.evaluate(({ e, f }) => window.dlAttach(e, f), { e: encoded, f: filename }),
      ]);
    }

    const dest = join(destDir, filename.replace(ILLEGAL, '_'));
    await download.saveAs(dest);
    saved.push(dest);
  }
  return saved;
}

// 目前開啟公文的附件數量（不下載）。
export async function countAttachments(page) {
  const docFrame = await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
  return docFrame.evaluate((sel) => document.querySelectorAll(sel).length, S.doc.attachLinkSelector);
}
