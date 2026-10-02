# 3C.4.2 — player width, full waveform gradient and weekly catalog

Player maximum width is 646px, down 15% from 760px. Height and mobile viewport cap are unchanged. The SVG gradient now uses the full waveform coordinate system, with endpoint-color plateaus, rather than repeating inside each bar. Both endpoints still follow the Edit Layout hero palette without unloading the provider.

Successful account-specific weekly drops receive DROP001, DROP002, etc. The cyan identifier appears at the right of the results heading and in history. One Time Digs and unfinished jobs do not consume numbers. Numbers remain attached to the same drop through subsequent updates; completion allocation and the counter share one database transaction. Existing ready weekly drops are backfilled in scheduled order. Future numbers follow successful completion order, including late retries. Explicitly clearing all personal data resets that account's catalog; ordinary history truncation/deletion does not renumber surviving drops.

## Rollout

Run `db/migrations/007_weekly_drop_sequence.sql` in Supabase SQL Editor after 005, before deploying this patch. 006 is a separate optional Supabase Cron setup; numbering does not depend on it. If 006 is not configured, the GitHub scheduler remains responsible for worker invocation. A successful manual workflow run alone does not verify future automatic delivery.

007 adds a column, transactionally backfills existing successful weekly drops, installs the allocation trigger, and includes the counter in the existing privacy-clear function. Do not rerun this migration after success. No worker API change is required because the worker's ready-state update activates the database trigger and the read API already returns all drop columns.

`npm run build`: 71 tests passed plus feed/research/schedule and static-shell validation. Database behavior tested with PGlite, including two accounts, onetime exclusion, historical ordering, repeated ready updates, rollback and owner permissions. Real browser appearance and production migration/deployment are not verified in this workspace.
