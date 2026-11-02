# ARTSS native iOS integration

The uploaded React Native iOS host is integrated with one C++ AudioEngine and CoreAudio RemoteIO backend. The earlier standalone AudioCore/TurboModule skeleton has been replaced by this host. The PWA remains a separate target.

Implemented source: dual track import/playback, cue, rate, loops and crossfader; 303/606/909 kits, eight UI-worklet pads, and a 16-step audio-thread sequencer. Kit PCM is generated before rendering. Existing voices retain immutable sample storage during kit changes. Patterns survive audio preparation; session stop and restart reset the sequence clock.

Each deck's jog platter uses UI-thread angular touch velocity to drive a bounded, bidirectional C++ playback rate. A 5 ms rate ramp and deck envelope soften contact/release; after 50 ms without a gesture update, speed decays to zero even if the finger remains on the platter. Waveform drag seeks continuously with a short crossfade at each jump or loop wrap. The output remains routed through the shared master EQ and limiter. Jog playback is normal resampling and changes pitch; this is not pitch-preserving time stretch. Paused decks can be auditioned by moving the platter, and releasing it leaves them paused.

Verification: `npm ci && npm run verify` checks strict TypeScript, lint, portable C++ tests, Codegen and the Metro iOS bundle. `ASAN_OPTIONS=detect_leaks=0 SANITIZER=address,undefined npm run test:core` checks memory safety. These are not Xcode or physical-device verification.

macOS: install Xcode, run `bundle install`, `bundle exec pod install --project-directory=ios`, then `npm run ios -- --mode Release`.

No signed IPA has been built. iOS compilation, device playback, physical latency and frame pacing remain unverified. Pitch-preserving stretch, automatic BPM/key analysis and recording are not implemented in the native target. Track loops use a fixed 120 BPM reference; rate changes pitch. Track replacement pauses both decks. The UI retains the supplied archive's deck layout and adds the drum machine; exact screenshot fidelity is not claimed.
