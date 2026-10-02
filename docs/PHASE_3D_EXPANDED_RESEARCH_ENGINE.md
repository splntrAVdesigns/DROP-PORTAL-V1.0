# Sprint 3D — expanded research engine: research and implementation brief

Prepared 2026-10-02. This is a researched implementation plan, not a claim that new sources are connected or that the whole internet can be searched exhaustively.

## Current gap

The existing source registry contains MusicBrainz and SoundCloud only. Intake is budgeted and uses a bounded 400-item file queue. Private drops currently select from archived catalog payloads; adding outlets to a document does not expand what the private worker can actually select. 3D must connect fresh retrieval and durable evidence to private requests while preserving public/private data separation.

## Source strategy and verified access findings

| Source | Intended role | Findings and integration decision |
|---|---|---|
| SoundCloud | Artist/label uploads and public catalog search | Official guide documents public-resource client credentials, search and pagination. Registered app required; reuse/refresh server tokens. Upload date is not a verified commercial release date. Existing adapter needs source coverage tests and account-led queries. |
| MusicBrainz | Identity, releases, aliases and relationships | Official API supports search, lookup and browse. Use as a cross-reference and graph source, with existing throttling. It is not a complete inventory of current underground digital releases. |
| Bandcamp artist/label pages | Independent catalogs, credits, release dates and purchase links | Official API documentation covers account, sales and merchandise access for labels/partners, not unrestricted global discovery. Use a documented search provider and permitted public-page retrieval; evaluate terms/robots before automated adapter activation. Do not adopt reverse-engineered private endpoints or reuse site credentials. |
| Mixcloud | Trusted DJs, shows and tracklist leads | Official API documents public reads, show/user/tag search and pagination. Treat tracklists as leads requiring exact release verification; a show's upload date never establishes a track release date. Not every show supplies an accessible complete tracklist. |
| UKF | Editorial leads, label/artist spotlights and releases | Official site exposes releases, playlists, podcasts and artist/label discovery. Editorial context can find related artists; cite it separately from authoritative release facts. No API access assumed. |
| Beatport | Major store, exact versions, labels and buy links | Official v4 docs URL exists but returned no readable specification in this research environment. API permissions, rate limits and commercial use remain unverified. Start with permitted indexed pages; require a verified access contract before API activation. Avoid popularity/chart-led intake as the default. |
| Discogs | Historical labels, catalog numbers, formats and versions | Official developers page could not be retrieved here. Verify current API terms, authentication, attribution, rate limits and caching before implementing. Candidate metadata source, not proof of digital purchase or preview availability. |
| Juno Download | Possible store coverage | Direct site retrieval failed; search surfaced closure reports that were not confirmed by an authoritative source here. Keep disabled pending current availability verification. An old affiliate page is insufficient evidence of a working catalog feed. |

