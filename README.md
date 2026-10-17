# ARTSS LIVE 12 — Track Slicer / iPhone PWA

Canonical production app: https://artss-djs.vercel.app. 8 performance pads, 16/32-step overdub recorder, transport pause/stop, separately saved master takes. This release replaces duplicate sound-list and loop-strip columns with one import workspace.

## Full track workflow

1. Open **SLICES**, choose 16 (default) or 32, then **LOAD FULL TRACK** (.mp3/.m4a/.wav etc supported by the browser).
2. The browser decodes the full recording locally, selects six-second excerpts across its duration using energy and onset changes, and places them from lower to higher estimated tone/brightness. The source recording is never uploaded.
3. Select a bank of eight slices; the same eight LIVE performance pads now trigger that bank. Tap **KIT SOUNDS** to switch back to the original synthesizer.
4. Open **MIX** for individual channel pitch adjustment (-12 to +12 semitones), level, mute and solo. There are no per-pad volume/pitch sliders.
5. Play and record as before. The selected bank plays in the sequencer and real-time audio take capture. Slice data is stored in IndexedDB for future sessions when storage permits.

**Limitations:** This is on-device acoustic event detection and slicing, **not** neural stem/source separation. Complex polyphonic mixes remain mixed within each excerpt; precise kick/vocal/bass isolation is not claimed. Estimated frequency sorting is approximate. Browser decoding of very large or long tracks is memory-intensive on older iPhones; this implementation has 80 MiB file and 45-minute decoded-duration guards. Storage is device-local; exporting a pattern as JSON does not embed copyrighted audio. 6-second clips are mono at 22.05 kHz with fades to cap mobile memory.

Run `npm test && npm run build` (no npm dependencies). Browser smoke: `python3 tests/production-qa.py chromium`; WebKit: `python3 tests/production-qa.py webkit` with Playwright installed.