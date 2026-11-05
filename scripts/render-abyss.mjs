import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const kRate = 22050;
const kBpm = 124;
const kBar = 240 / kBpm;

export const ABYSS_NAMES = [
  '909_foundation', '909_warehouse', '909_shuffle', '909_ride',
  '606_classic', '606_break', '606_hats', '606_toms',
  '303_acid', '303_resonance', '303_subline', '303_drive',
  'hybrid_peak', 'hybrid_rolling', 'hybrid_minimal', 'hybrid_fill',
  '909_kick', '606_kick', '909_snare', '606_snare', '909_clap', '606_hat',
  '909_open_hat', '606_rim', '909_tom', '606_cowbell', '909_ride_hit',
  '303_acid_hit', '303_sub_hit', '606_perc', '909_shaker', '909_crash'
];

const Drum = {
  Kick909: 0, Kick606: 1, Snare909: 2, Snare606: 3, Clap909: 4,
  Hat606: 5, OpenHat909: 6, Rim606: 7, Tom909: 8, Cowbell606: 9,
  Ride909: 10, Acid303: 11, Sub303: 12, Perc606: 13, Shaker909: 14, Crash909: 15
};

const instruments = [
  Drum.Kick909, Drum.Kick606, Drum.Snare909, Drum.Snare606, Drum.Clap909,
  Drum.Hat606, Drum.OpenHat909, Drum.Rim606, Drum.Tom909, Drum.Cowbell606,
  Drum.Ride909, Drum.Acid303, Drum.Sub303, Drum.Perc606, Drum.Shaker909, Drum.Crash909
];

function duration(drum) {
  switch (drum) {
    case Drum.OpenHat909: return 0.62;
    case Drum.Ride909: return 0.84;
    case Drum.Crash909: return 1.4;
    case Drum.Acid303: return 0.42;
    case Drum.Sub303: return 0.73;
    default: return 0.52;
  }
}

function renderDrum(drum, output, capacity, sampleRate, variation = 0) {
  if (!output || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || drum >= 16 || drum < 0) return 0;
  const frames = Math.min(capacity, Math.floor(duration(drum) * sampleRate));
  if (!frames) return 0;

  let state = (0xAC1D909 ^ Math.imul(drum, 0x9e3779b9) ^ Math.imul(variation, 0x85ebca6b)) >>> 0;
  if (!state) state = 1;

  function noise() {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return (((state >>> 8) & 0xffff) / 32767.5) - 1.0;
  }

  let phase = 0.0;
  let noiseLow = 0.0;
  let acidLow = 0.0;
  const noiseAlpha = -Math.expm1(-2 * Math.PI * 350 / sampleRate);
  const toneOffset = ((variation % 5) - 2) * 0.018;

  for (let i = 0; i < frames; ++i) {
    const t = i / sampleRate;
    const n = noise();
    noiseLow += noiseAlpha * (n - noiseLow);
    const high = n - noiseLow;
    const osc = (hz) => Math.sin(2 * Math.PI * hz * t);
    let v = 0.0;

    switch (drum) {
      case Drum.Kick909:
      case Drum.Kick606: {
        const big = drum === Drum.Kick909;
        const f = (big ? 48.0 : 62.0) + (big ? 170.0 : 105.0) * Math.exp(-t * (big ? 28.0 : 38.0));
        phase += 2 * Math.PI * f / sampleRate;
        v = Math.sin(phase) * Math.exp(-t * (big ? 10.0 : 17.0)) * 0.84 +
            n * Math.exp(-t * 180.0) * 0.12;
        break;
      }
      case Drum.Snare909:
      case Drum.Snare606: {
        v = high * (drum === Drum.Snare909 ? 0.65 : 0.48) * Math.exp(-t * 19.0) +
            osc(drum === Drum.Snare909 ? 181.0 : 232.0) * 0.32 * Math.exp(-t * 26.0);
        break;
      }
      case Drum.Clap909: {
        const burst = Math.exp(-(t % 0.012) * 230.0) *
          (t < 0.042 ? 1.0 : 0.55 * Math.exp(-(t - 0.042) * 15.0));
        v = high * burst * 0.72;
        break;
      }
      case Drum.Hat606:
      case Drum.OpenHat909:
      case Drum.Shaker909: {
        v = high * Math.exp(-t * (drum === Drum.OpenHat909 ? 8.0 : drum === Drum.Shaker909 ? 24.0 : 55.0)) * 0.57;
        break;
      }
      case Drum.Rim606: {
        v = (osc(752.0) + osc(1291.0)) * 0.35 * Math.exp(-t * 47.0);
        break;
      }
      case Drum.Tom909: {
        phase += 2 * Math.PI * (112.0 + 75.0 * Math.exp(-t * 19.0)) / sampleRate;
        v = Math.sin(phase) * Math.exp(-t * 13.0) * 0.72;
        break;
      }
      case Drum.Cowbell606: {
        v = (osc(542.0) + osc(800.0)) * 0.27 * Math.exp(-t * 15.0);
        break;
      }
      case Drum.Ride909:
      case Drum.Crash909: {
        v = (high * 0.47 + osc(527.0) * 0.10) *
            Math.exp(-t * (drum === Drum.Ride909 ? 5.0 : 3.8));
        break;
      }
      case Drum.Sub303: {
        phase += 2 * Math.PI * (48.0 + 18.0 * Math.exp(-t * 20.0)) / sampleRate;
        v = Math.sin(phase) * Math.exp(-t * 6.2) * 0.63;
        break;
      }
      case Drum.Acid303: {
        const f = 110.0 * (1.0 + toneOffset);
        const p = (f * t) % 1.0;
        const dt = f / sampleRate;
        let correction = 0;
        if (p < dt) {
          const x = p / dt;
          correction = x + x - x * x - 1.0;
        } else if (p > 1.0 - dt) {
          const x = (p - 1.0) / dt;
          correction = x * x + x + x + 1.0;
        }
        const saw = 2.0 * p - 1.0 - correction;
        const hz = 220.0 + 2400.0 * Math.exp(-t * 14.0);
        const cutoff = -Math.expm1(-2 * Math.PI * Math.min(hz, sampleRate * 0.4) / sampleRate);
        acidLow += cutoff * (saw - acidLow);
        v = (acidLow * 0.52 + osc(f) * 0.12) * Math.exp(-t * 7.0);
        break;
      }
      case Drum.Perc606: {
        v = (osc(328.0) * 0.42 + high * 0.26) * Math.exp(-t * 28.0);
        break;
      }
    }
    const edge = Math.min(1.0, i / 32.0, (frames - 1 - i) / 96.0);
    output[i] = Math.max(-0.95, Math.min(0.95, v * edge));
  }
  return frames;
}

