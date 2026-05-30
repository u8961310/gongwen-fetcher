import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDownload } from '../src/runDownload.js';

function makeDeps(overrides = {}) {
  const created = [];
  return {
    created,
    deps: {
      chromium: { launch: async () => ({ newPage: async () => ({}), close: async () => {} }) },
      login: async () => {},
      openInbox: async () => {},
      scrapeInbox: async () => [
        { docNumber: 'A1', subject: '主旨一', href: 'h1' },
        { docNumber: 'B2', subject: '主旨二', href: 'h2' },
      ],
      filterNew: (items) => items,
      loadProcessed: () => new Set(),
      saveProcessed: () => {},
      openDoc: async () => {},
      collectAttachments: async (page, cfg) => (cfg._n2 ? [] : [{ encoded: 'e', filename: 'f.pdf' }]),
      downloadAttachments: async () => ['x'],
      buildFolderName: (n, s) => `${n}_${s}`,
      ensureFolder: (out, name) => { created.push(name); return { dir: name, isNew: true }; },
      existsSync: () => false,
      ...overrides,
    },
  };
}

test('正常流程發出 login/list/item-done/done 事件', async () => {
  const events = [];
  const { deps } = makeDeps();
  await runDownload({ config: { outputDir: 'O', processedFile: 'p' }, onProgress: (e) => events.push(e.type) }, deps);
  assert.ok(events.includes('login'));
  assert.ok(events.includes('list'));
  assert.ok(events.includes('done'));
});

test('無附件不建資料夾', async () => {
  const { deps, created } = makeDeps({ collectAttachments: async () => [] });
  await runDownload({ config: { outputDir: 'O', processedFile: 'p' }, onProgress: () => {} }, deps);
  assert.equal(created.length, 0);
});
