# DROP:PORTAL

DROP:PORTAL is a curated weekly Drum & Bass discovery dashboard.

## Phase 2 production shell

The approved Phase 1 application remains a portable static ES-module app under:

`DROP_PORTAL_PHASE1_CODEBASE_2026-09-21/dist/`

The repository root now owns the production build contract:

- `npm run validate` validates the canonical weekly feed.
- `npm run check` validates the feed and static application modules.
- `npm run build` validates everything and synchronizes `weekly-feed/` into the deployed `dist/weekly-feed/` snapshot.
- `vercel.json` defines the Vercel build and static output.
- `.github/workflows/phase2-validation.yml` runs the same checks on pushes and pull requests.

## Canonical data boundary

`weekly-feed/` and `weekly-inquiry/` are source-controlled publication contracts. The browser never receives a repository credential. The deployed snapshot is generated from `weekly-feed/` during build, while the runtime retains its safe live-feed fallback.

## Local verification

Requires Node.js 20 or newer.

```bash
npm run check
npm run build
```

No database, authentication, live recommendation API, or automated discovery service is introduced by Phase 2.