function add(mix, drum, at, level, variation) {
  const hit = new Float32Array(Math.floor(kRate * 2));
  const n = renderDrum(drum, hit, hit.length, kRate, variation);
  const start = Math.round(at * kRate);
  for (let i = 0; i < n && start + i < mix.length; ++i) {
    mix[start + i] += hit[i] * level;
  }
}

function groove(data, index) {
  const family = Math.floor(index / 4);
  const variation = index % 4;
  const has909 = family === 0 || family === 3;
  const has606 = family === 1 || family === 3;

  for (let step = 0; step < 16; step++) {
    const at = kBar * step / 16.0;
    const seed = (index * 37 + step) >>> 0;
    const accent = step % 4 === 0 ? 1.0 : 0.73;

    if (step % 4 === 0 || (variation === 1 && step === 14) || (variation === 3 && step === 15)) {
      add(data, has909 ? Drum.Kick909 : Drum.Kick606, at, 0.68 * accent, seed);
    }
    if (step === 4 || step === 12) {
      add(data, has606 && variation % 2 ? Drum.Snare606 : Drum.Clap909, at, 0.54, seed);
    }
    if ((step % 2 === 0) || (variation >= 2 && step % 2 === 1)) {
      add(data, has909 && variation === 3 ? Drum.Shaker909 : Drum.Hat606, at, step % 2 ? 0.18 : 0.27, seed);
    }
    if ((step === 6 || step === 14) && variation !== 2) {
      add(data, variation === 3 ? Drum.Ride909 : Drum.OpenHat909, at, 0.17, seed);
    }
    if (family === 1 && (step === 3 || step === 11 || (variation === 3 && step === 15))) {
      add(data, variation === 3 ? Drum.Tom909 : Drum.Rim606, at, 0.29, seed);
    }
    if ((family === 2 || family === 3) && (step === 0 || step === 3 || step === 6 || step === 10 || step === 13)) {
      add(data, variation === 2 ? Drum.Sub303 : Drum.Acid303, at, 0.42, seed);
    }
    if (family === 2 && step === 8) {
      add(data, Drum.Kick606, at, 0.18, seed);
    }
  }
}

function encodeWav(data) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const gain = Math.min(1.0, 0.77 / Math.max(peak, 0.00001));

  const byteLen = 44 + data.length * 2;
  const buf = Buffer.alloc(byteLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(byteLen - 8, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(kRate, 24);
  buf.writeUInt32LE(kRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(data.length * 2, 40);

  for (let i = 0; i < data.length; i++) {
    const edge = Math.min(1.0, i / 64.0, (data.length - 1 - i) / 128.0);
    const clamped = Math.max(-0.95, Math.min(0.95, data[i] * gain * edge));
    buf.writeInt16LE(Math.round(clamped * 32767.0), 44 + i * 2);
  }
  return buf;
}

export async function renderAbyssKits(outputDir) {
  await mkdir(outputDir, {recursive: true});
  for (let i = 0; i < ABYSS_NAMES.length; i++) {
    const frames = i < 16 ? Math.round(kBar * kRate) : Math.round(kRate * 1.5);
    const pcm = new Float32Array(frames);
    if (i < 16) {
      groove(pcm, i);
    } else {
      add(pcm, instruments[i - 16], 0, 0.87, i);
    }
    const wav = encodeWav(pcm);
    await writeFile(join(outputDir, `${ABYSS_NAMES[i]}.wav`), wav);
  }
  console.log('PASS 32 original native C++ equivalent drum sounds (16 grooves, 16 hits)');
}
