# Phase 2.8 — Scheduled Drop Reliability, Tuner Synchronization & UI Closeout

## Scope delivered
- One shared browser/server schedule and profile contract; valid 00:00–23:00 hours; actual calendar-date and America/Chicago DST checks.
- Authenticated schedule/profile writes use an expected repository revision. All reads are pinned to that revision. Non-forced atomic Git commits reject races; schedule and inquiry targeting move together.
- Tuner loads canonical saved settings before editing; Base/This Week, target date, actual weekly default, saving, unavailable and conflict states are explicit. Sliders survive schedule saves. Conflict recovery can reload saved settings or retain drafts against a freshly loaded revision.
- Relative lane priorities are labelled; profile count remains 10–15 throughout the client/server/schema.
- Feed compares live and deployed manifests, rejects rollback to an older snapshot, retains the last valid feed on failure, checks every minute and on focus, and stages changes during provider playback or editing.
- Selected-drop profile/mixes/counts, all mix rows, durable archive links, and removal of demo-only archive entries after successful live load.
- Saved/Heard/Hidden retain existing storage identity, use per-field timestamps, and merge cross-tab updates. No deployment reset or interaction migration is required.
- Top 3 / Top Picks: from the drop; full-width ambient provider bars; caption centred under transport.
- Hero gradients: Cyan/Violet, Neon Yellow/Electric Blue, Teal/Coral, Magenta/Amber, Violet/Rose. Local selection persistence and reduced-motion support; original motion preserved.
- New modules isolate Tuner, hero, refresh orchestration, interaction merging, shared contracts, and repository transactions.

## Publication contract
The current enabled external publisher checks the schedule hourly. It researches and curates after the due time, then writes an immutable drop and index, and rolls schedule/inquiry state forward after verification. Tests do not consume the production occurrence. Phase 2.8 does not change tonight's scheduled occurrence or queued taste profile.

The board can now discover GitHub publication before a Vercel rebuild completes. An active Bandcamp embed is allowed to finish; STOP / UNLOAD permits a pending board update. Direct audio remains in its existing audio session during board updates.

Precise 7 PM availability is still a future READY-before-publication workflow. The UI states the current timing honestly.

## Verification
`npm run build` runs canonical feed/inquiry/schedule validation, static asset/import/syntax checks, and behavior tests before building the snapshot. Tests cover 24 hours, invalid dates, DST, rollover calculations, canonical state reads, atomic schedule saves, base/weekly behavior, stale revision and concurrent commit conflicts, authorization, live/deployed freshness, drop scoping, deferred feed updates, and interaction merge behavior.

Production admin writes are deliberately not exercised with fabricated preferences or schedule changes. Their transaction paths are tested with a simulated GitHub API. A real production save requires the existing admin access code.

## Roadmap reconciliation
The master v1.0 Phase 2 foundation (GitHub/Vercel portable shell) exists, with operational feed/publisher work pulled forward from later phases by approved 1.5–2.8 sprints. This is not completion of master Phases 3–7.

Next: observe the real scheduled publication and rollover; then Phase 3 durable data/identity decisions. Retain a separate follow-up for full lint/type-check coverage and production observability. No React/TypeScript rewrite or database is introduced in this closeout.
