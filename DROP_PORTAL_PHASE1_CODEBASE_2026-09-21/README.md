# DROP:PORTAL — Phase 1 + Phase 1.5 Weekly Feed Bridge

Portable static ES-module app. Serve `dist/` with any static server. No build dependency required.

Phase 1 implements the dashboard, local interactions/preferences/layout, singleton preview player, seeking, volume, real audio-derived waveforms, archive/saved routes, responsive sheets, and the locked ASCII rotational portal hero.

## Phase 1.5 — Automated Weekly Drop Feed Bridge

The dashboard now attempts to load the versioned publication manifest at `/weekly-feed/drops/index.json` through GitHub raw content. The newest valid published drop becomes THIS WEEK; older valid published drops become Archive. Invalid/unavailable network data fails safely back to the bundled Phase 1 demo collection.

Bridge files:
- `dist/feed.js` — fetch, validate, sort, and apply published drops.
- `weekly-feed/drop.schema.json` — publication contract.
- `weekly-feed/drops/index.json` — immutable-drop manifest.
- `weekly-feed/README.md` — publisher rules.

Publishing is intentionally separated from preview resolution. Weekly recommendation data may contain only authorized/licensed/owned preview metadata; unavailable previews remain explicit and store/listening links continue to work independently.

The repository is now ready for the Wednesday ChatGPT curation task to create one immutable weekly JSON payload and append its published manifest entry.

Local browser state remains namespaced under `drop-portal:`. No database or user authentication is introduced in Phase 1.5.
