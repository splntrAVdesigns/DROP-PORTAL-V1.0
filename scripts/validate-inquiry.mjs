import {validInquiry} from '../lib/contracts.js';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'weekly-inquiry', 'current.json');

const fail = (message) => {
  console.error(`[inquiry] FAIL: ${message}`);
  process.exitCode = 1;
};

let inquiry;
try {
  inquiry = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  fail(`weekly-inquiry/current.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const numeric = ['future','deep','jungle','depth','experimental','floor','darkness','breaks'];
const validProfile = (profile, label) => {
  if (!profile || typeof profile !== 'object') {
    fail(`${label} must be an object`);
    return;
  }
  for (const key of numeric) {
    if (!Number.isFinite(profile[key]) || profile[key] < 0 || profile[key] > 100) {
      fail(`${label}.${key} must be between 0 and 100`);
    }
  }
  if (!Number.isInteger(profile.count) || profile.count < 10 || profile.count > 30) {
    fail(`${label}.count must be an integer between 10 and 30`);
  }
  if (typeof profile.mixes !== 'boolean') fail(`${label}.mixes must be boolean`);
};

if (inquiry.schemaVersion !== 1) fail('schemaVersion must equal 1');
if (!['base-only','queued'].includes(inquiry.status)) fail('status must be base-only or queued');
validProfile(inquiry.baseProfile, 'baseProfile');

if (inquiry.status === 'queued') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inquiry.targetDropDate || '')) {
    fail('queued inquiry requires targetDropDate in YYYY-MM-DD form');
  }
  validProfile(inquiry.weeklyOverride, 'weeklyOverride');
} else if (inquiry.weeklyOverride !== null) {
  fail('base-only inquiry must set weeklyOverride to null');
}

if (inquiry.updatedAt != null && Number.isNaN(Date.parse(inquiry.updatedAt))) {
  fail('updatedAt must be a valid timestamp or null');
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`[inquiry] PASS: ${inquiry.status} profile targeting ${inquiry.targetDropDate || 'base only'}`);

const canonical=JSON.parse(fs.readFileSync('weekly-inquiry/current.json','utf8'));
if(!validInquiry(canonical)){console.error('[inquiry] FAIL: shared profile contract');process.exit(1);}
