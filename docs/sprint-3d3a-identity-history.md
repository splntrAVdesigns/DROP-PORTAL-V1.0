# 3D.3A — identity, evidence, history

Apply `db/migrations/009_identity_evidence_history.sql` once in Supabase **after 008, before deploying this patch**. Existing private ready drops are used to backfill recommendation history. Their results and weekly numbers stay unchanged.

## What changes

- MusicBrainz recording IDs and artist IDs establish source-backed identity. Credited artist names and release editions are stored separately. Edition dates cannot overwrite the original-recording date. A title match across outlets is only a lead: it cannot merge unrelated recordings or donate a listening link to a dated recording.
- Historical month/year dates remain explicit intervals. The current recent-release worker still requires day precision; this foundation does not enable the Archive/Future Tuner modes.
- Each run appends claim events with source URLs, precision, observation timestamps and verification state. The older observation table remains a latest-state cache. Conflicts across retries/runs remain flagged; the worker cannot update evidence events. New evidence has no embedding permission. Retention/removal workflows and approved semantic content are later work.
- Fresh eligibility requires resolved recording identity, a corresponding release-date claim, and a destination with a verified release-page claim for that same recording. None of the existing search-result or mix/upload-only adapters produces that destination verification. Until the later verifier integration qualifies candidates, fresh selections can be zero. The worker can use unseen verified archive tracks; an exhausted pool becomes `needs_research`.
- Each private weekly or additional drop is filtered against its owner's lifetime recommendation history. PostgreSQL checks again when committing a ready result, so stale concurrent selections cannot both publish a duplicate. A rejected publication rolls back its history writes and weekly number. The worker retries with a visible status message.
- Repeat keys include source track ID, resolved recording ID where supplied, and a conservative artist/title family guard. Remix, VIP, edit, remaster and reissue suffixes are excluded from that family guard. These versions remain distinct identities; the default recommendation policy suppresses related versions. Unresolved homonyms can be over-suppressed. Alias-based repeats are protected when a shared resolved recording ID exists; legacy anonymous catalog entries cannot provide a universal identity guarantee.
- History survives deletion of an individual drop. Explicit `DELETE MY TASTE` clears the owner's history along with their other private data. History is included in paginated account export. Account deletion cascades history. Shared source facts have no user ID or preference query.
- Published results are immutable. Partial provider coverage is preserved in run status and in the drop note, rather than being marked complete after one provider succeeds.

## Verification

Local tests cover migration backfill; date precision; credited names/editions; unresolved same-title candidates; conflicting dates across retries; evidence immutability; account isolation; history filtering; stale competing selections; transactional rollback; deletion and clear-all behavior. PGlite simulates two selections made before the first publication; it is not a multi-connection production load test. Existing application tests and build remain required.

After deployment, run one private worker invocation and inspect `dp_research_runs`, `dp_music_evidence` and `dp_recommendation_history`. A small archive may legitimately run out of unseen eligible tracks. Do not erase history or weaken evidence checks to fill the requested count. Continue with permissioned verification and retrieval in 3D.3B/C.

No new secrets are required for 3D.3A. No production migration, source credentials or deployment was exercised by this local patch.
