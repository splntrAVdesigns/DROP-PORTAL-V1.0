# Preview priority and taste learning

## Delivered
- Saved/Heard sit immediately left of Details in their own wrapping action row.
- Track previews appear ahead of descriptive copy. One official iframe remains active at a time.
- Bandcamp resolver verifies exact artist/title against the linked release's public metadata and checks streaming is enabled before recording a numeric track embed ID. It never stores signed MP3 URLs or extracts audio.
- All 12 tracks in Drop 005 resolved on 2026-09-26 UTC. Amendments preserve the original published payload.
- SoundCloud and Mixcloud destination links already produce official players; each provider now gets appropriate frame height. Explicit embeds are restricted to matching official player hosts and paths.
- Preview Enrichment runs on feed changes, hourly, or via GitHub Actions. It only checks the latest published drop's missing previews, reuses album fetches, and saves verified amendments with a non-forced push. A concurrent commit can reject that push; a later run retries from current main. No secrets beyond the existing GitHub Actions token are required.
- Local command: `node scripts/enrich-previews.mjs` reports only; add `--write` to save verified amendments. Unmatched tracks remain unresolved and are reported, never assigned guessed players.

## Limits
Official provider playback remains controlled by provider availability, streaming settings and browser restrictions. A resolved ID proves identity, not a successful listening session. Bandcamp playback stays inside its embed; its public embed has no supported native transport bridge used by this app. The native audio player requires an authorized direct audio source. SoundCloud/Mixcloud widget control can be integrated separately using their documented APIs.

## Recommended next sprint: Listening Feedback & Personal Taste Model
1. Persist feedback privately per authenticated user in a database. Current Saved/Heard are browser-local and do not train research ranking.
2. Collect explicit like/dislike and save/unsave events; keep Heard neutral. Record play, replay and completion only when a supported player reports them. Clicking an iframe is not proof of playback; unavailable previews are not dislikes.
3. Enrich track features with verified artists, labels, release identities, genre tags and source evidence. Add labeled user examples. Licensed audio features require an authorized audio-analysis path.
4. Start with an explainable preference model over those features, constrained by the Tuner and date range, with room for unfamiliar artists. Version models, expose reset/opt-out, and evaluate recommendations against held-out feedback.
5. Introduce learned ranking after enough real feedback exists; compare it against the initial model and track saves, listening satisfaction and discovery diversity. This patch does not introduce a trained model or upload browser interactions.
