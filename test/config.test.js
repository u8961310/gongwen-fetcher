import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig } from '../src/config.js';

test('buildConfig 由 env-like 物件組出 config，套用預設值', () => {
  const c = buildConfig({ GW_BASE_URL: 'u', GW_ACCOUNT: 'a', GW_PASSWORD: 'p', GW_OUTPUT_DIR: 'd' });
  assert.equal(c.baseUrl, 'u');
  assert.equal(c.account, 'a');
  assert.equal(c.timeout, 30000);
  assert.equal(c.processedFile, 'processed.json');
});

test('buildConfig 缺必填丟錯', () => {
  assert.throws(() => buildConfig({ GW_BASE_URL: '', GW_ACCOUNT: 'a', GW_PASSWORD: 'p', GW_OUTPUT_DIR: 'd' }));
});
