import { selectors as S } from './selectors.js';
import { waitForFrame } from './frames.js';

export async function login(page, config) {
  await page.goto(config.baseUrl, { timeout: config.timeout, waitUntil: 'domcontentloaded' });
  const loginFrame = await waitForFrame(page, S.login.frameUrlIncludes, config.timeout);
  await loginFrame.fill(S.login.account, config.account);
  await loginFrame.fill(S.login.password, config.password);
  await loginFrame.evaluate((fn) => window[fn](), S.login.submitFn);
  await waitForFrame(page, S.loginSuccess.frameUrlIncludes, config.timeout);
}
