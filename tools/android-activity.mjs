// Install our activity after `tauri android init`. Keep gen/android
// generated, but do not lose the system-inset fix on every clean runner.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function installActivity(root, source) {
  const matches = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'MainActivity.kt') matches.push(path);
    }
  }
  walk(root);
  if (matches.length !== 1) throw new Error(`Expected one generated MainActivity.kt, found ${matches.length}`);
  const target = matches[0];
  const packageOf = (text) => text.match(/^package\s+([^\s;]+)/m)?.[1];
  const generatedPackage = packageOf(readFileSync(target, 'utf8'));
  const sourcePackage = packageOf(source);
  if (!sourcePackage || sourcePackage !== generatedPackage) {
    throw new Error('MainActivity package differs from the generated app; refusing to install it');
  }
  writeFileSync(target, source);
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) throw new Error('usage: android-activity.mjs <generated app/src/main directory>');
  const source = readFileSync(new URL('../src-tauri/android/MainActivity.kt', import.meta.url), 'utf8');
  const target = installActivity(root, source);
  writeFileSync(join(dirname(target), 'AndroidUpdater.kt'), readFileSync(new URL('../src-tauri/android/AndroidUpdater.kt', import.meta.url)));
  console.log('Installed activity and Android updater: ' + target);
}
