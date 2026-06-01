import { selectors as S } from './selectors.js';
import { findFrame, waitForFrame } from './frames.js';

export async function login(page, config) {
  await page.goto(config.baseUrl, { timeout: config.timeout, waitUntil: 'domcontentloaded' });
  const loginFrame = await waitForFrame(page, S.login.frameUrlIncludes, config.timeout);
  await loginFrame.fill(S.login.account, config.account);
  await loginFrame.fill(S.login.password, config.password);
  await loginFrame.evaluate((fn) => window[fn](), S.login.submitFn);
  await enterSignModule(page, config);
}

// 登入後可能停在入口頁(portal)，公文模組(folder_tree)不會自動出現。
// 輪詢：若公文模組已在就直接用；否則點上方「電子簽核」分頁切過去再等它載入。
async function enterSignModule(page, config) {
  const deadline = Date.now() + config.timeout;
  while (Date.now() < deadline) {
    if (findFrame(page, S.loginSuccess.frameUrlIncludes)) return; // 已在公文模組
    if (await clickNavTab(page, S.nav.signModuleText)) {
      await waitForFrame(page, S.loginSuccess.frameUrlIncludes, config.timeout);
      return;
    }
    await page.waitForTimeout(400); // 登入頁面還在載入，稍候再試
  }
  throw new Error('登入後既沒進入公文模組，也找不到「電子簽核」分頁（請確認帳號或站台是否客製）');
}

// 跨所有 frame 找文字「精確等於」目標的可點元素並真實點擊（觸發動態綁定的 onclick）。
async function clickNavTab(page, text) {
  for (const f of page.frames()) {
    try {
      const handle = await f.evaluateHandle((t) => {
        const els = [...document.querySelectorAll('td, a, div, span, button')];
        return els.find((el) => (el.textContent || '').trim() === t) || null;
      }, text);
      const el = handle.asElement();
      if (el) { await el.click(); return true; }
      await handle.dispose();
    } catch { /* 此 frame 不可評估（跨網域 rpc frame 等），略過 */ }
  }
  return false;
}
