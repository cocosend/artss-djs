# ARTSS DJS

Canonical source for [artss-djs.vercel.app](https://artss-djs.vercel.app).

This repository mirrors the working 7.1.0 production release. It is a static, self-contained Web Audio app with no build dependencies or database. Vercel serves `index.html` and its relative assets from the repository root.

Run locally with `python -m http.server 8000` in this directory, then open `http://localhost:8000`.

## Deployment

`main` is connected to the existing Vercel `artss-djs` project. Changes to this branch trigger its normal Git deployment workflow. No Supabase project is required: presets and projects remain in the browser or in files exported by the user.

## Mobile creator interface

On screens up to 900px, five reachable tabs (LIVE, CREATE, SOUNDS, FX, EXPORT) organize the existing single-engine DJ Creator. The transport and recording remain available without entering a second mixer. The step sequencer provides an undo history for up to 24 edits. Presets and projects remain local; the interface uses standard Web Audio APIs and avoids build-time dependencies.

Source Google AI Studio preview URLs may require a Google authentication cookie. They are not a source-code repository and cannot be reliably scraped for a pixel-perfect recreation. Production code is maintained here instead of replacing functioning audio infrastructure without access to its original source.

## Physical pad controller (SLAB-compatible MIDI learn)

On desktop Chrome/Edge over HTTPS, choose **CONNECT MIDI** and grant browser permission. Press **LEARN 16 PADS**, then press your hardware pads 1–16 in order. The 16-note mapping is stored locally and applies to every sound bank. MIDI note-on velocity controls hit velocity. **RESET MAP** restores generic MIDI note numbers 36–51. The mapper is vendor-agnostic and makes no assumption about AlphaTheta SLAB's factory MIDI notes.

On iPhone/Safari, Web MIDI is unavailable: the 16 touch pads, step sequencer, effects, recording and WAV export continue without a controller. The site has no deck-mixing interface or external dependencies.

## Original music engine v7.4

The 40 factory presets no longer share a fixed eight-note riff: each has deterministic scale-aware melodic rhythms, a keyed tonal identity, custom patch coloring, scene-dependent layering, and 8-bar harmonic movement. The **NEW RIFF** button on CREATE recomposes only tonal tracks across scenes; existing drums, effects and transport settings remain intact. The selected variation is saved in localStorage and exported project JSON. The same `melodyPitch()` calculation is used by live playback and offline WAV export. Existing projects can load without a destructive storage reset.
