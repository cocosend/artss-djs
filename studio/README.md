# ARTSS SOUNDLAB 8.0 — iOS/Android touch beat creator

A **new implementation**, not a reskin of the old DJ decks. No npm runtime dependencies.

## Features
- Low-latency Web Audio engine: 16 original voices, compressor, tone filter; immediate pointerdown pads.
- 16-track × 16-step sequencer, six distinct beats, variations, track selection, BPM, swing and master level.
- Sample import (up to 7 s and 12 MB), local JSON project save/load, undo pattern edits.
- MediaRecorder of mixed master bus (MP4 where available, otherwise WebM) and offline WAV export (4/8/16 bars).
- PWA manifest, offline static cache, viewport-fit and iPhone safe areas.
- Designed for iPhone 12–18 and Android: 5 tab screens, large buttons, no two decks.

## Build without npm install
The checked-in `dist/` files can be served statically directly; TypeScript source is in `src/`.
With globally available `tsc`: `tsc --noEmit && tsc`. With dependencies installed: `npm run build`.

## Validation
- `tsc --noEmit` — clean.
- `node --test tests/*.test.mjs` — audio and preset tests.
- Headless Chromium DevTools interaction QA verified responsive mobile UI, patterns, transport/playback, MediaRecorder start/stop, offline WAV download link. Local browser navigation to file/localhost was blocked by environment policy, so QA exercised the same compiled scripts in an injected about:blank document; HTTPS PWA must still be verified.

## Compatibility
For iOS, open on Safari via HTTPS and choose Share → Add to Home Screen. Web Audio unlock occurs on user gesture. MediaRecorder support may vary with iOS release; WAV export is the fallback.

## Limitations
Pitch is precomputed per voice: this is a drum machine, not a multitrack DAW. Imported samples exist in memory until tab close and are not persisted in the project JSON. Voice previews in headless browser do not substitute listening on iPhone speakers or headphones.