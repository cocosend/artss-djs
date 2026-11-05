# ARTSS DJS native parity audit — FIX38 baseline

Source: the actual native files in this repository; uploaded iOS IPA version 1.0.38.
This is a code-level checklist, not App Store release certification.
Checked items are implemented in the native source; no physical-device latency/FPS claim.

- [x] Two independent loaded decks with play/pause, BPM sync, and persistent per-deck CUE position.
- [ ] Visual, inertial jog wheels and complete scratch/nudge/pitch-bend behavior (Skia dual jog gesture/audio bridge now exists; native audio inertia and pitch-bend refinement pending).
- [x] Smooth/sharp/dipless selectable crossfader curves and independent native channel faders (DSP and UI logic implemented; tactile measurement pending).
- [ ] 3-band EQ with true isolation modes (per-deck EQ exists).
- [ ] Full gain, master true-peak limiter and stereo VU meters (independent stereo RMS L/R meters now exist; true-peak limiting remains).
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

## Cycle 2: selectable crossfader curves

- Smooth S-curve, sharp scratch cut and FIX38-preserving dipless curve.
- Per-sample smoothing of both channel and bass gains prevents curve-switch clicks.
- Native C++ regression for gain transitions, curve validation, output bounds and zero render allocations.
- The mode selector is accessible from the native mixer main transport.

## Cycle 3: stereo RMS meters

- Two finite Float32 RMS levels published as lock-free atomics per audio callback.
- Skia GPU bars read from the UI worklet without React state updates on each frame.
- Regression checks stereo channel isolation, normalized levels, master mute and stop reset.

## Cycle 4: interactive dual jog wheels

- Two independent Skia GPU decks with metallic radial gradients and position markers.
- Native per-deck scratch gestures call existing JSI `deckJog` worklet controls.
- One UI-thread frame callback per jog for spin and display-only momentum; zero DSP changes.
- Existing `jogAndLiveSeek` C++ regression covers safe reverse scrubbing and transport recovery.

## Cycle 5: independent channel level faders

- Replace each duplicate GAIN dial with a continuous touch-first vertical channel fader.
- Reuse existing C++ `setDeckGain` atomic and sample-rate-independent gain smoothing.
- Reanimated UI worklet performs frame updates without traversing React or audio-thread allocations.
- Dedicated reset-to-unity control per deck; separate state per channel.
