import { loadConfigFromEnv } from './config.js';
import { runDownload } from './runDownload.js';

const dryRun = process.argv.includes('--dry-run');

function consoleProgress(e) {
  if (e.type === 'login') console.log('✅ 登入成功');
  else if (e.type === 'list') console.log(`收件夾 ${e.total} 件，其中新件 ${e.fresh} 件`);
  else if (e.type === 'item-done') console.log(`  ${e.docNumber}：${e.message}`);
  else if (e.type === 'done') console.log(`\n完成：新下載 ${e.downloaded} 件，失敗 ${e.failed}。存放：${e.outputDir}`);
  else if (e.type === 'error') console.error(`❌ ${e.message}`);
}

runDownload({ config: loadConfigFromEnv(), onProgress: consoleProgress, dryRun });
