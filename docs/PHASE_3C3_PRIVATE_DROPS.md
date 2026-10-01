# Phase 3C.3 — Private dashboard and personal drops

## What is implemented

- With `DROP_PORTAL_PRIVATE_ENABLED=true`, the homepage displays an email-code sign-in gate. The dashboard, history, Saved crate and Tuner appear after authentication.
- Each account owns a weekly day/time in America/Chicago and may queue a **One Time Dig** without changing that cadence. Taste + weekly schedule save in one database transaction. The private drop rows are that user's manifest; no per-user records are written to the public GitHub feed index.
- A protected worker runs every 15 minutes through GitHub Actions (best effort). It queues due weekly occurrences, advances each account's next occurrence and curates eligible releases from verified production DROP:PORTAL catalog entries. One Time Dig jobs use the account's saved taste for their chosen date.
- Each result contains source provenance (`verified-published-catalog`), the personal profile snapshot, Top 3 and track metadata/previews. It is explicitly an archive-based personal selection. There is no claim of fresh research or audio analysis. Insufficient verified tracks produce `needs_research`, never synthetic tracks.
- Personal rows are readable only by their owner, protected by Supabase Auth and RLS. One account cannot alter another account's plan through the public API. Export and Delete My Taste cover private drops too.

## Activation order

1. In the dedicated Supabase project SQL Editor, run `db/migrations/003_personal_drops.sql` **once**, after migrations 001 and 002. Existing personal data remains. Verify tables `dp_personal_plans` and `dp_personal_drops` exist.
2. In Vercel Production environment, set `SUPABASE_SERVICE_ROLE_KEY` to this same project's **service_role secret**, and set `DROP_PORTAL_WORKER_SECRET` to a newly generated random secret of at least 32 characters. These are server-side secrets. Never add them to client files or GitHub source. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and beta email allowlist stay configured.
3. In GitHub Actions secrets, add `DROP_PORTAL_WORKER_SECRET` with the **same worker secret**. Do not put the Supabase service role key in GitHub; it stays on Vercel. The existing Vercel `GITHUB_TOKEN` must have Contents read access to the catalog repository.
4. Redeploy Vercel, then add Vercel Production `DROP_PORTAL_PRIVATE_ENABLED=true` and redeploy again. This is the cutover: visitors now see the sign-in gate instead of the shared board. When the flag or worker secrets are absent, the existing site continues to operate during setup.
5. Add GitHub repository variable `DROP_PORTAL_PERSONAL_WORKER_ENABLED=true`, then run the **DROP PORTAL Personal Drops** workflow manually once. A successful run returns a JSON summary. Scheduled runs continue every 15 minutes; Actions scheduling may run late.
6. Test Account A and Account B separately: save different plans and preferred artists/labels; queue a One Time Dig at the next future whole hour; after the worker runs, verify each sees only its own result and that the public `weekly-feed/drops/index.json` did not change. Test sign-out and sign-in again. Check Export and Delete My Taste in a disposable beta account.

## Boundaries and follow-up

- The worker currently uses the previously verified published catalog. It needs a larger validated source pool and deduplication across personal drops before every weekly request can reliably yield 10–15 unique tracks. The research queue is currently empty. The `needs_research` state exposes insufficient coverage.
- Worker results can be delayed by the 15-minute GitHub Actions cadence. This is not an exact-minute guarantee.
- Legacy shared publisher endpoints and feed data remain in the repository for compatibility. The private UI hides the shared publisher controls after cutover; removing those endpoints and old static feed assets should follow only after migration QA.
