import { join } from 'node:path';
import { selectors as S } from './selectors.js';
import { findFrame, waitForFrame } from './frames.js';

const ILLEGAL = /[\\/:*?"<>|]/g;

export async function openDoc(page, item, config) {
  const listFrame = findFrame(page, S.list.frameUrlIncludes);
  if (!listFrame) throw new Error('開啟公文前找不到清單區塊');
  await listFrame.evaluate((href) => {
    const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href') === href);
    if (!a) throw new Error('找不到該公文的開啟連結');
    a.click();
  }, item.href);
  await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
}

export async function collectAttachments(page, config) {
  const docFrame = await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
  await docFrame.waitForSelector('#attachments', { timeout: config.timeout }).catch(() => {});
  await docFrame
    .waitForFunction((sel) => document.querySelectorAll(sel).length > 0, S.doc.attachLinkSelector, { timeout: 8000 })
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

export async function downloadAttachments(page, destDir, config, atts) {
  const docFrame = await waitForFrame(page, S.doc.frameUrlIncludes, config.timeout);
  const saved = [];
  for (const { encoded, filename } of atts) {
    let download;
    const fire = () =>
      Promise.all([
        page.waitForEvent('download', { timeout: config.timeout }),
        docFrame.evaluate(({ e, f }) => window.dlAttach(e, f), { e: encoded, f: filename }),
      ]);
    try {
      [download] = await fire();
    } catch {
      [download] = await fire();
    }
    const dest = join(destDir, filename.replace(ILLEGAL, '_'));
    await download.saveAs(dest);
    saved.push(dest);
  }
  return saved;
}
