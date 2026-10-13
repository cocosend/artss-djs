# ARTSS DJS

Canonical source for [artss-djs.vercel.app](https://artss-djs.vercel.app).

This repository mirrors the working 7.0.0 production release. It is a static, self-contained Web Audio app with no build dependencies or database. Vercel serves `index.html` and its relative assets from the repository root.

Run locally with `python -m http.server 8000` in this directory, then open `http://localhost:8000`.

## Deployment

`main` is connected to the existing Vercel `artss-djs` project. Changes to this branch trigger its normal Git deployment workflow. No Supabase project is required: presets and projects remain in the browser or in files exported by the user.
