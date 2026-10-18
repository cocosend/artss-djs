# ARTSS LIVE 16 — Performance Mixer

Production-focused iOS/Android offline-capable groovebox PWA inspired by the *workflow* of modern live mixers (original UI, original synth engine; not affiliated with Mixvibes/Remixlive).

**Single application:** 8 responsive synth pads, 16 steps (editor shows 8 steps per page for finger-sized targets), 8 genre kits, INTRO/GROOVE/BUILD/DROP/BREAK performance scenes, 8-channel mix, real-time quantized LIVE REC overdub, master audio take recording, 44.1 kHz offline WAV rendering and local project backup/restore. No full-track import or stem separation, no DJ decks, no duplicate audio runtimes.

## Audio and transport

- A single `AudioContext` WebAudio signal chain shared by pads and sequencer. `MediaStreamDestination` taps the post-master graph for audio takes.
- AudioContext wakes on the physical pad gesture in iOS Safari. Synth buffers are reused and warmed after unlock, and the active voice count is bounded (28).
- Scheduled 16-step music events run against `AudioContext.currentTime` with lookahead, avoiding per-note JS-timer triggering.
- Scene changes are queued at the beginning of the next 16-step bar during playback, applied immediately while stopped.
- MUTE/SOLO policies apply to live pads as well as sequenced output. Loop REC writes note positions synchronously on touch so asynchronous audio-resume cannot shift notes.
- PAUSE, STOP and LOOP REC OFF never delete saved notes; CLEAR is separately confirmed. Local storage migration reads v15–v10 sessions safely.
- WAV export uses an `OfflineAudioContext` with the same synth, filters, effects, pitch and levels as playback. Live master takes are separate files in IndexedDB, as allowed by iOS storage quota.

## Architecture

| File | Responsibility |
|---|---|
| `src/sound-design.js` | Deterministic PCM samples, genre kits and patterns |
| `src/session.js` | Versioned local project, migration, normalization and 16-step edits |
| `src/engine.js` | Single realtime/offline audio graph, scheduler, capture, limiting |
| `src/takes.js` | IndexedDB take management and download |
| `studio.js` | Event delegation, touch UI, scene/page navigation, interaction |
| `studio.css` | Mobile-first accessible design with device safe areas |
| `sw.js` | Versioned offline shell cache and old-cache pruning |

No runtime third-party dependencies; source remains native ESM to avoid introducing a second React audio runtime. Functional tests are included for Chromium and WebKit. Tests do not constitute a physical iPhone latency certification or a comparison against commercial hardware.

## Verify

```bash
npm test && npm run build
python3 tests/browser-qa.py chromium
python3 tests/browser-qa.py webkit
```

CI runs all tests against the built `dist` files on real browsers before merging to `main` for Git-connected Vercel deployment. On iPhone use Safari → Share → Add to Home Screen.