# Phase 2.8.1 — Publisher Save Recovery and One-Click Drop Settings

## Production issue diagnosed (2026-09-25)

Production GET /api/inquiry and /api/schedule succeeded (HTTP 200). Runtime logs
recorded POST /api/inquiry = 503 and POST /api/schedule = 503 when the Tuner
attempted to save. The server `authorize()` deliberately returns the exact
error "Publisher saves are not configured." when either
`DROP_PORTAL_ADMIN_KEY` or `GITHUB_TOKEN` is absent from the currently deployed
production environment. The connected ChatGPT GitHub account and the automated
publisher's GitHub permissions do not grant Vercel serverless functions access
to a token.

Neither current.json was changed by the failed saves. Unsaved Tuner slider
values are not canonical until a server write succeeds.

## Required production setup (one-time)

In the Vercel `drop-portal-v1-0` project, go to
**Settings → Environment Variables** and create/check BOTH variables for
**Production**:

- `GITHUB_TOKEN`: a fine-grained GitHub PAT scoped exclusively to
  `splntrAVdesigns/DROP-PORTAL-V1.0`, with repository **Contents: Read and write**.
  Set an expiration and rotate it before it expires.
- `DROP_PORTAL_ADMIN_KEY`: a separate strong admin passphrase used to
  authenticate Tuner write requests. Do **not** reuse or paste the GitHub PAT
  as this key.

Save both as sensitive secrets where available. Redeploy the **production**
deployment: previous builds do not inherit newly added environment variables.
Never put either value in source files, screenshots, chat, or public browser
environment variables. Do not rename the variables: these are the names that
the server actually reads.

## UI and API improvements

- The read-only Tuner GET response now includes only
  `publisherConfigured: true|false` (never secrets).
- When production credentials are unavailable, the Tuner shows setup
  instructions immediately, before the user wastes time trying a Save. Saves
  remain disabled until the server has been configured and redeployed.
- The new **SAVE DROP SETTINGS** action at the bottom of the Tuner saves the
  selected active tab's profile AND the chosen date/time/mode in **one atomic
  non-forced Git commit**. It replaces the misleading schedule-only action.
- The existing profile-only Save button remains for changes that do not affect
  scheduling.
- The new `POST /api/drop-settings` uses the same admin authentication,
  server-side GitHub credential, date validation, daylight-saving handling,
  and optimistic `expectedRevision` lock as existing endpoints. It updates
  **`weekly-inquiry/current.json` and `weekly-schedule/current.json`**.
  It deliberately does not modify historical `weekly-feed/drops/index.json`:
  the publisher updates that feed manifest only after a drop is researched
  and validated.
- The **This Week** tab's SAVE DROP SETTINGS action records the selected
  one-week profile + schedule together; selecting Base saves the Base profile
  + schedule and retains any already queued weekly override. If both tabs
  have unsaved edits, save each tab explicitly rather than assuming a
  one-tab action saves both.
- Test drops remain separate from the normal production recurrence.

## Verification without changing the live schedule

1. Redeploy after both production secrets have been installed.
2. Open Tuner → verify the setup warning is gone.
3. Edit This Week preferences and a future **This Drop Only** date/time.
4. Click **SAVE DROP SETTINGS** once; supply the admin access code if asked.
5. Verify success toast and read-only GET `/api/inquiry`: the selected values
   must be in `weeklyOverride`, `targetDropDate` must equal the chosen local
   date, and `schedule.override`/`nextDropAt` must match the chosen time.
6. Confirm the cyan dashboard NEXT DROP flag updates.
7. Restore Wednesday 7 PM with a new write *only if desired*. Restoring
   an earlier schedule while a publisher is actively running risks collision;
   do not change the schedule during active publication.

Do not use a live production POST as a smoke test without permission, since
it necessarily changes the user's real schedule and inquiry.
