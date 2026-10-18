# ARTSS LIVE 19 — Performance Engine

A compact performance groovebox for iPhone PWA. Eight touch pads, exactly sixteen steps, two actual audio buses (drums A and synths B), equal-power crossfade, filter, tempo-synced echo, limiter-style compressor, sampled 44.1kHz CC0 drum assets, synthesized sub and acid, local user sample import/auto processing, live quantized overdub, pause/stop without data loss, offline WAV and master audio takes.

Architecture: TypeScript Web Audio engine with AudioWorklet clock (setInterval fallback), separate model/DSP/sample layers. No cloud AI model: custom-sample classification is local spectral/transient analysis. Sound quality and input latency still require subjective assessment and physical iPhone measurements.

UI: one compact live performance screen; MIX panel houses filter/echo and eight levels/mutes; REC panel stores and exports recording. Works offline after first successful full asset caching (service worker).

Release procedure: `npm run typecheck && npm run compile && npm run build && npm test` then Chromium/WebKit touch QA; deploy only after both CI jobs pass. TypeScript compiled `app/*.js` is committed because Vercel project is configured to skip dependency installation during production build. Canonical production URL https://artss-djs.vercel.app/ . Do not overwrite legacy v18 session data.