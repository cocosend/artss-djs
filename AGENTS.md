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
- MediaRecorder failures must release microphone tracks and notify UI instead of leaving the recording button armed.
