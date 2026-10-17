# ARTSS STUDIO 10 — LIVE SESSION

An original Ableton Live-inspired touch workstation, not Ableton Live or a replacement for desktop DAWs. The existing 8-voice DSP is preserved.

- 8 pressure-independent touch pads and eight genre banks.
- Session clip launcher: 8 instrument tracks × 5 scenes; bar-quantized clip switching while playing.
- Scene launch, mixed clips across lanes, capture active clips to BUILD.
- Per-channel volume, mute and solo; master effects, compression, reverb, delay.
- 8 × 16 step sequencer, scene editing, undo, custom audio sample import.
- MediaRecorder live capture, 8/16/32-bar WAV bounce, JSON project save/load.
- One Web Audio runtime, local-first data, offline-installable iOS/Android PWA.

The `main` branch deploys to https://artss-djs.vercel.app/ through existing GitHub–Vercel integration.

`npm test && npm run build` validates the DSP and production artifacts. Chromium/WebKit QA runs from `tests/production-qa.py`.

Not a multi-track audio editor: the session matrix launches and combines sequencer patterns, not externally recorded audio clips. Imported samples are session-only.