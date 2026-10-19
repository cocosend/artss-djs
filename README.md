# ARTSS DJ Creator 20 — Live Sample Studio

One existing Web Audio engine, two real mix buses (A drums/B synths), equal-power crossfader, 8 performance pads, strictly 16 steps, LIVE REC overdub, scene presets, BPM/filter/echo, offline WAV export and audio takes.

**New: record your own pad sample.** Select pad, choose LIVE MIX or MIC, press START then STOP. Capture up to 12 seconds of the current master mix or microphone without monitoring the microphone through speakers. Capture uses MediaRecorder where available and lossless PCM WAV via Web Audio ScriptProcessor fallback where unavailable (including Playwright WebKit). Trim transients, normalize bounded RMS/peak, apply role EQ, and bind the recorded sample to that pad for the **current style preset**. Imported sounds are now also style-scoped. Returning to that style restores its sound; legacy global samples remain a non-destructive fallback. Sound files persist locally in IndexedDB, with no cloud uploads.

The LIVE REC transport records pad presses into the 16-step loop independently from START/STOP SAMPLE, which captures a reusable audio snippet. MASTER TAKE records a full set. Old session localStorage and existing IndexedDB audio are preserved.

Automated validation: TypeScript check, Node tests, Chromium + WebKit browser smoke (record→pad binding→reload→per-style isolation), production smoke, no file uploads to servers. Real iPhone latency and subjective professional audio quality require hardware testing. **Not a neural AI model or stem separation.**