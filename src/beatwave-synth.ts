/**
 * Beatwave DSP Synthesizer & Offline Audio Generator
 * Extracted and optimized from Beatwave Hard Techno Web Audio Engine
 * Zero external asset dependencies - generates pristine 44.1kHz stereo club audio.
 */

export interface DJFilterState {
  mode: 'flat' | 'lowpass' | 'highpass';
  frequency: number;
  resonanceQ: number;
}

export function normalizedToLogHz(normalized: number, minHz = 20, maxHz = 20000): number {
  const clamped = Math.max(0, Math.min(1, normalized));
  return Math.round(minHz * Math.pow(maxHz / minHz, clamped));
}

export function calculateDJFilterState(sliderPos: number, resonanceQ = 2.0): DJFilterState {
  const deadband = 0.02;
  if (Math.abs(sliderPos - 0.5) <= deadband) {
    return { mode: 'flat', frequency: 20000, resonanceQ: 0.7 };
  }
  if (sliderPos < 0.5) {
    const norm = sliderPos / (0.5 - deadband);
    return { mode: 'lowpass', frequency: normalizedToLogHz(norm, 30, 20000), resonanceQ };
  }
  const norm = (sliderPos - (0.5 + deadband)) / (0.5 - deadband);
  return { mode: 'highpass', frequency: normalizedToLogHz(norm, 20, 16000), resonanceQ };
}

export function makeDistortionCurve(drive: number, nSamples = 4096): Float32Array {
  const curve = new Float32Array(nSamples);
  const k = Math.max(0, drive);
  if (k === 0) {
    for (let i = 0; i < nSamples; i++) curve[i] = (i * 2) / nSamples - 1;
    return curve;
  }
  const driveFactor = 1 + k * 0.1;
  for (let i = 0; i < nSamples; i++) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = Math.tanh(x * driveFactor);
  }
  return curve;
}

export function calculateDelaySeconds(bpm: number, division: '1/2' | '1/4' | '1/8' | '1/8T' | '1/16'): number {
  const beatSec = 60 / bpm;
  switch (division) {
    case '1/2': return beatSec * 2;
    case '1/4': return beatSec;
    case '1/8': return beatSec * 0.5;
    case '1/8T': return (beatSec * 0.5) * (2 / 3);
    case '1/16': return beatSec * 0.25;
    default: return beatSec;
  }
}

export function createSyntheticReverbImpulse(ctx: BaseAudioContext, durationSec = 1.8, decay = 2.5): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = i / length;
    const factor = Math.exp(-n * decay);
    left[i] = (Math.random() * 2 - 1) * factor;
    right[i] = (Math.random() * 2 - 1) * factor;
  }
  return impulse;
}

