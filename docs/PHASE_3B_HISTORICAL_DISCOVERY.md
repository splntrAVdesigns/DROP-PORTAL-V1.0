# Phase 3B — Historical Discovery & Depth-Aware Search

## Implemented

- Tuner **Search The Past**: 1 month, 3 months, 6 months, 1 year. Saved separately in Base Profile or This Week. Old saved profiles implicitly use 1 month; their JSON is upgraded on the next save. The publication and stage snapshots include the effective setting without rewriting previous drops.
- `lib/research-window.js` resolves rolling calendar windows and splits them into inclusive calendar-month slices. Its internal `year` and `era` contracts let a future Archive Dive use the same date planner; those long jobs are not exposed or scheduled yet.
- MusicBrainz recording search filters by first release date per slice, uses offsets and a two-page per-query budget, and throttles requests. SoundCloud search uses its documented `created_at` date filter and linked pagination with a strict URL check. A SoundCloud upload date **never becomes** a confirmed release date. SoundCloud URNs are used as identifiers, with numeric IDs accepted for older responses.
- Each source run records attempted query/date slices, page counts, matches, errors, and truncation. A truncated search is visibly incomplete; no provider is presented as having searched an entire catalog.
- The queue ranks by the effective Discovery depth within the selected window, available metadata evidence, older vs newer position in the window, limited SoundCloud reach evidence, and repeat checks against eight recent published drops. This is **discovery priority**, never an audio-quality or genre verdict. Only tracks with a confirmed in-window release date count as eligible for further review.
- Tuner Research Intake shows window, depth, source coverage, release vs upload basis, repeat status, priority explanation, and shortlist/reject actions.

## Verify and activate

1. Save Base or This Week with a chosen Search The Past value. Run `DROP PORTAL Research Intake` from GitHub Actions with `dry_run=true`. Open the `Discover research candidates` log: compare `window`, `profileSnapshot`, `captured`, per-source `coverage`, `eligible`, and `capacityDropped`. Dry runs do not write the queue.
2. Inspect all four windows. Pages marked `truncated` or `error` indicate a coverage gap. SoundCloud requires its API credentials; `needs_credentials` is explicit. A successful workflow is not proof of complete source coverage or recommendation quality.
3. Enable saved intake only after source reports are reviewed. This sprint does not enable the Phase 2.9 autonomous publisher or create the 12-track drop payload.

## Boundaries

The source registry still has only MusicBrainz and SoundCloud. There is no Bandcamp/Juno/Beatport universal search, label graph, licensed audio analysis, or year/era UI. The two-page budget bounds each query and marks excess results `truncated`; a one-year search does **not** guarantee exhaustive results. The queue retains at most 400 candidates and reports `capacityDropped`. Archive Dive and additional verified source adapters should use the date planner and a durable candidate store before promising broad historical coverage.
