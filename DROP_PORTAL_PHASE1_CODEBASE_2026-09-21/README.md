# DROP:PORTAL — Phase 1
Portable static ES-module app. Serve `dist/` with any static server. No build dependency required. Sites hosting configured in `.openai/hosting.json`.

Implemented: weekly dashboard, three priorities, lane bins, conditional wildcard/mix modules, archive and saved routes, local saved/heard/hidden actions, modal detail and tuner, base/weekly preference scopes, layout drag handles and keyboard move buttons, constrained sizes/reset/local persistence, singleton native audio player, seeking, volume, actual audio-derived waveforms, and responsive mobile sheets.

Content limitation: supplied Phase 0 package contained plans only, no previous weekly recommendations or licensed audio. All seed artists/titles/scores/mix entries are explicitly illustrative. Three original synthesized 16-second audio studies demonstrate playback and actual PCM-derived peaks. No third-party recordings, fictitious commercial links, or fake waveform data. Commercial release/store/provider integration awaits verified seed records.

State: namespaced browser-local storage, no authentication/database/scheduled discovery. Weekly tuner overrides bind to the current drop ID. Track/recommendation fixtures are isolated in dist/data.js. Audio ownership/runtime is in player.js; persistence in storage.js. Preview links remain separate from store links.

Phase 1.5.2B adds the Sites runtime deployment bridge. The browser loads the published GitHub weekly-feed manifest at runtime, validates each drop before applying it, and falls back first to the feed snapshot deployed with the Site and then to the original Phase 1 seed data. The deployed snapshot lives under dist/weekly-feed/; no repository credential is exposed to the browser.

Phase 1.6 closes the recommendation-to-listening loop. Published cards expose verified provider destinations directly, combine Bandcamp listening/purchase destinations into one clear action, embed supported provider players such as SoundCloud without autoplay, show release/label/date/subgenre metadata, and retain honest unavailable states. Direct authorized audio continues through the singleton player and real waveform path. The publication gate at scripts/validate-feed.mjs rejects incomplete metadata, missing destinations, invalid preview contracts, duplicate IDs, and broken drop references before deployment.

Phase 1.6.1 adds per-track runtime audition lookup. The dashboard resolves short, provider-authorized Apple Music previews first and Deezer previews second, accepts only strict artist/title matches, and streams them directly without downloading or rehosting. The cyan preview transport is visually and functionally separate from the verified Listen / Buy destination. Unmatched tracks remain explicit rather than receiving a guessed clip.

Phase 1.6.2 replaces the browser-side catalog lookup with official Bandcamp per-track players resolved from each recommendation's verified source page. This removes the indefinite loading state and keeps playback under the provider's authorization and stream limits. Eight current recommendations expose published audio; the two Dispatch Blueprints 029 preorder tracks remain explicitly unavailable until their provider publishes audio. Destination links use top-level navigation so they work from both the standalone Site and its embedded mobile preview.

Validation: JavaScript syntax and local asset/route/PCM-peak consistency checked. Interactive browser QA was not performed in this environment.
