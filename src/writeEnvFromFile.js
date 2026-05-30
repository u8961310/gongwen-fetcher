import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import { buildEnvContent } from './setup.js';

export function parseInput(raw) {
  let s = raw;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // 去 BOM
  const [baseUrl = '', account = '', password = '', outputDir = ''] = s.split(/\r?\n/);
  return {
    baseUrl: baseUrl.trim(),
    account: account.trim(),
    password: password.trim(),
    outputDir: outputDir.trim(),
  };
}

function main() {
  const inputPath = argv[2] || '.setup-input.txt';
  const values = parseInput(readFileSync(inputPath, 'utf8'));
  writeFileSync('.env', buildEnvContent(values), 'utf8');
  if (existsSync(inputPath)) unlinkSync(inputPath);
  console.log('.env 已建立');
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main();
}
