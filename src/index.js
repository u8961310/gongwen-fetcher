import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { config } from './config.js';
import { login } from './login.js';
import { openInbox, scrapeInbox } from './listScraper.js';
import { openDoc, downloadAttachments } from './docHandler.js';
import { buildFolderName, ensureFolder } from './fileManager.js';
import { loadProcessed, saveProcessed, filterNew } from './stateStore.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const processed = loadProcessed(config.processedFile);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await login(page);
    console.log('✅ 登入成功');

    await openInbox(page);
    const items = await scrapeInbox(page);
    const newItems = filterNew(items, processed);
    console.log(`收件夾 ${items.length} 件，其中新件 ${newItems.length} 件`);

    let done = 0;
    let failed = 0;
    for (const item of newItems) {
      const folderName = buildFolderName(item.docNumber, item.subject);

      if (dryRun) {
        console.log(`[dry-run] ${folderName}`);
        continue;
      }

      // 資料夾已存在 → 視為已處理，免開公文
      if (existsSync(join(config.outputDir, folderName))) {
        console.log(`⏭️ ${folderName} 資料夾已存在，視為已處理`);
        processed.add(item.docNumber);
        continue;
      }

      try {
        await openDoc(page, item);
        const saved = await downloadAttachments(page, ensureFolder(config.outputDir, folderName).dir);
        if (saved.length === 0) {
          console.log(`ℹ️ ${folderName}：無附件`);
        } else {
          console.log(`✅ ${folderName}：下載 ${saved.length} 個附件`);
          done += 1;
        }
        processed.add(item.docNumber);
        await openInbox(page); // 回清單供下一件
      } catch (err) {
        console.error(`⚠️ ${folderName} 失敗，跳過（下次重試）：${err.message}`);
        failed += 1;
        try {
          await openInbox(page);
        } catch {
          /* 回清單失敗就讓外層處理 */
        }
      }
    }

    if (!dryRun) {
      saveProcessed(config.processedFile, processed);
      console.log('\n========================================');
      console.log(
        `完成：本次新下載 ${done} 件公文的附件` +
          (failed ? `，${failed} 件失敗（下次自動重試）` : '')
      );
      console.log(`存放位置：${config.outputDir}`);
      console.log('========================================');
    }
  } catch (err) {
    console.error(`\n❌ 執行中止：${err.message}`);
    console.error('常見原因：帳號密碼或網址錯誤、公文系統暫時無法連線。');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