Primary references inspected: [SoundCloud guide](https://developers.soundcloud.com/docs/api/guide), [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [Bandcamp API](https://bandcamp.com/developer), [Mixcloud API](https://www.mixcloud.com/developers/), [UKF](https://ukf.com/), [Beatport docs](https://api.beatport.com/v4/docs/). Failed retrievals: Discogs developers, Juno Download, MusicBrainz rate-limiting page. Recheck documentation at adapter implementation time.

## Underground discovery, not a static famous-label list

Initial verified public seeds include [Dispatch](https://dispatchrecordings.bandcamp.com/), [Metalheadz](https://metalheadz.bandcamp.com/), [Critical](https://criticalmusic.bandcamp.com/), [Omni](https://omnimusic.bandcamp.com/) and [Samurai](https://samuraimusic.bandcamp.com/). These are discovery entry points, not a complete scene map or guaranteed adapters. Omni's landing page redirected to a release with a tracklist, release date, genre tags and a long discography; Samurai landed on merchandise. This demonstrates why URL type and redirected content must be validated rather than assuming every label root is a catalog.

For each private request, compile separate query families from the saved taste snapshot:

1. Exact preferred artists/labels, aliases, current releases and back catalog within the selected window.
2. Related collaborators, remixer credits, label roster connections and compilation contributors, with cited relationship edges.
3. Genre synonyms, regional terms and combinations such as atmospheric jungle, deep drum and bass, halftime, breakbeat and experimental D&B. Synonyms expand retrieval; they do not override the user's lane settings.
4. Editorial spotlights and trusted DJ/show tracklists, followed by exact artist/title/version searches on release pages.
5. Exploration queries for smaller labels and unfamiliar producers. Reserve a bounded part of each run for these so preferred names do not monopolize the candidate pool.

Allocate proposed retrieval budget 40% direct taste seeds, 30% relationship expansion, 20% exploratory catalogs, 10% editorial/show leads. These are initial tunable values, not validated optimal weights. Rotate seeds and paginate catalogs by date/cursor; continue across runs through persisted checkpoints. Never interpret the first search page as complete coverage. Surface a partial-coverage status when rate limits, errors or budgets end a run.

## Durable evidence and catalog design

Introduce catalog entities, source observations, relationships, source cursors and research runs in the database. Every observation records source URL, retrieval time, provider identity, exact version, release-date value and precision, date type (release/upload/reissue), label/cat number, identifiers and evidence confidence. Keep minimal factual excerpts or structured fields according to provider terms, rather than storing whole copyrighted articles. Distinguish the shared factual catalog from private request snapshots, feedback and ranking explanations under account RLS.

Resolve entities conservatively: ISRC/MBID/provider IDs when available, otherwise normalized artist + title + mix/version + label evidence. A remix, original, dub and reissue remain distinct. Do not merge by title alone. Conflicting release dates require reconciliation; year-only metadata cannot qualify a track for a one-month window. An uploaded old track does not become a new release. A removed purchase link must not remain a verified destination indefinitely.

The server fetch layer needs adapter-specific allowed hosts, redirect validation, public-address checks, timeouts, response size limits, content-type checks, per-provider concurrency/rate limits, retry-after handling, token reuse and cost budgets. Credentials stay server-side. Public search receives only the query terms required for retrieval, never emails, account IDs or complete private profiles. Retrieved page instructions are untrusted content. Adapter failure must not take down a whole drop.

## Taste-led selection and DJ utility

Rank only candidates that pass factual eligibility. Separate taste fit, evidence confidence, novelty and preview availability; do not let a missing embed bury a valuable independent release. Use genre lanes, exact artist/label affinities, chosen date window, discovery depth and experimental bias, then diversify the final set. Start with a maximum of two picks per artist and three per label for a ten-track drop; relax only with an explicit sparse-pool reason. Suppress already-heard picks and recent repeat recommendations, while retaining user-saved tracks in the library.

Popularity is not a primary relevance feature. Provide a balance of familiar anchors and related discoveries, with exploration strength controlled by depth. Each pick explains concrete evidence: preferred label, verified collaborator, matching source tags, or cited editorial lead. Keep source-confirmed BPM/key/version facts separate from inferred audio traits. Do not claim darkness, floor impact, groove or break density from a title, artwork or general genre tag. Licensed audio analysis can be a later phase with confidence and evaluation.

An LLM may plan queries and summarize verified evidence into a DJ-friendly reason. It must not invent tracks, URLs, dates, label associations, previews or relationships. Deterministic eligibility and deduplication surround the model. Persist ranking version and the saved taste snapshot so a completed drop is explainable after tastes change.

## Implementation order and acceptance gates

**3D.1: durable retrieval foundation.** Candidate/observation/run/cursor schema and private job linkage; source capability registry with disabled/ready/access-blocked states; search-provider adapter contract; bounded query planner and run telemetry. Replace catalog-only private-worker selection with fresh researched candidates plus clearly identified eligible fallback. No source gets a ready badge until live retrieval succeeds.

**3D.2: catalog adapters.** Expand existing MusicBrainz/SoundCloud retrieval; integrate one permitted independent-label/Bandcamp retrieval route and Mixcloud leads. Verify credentials, terms and live responses before Beatport/Discogs integration. Add outlet-specific fixtures for pagination, date precision, redirects, removals and malformed data.

**3D.3: relationships and selection.** Evidence-backed artist/label graph expansion, deterministic version resolution, repeat suppression, diversity reranking and source-linked match reasons. Mix/show leads become selectable only after release-page verification.

**3D.4: evaluation and rollout.** Fixed benchmark with at least 20 taste profiles spanning familiar labels, sparse preferences, atmospheric jungle, deep/minimal, experimental and mixed lanes. Include artist aliases, same-title tracks, remixes/reissues, upload-vs-release traps, deleted pages, rate-limited providers and empty pools. Evaluate blinded human taste fit alongside verified-date rate, unique artists/labels, independently sourced picks, repeats, preview coverage, latency and cost. Suggested release gates: every displayed pick has source evidence; no unverified dates silently pass the window; no fabricated links; account isolation tests pass; failures/partial coverage are visible; underground coverage improves relative to the current archive baseline. Numeric relevance/coverage thresholds require measured baseline data, not arbitrary promises.

This work does not activate new external adapters. Broad discovery coverage remains an explicit rollout objective with measurable source coverage rather than an exhaustive-search claim.
