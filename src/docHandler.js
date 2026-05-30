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

// 收集目前開啟公文的附件清單，回傳 [{ encoded, filename }]。
// 附件由 RPC（buildAttachmentList）非同步建立，等它長出來；真的沒附件則等短逾時後回空陣列。
export async function collectAttachments(page) {
  const docFrame = await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
  await docFrame.waitForSelector('#attachments', { timeout: config.timeout }).catch(() => {});
  await docFrame
    .waitForFunction((sel) => document.querySelectorAll(sel).length > 0, S.doc.attachLinkSelector, {
      timeout: 8000,
    })
    .catch(() => {});

  const onclicks = await docFrame.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((a) => a.getAttribute('onclick')),
    S.doc.attachLinkSelector
  );

  return onclicks
    .map((oc) => oc && oc.match(/dlAttach\('([^']*)','([^']*)'\)/))
    .filter(Boolean)
    .map((m) => ({ encoded: m[1], filename: m[2] }));
}

// 下載已收集的附件到 destDir，回傳已存檔路徑陣列；單檔逾時重試一次。
export async function downloadAttachments(page, destDir, atts) {
  const docFrame = await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
  const saved = [];
  for (const { encoded, filename } of atts) {
    let download;
    try {
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: config.timeout }),
        docFrame.evaluate(({ e, f }) => window.dlAttach(e, f), { e: encoded, f: filename }),
      ]);
    } catch {
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
