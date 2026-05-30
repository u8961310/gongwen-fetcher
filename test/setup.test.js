import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvContent } from '../src/setup.js';

test('buildEnvContent 產生正確 .env 文字', () => {
  const out = buildEnvContent({
    baseUrl: 'https://a.example/login',
    account: 'user1',
    password: 'pass1',
    outputDir: 'D:\\公文',
  });
  assert.match(out, /^GW_BASE_URL=https:\/\/a\.example\/login$/m);
  assert.match(out, /^GW_ACCOUNT=user1$/m);
  assert.match(out, /^GW_PASSWORD=pass1$/m);
  assert.match(out, /^GW_OUTPUT_DIR=D:\\公文$/m);
});

test('buildEnvContent 對缺值丟錯', () => {
  assert.throws(() => buildEnvContent({ baseUrl: '', account: 'a', password: 'b', outputDir: 'c' }));
});