/** Synthesize Deck A track: "Night Circuit" (124.00 BPM, F# minor, 32 bars) */
export async function synthesizeNightCircuit(ctx: BaseAudioContext): Promise<AudioBuffer> {
  const bpm = 124;
  const bars = 32;
  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * 4;
  const totalDuration = bars * secPerBar;
  const sampleRate = 44100;
  const length = Math.ceil(totalDuration * sampleRate);
  const offline = new OfflineAudioContext(2, length, sampleRate);

  const master = offline.createGain();
  master.gain.value = 0.82;
  master.connect(offline.destination);

  // Reverb bus
  const convolver = offline.createConvolver();
  convolver.buffer = createSyntheticReverbImpulse(offline, 1.6, 2.8);
  const reverbGain = offline.createGain();
  reverbGain.gain.value = 0.18;
  convolver.connect(reverbGain).connect(master);

  // Delay bus
  const delay = offline.createDelay(1.0);
  delay.delayTime.value = calculateDelaySeconds(bpm, '1/8');
  const delayFeedback = offline.createGain();
  delayFeedback.gain.value = 0.32;
  const delayGain = offline.createGain();
  delayGain.gain.value = 0.15;
  delay.connect(delayFeedback).connect(delay);
  delay.connect(delayGain).connect(master);

  // Acid notes in F# Minor: F#1 (46.25), A1 (55.0), B1 (61.74), C#2 (69.3), E2 (82.4)
  const acidNotes = [46.25, 46.25, 55.0, 46.25, 61.74, 55.0, 41.2, 46.25, 69.3, 61.74, 55.0, 46.25, 82.4, 69.3, 55.0, 41.2];

  for (let bar = 0; bar < bars; bar++) {
    const barTime = bar * secPerBar;
    const isBreak = (bar >= 12 && bar < 16) || (bar >= 28 && bar < 30);
    const isDrop = bar === 16 || bar === 30;

    // 1. Kick & Rumble (Quarter notes)
    for (let beat = 0; beat < 4; beat++) {
      const beatTime = barTime + beat * secPerBeat;

      if (!isBreak || (bar === 15 && beat >= 2)) {
        // 909 Kick: 155 Hz -> 42 Hz pitch drop
        const kickOsc = offline.createOscillator();
        const kickGain = offline.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(155, beatTime);
        kickOsc.frequency.exponentialRampToValueAtTime(42, beatTime + 0.08);
        kickGain.gain.setValueAtTime(0.85, beatTime);
        kickGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.28);
        kickOsc.connect(kickGain).connect(master);
        kickOsc.start(beatTime);
        kickOsc.stop(beatTime + 0.3);

        // Sub Rumble
        const subOsc = offline.createOscillator();
        const subGain = offline.createGain();
        const subFilter = offline.createBiquadFilter();
        subOsc.type = 'triangle';
        subOsc.frequency.setValueAtTime(38, beatTime);
        subFilter.type = 'lowpass';
        subFilter.frequency.setValueAtTime(95, beatTime);
        subGain.gain.setValueAtTime(0.05, beatTime);
        subGain.gain.linearRampToValueAtTime(0.42, beatTime + 0.12);
        subGain.gain.exponentialRampToValueAtTime(0.01, beatTime + 0.38);
        subOsc.connect(subFilter).connect(subGain).connect(master);
        subOsc.start(beatTime);
        subOsc.stop(beatTime + 0.4);
      }

      // Claps on beats 2 and 4
      if ((beat === 1 || beat === 3) && (!isBreak || bar === 15)) {
        const clapBuf = offline.createBuffer(1, Math.floor(sampleRate * 0.12), sampleRate);
        const data = clapBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const clapSrc = offline.createBufferSource();
        clapSrc.buffer = clapBuf;
        const clapFilt = offline.createBiquadFilter();
        clapFilt.type = 'bandpass';
        clapFilt.frequency.setValueAtTime(1200, beatTime);
        clapFilt.Q.setValueAtTime(1.8, beatTime);
        const clapGain = offline.createGain();
        clapGain.gain.setValueAtTime(0.38, beatTime);
        clapGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.12);
        clapSrc.connect(clapFilt).connect(clapGain).connect(master);
        clapGain.connect(convolver);
        clapSrc.start(beatTime);
      }
    }

    // 2. Hats (16th notes)
    const secPer16th = secPerBeat / 4;
    for (let step = 0; step < 16; step++) {
      const stepTime = barTime + step * secPer16th;
      const isOffbeat = step % 4 === 2;
      const isGhost = step % 2 === 1;

      if ((isOffbeat || (isGhost && bar % 2 === 1)) && (!isBreak || bar >= 14)) {
        const hatBuf = offline.createBuffer(1, Math.floor(sampleRate * 0.05), sampleRate);
        const data = hatBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const hatSrc = offline.createBufferSource();
        hatSrc.buffer = hatBuf;
        const hatFilt = offline.createBiquadFilter();
        hatFilt.type = 'highpass';
        hatFilt.frequency.setValueAtTime(7000, stepTime);
        const hatGain = offline.createGain();
        hatGain.gain.setValueAtTime(isOffbeat ? 0.28 : 0.12, stepTime);
        hatGain.gain.exponentialRampToValueAtTime(0.001, stepTime + 0.045);
        hatSrc.connect(hatFilt).connect(hatGain).connect(master);
        hatSrc.start(stepTime);
      }

      // 3. Acid 303 sequence
      const noteFreq = acidNotes[step % acidNotes.length]!;
      const isAccent = step % 4 === 0 || step === 10;
      if (step % 2 === 0 || isAccent) {
        const osc = offline.createOscillator();
        const filt = offline.createBiquadFilter();
        const gain = offline.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(noteFreq * (bar >= 16 ? 2 : 1), stepTime);
        filt.type = 'lowpass';
        const cutoff = isAccent ? 2400 : 900;
        filt.frequency.setValueAtTime(cutoff, stepTime);
        filt.frequency.exponentialRampToValueAtTime(180, stepTime + (isAccent ? 0.22 : 0.12));
        filt.Q.setValueAtTime(isAccent ? 7.0 : 4.5, stepTime);
        gain.gain.setValueAtTime(isAccent ? 0.35 : 0.22, stepTime);
        gain.gain.exponentialRampToValueAtTime(0.001, stepTime + 0.24);

        osc.connect(filt).connect(gain).connect(master);
        gain.connect(delay);
        osc.start(stepTime);
        osc.stop(stepTime + 0.25);
      }
    }

    // 4. Industrial Noise Swell & Riser
    if (bar === 15 || bar === 31) {
      const swellOsc = offline.createOscillator();
      const swellFilt = offline.createBiquadFilter();
      const swellGain = offline.createGain();
      swellOsc.type = 'sawtooth';
      swellOsc.frequency.setValueAtTime(110, barTime);
      swellOsc.frequency.exponentialRampToValueAtTime(880, barTime + secPerBar);
      swellFilt.type = 'bandpass';
      swellFilt.frequency.setValueAtTime(300, barTime);
      swellFilt.frequency.exponentialRampToValueAtTime(6000, barTime + secPerBar);
      swellFilt.Q.setValueAtTime(3.5, barTime);
      swellGain.gain.setValueAtTime(0.01, barTime);
      swellGain.gain.linearRampToValueAtTime(0.35, barTime + secPerBar * 0.9);
      swellGain.gain.exponentialRampToValueAtTime(0.001, barTime + secPerBar);
      swellOsc.connect(swellFilt).connect(swellGain).connect(master);
      swellGain.connect(convolver);
      swellOsc.start(barTime);
      swellOsc.stop(barTime + secPerBar);
    }
  }

  return offline.startRendering();
}

