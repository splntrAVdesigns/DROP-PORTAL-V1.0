import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'DROP_PORTAL_PHASE1_CODEBASE_2026-09-21', 'dist');
const source = path.join(root, 'weekly-feed');
const target = path.join(dist, 'weekly-feed');

const validation = spawnSync(process.execPath, [path.join(root, 'scripts', 'validate-feed.mjs')], { stdio: 'inherit' });
if (validation.status !== 0) process.exit(validation.status ?? 1);

if (!fs.existsSync(dist)) {
  console.error('[build] missing static application directory');
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log('[build] PASS: canonical weekly-feed copied into deployed dist output');
