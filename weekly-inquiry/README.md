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

The browser must never contain a GitHub write token or repository secret.

Phase 2.7 adds authenticated server-side publication-control endpoints for both Tuner inquiry writes and schedule writes. The browser sends only the user's requested settings plus a short-lived admin access key held in session storage; the GitHub credential remains server-side in Vercel environment variables.

Required production environment variables:

- `GITHUB_TOKEN` — fine-grained token restricted to this repository with Contents read/write permission.
- `DROP_PORTAL_ADMIN_KEY` — admin access code used to authorize Tuner publication-control writes.

The API fails closed when either credential is absent. Do not embed either value in client JavaScript or commit them to the repository.
