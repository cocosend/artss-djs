/**
 * Pioneer DJ MixSound Dual-Deck Engine & Controller Architecture
 * Inspired by Pioneer CDJ-3000 / DJM-900NXS2 & Rekordbox iOS
 * Models dual decks, vinyl jog wheels, 3-band isolators, bi-directional filter,
 * multi-mode waveforms, color & time FX, and XY modulation pad.
 */

import {
  synthesizeNightCircuit,
  synthesizeRetroCoast,
  calculateDJFilterState,
  calculateDelaySeconds,
  makeDistortionCurve,
  createSyntheticReverbImpulse,
} from './beatwave-synth.js';

export interface DeckState {
  id: 'A' | 'B';
  title: string;
  artist: string;
  bpm: number;
  originalBpm: number;
  key: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  rate: number;
  pitchOffsetPercent: number; // e.g. +1.2%
  isSync: boolean;
  cueTime: number;
  hotCues: (number | null)[];
  volume: number; // 0 to 1
  eqLow: number;  // -12 to +12 dB
  eqMid: number;  // -12 to +12 dB
  eqHigh: number; // -12 to +12 dB
  filter: number; // 0.0 (LPF) to 0.5 (Flat) to 1.0 (HPF)
  jogAngle: number; // in degrees
  vuLevel: number; // 0.0 to 1.0
  activeMode: 'HOT CUE' | 'LOOP' | 'STEMS' | 'FX';
  loopSize: 0 | 1 | 2 | 4 | 8 | 16;
}

export type FXType = 'riser' | 'echo' | 'phaser' | 'gate';
export type FXCategory = 'build' | 'motion' | 'space';
export type PioneerView = 'wave' | 'decks' | 'mix' | 'fx';

export interface DJState {
  view: PioneerView;
  fxCategory: FXCategory;
  activeFx: FXType | null;
  riserIntensity: number; // 0 to 100
  xyPad: { x: number; y: number; active: boolean };
  crossfader: number; // 0.0 (Deck A) to 1.0 (Deck B)
  masterVolume: number;
  vuMasterLeft: number;
  vuMasterRight: number;
  decks: {
    A: DeckState;
    B: DeckState;
  };
}

