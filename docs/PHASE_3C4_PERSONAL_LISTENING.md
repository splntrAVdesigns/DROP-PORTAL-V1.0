# Phase 3C.4 — Personal dashboard and listening

## Delivered
- Compact Your Signal and Upcoming/research panels share a desktop row; stack on mobile. Layout widths and ordering remain account-scoped.
- Top 3 cards form their own section. Remaining recommendations appear once in Dig deeper.
- Section icons, four-lane distribution, preferred artist/label counts and taste explanations use the displayed completed result and its saved profile snapshot. Actual distribution is not a claimed target quota. Unsupported audio traits remain identified.
- LISTEN opens one persistent bottom dock. Bandcamp/SoundCloud/Mixcloud use provider controls; cross-provider transport is disabled. Authorized native previews get play/pause, previous/next native preview, seek and volume. Minimize retains playback; stop unloads it.
- Dock media survives refreshes, layout changes and history/saved navigation; logout or account changes unload it. Links remain available when no preview is supported.

## Installation
This combined patch includes pending Phase 3C.3.3 changes. Run migration 005 once before deploying if it has not already succeeded. Migration 006 is an optional additional Supabase worker trigger, not a prerequisite for this UI. No additional 3C.4 schema change is required.

The rejected local push came from an older checkout missing the personal account baseline. Preserve that commit on a backup branch, fetch origin, create a new branch from origin/main, then extract this combined patch there. Avoid rebasing the old patch commit with add/add conflicts or force-pushing over main. The supplied current-main baseline already contains personal.js and the dependencies missing from that old checkout.

The dependency lock requires Node >=22. Let Vercel run npm ci and npm run build if the local Mac still runs Node 20. Do not treat a local build failure as a pass or force a push over newer upstream work. Verify Vercel uses a supported Node runtime.

## Validation and remaining checks
Full build and 68 tests pass locally on Node 24. Tests cover exactly one loaded provider, provider switching, media retention, native seek/volume/pause, account cleanup, private layouts, actual signal counts and snapshot matching, plus scheduling/security regression checks.

No browser executable is installed in this workspace. Desktop/mobile appearance, actual provider audio behavior, deployed worker heartbeat, completed weekly recurrence and live second-account testing remain unverified. LISTEN loads the provider widget; the user then controls playback inside it. The app does not infer or claim a provider's playing state from iframe focus.

## Next
Complete production reliability and listening QA, then Phase 3D: expand validated candidates and research coverage. Continue to distinguish catalog personalization from fresh source research.
