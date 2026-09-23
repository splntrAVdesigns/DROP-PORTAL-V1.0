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
if (!appSource.includes('let activeProviderSlot=null') ||
    !appSource.includes('function providerShell(') ||
    !appSource.includes('data-provider-activate') ||
    !appSource.includes('if(b.dataset.providerActivate)') ||
    !appSource.includes('stopProviderPlayback();render();player.play(')) {
  console.error('[shell] FAIL: single provider playback shell is missing');
  process.exit(1);
}
if (appSource.includes('providerOwner===frame') || appSource.includes('reconcileProviderFocus()},120')) {
  console.error('[shell] FAIL: obsolete iframe focus ownership logic is still present');
  process.exit(1);
}

if (appSource.includes('class="provider-signal"')) {
  console.error('[shell] FAIL: provider embed exposes a fake audio meter');
  process.exit(1);
}
if (appSource.includes('provider-edge-mask') ||
    !appSource.includes('provider-load-progress') ||
    !appSource.includes('provider-native-play') ||
    !appSource.includes('is-provider-locked')) {
  console.error('[shell] FAIL: Bandcamp loading mask or truthful native transport contract is missing');
  process.exit(1);
}
if (!appSource.includes('function boardActions(') ||
    !appSource.includes('providerDockSlot') ||
    !appSource.includes('CONTROL IN EMBED') ||
    !appSource.includes('providerDockWave()') ||
    !appSource.includes('data-provider-focus')) {
  console.error('[shell] FAIL: original-style provider dock or compact board controls are missing');
  process.exit(1);
}
const boardActionsStart = appSource.indexOf('function boardActions(');
const boardActionsEnd = appSource.indexOf('function destinationActions(', boardActionsStart);
const boardActionsSource = appSource.slice(boardActionsStart, boardActionsEnd);
if (boardActionsSource.includes('buttons(t)')) {
  console.error('[shell] FAIL: Save/Heard actions leaked back onto the main board');
  process.exit(1);
}

const phase16Source = fs.readFileSync(path.join(dist, 'phase16.css'), 'utf8');
if (!phase16Source.includes('@keyframes provider-load-progress') ||
    !phase16Source.includes('.provider-frame-wrap.is-provider-ready iframe{opacity:1}') ||
    !phase16Source.includes('.provider-native-controls button+button{') ||
    !phase16Source.includes('border:0!important')) {
  console.error('[shell] FAIL: Bandcamp embed polish CSS is missing');
  process.exit(1);
}

const storageSource = fs.readFileSync(path.join(dist, 'storage.js'), 'utf8');
if (!storageSource.includes("COOKIE_PREFIX='drop_portal_'") ||
    !storageSource.includes("BACKUP_SUFFIX=':backup'") ||
    !storageSource.includes('localStorage.setItem') ||
    !storageSource.includes('writeCookie(key,raw)') ||
    !storageSource.includes('writtenAt')) {
  console.error('[shell] FAIL: mirrored durable interaction persistence is missing');
  process.exit(1);
}

console.log(`[shell] PASS: ${required.length} required assets and ${jsFiles.length} JavaScript modules checked`);
