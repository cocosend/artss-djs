# ARTSS native iOS integration

**CHAPTER 100 / M100 (10% milestone):** [Контрольная точка · новое начало](./RELEASE_100.md). Текущий milestone — исходный код + unsigned IPA для подписи; аппаратная валидация и релиз в Store ещё впереди.

The uploaded React Native iOS host is integrated with one C++ AudioEngine and CoreAudio RemoteIO backend. The earlier standalone AudioCore/TurboModule skeleton has been replaced by this host. The PWA remains a separate target.

Implemented source: dual track import/playback, cue, rate, loops and crossfader; 303/606/909 kits, eight UI-worklet pads, and a 16-step audio-thread sequencer. Kit PCM is generated before rendering. Existing voices retain immutable sample storage during kit changes. Patterns survive audio preparation; session stop and restart reset the sequence clock.

Each deck's jog platter uses UI-thread angular touch velocity to drive a bounded, bidirectional C++ playback rate. A 5 ms rate ramp and deck envelope soften contact/release; after 50 ms without a gesture update, speed decays to zero even if the finger remains on the platter. Waveform drag seeks continuously with a short crossfade at each jump or loop wrap. The output remains routed through the shared master EQ and limiter. Jog playback is normal resampling and changes pitch; this is not pitch-preserving time stretch. Paused decks can be auditioned by moving the platter, and releasing it leaves them paused.

Verification: `npm ci && npm run verify` checks strict TypeScript, lint, portable C++ tests, Codegen and the Metro iOS bundle. `ASAN_OPTIONS=detect_leaks=0 SANITIZER=address,undefined npm run test:core` checks memory safety. These are not Xcode or physical-device verification.

macOS: install Xcode, run `bundle install`, `bundle exec pod install --project-directory=ios`, then `npm run ios -- --mode Release`.

No signed IPA has been built. iOS compilation, device playback, physical latency and frame pacing remain unverified. Pitch-preserving stretch, automatic BPM/key analysis and recording are not implemented in the native target. Track loops use a fixed 120 BPM reference; rate changes pitch. Track replacement pauses both decks. The UI retains the supplied archive's deck layout and adds the drum machine; exact screenshot fidelity is not claimed.

## NEXUS 34: Stripewolf sound packs in ARTSS DJS

This project remains **ARTSS DJS**, not DJ Creator, DJ NOVA or TrackBuilder. The original NEXUS black/yellow performance design and native CoreAudio/C++ engine are retained.

- **СОЗДАТЬ**: Stripewolf / Music Packs offers nine reproducible techno, acid and rave 16-step grooves modeled after the source Stripewolf `DemoPicker`. A tap loads the selected kit, BPM and all eight editable pad lanes into the currently selected A/B/C/D bank. Other banks are not overwritten. Record pad hits or edit steps and tempo from the existing controls.
- **MIX**: nine eight-bar synthetic demonstration loops, built on the native iOS lifecycle queue, load into Deck A or B for cueing and mixing. The seven named styles are Maddix, ARTBAT, Brejcha, Guetta, Kazantip, Legends and Modern; the additional demo variants include Sunrise 303 and Black Sea Warehouse. No third-party artist tracks are embedded.
- The loop synthesizer adds native 303 acid, sub and 909 accents. Pattern editing executes via preexisting atomic controls and alloc-free CoreAudio render callback; no new engine or audio thread.
- Automated `npm run test:grooves` verifies nine unique deterministic patterns, valid tempos, 8×16 velocity bounds, and non-mutation.
- The **Native iOS** GitHub Actions workflow produces a **single unsigned development IPA artifact**, not an installable Apple-signed IPA. Installing on an iPhone requires signing via Apple developer provisioning or an authorized sideload signer. There is no claim of working live recording/export in this native target.

Audio is newly synthesized and the artist names are stylistic descriptors, not sourced commercial audio.
