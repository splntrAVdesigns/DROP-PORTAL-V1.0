# Sprint 3D.3B — Graph and hybrid retrieval

Implemented locally; production migration state and live embedding credentials are not verified by this patch.

## Previous sprint audit

The 3D.3A code is connected to the private worker: identity/evidence writes, lifetime history filtering before selection, atomic duplicate prevention when publishing, and personal-data export/clear. Existing SQL tests cover account isolation, legacy history backfill, concurrent publication, and immutable published drops. Those tests remain part of the full build.

Migration **008 alone is insufficient**. 3D.3A requires **009_identity_evidence_history.sql**. Run `db/check_research_readiness.sql` in Supabase SQL Editor. If 009 is false, apply the existing 009 file once; then apply **010_graph_hybrid_retrieval.sql** once. Re-run readiness: all three fields must be true. Do this before deploying the new worker. An unavailable schema now causes an explicit 503 before queued jobs are claimed.

## Delivered

- MusicBrainz artist/credited-name, recording, edition and label graph, with source URLs on every edge. A bounded release-detail lookup resolves label IDs from the actual matching release response.
- Exact identity-backed seed resolution; ambiguous same-name artists are not guessed. Traversal is capped at 20 seeds, three hops, eight neighbors per node, and 40 returned nodes. Known relationships bootstrap from 3D.3A tables.
- Graph-derived artist/label queries retain their evidence paths. Preferred names rotate by scheduled date; relationship-enabled MusicBrainz search reserves one request for release details and one page per query. Source/global request budgets remain enforced.
- Private Postgres full-text documents and genuine 256-dimensional pgvector embeddings, combined with graph ranks using reciprocal rank fusion. Retrieval returns at most 40 candidate IDs, then hydrates stored evidence and rechecks eligibility.
- Only core MusicBrainz titles, credited artists and original dates are sent for document embedding. Reviews, tags, SoundCloud descriptions, Bandcamp text and Mixcloud content are excluded. This deliberately limits taste semantics until richer permitted descriptors are available.
- Content hashes invalidate stale vectors. Hash-checked writes cannot attach an old response to changed text. Each worker research run refreshes at most 80 documents and embeds up to 12 documents plus one query in one request.
- Retrieval runs record vector state, requests, token usage when reported, refreshed/indexed counts, channel hit counts, graph nodes and retrieval latency. Missing credentials, disabled semantics, rate limits and provider failures remain visible as partial coverage; lexical and graph retrieval continue.
- Invalid calendar dates are rejected by the final selector as well as the retrieval layer.

## Configure semantic retrieval

In Vercel, add server-side environment variables:

```
DROP_PORTAL_SEMANTIC_ENABLED=true
OPENAI_API_KEY=<your project API key>
```

Redeploy after changing variables. Never put the key in client JavaScript or a public-prefixed variable. The adapter uses `text-embedding-3-small`, 256 dimensions, a fixed HTTPS endpoint, a six-second request timeout, and no redirects. Query text includes selected music preferences, but no account ID, email, history, or other account data. Document embeddings are shared public music metadata; query vectors are transient. Access to graph/index tables and RPCs is service-role only.

Without both settings, lexical/graph retrieval works and semantic coverage is explicitly disabled or credentials-missing. Tests use fixture vectors through actual PostgreSQL vector operations; they do not certify the live API key or measure music relevance. `semanticState=ready` means a valid embedding response, not a taste-quality certification; semantic hit count separately reports usable indexed matches.

## Preserved boundaries

Retrieval is candidate discovery, not publication approval. Graph neighbors, cosine similarity and lexical matches cannot establish dates, audio traits, classic status, or playable links. Only verified destinations and day-precision release evidence pass the existing publication gate, followed by lifetime account history filtering and the atomic publication guard. Mix/show leads remain unselectable without release verification.

The current adapters do not yet perform release-page verification, so new source hits may all remain research leads and an eligible archive fallback may still be used. That is intentional pending 3D.3C. The existing selector still controls final preference scoring; diversity reranking and source-linked user-facing match reasons belong to that next sprint. Hybrid ranks and graph paths are retained as provenance for that work.

The index supports historical date intervals without narrowing uncertain dates, but this patch does not activate the Archive Dive or Future tuner modes. Dense similarity over names/titles alone is not a validated genre/taste model. No underground relevance or coverage improvement is claimed until 3D.4 baseline and blinded evaluation.

Index warming is incremental inside due research jobs; there is no newly scheduled paid indexing job. The bounded initial index refresh covers 200 candidates. The current SQL does exact ranking over date-eligible documents; the installed vector index does not imply measured large-catalog latency. Production volume, latency and cost still need measurement before wider rollout.

## Validation and deployment

`npm ci --include=dev` then `npm run build`. The build includes all 21 test files, including the existing 3D.3A tests and new real PostgreSQL/pgvector tests for schema readiness, label lookup, aliases, ambiguous identities, graph paths, lexical and semantic retrieval, date bounds, malformed vectors, stale hashes, invalidation, rate limits, missing credentials, and restricted access.

After migrations and deployment, run the existing **DROP PORTAL Personal Drops** workflow. A run with no due job checks schema readiness but does not exercise an embedding request. For end-to-end verification use a due one-time drop, inspect `dp_research_runs.retrieval` and the drop's coverage note, and check retained history. Do not mark a provider ready based on a fixture or merely configured credentials.

Official implementation references:
- https://supabase.com/docs/guides/ai/hybrid-search
- https://musicbrainz.org/doc/MusicBrainz_Database/License
- https://platform.openai.com/docs/guides/embeddings
