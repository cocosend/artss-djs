# ARTSS LIVE 11 — iPhone PWA Groove Studio

Remixlive-inspired performance layout (original UI) over one deterministic Web Audio engine. No mixer decks and no duplicated clip matrix. The production entrypoint is `index.html`; project deploys automatically from `main` to `artss-djs.vercel.app`.

## Live workflow

1. Select a genre and press **LIVE REC**. Transport starts and the loop is armed.
2. Play any of the eight pads. The hit sounds immediately and is quantized to the nearest active step, stored in the active scene and added to the repeating loop. Multiple tracks are independent; overdub does not replace earlier steps.
3. Press **LIVE REC** to disarm without stopping playback; press **PAUSE** to stop sound without resetting position, **PLAY** to resume, or **STOP** to reset the playhead. None of these erase notes; **CLEAR SCENE** needs a double press.
4. Switch **16 STEPS / 32 STEPS** in STEPS; pages 1–16 and 17–32 are editable. 32 steps are not duplications of the first 16 and start empty.
5. **FILES → AUDIO TAKE** records the master output (both pad performance and sequencer) to an M4A/WebM recording via MediaRecorder. Every stopped take is stored in local IndexedDB with a playable/downloadable list, independent from the loop pattern. Browser storage can be evicted; export copies to Files for permanence.
6. Use **EXPORT WAV** for offline rendering; save/import project JSON for backup. Custom imported audio is in-memory for the session and not serialized.

## Mobile compatibility

iPhone Safari/WebKit and Android mobile Chromium; immediate pointerdown audio unlock, installable PWA, root scope and offline static shell, touch-targeted pads, iPhone safe areas. Transport stops on background for predictable Safari audio behavior. Physical device testing still recommended.

## Engineering

No external audio or runtime dependencies. UI is currently a native ES module frontend (not React); maintaining the Web Audio engine rather than introducing an unverified React migration prevents audio regressions. `npm test && npm run build` and `python3 tests/production-qa.py webkit` are run in CI before merge. Offline WAV uses identical patterns, lane volumes and synthesis to the live scheduler.