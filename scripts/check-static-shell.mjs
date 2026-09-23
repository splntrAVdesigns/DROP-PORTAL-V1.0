import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'DROP_PORTAL_PHASE1_CODEBASE_2026-09-21', 'dist');
const required = ['index.html', 'app.js', 'data.js', 'feed.js', 'player.js', 'storage.js', 'schedule.js', 'inquiry.js', 'styles.css'];
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

const apiFile = path.join(root, 'api', 'schedule.js');
const inquiryApiFile = path.join(root, 'api', 'inquiry.js');
const apiSyntax = spawnSync(process.execPath, ['--check', apiFile], { encoding: 'utf8' });
if (apiSyntax.status !== 0) {
  console.error('[shell] FAIL: syntax error in api/schedule.js');
  process.stderr.write(apiSyntax.stderr || '');
  process.exit(apiSyntax.status ?? 1);
}

const inquiryApiSyntax = spawnSync(process.execPath, ['--check', inquiryApiFile], { encoding: 'utf8' });
if (inquiryApiSyntax.status !== 0) {
  console.error('[shell] FAIL: syntax error in api/inquiry.js');
  process.stderr.write(inquiryApiSyntax.stderr || '');
  process.exit(inquiryApiSyntax.status ?? 1);
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

const inquiryClientSource = fs.readFileSync(path.join(dist, 'inquiry.js'), 'utf8');
if (!appSource.includes("from'./inquiry.js'") || !inquiryClientSource.includes("const API='/api/inquiry'")) {
  console.error('[shell] FAIL: secure Tuner publication-control client is missing');
  process.exit(1);
}

const scheduleSource = fs.readFileSync(path.join(dist, 'schedule.js'), 'utf8');
if (!appSource.includes("from'./schedule.js'") ||
    !appSource.includes('NEXT DROP') ||
    !appSource.includes('save-schedule') ||
    !appSource.includes('This drop only') ||
    !scheduleSource.includes("const API='/api/schedule'")) {
  console.error('[shell] FAIL: Phase 2.7 dynamic scheduling UI or client contract is missing');
  process.exit(1);
}

const scheduleApiSource = fs.readFileSync(apiFile, 'utf8');
if (!scheduleApiSource.includes("process.env.GITHUB_TOKEN") ||
    !scheduleApiSource.includes("process.env.DROP_PORTAL_ADMIN_KEY") ||
    scheduleApiSource.includes('ghp_') ||
    scheduleApiSource.includes('github_pat_')) {
  console.error('[shell] FAIL: secure schedule API credential boundary is missing or unsafe');
  process.exit(1);
}

if (!appSource.includes('scheduleSaving=false') ||
    appSource.includes("window.addEventListener('pagehide',()=>write('interactions',interactions))")) {
  console.error('[shell] FAIL: Tuner runtime state or interaction persistence regression detected');
  process.exit(1);
}

if (!appSource.includes('provider-embed-shield')) {
  console.error('[shell] FAIL: Bandcamp white-block shield is missing');
  process.exit(1);
}

if (!phase16Source.includes('@keyframes provider-signal-sweep') ||
    !phase16Source.includes('grid-template-columns:190px 180px minmax(420px,1fr) 46px')) {
  console.error('[shell] FAIL: provider shield or desktop waveform sizing regression detected');
  process.exit(1);
}

const storageSource = fs.readFileSync(path.join(dist, 'storage.js'), 'utf8');
if (!storageSource.includes("COOKIE_PREFIX='drop_portal_'") ||
    !storageSource.includes("BACKUP_SUFFIX=':backup'") ||
    !storageSource.includes('localStorage.setItem') ||
    !storageSource.includes('writeCookie(key,raw)') ||
    !storageSource.includes('Browser-local primary state is authoritative')) {
  console.error('[shell] FAIL: durable interaction persistence closeout is missing');
  process.exit(1);
}

console.log(`[shell] PASS: ${required.length} required assets and ${jsFiles.length} JavaScript modules checked`);
