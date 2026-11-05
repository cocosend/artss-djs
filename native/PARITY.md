# ARTSS DJS native parity audit — FIX38 baseline

Source: the actual native files in this repository; uploaded iOS IPA version 1.0.38.
This is a code-level checklist, not App Store release certification.
Checked items are implemented in the native source; no physical-device latency/FPS claim.

- [x] Two independent loaded decks with play/pause, BPM sync, and persistent per-deck CUE position.
- [ ] Visual, inertial jog wheels and complete scratch/nudge/pitch-bend behavior (native jog transport exists).
- [ ] Smooth/sharp/dipless selectable crossfader curves and independent channel faders (single crossfade exists).
- [ ] 3-band EQ with true isolation modes (per-deck EQ exists).
- [ ] Full gain, master true-peak limiter and stereo VU meters (sample-peak limiter, gain and peak meter exist).
- [ ] Peak/RMS/frequency-colored stereo scrolling waveform with zoom and beat-grid markers (peak overview exists).
- [ ] Fully editable beat grid and robust BPM sync (automatic detection and sync exist).
- [ ] Eight hot cues per deck, automatic/manual loop and beat jump (basic loop and one transport cue exist).
- [ ] Per-deck/master reverb, delay, filter, flanger, bitcrusher and roll (filters exist).
- [x] Native eight-pad sampler with PCM voices, kits and step sequencer.
- [ ] Searchable library, playlists, track artwork and preview (file picker and demo presets exist).
- [ ] Musical key detection and harmonic mixing.
- [ ] Artifact-controlled pitch-preserving time-stretch.
- [ ] WAV/AAC master recording and share.
- [ ] MIDI/HID/OSC controller mapping.
- [ ] iOS background audio plus interruption and route recovery (interruption stopping exists).
- [ ] Persistent pre-scan peak/RMS/beat-grid caching (loading-time analysis exists).

## Cycle 1: native CUE

- CUE short press: pause, cancel automix and return to stored point.
- Long press CUE while paused: store the current or still-pending seek position.
- Separate CUE point per deck, reset on replacing that deck's track.
- All new control operations are noexcept, atomic and allocation-free.
- Native regression coverage: control validation, seek-to-cue, independence, replay, PCM safety and reload.
- Execute `cd native && npm run test:core`, `npm run typecheck`, and native CI before declaring test success.
