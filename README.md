# ARTSS DJ Creator 31

The deployed target is a Web Audio PWA for iPhone and Android browsers. `native/` is an experimental iOS audio core, not a complete React Native application.

The live workspace has one touch-controlled jog wheel (filter, tempo, echo, and track-cue modes), an opt-in microphone CUE overdub routed through the existing master, and 3,145,728 on-demand rhythmic variations (12 styles × 2^18 addressable patterns). Preset pockets/folders are stored locally. This is deterministic generation, not 3.1 million recorded samples or a neural model.\n\nThe live workspace has eight sample pads, four pattern banks, a 16-step sequencer, manually selected style patterns, pad overdub, BPM, one manual A/B crossfader, three-band EQ, filter, echo, and eight channel level/mute controls. Local-track AutoMix is available for 1–3 user-owned files, using beat/transient estimates and equal-power transitions. Local sample replacement and restoration, audio takes, and offline WAV pattern export remain available.

Pad recording writes events to the ongoing loop. Pressing CUE · MIC requests microphone permission and starts an audio take of the shared master (mic, pads and music). Pressing CUE again saves that take. It requires HTTPS and browser permission. Use headphones to prevent feedback. The microphone is stopped by STOP/PAUSE or by toggling CUE. Existing localStorage session keys and IndexedDB custom samples/takes remain in place across updates. The service worker replaces only app shell caches.

## Verification

```bash
npm run check
g++ -std=c++20 -O2 -Wall -Wextra -pedantic native/core/AudioCore.cpp native/core/test.cpp -o /tmp/artss-audio-test && /tmp/artss-audio-test
python tests/browser-qa.py chromium
python tests/browser-qa.py webkit
```

The browser suite covers pads, pad event recording, sample replacement and restore, mixer controls, PCM WAV export, STOP cancellation, language switching, and responsive widths. Physical iPhone microphone and audio-take reliability, Android audio latency, interruptions, and installed PWA lifecycle still require device testing.
