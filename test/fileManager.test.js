import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFolderName, ensureFolder } from '../src/fileManager.js';

test('正常編號與主旨用底線串接', () => {
  assert.equal(
    buildFolderName('1130012345', '關於資訊設備採購案'),
    '1130012345_關於資訊設備採購案'
  );
});

test('非法字元換成底線', () => {
  assert.equal(buildFolderName('A1', 'a/b:c*d?e"f<g>h|i'), 'A1_a_b_c_d_e_f_g_h_i');
});

test('結尾空白與句點被移除', () => {
  assert.equal(buildFolderName('A1', '主旨...  '), 'A1_主旨');
});

test('過長主旨截斷到 150 字以內且不以空白句點結尾', () => {
  const name = buildFolderName('A1', '長'.repeat(300));
  assert.ok(name.length <= 150);
  assert.ok(!/[\s.]$/.test(name));
});

test('ensureFolder 建立資料夾並回報是否為新', () => {
  const base = mkdtempSync(join(tmpdir(), 'gw-'));
  const first = ensureFolder(base, 'X1_主旨');
  assert.equal(first.isNew, true);
  assert.ok(existsSync(first.dir));
  const second = ensureFolder(base, 'X1_主旨');
  assert.equal(second.isNew, false);
});
