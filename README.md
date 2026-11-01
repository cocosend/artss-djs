# ARTSS / LIVE 32 — Performance Studio

Mobile Web Audio PWA for iOS and Android. Eight real WAV pads, four A–D pattern banks, a 16-step sequencer, live pad overdub, master EQ/limiter, local-track automix, manual sample replacement, stereo WAV export, and local recording. User projects remain in `artss-live-session-v19`, `artss-nexus-pattern-banks-v23`, and IndexedDB; this release keeps their storage keys.

## Live 32

The performance page starts with eight playable pads in a 4×2 grid, followed by a compact transport and the 16-step sequencer. The color system uses black, warm yellow, off-white, and a restrained red recording accent. Local track automix supports two or three user-owned audio files. No commercial tracks or licensed vocals are bundled.

## Previous v31 music styles

Four appended genres: Festival EDM, Piano House, Trance Lift and Future Bass. Each has an original four-bar WAV melodic phrase, authored in `scripts/render-hooks.mjs` and built under `dist/samples/hooks/`. Switch to one of these genres to enable its melodic phrase; the `МЕЛОДИЯ` control can mute/unmute it without affecting pad timbre or user samples. The phrase starts on a sequencer bar, follows BPM, routes through the existing master DSP, and is present in WAV export. Existing styles retain their previous sound and the melody is off by default when loading an older session.

Groove generation now produces different fills, accents, bass and rhythmic density across repeated presses. The mobile layout is reordered around a flat performance console with accessible pad banks, EQ, transport and five destinations. No microphone permission, third-party streams or remote music service is used.

## Verification

`npm run check` checks TypeScript, compiles, packages and runs Node tests. `python3 tests/browser-qa.py chromium` and `python3 tests/browser-qa.py webkit` cover the interactive mobile flows when Playwright browser binaries are available. Native iOS release builds and on-device audio latency/FPS measurements require a Mac and physical iPhone; this PWA does not claim native CoreAudio performance.

## 303 / 606 / 909 drum machine (v33)

Open **ДРАМ-МАШИНА · 303 / 606 / 909 →** for A (16 one-bar grooves) and B (16 individual hits). All 32 files are generated at build time by `native/core/DrumSynth.cpp` and `native/core/render_kits.cpp` using original synthesis. No vendor factory samples or third-party drum ROMs are included. Four groups of loops quantize to the next bar and replace others in the same group; one shots retrigger on repeated taps. The sampler is routed through the existing protected master. Factory performance pads, 16-step sequence, session storage, and imported user samples remain intact.

The portable C++ core also pre-renders eight fixed stock voices when it starts, then mixes preallocated voices in its real-time callback. Its iOS bridge in `native/` is still source-only: this repository has no complete Xcode app project or signed IPA. The deployed PWA plays the C++-authored files through Web Audio. Run `npm run check` and the C++ command in `native/README.md` before shipping.
