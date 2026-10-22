# ARTSS NEXUS 31 — EDM Performance Studio

Mobile Web Audio PWA for iOS and Android. Eight real WAV pads, four A–D pattern banks, a 16-step sequencer, live pad overdub, master EQ/limiter, local-track automix, manual sample replacement, stereo WAV export, and local recording. User projects remain in `artss-live-session-v19`, `artss-nexus-pattern-banks-v23`, and IndexedDB; this release keeps their storage keys.

## New in v31

Four appended genres: Festival EDM, Piano House, Trance Lift and Future Bass. Each has an original four-bar WAV melodic phrase, authored in `scripts/render-hooks.mjs` and built under `dist/samples/hooks/`. Switch to one of these genres to enable its melodic phrase; the `МЕЛОДИЯ` control can mute/unmute it without affecting pad timbre or user samples. The phrase starts on a sequencer bar, follows BPM, routes through the existing master DSP, and is present in WAV export. Existing styles retain their previous sound and the melody is off by default when loading an older session.

Groove generation now produces different fills, accents, bass and rhythmic density across repeated presses. The mobile layout is reordered around a flat performance console with accessible pad banks, EQ, transport and five destinations. No microphone permission, third-party streams or remote music service is used.

## Verification

`npm run check` checks TypeScript, compiles, packages and runs Node tests. `python3 tests/browser-qa.py chromium` and `python3 tests/browser-qa.py webkit` cover the interactive mobile flows when Playwright browser binaries are available. Native iOS release builds and on-device audio latency/FPS measurements require a Mac and physical iPhone; this PWA does not claim native CoreAudio performance.
