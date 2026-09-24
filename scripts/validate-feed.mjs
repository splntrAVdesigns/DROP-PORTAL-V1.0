import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const feedRoot = path.join(root, 'weekly-feed');
const manifestPath = path.join(feedRoot, 'drops', 'index.json');

const fail = (message) => {
  console.error(`[feed] FAIL: ${message}`);
  process.exitCode = 1;
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${path.relative(root, file)} is not valid JSON: ${error.message}`);
    return null;
  }
};

const isHttps = (value) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

const validLink = (link) =>
  link &&
  typeof link.kind === 'string' &&
  isHttps(link.url);

const validPreview = (preview) => {
  if (preview == null) return true;
  if (!preview || typeof preview !== 'object' || typeof preview.provider !== 'string') return false;
  if (preview.kind === 'direct-audio') {
    return typeof preview.previewUrl === 'string' &&
      (preview.previewUrl.startsWith('/') || isHttps(preview.previewUrl)) &&
      typeof preview.usageBasis === 'string';
  }
  return preview.kind === 'provider-embed' && isHttps(preview.embedUrl);
};

const manifest = readJson(manifestPath);
if (!manifest) process.exit(1);

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.drops) || !manifest.drops.length) {
  fail('manifest must be schemaVersion 1 with at least one published drop');
}

const manifestIds = new Set();
const payloadIds = new Set();

for (const entry of manifest.drops ?? []) {
  if (!entry || typeof entry.id !== 'string' || typeof entry.url !== 'string' || entry.status !== 'published') {
    fail('every manifest entry must have id, url, and status=published');
    continue;
  }
  if (manifestIds.has(entry.id)) fail(`duplicate manifest id: ${entry.id}`);
  manifestIds.add(entry.id);

  const payloadPath = path.resolve(feedRoot, 'drops', entry.url.replace(/^\.\//, ''));
  if (!payloadPath.startsWith(path.join(feedRoot, 'drops') + path.sep)) {
    fail(`manifest entry escapes weekly-feed/drops: ${entry.url}`);
    continue;
  }
  if (!fs.existsSync(payloadPath)) {
    fail(`missing payload: ${entry.url}`);
    continue;
  }

  const payload = readJson(payloadPath);
  if (!payload || payload.schemaVersion !== 1 || !payload.drop || !Array.isArray(payload.tracks)) {
    fail(`invalid payload contract: ${entry.url}`);
    continue;
  }
  if (payloadIds.has(payload.drop.id)) fail(`duplicate payload drop id: ${payload.drop.id}`);
  payloadIds.add(payload.drop.id);

  if (entry.enrichmentUrl) {
    const enrichmentPath = path.resolve(feedRoot, 'drops', entry.enrichmentUrl.replace(/^\.\//, ''));
    if (!enrichmentPath.startsWith(path.join(feedRoot, 'drops') + path.sep) || !fs.existsSync(enrichmentPath)) {
      fail(`${entry.url}: missing or unsafe enrichment path`);
    } else {
      const enrichment = readJson(enrichmentPath);
      const ids = new Set(payload.tracks.map(track => track.id));
      const seen = new Set();
      if (enrichment?.schemaVersion !== 1 || enrichment.dropId !== entry.id || !Array.isArray(enrichment.tracks)) fail(`${entry.url}: enrichment identity mismatch`);
      for (const track of enrichment?.tracks ?? []) {
        if (!ids.has(track.id) || seen.has(track.id) || !validPreview(track.preview) || !track.preview || (track.links && (!Array.isArray(track.links) || !track.links.every(validLink)))) fail(`${entry.url}: invalid enrichment ${track.id}`);
        seen.add(track.id);
      }
    }
  }

  const trackIds = new Set();
  for (const track of payload.tracks) {
    if (!track || typeof track.id !== 'string') fail(`${entry.url}: track is missing id`);
    if (trackIds.has(track?.id)) fail(`${entry.url}: duplicate track id ${track.id}`);
    trackIds.add(track?.id);
    const required = ['artistName', 'title', 'release', 'label', 'releaseDate', 'subgenre', 'reason'];
    for (const field of required) {
      if (typeof track?.[field] !== 'string' || !track[field].trim()) {
        fail(`${entry.url}: track ${track?.id ?? 'unknown'} missing ${field}`);
      }
    }
    if (!Number.isFinite(track?.score) || !Number.isFinite(track?.confidence)) {
      fail(`${entry.url}: track ${track?.id ?? 'unknown'} has invalid score/confidence`);
    }
    if (!Array.isArray(track?.links) || !track.links.length || !track.links.every(validLink)) {
      fail(`${entry.url}: track ${track?.id ?? 'unknown'} needs at least one HTTPS destination`);
    }
    if (!validPreview(track?.preview)) {
      fail(`${entry.url}: track ${track?.id ?? 'unknown'} has an invalid preview contract`);
    }
  }

  for (const id of payload.drop.ids ?? []) {
    if (!trackIds.has(id)) fail(`${entry.url}: drop references missing track ${id}`);
  }

  for (const mix of payload.mixes ?? []) {
    if (!Array.isArray(mix.links) || !mix.links.length || !mix.links.every(validLink)) {
      fail(`${entry.url}: mix ${mix?.id ?? 'unknown'} needs an HTTPS listening destination`);
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`[feed] PASS: ${manifest.drops.length} published drop(s), ${payloadIds.size} payload(s)`);
