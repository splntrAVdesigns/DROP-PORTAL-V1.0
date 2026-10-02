# Phase 3C.3.3 — Personal drop reliability and security

Implemented: atomic weekly queue plus schedule advancement with revision checks and owner taste snapshot; bounded interruption and source retries; failed vs insufficient research states; owner-only manual retry; idempotent one-time saves; privacy-safe worker heartbeat; honest overdue status.

## Rollout order
1. Run db/migrations/005_personal_drop_reliability.sql once in the DROP:PORTAL Supabase SQL Editor, after migration 004. Apply before deploying this code.
2. Deploy this revision. Existing Vercel and GitHub worker secrets remain unchanged.
3. Run the Personal Drops workflow manually; verify a successful heartbeat on the dashboard and HTTP 200 in worker logs.
4. Optional additional dispatch: enable Supabase Cron and pg_net, then create a Vault secret named drop_portal_worker_secret with exactly the existing Vercel DROP_PORTAL_WORKER_SECRET value. Run 006_personal_worker_cron.sql once. This adds a five-minute trigger. Keep the GitHub trigger as a fallback; claims and weekly transactions tolerate overlapping workers. Never commit the secret. Check worker heartbeat and HTTP responses; a cron dispatch alone is not proof of completion.

## Recovery behavior
A late queued request remains eligible. If several weekly occurrences were missed, one oldest due request is preserved and the schedule advances to the next future occurrence, avoiding a backlog of repeated historical drops. Snapshot selection uses the original due date. Three automatic failures mark a job failed. RETRY DIG retains its original snapshot/date, allows at most three manual retries, and enforces a five-minute cooldown. Insufficient catalog coverage remains needs_research and cannot be resolved merely by retries.

## Verification
Local build and 66 tests pass, covering stale revisions, duplicate worker claims, missed runs, two-account RLS, retry ownership, one-time idempotency, health privacy, recurrence, and account-switch responses. No personal records write to GitHub public manifests.

Production weekly publication, production recurrence, a live second beta account, and deployed migration/cron configuration remain unverified. UI/listening enhancements follow in 3C.4; expanded validated candidate research follows in 3D. The existing engine remains verified-catalog selection.
