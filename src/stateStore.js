import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function loadProcessed(path) {
  if (!existsSync(path)) return new Set();
  return new Set(JSON.parse(readFileSync(path, 'utf8')));
}

export function saveProcessed(path, set) {
  writeFileSync(path, JSON.stringify([...set], null, 2), 'utf8');
}

export function filterNew(items, processed) {
  return items.filter((it) => !processed.has(it.docNumber));
}
