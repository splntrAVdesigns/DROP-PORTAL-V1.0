# Phase 3C.4.1 — Compact floating listening panel

- Bandcamp embeds use a 42px strip, capped at 640px to remove the excess white region observed in the supplied screenshots. Mixcloud uses a 60px strip; SoundCloud retains 80px for its widget controls. Cross-origin provider styling cannot be edited by the host app; production widget appearance still needs verification.
- Waveform bars have individual motion and use the same two-color palette as the ASCII hero. Edit Layout reveals the palette picker. Palette edits do not replace media.
- Provider waveform movement is decorative, as in the original public dock. Same-origin native audio uses Web Audio analysis when available; third-party widgets do not expose audio samples. Reduced motion and background-tab lifecycle are respected.
- Provider control guidance moves beside the header controls. Desktop mouse users can drag the header or use its arrow keys; movement clamps to the browser viewport and saves separately for each account. The position-reset button returns to the bottom dock. Mobile keeps a fixed bottom player.
- Plans overdue by 20 minutes show awaiting worker, even if no job has been queued yet. Missing heartbeat text says no successful check recorded.

## Weekly diagnosis, October 2
GitHub main advanced to 00636290765eac58ae7314c0bcf383a974ad89ea and validation succeeded at 17:05 UTC (12:05 CT). The latest visible Personal Drops run is the successful 14:07 UTC (9:07 CT) run. Queried production Vercel requests since 17:00 UTC show personal dashboard/account endpoints and no personal-worker invocation. Screenshots show the weekly plan still due October 2 at noon and no successful heartbeat recorded. This supports a dispatch gap, rather than proving a queued noon job is processing. Supabase Cron/Vault state and private rows have not been independently inspected.

Recovery: GitHub Actions > DROP PORTAL Personal Drops > Run workflow > main. Verify a successful response, heartbeat, weekly result and next Friday noon recurrence. If the workflow fails, inspect its response before retrying; the current worker requires migration 005. Do not change the scheduled plan solely to wake the worker. Migration 006 is the previously supplied optional five-minute Supabase trigger and must be configured with the correct Vault secret before relying on it.

69 tests and full build passed before delivery, including waveform/palette media retention, desktop drag bounds and account isolation. No new SQL migration is needed for this player patch. A browser executable is unavailable locally, so live provider appearance/audio and actual weekly delivery remain unverified.
