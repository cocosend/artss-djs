# ARTSS LIVE 15 — Groove Studio

Production source for https://artss-djs.vercel.app — a purpose-built touchscreen groovebox for iPhone and Android PWA.

## What changed

- Four focused screens: LIVE / STEPS / MIX / REC. No duplicate panels, full-track slicing, sample-bank selection, upload-to-sample processing or 32-step sequencer.
- Eight genuinely playable low-latency drum and synth pads, 16-step maximum sequencer and five manually selected scenes (INTRO, GROOVE, BUILD, DROP, BREAK).
- Existing original, deterministic eight-bank techno/dark/acid/rave/phonk sound design preserved in `src/sound-design.js`.
- One `AudioEngine` handling realtime playback, look-ahead scheduling, live output, MediaRecorder capture and offline WAV rendering. A single Web Audio graph; no React rerender or duplicate audio contexts.
- `src/session.js`: versioned strict normalization; safely migrates first 16 steps of existing 32-step projects, retaining existing music while dropping track extraction fields. `src/takes.js`: existing IndexedDB audio-take storage preserved.
- PWA cache updated to v15; old caches invalidated. Backgrounding pauses playback but does not erase project.

## Play / record

Tap a pad for immediate sound. Select a scene on LIVE, use STEPS to edit. Enable LOOP REC to overdub quantized played pads into the active 16-step scene. Turn LOOP REC OFF to keep playing without recording; PAUSE preserves timeline, STOP resets transport; CLEAR requires confirmation.

REC records the master audio stream to a saved take in IndexedDB (browser support required); WAV export renders loop patterns offline. All data is local, no server, no uploaded tracks.

## Testing

`npm test && npm run build`; `python3 tests/browser-qa.py chromium`. CI additionally runs the same touch/audio/export tests on WebKit. Physical iPhone listening is still necessary to validate subjective speaker/headphone output.

**Scope:** This is not Ableton Live, neural stem separation, or a compiled native iOS app. It is an installable Web Audio PWA with no third-party runtime packages.