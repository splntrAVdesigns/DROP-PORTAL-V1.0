import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'DROP_PORTAL_PHASE1_CODEBASE_2026-09-21', 'dist');
const required = ['index.html', 'app.js', 'data.js', 'feed.js', 'player.js', 'storage.js', 'styles.css'];
const missing = required.filter((file) => !fs.existsSync(path.join(dist, file)));

if (missing.length) {
  console.error(`[shell] FAIL: missing static assets: ${missing.join(', ')}`);
  process.exit(1);
}

const jsFiles = fs.readdirSync(dist)
  .filter((file) => file.endsWith('.js'))
  .map((file) => path.join(dist, file));

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`[shell] FAIL: syntax error in ${path.relative(root, file)}`);
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
  }
}

const appSource = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
const autoplayFrames = [...appSource.matchAll(/<iframe[^>]*allow="autoplay"[^>]*>/g)].map((match) => match[0]);
const unmanagedFrames = autoplayFrames.filter((frame) => !frame.includes('data-provider-player'));
if (unmanagedFrames.length) {
  console.error(`[shell] FAIL: ${unmanagedFrames.length} autoplay provider frame(s) bypass playback ownership`);
  process.exit(1);
}
if (!appSource.includes('releaseProviderPlayback();player.play(') ||
    !appSource.includes("providerOwner===frame") ||
    !appSource.includes("reconcileProviderFocus()},120")) {
  console.error('[shell] FAIL: preview playback ownership arbitration is missing');
  process.exit(1);
}

console.log(`[shell] PASS: ${required.length} required assets and ${jsFiles.length} JavaScript modules checked`);
