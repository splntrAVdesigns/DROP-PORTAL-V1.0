# Sprint 3D.1–3D.2: private research foundation

## Rollout

1. Run `db/migrations/007_weekly_drop_sequence.sql` if it has not already been applied, then run `db/migrations/008_research_foundation.sql` in Supabase SQL Editor. Migration 006 is independent of these steps.
2. Deploy the code on `main`. The private worker attempts one researched drop per invocation, within ten source requests and a 35-second network budget. Subsequent queued drops are handled by later worker invocations.
3. If available, configure `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET` (or a managed `SOUNDCLOUD_ACCESS_TOKEN`) and `BRAVE_SEARCH_API_KEY` in the worker's server environment. Never put these values in the frontend or registry JSON.
4. Run the private worker and inspect `dp_research_runs`, `dp_research_source_health` and a private drop's `result.selectionSources`. A source starts `access-blocked` and changes to `ready` only after a successful live response from its configured route. Beatport and Discogs stay `disabled`.

## Selection and evidence

- The bounded query planner takes preferred artists, labels and taste lanes from each saved profile. A run is linked to one owner and one drop; query cursors remain private to the service role. Observations preserve the source URL, claim type, precision and observation time.
- MusicBrainz day-precision `first-release-date` is a release claim but a metadata URL alone is not a listening link. SoundCloud `created_at` is an upload claim. A matching listing with a store or listening URL can become eligible when supported by a day-precision release claim. Conflicting dates are withheld. Exact artist/title matching is conservative but still requires editorial evaluation for homonyms.
- Mixcloud show and tracklist mentions are discovery leads. They do not assert a recording's release date.
- The Bandcamp route searches the licensed Brave Search API for indexed artist/label release URLs. It stores the indexed result as a lead and store link. The worker does **not** fetch or scrape Bandcamp pages. A matching independently dated release is required before selection. Bandcamp's official API is limited to granted partner/label access; its acceptable use policy prohibits scraping site content.
- The result identifies `freshResearch` and `verifiedArchiveFallback` counts. Published catalog tracks remain an eligible fallback within the user's date window. If fewer than the requested number survive both sources, the job stays `needs_research` with a count instead of inventing results.

## Coverage limits

This patch was validated with deterministic adapter fixtures and a local SQL migration, not with production source credentials or a live private worker. In particular, a successful Brave index response cannot prove that every indexed Bandcamp link still resolves; removals and redirects are treated as unverified leads. The producer must check source health and run telemetry after deployment before advertising live source coverage. Beatport and Discogs require separate credential, terms and live-response verification before integration.

Official source references: [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [SoundCloud API](https://developers.soundcloud.com/docs/api/guide), [Mixcloud API](https://www.mixcloud.com/developers/), [Bandcamp developer API](https://bandcamp.com/developer), [Bandcamp acceptable use](https://get.bandcamp.help/en/articles/15263124-bandcamp-s-acceptable-use-and-moderation-policy), [Brave Search API](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started).
