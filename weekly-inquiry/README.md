# DROP:PORTAL Tuner → Weekly Inquiry Bridge

The Wednesday publisher MUST read `current.json` before discovery.

Effective discovery profile:

`BASE PROFILE + valid THIS WEEK override = EFFECTIVE PROFILE`

A weekly override applies only when `status` is `queued` and `targetDropDate` matches the upcoming publication date. Otherwise the base profile governs discovery.

## Post-publication rollover

After a canonical Wednesday production drop is successfully validated, written to `weekly-feed/drops/`, added to the manifest, and re-read successfully, the publisher rolls `weekly-inquiry/current.json` forward to the next Wednesday.

Rollover rules:

- Preserve `baseProfile`.
- Set `targetDropDate` to the next Wednesday.
- Set `status` to `base-only`.
- Set `weeklyOverride` to `null` so a stale one-week override is never carried forward silently.
- Refresh `updatedAt`.
- Re-read and verify the updated inquiry.
- Never roll the inquiry after a failed publication.
- Never overwrite an inquiry already intentionally queued for a later publication date.
- Test drops do not perform the production rollover.

This keeps the weekly publisher armed for the next cycle while requiring any new one-week tuning choice to be explicit.

## Security boundary

The Phase 1 dashboard is a static browser application. It must never contain a GitHub write token or other repository secret. Therefore browser-local Tuner changes cannot securely write this file directly yet.

The contract and scheduler-read side are active in Phase 1.5.1. Automatic dashboard-to-repository publication requires an authenticated server write endpoint (planned production/API layer). Until that endpoint exists, local Tuner state remains local and `current.json` is the scheduler's durable profile.

Do not weaken this boundary by embedding a GitHub token in client JavaScript.
