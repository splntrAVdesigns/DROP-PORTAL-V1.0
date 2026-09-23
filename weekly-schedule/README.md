# DROP:PORTAL Dynamic Publication Schedule

`weekly-schedule/current.json` is the source of truth for **when** the production DROP:PORTAL publisher should run.

The recommendation inquiry remains separate:

- `weekly-schedule/current.json` answers **when is the next production drop?**
- `weekly-inquiry/current.json` answers **what discovery profile should govern that drop?**
- `weekly-feed/drops/index.json` remains publication history and must not be used as mutable schedule state.

## Default cadence

Factory default:

- Wednesday
- 7:00 PM
- `America/Chicago`

The IANA timezone is intentional so CST/CDT transitions are handled correctly.

## Manual schedule modes

### This drop only

A one-off override changes only the upcoming production drop. After a successful publish, the override is consumed and the scheduler returns to the saved weekly default.

### Make weekly default

The selected weekday and hour become the new recurring default. No one-off override remains.

Phase 2.7 supports whole-hour publication times. This matches the hourly publication watcher and avoids presenting minute-level precision the scheduler cannot guarantee.

## Save transaction

An authenticated schedule save must update the schedule manifest and `weekly-inquiry/current.json.targetDropDate` together. The production API performs both changes in one Git commit so schedule state and inquiry targeting cannot drift.

The browser never receives a GitHub write token. Schedule mutation requires server-side credentials.

## Publication rollover

After a production drop is validated, written, added to the feed manifest, and re-read successfully:

1. Record `lastPublishedAt`.
2. Consume a one-off override if one was active.
3. Calculate the next occurrence from `defaultSchedule`.
4. Set `nextDropAt` and keep `status=armed`.
5. Synchronize `weekly-inquiry/current.json.targetDropDate` to that next local publication date.
6. Preserve the inquiry `baseProfile`.
7. Reset the one-week recommendation override after its intended production drop.
8. Re-read and verify both schedule and inquiry state.

Failed publications do not advance the schedule. Test drops do not consume or roll the production schedule.
