# Phase 3C.1 / 3C.2 — Personal Taste & Focused Discovery

## Implementation and activation status
Code implements private email-code accounts, private profile/history storage, a compact personal Tuner, and structured personal search requests. Existing shared publisher controls remain independent. Deployment without Supabase configuration is supported: the account section clearly says setup is pending, and the public drop and device crate remain available. Do not call this a live multiuser launch until the activation checklist passes.

Personal selection and learning are Phase 3C.3. Saved focus choices produce a structured request but do not change the shared published drop. Archive and Future UI buttons are disabled until source coverage is validated. Anthem/Groove are declared intent, not claims that tracks have been audio-analyzed. The initial artist/label names are explicitly unresolved; suggestions use published catalog metadata. No automatic entity match is asserted.

## One-time activation — project owner
1. Create a dedicated Supabase project or select an existing appropriate project. No hosted database or auth account was provisioned by this code change.
2. Execute `db/migrations/001_personal_discovery.sql` once in its SQL Editor. It creates private profiles, current feedback, optional learning events, row-level policies, and revision-checked functions. This migration is transactional and deliberately fails rather than silently altering conflicting existing tables.
3. Enable Cron under Supabase Integrations, then execute `db/migrations/002_learning_retention.sql` to purge learning events older than 180 days daily. Current crate state persists until its owner deletes it; learning opt-out immediately deletes learning events.
4. In Supabase Auth email templates, configure the Magic Link template to display `{{ .Token }}` (the app uses email codes, not redirect links). Configure sender/SMTP and rate limits suitable for the beta; the default sender may restrict recipients. Add the production site URL. Use the provider's controls for email abuse prevention before expanding the beta.
5. Add these **server-side Vercel Production environment variables**, then redeploy:
   - `SUPABASE_URL`: this project's HTTPS `https://<project-ref>.supabase.co` URL.
   - `SUPABASE_ANON_KEY`: its publishable/anon key. Never use a service-role key.
   - `DROP_PORTAL_BETA_EMAILS`: comma-separated approved email addresses for Brandon and the second tester. Do not put this list in GitHub.
6. Sign in from the Tuner with an allowed email and its verification code. Save a base taste. The app holds access/refresh credentials in Secure, HttpOnly, SameSite=Strict cookies, never localStorage. Session renewal and writes are same-origin operations.
7. On the original browser, use History & privacy > Import this device's saved/heard history. This is explicit to avoid importing one person's guest history into somebody else's account. Imports are resumable and preserve existing account choices, including false values. No local history is deleted.
8. Validate a second device and a second account using the matrix below. Personal accounts cannot unlock the shared publisher.

## User behavior
- Preferred artists and labels are removable chips; up to 20 of each. Case/spacing variants are deduplicated. Each remains an unresolved name until an entity resolver verifies it.
- Base taste persists. This Week stores a full override scoped to the displayed next shared-drop date. It expires by date matching; saving Base does not clear an override. Use Base Taste This Week clears it explicitly.
- Recent Releases uses 1mo / 3mo / 6mo / 1yr. Label Specific requires selected labels. Anthem, Groove and Deep Dig combine; existing detailed controls live under Fine tune.
- Save is positive; Unsave withdraws that signal; Heard and Hidden are neutral. No unsaved-track dislike or inferred listening event is collected. The native/provider playback event bridge is not part of this phase.
- Account saves are confirmed by the server before the board updates. Offline errors do not silently downgrade to guest storage. Cross-device changes are loaded on account load or window focus; stale writes ask for reload.
- Guest flags continue to use existing browser storage. Account flags and preferences stay in memory and the private database, not guest localStorage/cookies/backups. Signing out restores that device's guest crate.
- Learning-history collection is off by default. Opt-in records feedback events for the future model. Opt-out removes them and leaves the crate intact. Export retrieves paginated data. Delete My Taste removes preference/history/event records; the sign-in identity remains and can be deleted by the project owner in Supabase Auth.

## Security and data boundaries
The backend verifies the Supabase user for every private request and queries with that user's token. It never trusts a submitted user ID to select the owner. An account header detects a cookie/account change in another tab. Database RLS also enforces ownership independently of the HTTP API. The publisher admin cookie grants no personal-data access. No private data or personal source queries are sent to the public GitHub research queue. Tokens and raw provider errors must not be logged.

## Validation matrix
- Account A on two devices: create artist/label preferences, save different Base/This Week settings, save/unsave and mark Heard; reload the other device and verify each state.
- Account B: cannot see A's data or overwrite it. Direct database requests using B's JWT must also be denied by RLS for A's rows.
- Save stale revisions on the second device: 409; no silent overwrite.
- Import guest history twice: existing remote true/false choices stay intact; no duplicate learning events.
- Opt out of learning: prior learning events deleted; Saved/Heard remain.
- Export and delete taste: all account-owned taste records are included/removed; the other account is unaffected.
- Expired session, invalid OTP, account switch, source unavailable and backend unconfigured: explicit errors; no token leakage or public data fallback.

Automated tests use an embedded PostgreSQL engine to execute the actual migration and test RLS with two database roles/users. They also test profile semantics, session cookie boundaries, account mismatch rejection and publisher/personal separation. Hosted Supabase, email delivery and real cross-device sign-in require the activation steps above and are not claimed as verified by local tests.
