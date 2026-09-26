# Phase 3A — Research Source Registry & Candidate Intake

## Implemented

- `research/sources.json` is a reviewed source registry with bounded query definitions and two supported adapters: MusicBrainz recordings and SoundCloud tracks. It is never a browser-supplied URL crawler. Further stores and underground sources need their own permitted adapters or agreements.
- `scripts/research-intake.mjs` queries official provider endpoints and normalizes recent records. `SOUNDCLOUD_ACCESS_TOKEN` is optional: without it, the SoundCloud adapter reports `needs_credentials` and never invents records.
- `research/queue.json` holds discovered candidates and source evidence. Exact normalized artist/title matches merge across providers. The collector preserves reviewer decisions; it does not call an upload timestamp a release date or claim it listened to a track.
- The queue is written to `main` in a non-forced commit and read back at its resulting revision. The GitHub Action is opt-in (`DROP_PORTAL_RESEARCH_ENABLED=true`) and also supports manual dry runs. It does not stage or publish a drop.
- Authenticated publishers can inspect up to 30 candidates in the Tuner's Research Intake panel and shortlist or reject them. Full queue and source run reports are available at `GET /api/research-queue`; a reviewed status is saved through authenticated `POST /api/research-queue`. Shortlisting records editorial interest only, not full metadata/audio approval.

## Activation and boundaries

1. Run the workflow manually with `dry_run=true`. Check real provider results and the source reports before enabling daily intake. MusicBrainz is public but rate limited. Set `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET` as repository Actions secrets for SoundCloud; the runner exchanges them for one short-lived token per daily run. Do not place them in the browser or registry file. A pre-issued `SOUNDCLOUD_ACCESS_TOKEN` also works for a one-off run but expires and must not be relied on for daily operation.
2. Enable `DROP_PORTAL_RESEARCH_ENABLED=true` only after that verification. Daily intake checks source updates independently of the weekly publishing window.
3. The queue is a **research workbench**, not a completed Phase 2.9 candidate. Each record still needs exact release metadata, a legitimate store destination, a provider-owned preview if available, audio/style assessment, tuning/ranking, three Top 3 picks, and review before it may be composed and staged. The live publisher and its opt-in gate are unchanged.

The initial repository queue is a bounded single-publisher store. Before multiple accounts or a larger source corpus, move source/candidate/run state into account-scoped durable storage; leave GitHub as the immutable published feed. Explicit provider permissions and a source-specific adapter are required for additional outlets. Automated crawling of arbitrary websites is not implemented.
