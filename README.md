# ARTSS DJ Creator 29

The deployed target is a Web Audio PWA for iPhone and Android browsers. `native/` is an experimental iOS audio core, not a complete React Native application.

The live workspace has eight sample pads, four pattern banks, a 16-step sequencer, manually selected style patterns, pad overdub, BPM, one manual A/B crossfader, three-band EQ, filter, echo, and eight channel level/mute controls. Track AutoMix and automatic A/B mixing were removed. Local sample replacement and restoration, audio takes, and offline WAV pattern export remain available.

Pad recording writes events to the ongoing loop; it does not use the microphone. Existing localStorage session keys and IndexedDB custom samples/takes remain in place across updates. The service worker replaces only app shell caches.

## Verification

```bash
npm run check
g++ -std=c++20 -O2 -Wall -Wextra -pedantic native/core/AudioCore.cpp native/core/test.cpp -o /tmp/artss-audio-test && /tmp/artss-audio-test
python tests/browser-qa.py chromium
python tests/browser-qa.py webkit
```

The browser suite covers pads, pad event recording, sample replacement and restore, mixer controls, PCM WAV export, STOP cancellation, language switching, and responsive widths. Physical iPhone and Android audio latency, interruptions, and installed PWA lifecycle still require device testing.
