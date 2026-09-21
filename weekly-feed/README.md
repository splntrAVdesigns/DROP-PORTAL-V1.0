# DROP:PORTAL Weekly Feed

Phase 1.5 uses this directory as the versioned publication bridge between the Wednesday ChatGPT curation task and the dashboard.

## Publication contract

1. Create one immutable file in `weekly-feed/drops/YYYY-MM-DD.json`.
2. Validate it against `weekly-feed/drop.schema.json`.
3. Add a published entry to `weekly-feed/drops/index.json`.
4. Never overwrite an older weekly drop to publish a new week.
5. The dashboard loads the newest valid published entry and treats older entries as Archive.
6. If the manifest or a payload is unavailable/invalid, the app keeps its bundled Phase 1 seed data instead of failing.

Manifest entry:

```json
{
  "id": "002",
  "publishedAt": "2026-09-23T19:00:00-05:00",
  "status": "published",
  "url": "./2026-09-23.json"
}
```

Preview URLs must be provider-authorized, licensed, owned, or explicitly unavailable. Do not invent or scrape direct commercial audio URLs. Store/listening links remain independent from preview audio.
