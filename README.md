# ARTSS LIVE 13 — Smart Track Kit

One existing Web Audio audio engine, 8 touch pads, 16 or 32 sequencer steps, live overdub and audio takes.

**TRACK IMPORT:** upload complete audio locally, detect onset candidates across the entire track, rank candidates by low/high-frequency energy, transients and arrangement position, and fill sixteen fixed musical roles (KICK, CLAP, HAT, OPEN HAT, PERC, BASS, ACID, HIT, KICK ALT, SNARE, RIDE, STAB, GROOVE, BUILD, DROP, BREAK). Two banks of eight physical pads.

Clips have role-specific lengths: short one-shots for drums, longer phrases for tonal elements and arrangement stages. Frequency-selective filtering attenuates some unrelated material; because the input is a mastered mix, it **does not** isolate authentic independent stems. We do not claim neural source separation or an AI server. No track is uploaded to a backend.

Import creates an immediately playable musical arrangement in INTRO/GROOVE/BUILD/DROP/BREAK with 4-on-the-floor kick, sparse bass and acid, genre-appropriate percussion. Prior session state is backed up in browser localStorage under `artss-before-track-import-v13`. Imported PCM stored in IndexedDB.

The UI lists musical roles, not timestamps; no arbitrary 6-second excerpts or irrelevant sorting by pitch. Existing LIVE REC, STOP/PAUSE, WAV export, MIX pitch and PWA remain.

Run `npm test && npm run build`; Chromium / WebKit tests use `python3 tests/production-qa.py chromium|webkit` with Playwright.