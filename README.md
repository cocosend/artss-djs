# ARTSS LIVE 17 — Studio Recovery

Production-targeted rebuild of the eight-pad, sixteen-step mobile iOS PWA. This release restores a compact 4×2 finger layout and charcoal/crimson identity instead of the oversize v16 UI.

## Audio change

Sixteen authentic CC0 one-shot WAV assets from Octal `house-core` replace the simplistic sine/noise kick, clap, snare, hats, percussion and hit sounds. The bank chooses actual distinct recordings. Sub bass and 303 acid remain a controlled mono synthesizer, without random notes. All 16 drum files are shipped in the same-origin PWA and included in offline cache. WAV buffers are decoded only after the first user gesture (required by iOS/WebKit) and then reused without per-hit network access. The first tap uses the existing synthesized transient fallback if decoding has not finished. The approved 16-step musical arrangements remain.

Audio path: decoded sample/synth -> per-track gain and pitch -> fixed master filter/drive/delay/reverb -> dynamics compressor -> main output and MediaRecorder stream. Offline WAV uses exactly the same sample buffers and master graph when available. Pitch change is available only in MIX. No microphone or source-track slicing.

## Reliability

- 8 pads, 8 genre banks; one sequencer, 16 steps, 5 scenes, loop REC, PAUSE/STOP, saved takes, WAV.
- iOS Safari/Chrome/Android PWA; single independent audio graph, no runtime JS dependencies; normalized old session import.
- `npm test`, `npm run build`, Playwright Chromium and WebKit checks. CI additionally verifies the bundled CC0 WAV files and decoded sample output.
- Third-party audio licensing and exact provenance in `THIRD_PARTY_SAMPLES.md`.

No claim of studio mastering or measured physical-iPhone latency: device-level listening and hardware measurements must be done on a phone.