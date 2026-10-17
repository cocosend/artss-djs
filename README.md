# ARTSS LIVE 14 — High-Fidelity Sample Engine

One existing Web Audio audio engine, 8 touch pads, 16 or 32 sequencer steps, live overdub and audio takes.

**TRACK IMPORT:** upload complete audio locally, detect onset candidates across the entire track, rank candidates by low/high-frequency energy, transients and arrangement position, and fill sixteen fixed musical roles (KICK, CLAP, HAT, OPEN HAT, PERC, BASS, ACID, HIT, KICK ALT, SNARE, RIDE, STAB, GROOVE, BUILD, DROP, BREAK). Two banks of eight physical pads.

Clips have role-specific lengths: short one-shots for drums, longer phrases for tonal elements and arrangement stages. Frequency-selective filtering attenuates some unrelated material; because the input is a mastered mix, it **does not** isolate authentic independent stems. We do not claim neural source separation or an AI server. No track is uploaded to a backend.

Import creates an immediately playable musical arrangement in INTRO/GROOVE/BUILD/DROP/BREAK with 4-on-the-floor kick, sparse bass and acid, genre-appropriate percussion. Prior session state is backed up in browser localStorage under `artss-before-track-import-v13`. Imported PCM stored in IndexedDB.

The UI lists musical roles, not timestamps; no arbitrary 6-second excerpts or irrelevant sorting by pitch. Existing LIVE REC, STOP/PAUSE, WAV export, MIX pitch and PWA remain.

Run `npm test && npm run build`; Chromium / WebKit tests use `python3 tests/production-qa.py chromium|webkit` with Playwright.

## Sample sound quality (v14)
- 44.1 kHz capture of extracted one-shots, with four-tap interpolation rather than 22.05 kHz linear decimation. Existing v13 banks at 22.05 kHz remain playable and can be reimported to obtain the new processing.
- Stereo preservation for four arrangement phrases, avoiding collapsed spatial FX; the individual drum/synth one-shots remain mono for tightness and lower memory use.
- DC correction, bounded peak/RMS leveling, click-free sine fade-in/out and reduced 2 ms sample playback attack.
- 16 role samples remain estimates from a mixed track; this is not instrument-isolating stem separation or an audio mastering replacement.
- All processing stays local on device. Real-world output depends on the source recording and connected audio hardware.