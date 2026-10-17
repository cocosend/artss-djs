# ARTSS STUDIO 8.1 — canonical DJ Creator

**Live:** https://artss-djs.vercel.app/ — single canonical installation entrypoint.
**Repository:** `cocosend/artss-djs`, production branch `main`, Vercel project `artss-djs`.

ARTSS STUDIO is the approved eight-bank, 16-pad beat creator. The original v8.0 sound synthesis (`makePCM`), arrangement presets and compressor routing are preserved as tested. No DJ decks, duplicated audio engine, or external sample service.

## Source layout

- `index.html` / `studio.css` — mobile touch interface and five tabs.
- `studio.js` — one Web Audio engine, sequencer, sound banks, effects, sample import, recording and WAV/JSON export.
- `manifest.webmanifest`, `sw.js`, `icons/` — installable PWA and offline assets.
- `scripts/build.mjs` — only the above static runtime files are copied to `dist/`.
- `tests/` — sound fingerprint, Chromium and WebKit transport/record/export gates.

## Develop and release

```bash
npm test
npm run build
npm run test:browser
```

No npm runtime dependencies or server/database required. Publish via GitHub `main` to the existing linked Vercel project. A change is acceptable only after Chromium and WebKit mobile tests pass and `https://artss-djs.vercel.app/release.json` matches the expected version.

**iOS:** Safari → Share → Add to Home Screen. Web Audio starts on a user gesture. Imported audio is session-local; session patterns and settings are stored on-device. Live recording requires browser MediaRecorder; WAV export uses offline Web Audio. The app does not send music projects to Supabase or other external services.

Production replaces the old 7.x root. Older implementations remain accessible in Git history for rollback rather than as duplicate production runtimes.