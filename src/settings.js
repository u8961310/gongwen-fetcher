import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const settingsPath = (dir) => join(dir, 'settings.json');
const historyPath = (dir) => join(dir, 'history.json');

export function hasSettings(dir) {
  if (!existsSync(settingsPath(dir))) return false;
  const s = JSON.parse(readFileSync(settingsPath(dir), 'utf8'));
  return Boolean(s.baseUrl && s.account && s.password && s.outputDir);
}

export function saveSettings(dir, { baseUrl, account, password, outputDir }) {
  writeFileSync(settingsPath(dir), JSON.stringify({ baseUrl, account, password, outputDir }, null, 2), 'utf8');
}

export function loadConfig(dir) {
  const s = JSON.parse(readFileSync(settingsPath(dir), 'utf8'));
  return {
    baseUrl: s.baseUrl,
    account: s.account,
    password: s.password,
    outputDir: s.outputDir,
    timeout: 30000,
    processedFile: join(dir, 'processed.json'),
  };
}

export function loadHistory(dir) {
  if (!existsSync(historyPath(dir))) return [];
  return JSON.parse(readFileSync(historyPath(dir), 'utf8'));
}

export function appendHistory(dir, record) {
  const list = loadHistory(dir);
  list.unshift(record);
  writeFileSync(historyPath(dir), JSON.stringify(list.slice(0, 500), null, 2), 'utf8');
}
