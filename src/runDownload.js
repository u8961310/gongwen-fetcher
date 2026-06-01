import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { login } from './login.js';
import { openInbox, scrapeInbox } from './listScraper.js';
import { openDoc, collectAttachments, downloadAttachments } from './docHandler.js';
import { buildFolderName, ensureFolder } from './fileManager.js';
import { loadProcessed, saveProcessed, filterNew } from './stateStore.js';

const REAL = {
  chromium, login, openInbox, scrapeInbox, openDoc, collectAttachments,
  downloadAttachments, buildFolderName, ensureFolder, loadProcessed, saveProcessed, filterNew, existsSync,
};

export async function runDownload({ config, onProgress, dryRun = false, force = false }, deps = REAL) {
  const emit = (e) => { if (onProgress) onProgress(e); };
  let browser;
  let downloaded = 0;
  let failed = 0;
  try {
    const processed = deps.loadProcessed(config.processedFile);
    // launch / newPage 放進 try：乾淨電腦上 Chromium 啟動失敗會走到 catch 並 emit error，
    // 而不是丟到 try 外面被吞掉、UI 永遠卡在「登入中…」。
    emit({ type: 'launch' });
    browser = await deps.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await deps.login(page, config);
    emit({ type: 'login' });

    await deps.openInbox(page, config);
    const items = await deps.scrapeInbox(page, config);
    // force（重新下載）：整個收件夾重抓，忽略 processed.json；否則增量只抓新件
    const newItems = force ? items : deps.filterNew(items, processed);
    emit({ type: 'list', total: items.length, fresh: newItems.length, items: newItems });

    for (const item of newItems) {
      const folderName = deps.buildFolderName(item.docNumber, item.subject);
      emit({ type: 'item-start', docNumber: item.docNumber });

      if (dryRun) { emit({ type: 'item-done', docNumber: item.docNumber, status: 'dry', message: `會建 ${folderName}` }); continue; }

      if (!force && deps.existsSync(join(config.outputDir, folderName))) {
        processed.add(item.docNumber);
        emit({ type: 'item-done', docNumber: item.docNumber, status: 'skipped', message: '資料夾已存在' });
        continue;
      }
      try {
        await deps.openDoc(page, item, config);
        const atts = await deps.collectAttachments(page, config);
        if (atts.length === 0) {
          processed.add(item.docNumber);
          emit({ type: 'item-done', docNumber: item.docNumber, status: 'noattach', message: '無附件' });
        } else {
          const { dir } = deps.ensureFolder(config.outputDir, folderName);
          const saved = await deps.downloadAttachments(page, dir, config, atts);
          processed.add(item.docNumber);
          downloaded += 1;
          emit({ type: 'item-done', docNumber: item.docNumber, status: 'downloaded', count: saved.length, message: `下載 ${saved.length} 個附件` });
        }
        await deps.openInbox(page, config);
      } catch (err) {
        failed += 1;
        emit({ type: 'item-done', docNumber: item.docNumber, status: 'failed', message: err.message });
        try { await deps.openInbox(page, config); } catch { /* 回清單失敗，外層收尾 */ }
      }
    }
    if (!dryRun) deps.saveProcessed(config.processedFile, processed);
    emit({ type: 'done', downloaded, failed, outputDir: config.outputDir });
  } catch (err) {
    emit({ type: 'error', message: err.message, stack: err.stack });
  } finally {
    if (browser) await browser.close();
  }
}
