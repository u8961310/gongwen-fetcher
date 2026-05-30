import { config } from './config.js';
import { selectors as S } from './selectors.js';
import { findFrame, waitForFrame } from './frames.js';

// 點左側資料夾樹的「收件夾」節點，等清單載入。
export async function openInbox(page) {
  const tree = await waitForFrame(page, S.tree.frameUrlIncludes, config.timeout);
  // 樹節點是登入後由 RPC 建立的，等它出現再點
  await tree.waitForFunction((id) => !!document.getElementById(id), S.tree.inboxNodeId, {
    timeout: config.timeout,
  });
  await tree.evaluate((id) => {
    const span = document.getElementById(id);
    if (!span) throw new Error('找不到收件夾節點');
    // 點 span 及其數層祖先，觸發掛在列上的開資料夾 handler
    let el = span;
    for (let i = 0; i < 4 && el; i++) {
      if (el.click) el.click();
      el = el.parentElement;
    }
  }, S.tree.inboxNodeId);

  // 等清單 RPC 載入完成（main.htm frame 出現且有資料列或表頭）
  const listFrame = await waitForFrame(page, S.list.frameUrlIncludes, config.timeout);
  await listFrame.waitForSelector('tr.headTr', { timeout: config.timeout }).catch(() => {});
  await page.waitForTimeout(800);
}

// 抓收件夾清單，回傳 [{ docNumber, subject, href }]
export async function scrapeInbox(page) {
  const listFrame = findFrame(page, S.list.frameUrlIncludes);
  if (!listFrame) throw new Error('找不到公文清單區塊');

  return listFrame.evaluate(
    (cfg) => {
      const pat = new RegExp(cfg.pattern);
      const rows = [...document.querySelectorAll('tr')].filter(
        (tr) => tr.children[cfg.numIdx] && pat.test((tr.children[cfg.numIdx].innerText || '').trim())
      );
      return rows.map((tr) => {
        const c = tr.children;
        const subjCell = c[cfg.subjIdx];
        const link = subjCell.querySelector('a[href^="javascript:get_sheet"]');
        return {
          docNumber: (c[cfg.numIdx].innerText || '').trim(),
          subject: (subjCell.innerText || '').trim(),
          href: link ? link.getAttribute('href') : '',
        };
      });
    },
    {
      pattern: S.list.docNumberPattern.source,
      numIdx: S.list.docNumberCellIndex,
      subjIdx: S.list.subjectCellIndex,
    }
  );
}
