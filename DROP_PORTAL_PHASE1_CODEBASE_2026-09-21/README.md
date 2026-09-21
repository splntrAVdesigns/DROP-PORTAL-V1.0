# DROP:PORTAL — Phase 1
Portable static ES-module app. Serve `dist/` with any static server. No build dependency required. Sites hosting configured in `.openai/hosting.json`.

Implemented: weekly dashboard, three priorities, lane bins, conditional wildcard/mix modules, archive and saved routes, local saved/heard/hidden actions, modal detail and tuner, base/weekly preference scopes, layout drag handles and keyboard move buttons, constrained sizes/reset/local persistence, singleton native audio player, seeking, volume, actual audio-derived waveforms, and responsive mobile sheets.

Content limitation: supplied Phase 0 package contained plans only, no previous weekly recommendations or licensed audio. All seed artists/titles/scores/mix entries are explicitly illustrative. Three original synthesized 16-second audio studies demonstrate playback and actual PCM-derived peaks. No third-party recordings, fictitious commercial links, or fake waveform data. Commercial release/store/provider integration awaits verified seed records.

State: namespaced browser-local storage, no authentication/database/scheduled discovery. Weekly tuner overrides bind to the current drop ID. Track/recommendation fixtures are isolated in dist/data.js. Audio ownership/runtime is in player.js; persistence in storage.js. Preview links remain separate from store links.

Validation: JavaScript syntax and local asset/route/PCM-peak consistency checked. Interactive browser QA was not performed in this environment.
