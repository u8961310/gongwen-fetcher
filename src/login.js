import { config } from './config.js';
import { selectors as S } from './selectors.js';
import { waitForFrame } from './frames.js';

// 登入 Cyberhood：填帳密 → 呼叫頁面 login() → 等公文模組載入。
export async function login(page) {
  await page.goto(config.baseUrl, { timeout: config.timeout, waitUntil: 'domcontentloaded' });

  const loginFrame = await waitForFrame(page, S.login.frameUrlIncludes, config.timeout);
  await loginFrame.fill(S.login.account, config.account);
  await loginFrame.fill(S.login.password, config.password);
  await loginFrame.evaluate((fn) => window[fn](), S.login.submitFn);

  // 公文模組（資料夾樹）出現代表登入成功
  await waitForFrame(page, S.loginSuccess.frameUrlIncludes, config.timeout);
}
