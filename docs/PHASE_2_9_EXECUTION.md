# Phase 2.9 — Staging and Publication Reliability (opt-in)

## Scope implemented

The previous preflight could research music but fail to write a staged JSON through
the conversational connector. Phase 2.9 introduces an **independent server-side
GitHub write path** that uses the existing scoped `GITHUB_TOKEN` already saved
in the Vercel production environment. This avoids treating the conversational
GitHub connector as the only staging transport.

Changes on this branch:
- `lib/pipeline.js`: strict candidate and stage validation. Requires exactly
  the requested track count, exactly three Top 3 picks, nonrepeating IDs against
  the most recent eight archived drops, per-track official metadata source
  attestations, safe HTTPS destinations, and provider-owned embed URLs or null.
  Captures *exact* `nextDropAt`, `inquiry.updatedAt`, and effective tuner
  snapshot; stale research is rejected rather than silently reweighted.
- `lib/pipeline-runtime.js`: GitHub-native stage writes, pinned readback,
  read-only live preflight status, due-time checks, idempotence, and **one
  compare-and-swap commit** containing the immutable production payload,
  new feed index, schedule rollover, and inquiry rollover. No partial
  payload/manifest states are created by this route.
- `POST /api/engine-stage`: authenticated candidate intake; succeeds only
  after the server has validated the candidate and the GitHub stage readback.
- `POST /api/engine-publish`: authenticated **due-only** publication endpoint.
- `GET /api/pipeline-status`: public, secret-free readiness indicator.
  Dashboard visibly distinguishes **NEXT DROP ARMED** (scheduled) from
  **PREFLIGHT STAGED** (validated candidate exists).
- `scripts/phase29-runner.mjs` + optional GitHub Actions workflow: checks
  the live repo snapshot, requests an approved discovery candidate from
  `DROP_PORTAL_SOURCE_FEED_URL` if configured, probes official metadata
  URLs and stages the result ahead of time. Once due, publishes an already
  validated stage, verifies the four affected files and reports failure stage.
  No candidate = explicit failure, never synthetic recommendations.
- Unit and GitHub-mock integration tests check contract validation,
  stale Tuner protection, repeat protection, transaction atomicity, retry
  and duplicate-publication safety.

## What remains required for genuine autonomous music research

**Research source not yet configured.** The existing weekly ChatGPT research
automations and/or a future DROP:PORTAL neural research engine must supply a
structured candidate with independently verified metadata. There is **no
magic conversion** of your ChatGPT account into an API credential for Vercel.
The new `DROP_PORTAL_SOURCE_FEED_URL` adapter is an optional integration point
for a vetted research provider. The app won't fabricate 12 tracks to satisfy
a deadline when there are no validated inputs. Provider availability,
audio analysis, source licensing, and future neural engine implementation
remain separate work.

A candidate must include:
- `captured`: `nextDropAt` and `inquiryUpdatedAt` read from the currently
  armed schedule and inquiry files.
- `profileSnapshot`: exact effective Tuner profile for that occurrence,
  including `source` and `targetDropDate`.
- `tracks`: actual researched tracks with metadata, user-facing reason,
  score/confidence, links and optional official preview. Exactly
  `profileSnapshot.count` tracks; exactly three `startHere:true`.
- `mixes`: zero to two verified mixes only when enabled.
- `sources`: HTTPS source URLs.
- `evidence`: keyed by track ID, each having an **official** `sourceUrl`
  and attested `fields` including `artistName`, `title`, `releaseDate`.
  The feed runner also probes official source URL reachability. URL reachability
  does not certify audio content, music style or recommendation scoring;
  these need trustworthy research and/or licensed audio analysis.

## Safe deployment / activation

This commit adds code but **does not change live feed files, current schedule
or current inquiry** and DOES NOT enable the new GitHub publisher by default.

1. Deploy and check the test suite: `npm run build` should pass.
2. Inspect `GET /api/pipeline-status`: before preflight it should report
   `awaiting_research` (or `due_without_stage`); **not** `staged`.
3. Connect a **vetted** candidate research feed via GitHub Actions repository
   variable `DROP_PORTAL_SOURCE_FEED_URL` (server-controlled, HTTPS).
   Do not place GitHub/administrative secrets in feed URLs.
4. Use `workflow_dispatch` with dry_run=true to verify the feed snapshot,
   stage contract and GitHub permissions. Schedule-triggered Action will not
   publish until explicitly enabled.
5. Review duplicate scheduling with existing ChatGPT publisher. Only when
   the new path is validated, enable repository Actions variable
   `DROP_PORTAL_ENGINE_AUTO_ENABLED=true`. Disable/scope redundant ChatGPT
   publication triggers to avoid competing publishers.
6. For a manually supplied verified research candidate, an authorized operator
   can POST to `/api/engine-stage` via the existing 8-hour admin session.
   `/api/engine-publish` attempts publication only when due. Never POST
   arbitrary unreviewed track data to the live route.

GitHub Actions schedules are best-effort and can start late. An exact start
is **not** a guaranteed dashboard publication deadline. To provide true
READY-before-publication reliability, supply validated research in time
before the scheduled occurrence and monitor readiness/errors.

## Fallback / emergency behavior

The existing preflight and publication tasks remain unchanged during this
phase. This engine defaults to **disabled** to avoid introducing a competing
publisher for the current one-off drop. Stale candidate, missing research,
GitHub conflict or verification error leaves the existing schedule and
publication manifest unchanged. A readable, explicit operational status is
preferred over a misleading READY badge.
