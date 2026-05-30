import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ILLEGAL = /[\\/:*?"<>|]/g;
const MAX_LEN = 150;

function trimTrailing(s) {
  return s.replace(/[\s.]+$/, '');
}

export function sanitizeSegment(s) {
  return trimTrailing(String(s).replace(ILLEGAL, '_')).trim();
}

export function buildFolderName(docNumber, subject) {
  const name = `${sanitizeSegment(docNumber)}_${sanitizeSegment(subject)}`;
  return trimTrailing(name.slice(0, MAX_LEN));
}

export function ensureFolder(outputDir, folderName) {
  const dir = join(outputDir, folderName);
  const isNew = !existsSync(dir);
  mkdirSync(dir, { recursive: true });
  return { dir, isNew };
}
