# Audio provenance

The sixteen bundled drum one-shots in `samples/kicks`, `samples/snares`, `samples/claps`, `samples/hats`, `samples/percs`, and `samples/cymbals` derive from the CC0-1.0 [octalmusic/octal-samples](https://github.com/octalmusic/octal-samples) house-core pack. Their original paths and filenames are retained.

The four melodic WAV stems in `dist/samples/hooks/` are original renders from `scripts/render-hooks.mjs` created for this project; they contain no third-party recordings. Imported tracks and pad sounds remain on the user's device and are not bundled with the app.

Abyss drum loops and percussion effects in `dist/samples/abyss/` layer those same recorded one-shots; see `scripts/render-abyss.mjs`. The melodic, bass and vocal-named slots are generated instrument/texture renders rather than sampled songs or recorded vocals.
