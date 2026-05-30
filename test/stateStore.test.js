import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProcessed, saveProcessed, filterNew } from '../src/stateStore.js';

test('檔案不存在時回傳空 Set', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'gw-')), 'processed.json');
  assert.equal(loadProcessed(p).size, 0);
});

test('save 後 load 還原同一組編號', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'gw-')), 'processed.json');
  saveProcessed(p, new Set(['A1', 'B2']));
  const loaded = loadProcessed(p);
  assert.ok(loaded.has('A1') && loaded.has('B2'));
});

test('filterNew 只留下未處理過的件', () => {
  const items = [{ docNumber: 'A1' }, { docNumber: 'B2' }, { docNumber: 'C3' }];
  const result = filterNew(items, new Set(['B2']));
  assert.deepEqual(result.map((i) => i.docNumber), ['A1', 'C3']);
});
