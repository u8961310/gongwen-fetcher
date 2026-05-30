import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasSettings, saveSettings, loadConfig, appendHistory, loadHistory } from '../src/settings.js';

test('無設定時 hasSettings 為 false', () => {
  const d = mkdtempSync(join(tmpdir(), 'gw-'));
  assert.equal(hasSettings(d), false);
});

test('save 後 loadConfig 還原並補預設與 userData 路徑', () => {
  const d = mkdtempSync(join(tmpdir(), 'gw-'));
  saveSettings(d, { baseUrl: 'u', account: 'a', password: 'p', outputDir: 'D:\\公文' });
  assert.equal(hasSettings(d), true);
  const c = loadConfig(d);
  assert.equal(c.baseUrl, 'u');
  assert.equal(c.timeout, 30000);
  assert.equal(c.processedFile, join(d, 'processed.json'));
});

test('appendHistory 後 loadHistory 取得紀錄（新在前）', () => {
  const d = mkdtempSync(join(tmpdir(), 'gw-'));
  appendHistory(d, { time: '2026-05-30T10:00', docNumber: 'A1', count: 2 });
  appendHistory(d, { time: '2026-05-30T11:00', docNumber: 'B2', count: 1 });
  const h = loadHistory(d);
  assert.equal(h[0].docNumber, 'B2');
  assert.equal(h.length, 2);
});
