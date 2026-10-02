# Phase 3C.3.1 — Personal scheduling and beta reliability

## Scope shipped

- Private setup and connection errors no longer open the legacy shared dashboard or publisher controls.
- Default taste, weekly-plan and One Time Dig actions have distinct labels and confirmations.
- A standalone This Week taste save requires the account's actual next weekly occurrence. A stale target produces a conflict instead of silently targeting today.
- Schedule field edits survive Tuner redraws. Account changes clear those drafts.
- Anthem/Groove and mix discovery are visibly unavailable in private mode. Unsupported audio sliders are omitted. Their stored preferences remain available for future research integration. Deep Dig currently prioritizes the Deep lane; it does not make an acoustic undergroundness claim.
- Routine polling and Save/Heard updates keep existing iframe/audio elements attached when the result content is unchanged.
- Personal request retries retain the initiating account; late responses cannot replace the currently signed-in account's drops.
- Interrupted running jobs recover after five minutes, with three attempts maximum. Claims and final writes check attempt number to prevent an older worker overwriting a reclaimed job.
- Worker errors produce a failed HTTP/workflow result with a summary. The workflow is scheduled by default unless explicitly paused with `DROP_PORTAL_PERSONAL_WORKER_ENABLED=false`. A missing Actions worker secret produces a clear failure.
- A new One Time Dig supersedes the account's older unfinished request in the database. Completed results remain in history, and superseded jobs cannot be picked up by the worker. The dashboard also hides older queued entries while the migration is being applied.
- Run `db/migrations/004_one_time_replacement.sql` once in the DROP:PORTAL Supabase project's SQL Editor after this code deploys. Existing `001` and `003` migrations remain in place. No replacement secrets are required.

## Live evidence at review

The supplied October 2 screenshot shows an October 1 9 PM CT request still queued alongside a newer October 2 8 AM CT request. The latest observed Personal Drops Actions run (36952901642, October 2 01:51 UTC) was skipped. This confirms queued requests alone do not prove worker execution. Applying migration 004 marks the older queued request as superseded.

## Validation

Automated checks cover two-account database isolation, account-specific weekly snapshots, recurring advancement, future job exclusion, concurrent worker claims, interruption recovery, source failure, private activation states, preview DOM preservation, and the unscheduled weekly-override guard. The repository build runs the entire suite.

Live completion of a private drop and a second tester's session still require authenticated production verification. A scheduled workflow can run late; it is not an exact-minute delivery guarantee. Confirm the Actions worker secret matches Vercel and manually run DROP PORTAL Personal Drops after deployment for immediate verification of due jobs.

## Next engine sprint

Connect validated research intake to personal requests, expand provider coverage, add per-account repeat avoidance and supported audio/mix metadata. Until then, personal drops select from the verified published catalog and can return needs_research when the requested count cannot be met.
