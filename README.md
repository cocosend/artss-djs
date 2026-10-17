# ARTSS STUDIO 9 — 8-Pad Groovebox

Primary iOS/Android PWA: https://artss-djs.vercel.app/

**Concept:** Eight large touch pads, sixteen steps per instrument. One Web Audio engine for live, sequencing, recording and offline WAV. No toy melodies, no decks, no randomized chromatic note triggers.

## Pads

| Slot | Role |
|---|---|
| 1 | CLUB KICK — deep four-on-floor transient |
| 2 | DEEP SUB — bank-root-tuned sustained 808/sub |
| 3 | CLAP / SNARE — backbeat |
| 4 | CLOSED HAT — tight off-beat high-frequency pulse |
| 5 | OPEN HAT — atmospheric open eighth offbeat |
| 6 | RIM / PERC — genre-specific syncopation |
| 7 | 303 ACID — controlled low resonant sequence |
| 8 | GENRE HIT — rave stab or phonk cowbell, otherwise a short noise accent |

Eight genres: Warehouse Techno, Hardgroove, Deep Dub/Minimal, Acid, Industrial, Dark Hypno, Rave, Drift Phonk. Each template has a deliberately sparse arrangement. Only SUB, ACID and GENRE HIT have rooted minor-scale changes; the other five are unpitched.

## Architecture

`studio.js` owns transport and Web Audio bus. `sound-design.js` is pure genre programming and deterministic one-shot PCM synth. The 8×16 sequence layout and sampling use the same source for both live and offline WAV export. Recorded audio uses `MediaRecorder`, and WAV export uses `OfflineAudioContext`. No backend, external assets or npm runtime packages.

Project migration: fresh v9 startup state, old 16-track JSON project files can be imported with a defined 16→8 track mapping. Samples are ephemeral and are never included in the JSON project file.

## Checks

`npm test && npm run build`, then Playwright Chromium and WebKit tests when the engines are installed: `npm run test:browser`, `npm run test:webkit`. CI blocks merge if any of the production checks fail.

## Notes

Sound quality is subjective. These original algorithmically-generated one-shots are not recordings from professional hardware or commercial licensed sample packs. Test on real iPhone speakers/headphones before relying on it in a performance. iOS PWA install: Safari → Share → Add to Home Screen.