# Phase 2.8 repair — 24 September 2026

## Incident

The 23 September production occurrence was scheduled for 19:00 America/Chicago and its payload and manifest record publication at 19:17:46. All 12 published tracks had `preview: null`; links pointed to Bandcamp albums, but the client cannot infer an exact playable track embed from an album link. The publisher was an hourly condition watch that began research after the scheduled time. The current production drop did arrive, the prior drop moved to Archive, and the next schedule is armed for Wednesday 30 September at 19:00 Central.

## Repair

- The immutable 23 September payload remains unchanged. Its manifest entry points to a separate verified enrichment document with 12 official Bandcamp track embeds. The client validates the drop ID and track IDs before applying the enrichment and refuses to replace a previously published preview. Bandcamp album track metadata confirmed these exact streamable tracks and embed IDs on 24 September.
- The provider player now loads any verified provider embed, including SoundCloud. Mixcloud listening URLs generate the official widget for mixes. Bandcamp is the first choice during future curation; when absent, seek an authorized matching SoundCloud or other provider embed and validate the exact recording. Do not fabricate a player or silently display a different artist's recording.
- Apple Music has a direct destination when a verified Apple URL is supplied. Otherwise the visible `FIND ON APPLE MUSIC` button opens a search for artist and track, since an Apple listing for these 12 recordings was not confirmed. A search result is not a verified track link.
- The five hero gradient buttons now sit with Tuner and Edit Layout outside the hero canvas. Top 3 uses a CSS-styled text arrow and a compact single-line heading on mobile.
- The existing hourly automation remains the fallback for schedule overrides and missed/stale staging. A Wednesday 18:00 Central preflight stages a verified candidate; a Wednesday 19:00 exact automation promotes a still-current candidate without starting music research at publication time. Each checks the live schedule, inquiry revision, and existing production payload before writing. The scheduler platform and GitHub/Vercel propagation may still add minutes; these exact-time tasks improve latency but do not constitute a zero-latency guarantee. Report actual publication time against the target.

## Next production acceptance

At preflight confirm staged candidate includes the requested track count, profile snapshot, exact scheduled occurrence, inquiry revision, three Top 3 picks, verified destinations, and a preview count. At publication check both manifest and immutable payload, previous drop in Archive, schedule rollover, and current dashboard display. Record the time each stage completed. When no matching authorized preview exists, keep an honest unavailable state and source link; do not substitute an unrelated recording.