export class PioneerDJEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  // Deck Audio Buffers
  private bufferA: AudioBuffer | null = null;
  private bufferB: AudioBuffer | null = null;

  // Deck A Graph
  private sourceA: AudioBufferSourceNode | null = null;
  private eqLowA: BiquadFilterNode | null = null;
  private eqMidA: BiquadFilterNode | null = null;
  private eqHighA: BiquadFilterNode | null = null;
  private filterA: BiquadFilterNode | null = null;
  private gainA: GainNode | null = null;
  private crossGainA: GainNode | null = null;
  private analyserA: AnalyserNode | null = null;
  private startTimeA = 0;
  private pauseOffsetA = 0;

  // Deck B Graph
  private sourceB: AudioBufferSourceNode | null = null;
  private eqLowB: BiquadFilterNode | null = null;
  private eqMidB: BiquadFilterNode | null = null;
  private eqHighB: BiquadFilterNode | null = null;
  private filterB: BiquadFilterNode | null = null;
  private gainB: GainNode | null = null;
  private crossGainB: GainNode | null = null;
  private analyserB: AnalyserNode | null = null;
  private startTimeB = 0;
  private pauseOffsetB = 0;

  // Master Output & Limiter
  private masterSum: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;

  // FX Nodes
  private fxSend: GainNode | null = null;
  private fxReturn: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private xyFilter: BiquadFilterNode | null = null;
  private phaserAllpass: BiquadFilterNode[] = [];
  private gateGain: GainNode | null = null;

  // Listeners & Animation Loop
  private listeners: Set<(state: DJState) => void> = new Set();
  private animFrameId: number | null = null;
  private lastTickTime = performance.now();

  // Internal State
  public state: DJState = {
    view: 'decks',
    fxCategory: 'build',
    activeFx: null,
    riserIntensity: 62.5,
    xyPad: { x: 0.5, y: 0.5, active: false },
    crossfader: 0.5,
    masterVolume: 0.9,
    vuMasterLeft: 0,
    vuMasterRight: 0,
    decks: {
      A: {
        id: 'A',
        title: 'Night Circuit',
        artist: 'ARTSS Live',
        bpm: 124.0,
        originalBpm: 124.0,
        key: 'F#m',
        duration: 61.93,
        currentTime: 0,
        isPlaying: false,
        rate: 1.0,
        pitchOffsetPercent: 0.0,
        isSync: false,
        cueTime: 0,
        hotCues: [0, 15.48, 30.96, 46.45],
        volume: 0.9,
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0,
        filter: 0.5,
        jogAngle: 0,
        vuLevel: 0,
        activeMode: 'HOT CUE',
        loopSize: 0,
      },
      B: {
        id: 'B',
        title: 'Retro Coast',
        artist: 'Pioneer Horizon',
        bpm: 125.0,
        originalBpm: 125.0,
        key: 'Am',
        duration: 61.44,
        currentTime: 0,
        isPlaying: false,
        rate: 1.0,
        pitchOffsetPercent: 0.0,
        isSync: false,
        cueTime: 0,
        hotCues: [0, 15.36, 30.72, 46.08],
        volume: 0.9,
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0,
        filter: 0.5,
        jogAngle: 0,
        vuLevel: 0,
        activeMode: 'HOT CUE',
        loopSize: 0,
      },
    },
  };

  constructor(private existingCtx?: AudioContext) {
    if (existingCtx) {
      this.ctx = existingCtx;
    }
  }

  public subscribe(cb: (state: DJState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.state));
  }

  public async initAudio(): Promise<boolean> {
    if (this.isInitialized && this.ctx && this.ctx.state === 'running') {
      return true;
    }

    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.buildAudioGraph();
      await this.generateStockTracks();

      this.isInitialized = true;
      this.startAnimationLoop();
      this.notify();
      return true;
    } catch (err) {
      console.warn('Pioneer DJ audio init deferred until user gesture:', err);
      return false;
    }
  }

  private buildAudioGraph() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Master sum and limiter
    this.masterSum = this.ctx.createGain();
    this.masterSum.gain.setValueAtTime(this.state.masterVolume, t);

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-2.0, t);
    this.masterLimiter.ratio.setValueAtTime(16, t);
    this.masterLimiter.knee.setValueAtTime(2, t);
    this.masterLimiter.attack.setValueAtTime(0.003, t);
    this.masterLimiter.release.setValueAtTime(0.08, t);

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 128;
    this.masterAnalyser.smoothingTimeConstant = 0.3;

    // XY Master Filter
    this.xyFilter = this.ctx.createBiquadFilter();
    this.xyFilter.type = 'allpass';
    this.xyFilter.frequency.setValueAtTime(20000, t);

    // Master chain: masterSum -> xyFilter -> masterLimiter -> masterAnalyser -> destination
    this.masterSum.connect(this.xyFilter);
    this.xyFilter.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    // Setup Deck A Nodes
    this.eqLowA = this.createEQNode('lowshelf', 110, this.state.decks.A.eqLow);
    this.eqMidA = this.createEQNode('peaking', 1100, this.state.decks.A.eqMid, 0.82);
    this.eqHighA = this.createEQNode('highshelf', 6800, this.state.decks.A.eqHigh);
    this.filterA = this.ctx.createBiquadFilter();
    this.filterA.type = 'allpass';
    this.filterA.frequency.setValueAtTime(20000, t);
    this.gainA = this.ctx.createGain();
    this.gainA.gain.setValueAtTime(this.state.decks.A.volume, t);
    this.crossGainA = this.ctx.createGain();
    this.crossGainA.gain.setValueAtTime(Math.cos(this.state.crossfader * Math.PI * 0.5), t);
    this.analyserA = this.ctx.createAnalyser();
    this.analyserA.fftSize = 64;

    this.eqLowA.connect(this.eqMidA);
    this.eqMidA.connect(this.eqHighA);
    this.eqHighA.connect(this.filterA);
    this.filterA.connect(this.gainA);
    this.gainA.connect(this.crossGainA);
    this.crossGainA.connect(this.analyserA);
    this.analyserA.connect(this.masterSum);

    // Setup Deck B Nodes
    this.eqLowB = this.createEQNode('lowshelf', 110, this.state.decks.B.eqLow);
    this.eqMidB = this.createEQNode('peaking', 1100, this.state.decks.B.eqMid, 0.82);
    this.eqHighB = this.createEQNode('highshelf', 6800, this.state.decks.B.eqHigh);
    this.filterB = this.ctx.createBiquadFilter();
    this.filterB.type = 'allpass';
    this.filterB.frequency.setValueAtTime(20000, t);
    this.gainB = this.ctx.createGain();
    this.gainB.gain.setValueAtTime(this.state.decks.B.volume, t);
    this.crossGainB = this.ctx.createGain();
    this.crossGainB.gain.setValueAtTime(Math.sin(this.state.crossfader * Math.PI * 0.5), t);
    this.analyserB = this.ctx.createAnalyser();
    this.analyserB.fftSize = 64;

    this.eqLowB.connect(this.eqMidB);
    this.eqMidB.connect(this.eqHighB);
    this.eqHighB.connect(this.filterB);
    this.filterB.connect(this.gainB);
    this.gainB.connect(this.crossGainB);
    this.crossGainB.connect(this.analyserB);
    this.analyserB.connect(this.masterSum);

    // FX Chain (Echo Delay)
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(calculateDelaySeconds(124, '1/4'), t);
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.35, t);
    this.fxSend = this.ctx.createGain();
    this.fxSend.gain.setValueAtTime(0.0, t);
    this.fxReturn = this.ctx.createGain();
    this.fxReturn.gain.setValueAtTime(0.4, t);

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.fxReturn);
    this.fxReturn.connect(this.masterSum);

    this.masterSum.connect(this.fxSend);
    this.fxSend.connect(this.delayNode);
  }

  private createEQNode(type: BiquadFilterType, freq: number, gain = 0, q = 0.707): BiquadFilterNode {
    if (!this.ctx) throw new Error('AudioContext missing');
    const node = this.ctx.createBiquadFilter();
    node.type = type;
    node.frequency.setValueAtTime(freq, this.ctx.currentTime);
    node.gain.setValueAtTime(gain, this.ctx.currentTime);
    node.Q.setValueAtTime(q, this.ctx.currentTime);
    return node;
  }

  private async generateStockTracks() {
    if (!this.ctx) return;
    try {
      this.bufferA = await synthesizeNightCircuit(this.ctx);
      this.state.decks.A.duration = this.bufferA.duration;
      this.bufferB = await synthesizeRetroCoast(this.ctx);
      this.state.decks.B.duration = this.bufferB.duration;
    } catch (e) {
      console.warn('Offline synth fallback:', e);
    }
  }

  // MARK: - Deck Playback Controls
  public async playDeck(deckId: 'A' | 'B'): Promise<void> {
    await this.initAudio();
    if (!this.ctx) return;

    const deck = this.state.decks[deckId];
    if (deck.isPlaying) return;

    const buffer = deckId === 'A' ? this.bufferA : this.bufferB;
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(deck.rate, this.ctx.currentTime);
    source.loop = true;

    const targetNode = deckId === 'A' ? this.eqLowA : this.eqLowB;
    if (targetNode) {
      source.connect(targetNode);
    }

    const offset = deck.currentTime % buffer.duration;
    source.start(0, offset);

    if (deckId === 'A') {
      this.sourceA = source;
      this.startTimeA = this.ctx.currentTime - offset / deck.rate;
    } else {
      this.sourceB = source;
      this.startTimeB = this.ctx.currentTime - offset / deck.rate;
    }

    deck.isPlaying = true;
    this.notify();
  }

  public pauseDeck(deckId: 'A' | 'B'): void {
    const deck = this.state.decks[deckId];
    if (!deck.isPlaying) return;

    const source = deckId === 'A' ? this.sourceA : this.sourceB;
    if (source) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    }

    if (deckId === 'A') {
      this.sourceA = null;
    } else {
      this.sourceB = null;
    }

    deck.isPlaying = false;
    this.notify();
  }

  public togglePlay(deckId: 'A' | 'B'): void {
    if (this.state.decks[deckId].isPlaying) {
      this.pauseDeck(deckId);
    } else {
      void this.playDeck(deckId);
    }
  }

  public cueDeck(deckId: 'A' | 'B'): void {
    const deck = this.state.decks[deckId];
    if (deck.isPlaying) {
      this.pauseDeck(deckId);
      deck.currentTime = deck.cueTime;
    } else {
      deck.cueTime = deck.currentTime;
    }
    this.notify();
  }

  public setCueTime(deckId: 'A' | 'B', timeSeconds: number): void {
    const deck = this.state.decks[deckId];
    deck.cueTime = Math.max(0, Math.min(deck.duration, timeSeconds));
    deck.currentTime = deck.cueTime;
    if (deck.isPlaying) {
      this.pauseDeck(deckId);
      void this.playDeck(deckId);
    }
    this.notify();
  }

  public jumpToHotCue(deckId: 'A' | 'B', cueIndex: number): void {
    const deck = this.state.decks[deckId];
    const target = deck.hotCues[cueIndex];
    if (target !== null && target !== undefined) {
      deck.currentTime = target;
      if (deck.isPlaying) {
        this.pauseDeck(deckId);
        void this.playDeck(deckId);
      }
    } else {
      deck.hotCues[cueIndex] = deck.currentTime;
    }
    this.notify();
  }

  public needleDrop(deckId: 'A' | 'B', progressPercent: number): void {
    const deck = this.state.decks[deckId];
    const clamped = Math.max(0, Math.min(1, progressPercent));
    deck.currentTime = clamped * deck.duration;
    if (deck.isPlaying) {
      this.pauseDeck(deckId);
      void this.playDeck(deckId);
    }
    this.notify();
  }

  // MARK: - Pitch / Tempo & Sync
  public setPitch(deckId: 'A' | 'B', offsetPercent: number): void {
    const deck = this.state.decks[deckId];
    const clampedOffset = Math.max(-16, Math.min(16, offsetPercent));
    deck.pitchOffsetPercent = clampedOffset;
    deck.rate = 1.0 + clampedOffset / 100;
    deck.bpm = Math.round(deck.originalBpm * deck.rate * 100) / 100;

    const source = deckId === 'A' ? this.sourceA : this.sourceB;
    if (source && this.ctx) {
      source.playbackRate.setTargetAtTime(deck.rate, this.ctx.currentTime, 0.05);
    }
    this.notify();
  }

  public syncDeck(targetDeckId: 'A' | 'B'): void {
    const target = this.state.decks[targetDeckId];
    const master = this.state.decks[targetDeckId === 'A' ? 'B' : 'A'];

    target.rate = master.bpm / target.originalBpm;
    target.bpm = master.bpm;
    target.pitchOffsetPercent = (target.rate - 1.0) * 100;
    target.isSync = true;

    // Phase alignment
    const beatSec = 60 / master.bpm;
    const masterBeatPhase = master.currentTime % beatSec;
    const targetBeatPhase = target.currentTime % beatSec;
    target.currentTime = target.currentTime - targetBeatPhase + masterBeatPhase;

    const source = targetDeckId === 'A' ? this.sourceA : this.sourceB;
    if (source && this.ctx) {
      source.playbackRate.setValueAtTime(target.rate, this.ctx.currentTime);
    }

    if (target.isPlaying) {
      this.pauseDeck(targetDeckId);
      void this.playDeck(targetDeckId);
    }

    this.notify();
  }

  // MARK: - Mixer Controls & EQs
  public setCrossfader(value: number): void {
    this.state.crossfader = Math.max(0, Math.min(1, value));
    if (this.ctx && this.crossGainA && this.crossGainB) {
      const t = this.ctx.currentTime;
      // Equal-power crossfade curve
      const angle = this.state.crossfader * Math.PI * 0.5;
      this.crossGainA.gain.setTargetAtTime(Math.cos(angle), t, 0.015);
      this.crossGainB.gain.setTargetAtTime(Math.sin(angle), t, 0.015);
    }
    this.notify();
  }

  public setDeckVolume(deckId: 'A' | 'B', volume: number): void {
    const deck = this.state.decks[deckId];
    deck.volume = Math.max(0, Math.min(1.2, volume));
    const gainNode = deckId === 'A' ? this.gainA : this.gainB;
    if (gainNode && this.ctx) {
      gainNode.gain.setTargetAtTime(deck.volume, this.ctx.currentTime, 0.02);
    }
    this.notify();
  }

  public setDeckEQ(deckId: 'A' | 'B', band: 'low' | 'mid' | 'high', gainDb: number): void {
    const deck = this.state.decks[deckId];
    const clamped = Math.max(-12, Math.min(12, gainDb));

    if (band === 'low') deck.eqLow = clamped;
    else if (band === 'mid') deck.eqMid = clamped;
    else deck.eqHigh = clamped;

    const eqNode =
      band === 'low'
        ? deckId === 'A' ? this.eqLowA : this.eqLowB
        : band === 'mid'
        ? deckId === 'A' ? this.eqMidA : this.eqMidB
        : deckId === 'A' ? this.eqHighA : this.eqHighB;

    if (eqNode && this.ctx) {
      eqNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
    this.notify();
  }

  public setDeckFilter(deckId: 'A' | 'B', filterPos: number): void {
    const deck = this.state.decks[deckId];
    deck.filter = Math.max(0, Math.min(1, filterPos));
    const filterState = calculateDJFilterState(deck.filter);
    const filterNode = deckId === 'A' ? this.filterA : this.filterB;

    if (filterNode && this.ctx) {
      const t = this.ctx.currentTime;
      if (filterState.mode === 'flat') {
        filterNode.type = 'allpass';
        filterNode.frequency.setTargetAtTime(20000, t, 0.02);
      } else if (filterState.mode === 'lowpass') {
        filterNode.type = 'lowpass';
        filterNode.frequency.setTargetAtTime(filterState.frequency, t, 0.02);
        filterNode.Q.setTargetAtTime(filterState.resonanceQ, t, 0.02);
      } else {
        filterNode.type = 'highpass';
        filterNode.frequency.setTargetAtTime(filterState.frequency, t, 0.02);
        filterNode.Q.setTargetAtTime(filterState.resonanceQ, t, 0.02);
      }
    }
    this.notify();
  }

  // MARK: - Jog Wheel Physics & Scratching
  public rotateJog(deckId: 'A' | 'B', deltaAngleDeg: number): void {
    const deck = this.state.decks[deckId];
    deck.jogAngle = (deck.jogAngle + deltaAngleDeg) % 360;

    // Small scratch scrub
    const scrubSec = (deltaAngleDeg / 360) * 0.45;
    deck.currentTime = Math.max(0, Math.min(deck.duration, deck.currentTime + scrubSec));

    if (this.ctx && deck.isPlaying) {
      const source = deckId === 'A' ? this.sourceA : this.sourceB;
      if (source) {
        const scratchPitch = Math.max(0.2, Math.min(2.5, deck.rate + deltaAngleDeg * 0.05));
        source.playbackRate.setValueAtTime(scratchPitch, this.ctx.currentTime);
        source.playbackRate.setTargetAtTime(deck.rate, this.ctx.currentTime + 0.04, 0.06);
      }
    }
    this.notify();
  }

  // MARK: - Color & Time FX Rack
  public triggerFX(fx: FXType): void {
    if (this.state.activeFx === fx) {
      this.state.activeFx = null;
      if (this.fxSend && this.ctx) {
        this.fxSend.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
    } else {
      this.state.activeFx = fx;
      if (this.ctx) {
        const t = this.ctx.currentTime;
        if (fx === 'echo' && this.fxSend) {
          this.fxSend.gain.setTargetAtTime(0.7, t, 0.02);
        } else if (fx === 'riser') {
          this.triggerRiserBurst();
        }
      }
    }
    this.notify();
  }

  private triggerRiserBurst() {
    if (!this.ctx || !this.masterSum) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 1.8);

    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(400, t);
    filt.frequency.exponentialRampToValueAtTime(6000, t + 1.8);
    filt.Q.setValueAtTime(4.0, t);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime((this.state.riserIntensity / 100) * 0.45, t + 1.6);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);

    osc.connect(filt).connect(gain).connect(this.masterSum);
    osc.start(t);
    osc.stop(t + 2.1);
  }

  public setXY(x: number, y: number, active: boolean): void {
    this.state.xyPad = {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      active,
    };

    if (this.xyFilter && this.ctx) {
      const t = this.ctx.currentTime;
      if (!active) {
        this.xyFilter.type = 'allpass';
        this.xyFilter.frequency.setTargetAtTime(20000, t, 0.05);
      } else {
        // X maps to frequency 120Hz to 16000Hz
        const freq = 120 * Math.pow(16000 / 120, this.state.xyPad.x);
        // Y maps to resonance Q 1.0 to 12.0
        const q = 1.0 + this.state.xyPad.y * 11.0;
        this.xyFilter.type = this.state.xyPad.x < 0.5 ? 'lowpass' : 'highpass';
        this.xyFilter.frequency.setTargetAtTime(freq, t, 0.02);
        this.xyFilter.Q.setTargetAtTime(q, t, 0.02);
      }
    }
    this.notify();
  }

  public setView(view: PioneerView): void {
    this.state.view = view;
    this.notify();
  }

  public setFXCategory(cat: FXCategory): void {
    this.state.fxCategory = cat;
    this.notify();
  }

  // MARK: - Custom Audio File Loader
  public async loadCustomTrack(deckId: 'A' | 'B', file: File): Promise<void> {
    await this.initAudio();
    if (!this.ctx) return;

    const arrayBuf = await file.arrayBuffer();
    const audioBuf = await this.ctx.decodeAudioData(arrayBuf);

    if (deckId === 'A') {
      this.bufferA = audioBuf;
    } else {
      this.bufferB = audioBuf;
    }

    const deck = this.state.decks[deckId];
    deck.title = file.name.replace(/\.[^/.]+$/, '');
    deck.duration = audioBuf.duration;
    deck.currentTime = 0;
    deck.hotCues = [0, audioBuf.duration * 0.25, audioBuf.duration * 0.5, audioBuf.duration * 0.75];

    if (deck.isPlaying) {
      this.pauseDeck(deckId);
      void this.playDeck(deckId);
    }
    this.notify();
  }

  // Animation & Metering Loop
  private startAnimationLoop() {
    const loop = () => {
      const now = performance.now();
      const dt = (now - this.lastTickTime) / 1000;
      this.lastTickTime = now;

      // Update Deck A time & rotation
      if (this.state.decks.A.isPlaying && this.ctx) {
        this.state.decks.A.currentTime = (this.state.decks.A.currentTime + dt * this.state.decks.A.rate) % this.state.decks.A.duration;
        this.state.decks.A.jogAngle = (this.state.decks.A.jogAngle + (this.state.decks.A.bpm / 60) * 360 * dt * 0.5) % 360;
      }

      // Update Deck B time & rotation
      if (this.state.decks.B.isPlaying && this.ctx) {
        this.state.decks.B.currentTime = (this.state.decks.B.currentTime + dt * this.state.decks.B.rate) % this.state.decks.B.duration;
        this.state.decks.B.jogAngle = (this.state.decks.B.jogAngle + (this.state.decks.B.bpm / 60) * 360 * dt * 0.5) % 360;
      }

      // Update Real-time VU Levels from Analysers
      if (this.analyserA) {
        const dataA = new Uint8Array(16);
        this.analyserA.getByteFrequencyData(dataA);
        const maxA = Math.max(...dataA);
        this.state.decks.A.vuLevel = Math.max(0, maxA / 255);
      }
      if (this.analyserB) {
        const dataB = new Uint8Array(16);
        this.analyserB.getByteFrequencyData(dataB);
        const maxB = Math.max(...dataB);
        this.state.decks.B.vuLevel = Math.max(0, maxB / 255);
      }
      if (this.masterAnalyser) {
        const dataM = new Uint8Array(32);
        this.masterAnalyser.getByteFrequencyData(dataM);
        const maxM = Math.max(...dataM) / 255;
        this.state.vuMasterLeft = maxM;
        this.state.vuMasterRight = Math.min(1.0, maxM * 0.96 + Math.random() * 0.05);
      }

      this.notify();
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  public destroy() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.pauseDeck('A');
    this.pauseDeck('B');
  }
}

export const pioneerDJ = new PioneerDJEngine();
