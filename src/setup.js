import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export function buildEnvContent({ baseUrl, account, password, outputDir }) {
  for (const [k, v] of Object.entries({ baseUrl, account, password, outputDir })) {
    if (!v) throw new Error(`設定值 ${k} 不可空白`);
  }
  return [
    `GW_BASE_URL=${baseUrl}`,
    `GW_ACCOUNT=${account}`,
    `GW_PASSWORD=${password}`,
    `GW_OUTPUT_DIR=${outputDir}`,
    `GW_TIMEOUT=30000`,
    `GW_PROCESSED_FILE=processed.json`,
    '',
  ].join('\n');
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log('===== 國尊公文附件下載器 首次設定 =====\n');
  const baseUrl = (await rl.question('公文系統登入網址（例 https://校名.cyberhood.net.tw/tw/）：')).trim();
  const account = (await rl.question('你的公文系統帳號：')).trim();
  const password = (await rl.question('你的公文系統密碼：')).trim();
  const outputDir = (await rl.question('附件要存到哪個資料夾（例 D:\\公文附件）：')).trim();
  rl.close();

  writeFileSync('.env', buildEnvContent({ baseUrl, account, password, outputDir }), 'utf8');
  console.log('\n✅ 設定完成，已寫入 .env。現在可以雙擊「執行.bat」開始下載。');
  console.log('⚠️ 提醒：密碼以純文字存在此電腦的 .env，請勿把此資料夾分享給他人。');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}
