import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/writeEnvFromFile.js';

test('parseInput 去除 BOM 並切成四欄', () => {
  const r = parseInput('﻿https://a/login\r\nuser1\r\npass1\r\nD:\\公文');
  assert.deepEqual(r, {
    baseUrl: 'https://a/login',
    account: 'user1',
    password: 'pass1',
    outputDir: 'D:\\公文',
  });
});
