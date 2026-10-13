# ARTSS DJS

Canonical source for [artss-djs.vercel.app](https://artss-djs.vercel.app).

This repository mirrors the working 7.1.0 production release. It is a static, self-contained Web Audio app with no build dependencies or database. Vercel serves `index.html` and its relative assets from the repository root.

Run locally with `python -m http.server 8000` in this directory, then open `http://localhost:8000`.

## Deployment

`main` is connected to the existing Vercel `artss-djs` project. Changes to this branch trigger its normal Git deployment workflow. No Supabase project is required: presets and projects remain in the browser or in files exported by the user.

## Mobile creator interface

On screens up to 900px, five reachable tabs (LIVE, CREATE, SOUNDS, FX, EXPORT) organize the existing single-engine DJ Creator. The transport and recording remain available without entering a second mixer. The step sequencer provides an undo history for up to 24 edits. Presets and projects remain local; the interface uses standard Web Audio APIs and avoids build-time dependencies.

Source Google AI Studio preview URLs may require a Google authentication cookie. They are not a source-code repository and cannot be reliably scraped for a pixel-perfect recreation. Production code is maintained here instead of replacing functioning audio infrastructure without access to its original source.