/** Synthesize Deck B track: "Retro Coast" (125.00 BPM, A minor, 32 bars) */
export async function synthesizeRetroCoast(ctx: BaseAudioContext): Promise<AudioBuffer> {
  const bpm = 125;
  const bars = 32;
  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * 4;
  const totalDuration = bars * secPerBar;
  const sampleRate = 44100;
  const length = Math.ceil(totalDuration * sampleRate);
  const offline = new OfflineAudioContext(2, length, sampleRate);

  const master = offline.createGain();
  master.gain.value = 0.82;
  master.connect(offline.destination);

  // Lush space reverb
  const convolver = offline.createConvolver();
  convolver.buffer = createSyntheticReverbImpulse(offline, 2.2, 2.0);
  const reverbGain = offline.createGain();
  reverbGain.gain.value = 0.24;
  convolver.connect(reverbGain).connect(master);

  // Ping-pong delay
  const delay = offline.createDelay(1.0);
  delay.delayTime.value = calculateDelaySeconds(bpm, '1/4');
  const delayFeedback = offline.createGain();
  delayFeedback.gain.value = 0.35;
  const delayGain = offline.createGain();
  delayGain.gain.value = 0.18;
  delay.connect(delayFeedback).connect(delay);
  delay.connect(delayGain).connect(master);

  // Chord progression: Am -> F -> C -> G
  const chordRoots = [55.0, 43.65, 65.4, 49.0]; // A1, F1, C2, G1
  const chordTriads = [
    [220.0, 261.63, 329.63], // Am (A3, C4, E4)
    [174.61, 220.0, 261.63], // F (F3, A3, C4)
    [261.63, 329.63, 392.0], // C (C4, E4, G4)
    [196.0, 246.94, 293.66], // G (G3, B3, D4)
  ];

  for (let bar = 0; bar < bars; bar++) {
    const barTime = bar * secPerBar;
    const chordIndex = Math.floor(bar / 2) % 4;
    const rootFreq = chordRoots[chordIndex]!;
    const triad = chordTriads[chordIndex]!;

    // 1. Kick on all 4 beats
    for (let beat = 0; beat < 4; beat++) {
      const beatTime = barTime + beat * secPerBeat;
      const kickOsc = offline.createOscillator();
      const kickGain = offline.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(140, beatTime);
      kickOsc.frequency.exponentialRampToValueAtTime(48, beatTime + 0.09);
      kickGain.gain.setValueAtTime(0.82, beatTime);
      kickGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.32);
      kickOsc.connect(kickGain).connect(master);
      kickOsc.start(beatTime);
      kickOsc.stop(beatTime + 0.35);

      // Snare / Clap on 2 & 4
      if (beat === 1 || beat === 3) {
        const snareBuf = offline.createBuffer(1, Math.floor(sampleRate * 0.15), sampleRate);
        const data = snareBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const snareSrc = offline.createBufferSource();
        snareSrc.buffer = snareBuf;
        const snareFilt = offline.createBiquadFilter();
        snareFilt.type = 'highpass';
        snareFilt.frequency.setValueAtTime(1600, beatTime);
        const snareGain = offline.createGain();
        snareGain.gain.setValueAtTime(0.32, beatTime);
        snareGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.14);
        snareSrc.connect(snareFilt).connect(snareGain).connect(master);
        snareGain.connect(convolver);
        snareSrc.start(beatTime);
      }
    }

    // 2. Rolling 80s bassline (16th notes)
    const secPer16th = secPerBeat / 4;
    for (let step = 0; step < 16; step++) {
      const stepTime = barTime + step * secPer16th;
      const bassOsc = offline.createOscillator();
      const bassFilt = offline.createBiquadFilter();
      const bassGain = offline.createGain();

      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(rootFreq * (step % 4 === 3 ? 2 : 1), stepTime);
      bassFilt.type = 'lowpass';
      bassFilt.frequency.setValueAtTime(750, stepTime);
      bassFilt.frequency.exponentialRampToValueAtTime(220, stepTime + 0.1);
      bassFilt.Q.setValueAtTime(3.0, stepTime);
      bassGain.gain.setValueAtTime(0.32, stepTime);
      bassGain.gain.exponentialRampToValueAtTime(0.001, stepTime + 0.11);

      bassOsc.connect(bassFilt).connect(bassGain).connect(master);
      bassOsc.start(stepTime);
      bassOsc.stop(stepTime + 0.12);

      // Offbeat Hi-Hats
      if (step % 4 === 2) {
        const hatBuf = offline.createBuffer(1, Math.floor(sampleRate * 0.07), sampleRate);
        const data = hatBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const hatSrc = offline.createBufferSource();
        hatSrc.buffer = hatBuf;
        const hatFilt = offline.createBiquadFilter();
        hatFilt.type = 'highpass';
        hatFilt.frequency.setValueAtTime(6500, stepTime);
        const hatGain = offline.createGain();
        hatGain.gain.setValueAtTime(0.24, stepTime);
        hatGain.gain.exponentialRampToValueAtTime(0.001, stepTime + 0.06);
        hatSrc.connect(hatFilt).connect(hatGain).connect(master);
        hatSrc.start(stepTime);
      }
    }

    // 3. Lush Synth Pad Chords (every 2 bars)
    if (bar % 2 === 0) {
      triad.forEach((freq) => {
        const padOsc = offline.createOscillator();
        const padFilt = offline.createBiquadFilter();
        const padGain = offline.createGain();
        padOsc.type = 'sawtooth';
        padOsc.frequency.setValueAtTime(freq, barTime);
        padFilt.type = 'lowpass';
        padFilt.frequency.setValueAtTime(1400, barTime);
        padGain.gain.setValueAtTime(0.01, barTime);
        padGain.gain.linearRampToValueAtTime(0.12, barTime + 0.4);
        padGain.gain.setValueAtTime(0.12, barTime + secPerBar * 2 - 0.4);
        padGain.gain.linearRampToValueAtTime(0.001, barTime + secPerBar * 2);

        padOsc.connect(padFilt).connect(padGain).connect(master);
        padGain.connect(convolver);
        padGain.connect(delay);
        padOsc.start(barTime);
        padOsc.stop(barTime + secPerBar * 2);
      });
    }
  }

  return offline.startRendering();
}
