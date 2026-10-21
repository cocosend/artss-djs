# ARTSS NEXUS — production development contract

Repository: `cocosend/artss-djs`. The only canonical production site is `https://artss-djs.vercel.app/`.
This repo currently deploys a **Web Audio/TypeScript iPhone PWA**. A separate `native/` source experiment is **not** a deployed React Native app; do not claim native 120 FPS, native JSI/CoreAudio latency, App Store compatibility, or iPhone hardware validation without evidence.

## User-approved appearance and workflow
- Primary reference is the approved NEXUS DJ CREATOR iPhone screenshot from the project conversation (black metal instrument, concentric PLAY/REC discs and waveform).
- Layout invariants: **8 playable pads in a 4-by-2 grid** (not six), banks A/B/C/D visibly beside DRUM PADS, 16-step sequencer with 4 immediately readable lanes, **LOW/MID/HIGH EQ and crossfader on the live page**, five main navigation destinations CREATE/LIBRARY/PERFORM/MIX/PROFILE. Advanced tools can expand inline; no double decks or redundant fake controls.
- Latest palette request: deep black, pearl violet, luminous turquoise/white, controlled red accents. Keep high contrast, 44px-equivalent comfortable touch targets where layout allows, iOS safe areas, performance on iPhone 11–18 Pro and Android browsers.
- Do not hide required workflows in nested menus, reintroduce streaming-only SoundCloud/YouTube Music/Apple Music embeds, or replace working controls with mockups.
- Do not add another stylesheet/theme layer every release. The production build uses one authoritative stylesheet and one audio engine. Remove obsolete output assets from release packages.

## Audio must be trustworthy
- Every stock pad must resolve to a real bundled WAV. Never substitute an oscillator or a random instrument on missing assets; fail visibly and protect hearing/headroom.
- Switching presets may change rhythm and tempo, **not the factory timbre assigned to a pad** or a user's imported sample.
- Never auto-classify and replace pad audio after an upload, touch, or menu action. Only explicit REPLACE may overwrite the chosen pad; provide RESTORE ORIGINAL with persistent deletion of style-scoped and legacy overrides.
- Preserve user data (`artss-live-session-v19`, `artss-nexus-pattern-banks-v23`, IndexedDB recordings/custom sounds) across updates. For incompatible changes, provide tested migration and rollback before release.
- Audio clock must not depend on DOM rendering; schedule sound ahead of UI work. Avoid synchronous localStorage/64-cell repaint during touch processing. Keep bounded voices, no clicks/clipping, no hidden media autoplay, no duplicated output.
- The WAV exported by the app must be non-silent, stereo, and remain below digital clipping; verify all essential pads and source files.

## Shipping gate (no forced production changes)
1. Identify and reproduce regression(s); retain a stable production backup SHA.
2. Make minimal, reversible changes on a branch. Do not rewrite a functioning audio architecture without measured need.
3. Pass TypeScript compile/typecheck, unit tests, C++ test, Chromium and iOS WebKit smoke (pads, bank switching, pattern restore, FX/EQ, custom sample import/restore, microphone/live capture, WAV export, widths 320–430).
4. Validate visual geometry against reference, network asset size/requests, that the app has no console errors, that Service Worker invalidates old assets, and that no locally saved state disappears.
5. Only after CI passes, merge PR, verify Vercel production READY and live files at the canonical URL. Do not claim objective audio quality, 0ms latency, 120 FPS, pixel-perfect screenshot matching or physical iPhone tests unless actually measured.
6. For a regression or failing WebKit, diagnose and fix first; do **not** count a single retry as evidence that a reproducible problem was solved.
7. Communicate concise verified changes, metrics and remaining blockers, not inflated claims of perfection. User authorizes normal reversible changes but destructive operations and sensitive external actions still require applicable safeguards.

Engineering priorities: **sound integrity → correctness/data preservation → touch latency → screenshot fidelity → UI minimalism → features**.

## v27.1 recording regression rule
- Recorded PCM is WAV, not WebM: MIME, filename extension, header and stored IndexedDB name must agree.
- Asynchronous IndexedDB restore cannot overwrite a user's newer imported sample during decode.
- The user prohibited microphone capture: never use getUserMedia or a microphone selector. LIVE REC captures pad events in the continuing 16-step loop.

- On Safari/iOS only internal live mix sample capture uses bounded PCM; microphone capture is unsupported.

## v27.2 tactile interaction
- Pads render their pressed state immediately on pointerdown and retain it until pointerup or pointercancel; allow true multi-touch while forbidding long-press file pickers.
- Pad selection changes classes, not audio engine, pad DOM nodes, or sequencer structure; tapping existing step controls persists via bounded 250 ms debounce with pagehide/background flush.
- LOW/MID/HIGH accept vertical touch movement at 7 CSS px/dB, native keyboard access remains, and all frequency changes reach AudioParam before persistence.
- One CSS cascade only; preserve 8 pads/4x2, A-D bank strip, five tabs and headroom/compressor behavior.

- For short Safari/iOS PCM recordings, record post-limiter master directly through `/app/pcm-capture.js` AudioWorklet instead of routing live WebAudio through MediaStreamDestination -> MediaStreamSource -> ScriptProcessor. AudioWorklet remains allocated only while capturing; preserve playback connections on cleanup. The fallback ScriptProcessor remains for platforms without AudioWorklet.

- Regression QA must assert long-press on a performance pad cannot accidentally switch to sample replacement, and computed touch-action for pads and EQ prevents scroll hijacking.

## v28 local track DJ automix
- Real audio-track automix is available from the collapsed АВТОСВОДКА ТРЕКОВ panel: 2–3 user-owned files, transient BPM and beat offsets, peak-limited RMS normalization, beat-aligned 4-bar equal-power crossfade with sub-bass handoff, routed through the existing master EQ and limiter. This is a deterministic DJ assistant, not a trained neural model or third-party DRM stream extractor.
- The old button АВТОМИКС in pad mode controls automatic A/B pad-group balance only, and must not be described as track automix.
- Keep eight pads and manual pad REC looping intact. No second deck UI. iPhone decoding is bounded to three files and twelve minutes combined.
