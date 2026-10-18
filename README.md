# ARTSS LIVE 18 — ONE TAP STUDIO

One-screen 8-pad 16-step iPhone PWA. New TypeScript Web Audio engine and AudioWorklet clock. **No SoundLab, DJ decks, duplicate pads, full-song slicing, 32-step mode or third-party runtime dependencies.**

- **LIVE REC:** first touch starts transport + enables writing notes; playing pads triggers sound immediately and overdubs the current 16-step loop; REC OFF leaves loop playing.
- **PLAY/PAUSE/STOP:** Pause preserves phase, Stop returns to first step and disarms REC. Neither deletes recorded notes.
- **ADD SOUND:** load up to eight individual WAV/MP3/M4A audio files (<16MB/file, <30s each), locally detect onset, RMS, peak, brightness, and suitable pad type; trim/fade, set gain/HPF/LPF; audio is never uploaded. An optional manual replacement selector exists in MIX.
- **MIX:** automatically prepared gains/EQ; 8 simple level/mute lanes. No per-pad duplicate volume controls.
- **EXPORT:** offline WAV of 4 bars; optional master take recorder using native MediaRecorder if supported.
- **Sound:** 16 real CC0 sampled drums from `octalmusic/octal-samples` already in the upstream `artss-djs/samples/` repository; tonal SUB and ACID remain original synth voices. See previous `THIRD_PARTY_SAMPLES.md`.

AI caveat: `smart.ts` is automatic local **DSP heuristics**, not a neural model, stem splitter or server inference. Do not claim AI-powered key recognition: rough frequency estimation is diagnostic only.

Runtime prerequisites: static HTTPS and a browser with Web Audio. `AudioWorklet` is used when available; a 25ms timer is used as fallback. TypeScript is a build-time dependency only; no client runtime libraries are installed on the phone. If deploying to Vercel, use `npm run build` and output directory `dist`. Old projects remain untouched under previous localStorage keys; v18 starts a fresh project.

Tests: `npm run check` then Playwright Chromium/WebKit UI smoke test. Hardware latency and subjective sound remain unmeasured until a physical device listening test.