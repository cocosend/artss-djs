export const TRACKS = [
    { id: 'kick', name: 'KICK', kind: 'kick', tone: 0 }, { id: 'clap', name: 'CLAP', kind: 'clap', tone: 0 },
    { id: 'hat', name: 'CLOSED HAT', kind: 'hat', tone: 0 }, { id: 'snare', name: 'SNARE', kind: 'snare', tone: 0 },
    { id: 'sub', name: 'SUB', kind: 'bass', tone: -12 }, { id: 'oh', name: 'OPEN HAT', kind: 'hat', tone: 1 },
    { id: 'rim', name: 'RIM', kind: 'perc', tone: 1 }, { id: 'bass', name: 'BASS', kind: 'bass', tone: 0 },
    { id: 'tom', name: 'LOW TOM', kind: 'perc', tone: -5 }, { id: 'shaker', name: 'SHAKER', kind: 'hat', tone: 2 },
    { id: 'perc', name: 'PERC', kind: 'perc', tone: 3 }, { id: 'kick2', name: 'KICK 2', kind: 'kick', tone: 1 },
    { id: 'stab', name: 'STAB', kind: 'bass', tone: 7 }, { id: 'click', name: 'CLICK', kind: 'perc', tone: 8 },
    { id: 'ride', name: 'RIDE', kind: 'hat', tone: 3 }, { id: 'fx', name: 'IMPACT', kind: 'fx', tone: -12 },
];
export const GENRES = ['RAW TECHNO', 'HARDGROOVE', 'DEEP MINIMAL', 'WAREHOUSE', 'PHONK', 'RAVE'];
const clip = (x, a, b) => Math.max(a, Math.min(b, x));
function rand(seed) { let x = seed | 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296 * 2 - 1; }; }
export function presetPattern(genre) {
    const out = TRACKS.map(() => Array(16).fill(0));
    const at = (row, indices, velocity) => { for (const step of indices)
        out[row][step] = velocity; };
    const hard = genre === 'WAREHOUSE' || genre === 'RAW TECHNO';
    if (genre === 'PHONK') {
        at(0, [0, 6, 10], .92);
        at(3, [4, 12], .7);
        at(2, [2, 6, 10, 14], .30);
        at(4, [0, 7, 10, 14], .68);
        at(7, [0, 3, 7, 11, 14], .63);
        at(6, [5, 13], .42);
        at(9, [3, 7, 11, 15], .18);
    }
    else if (genre === 'HARDGROOVE') {
        at(0, [0, 4, 8, 12], .94);
        at(1, [4, 12], .6);
        at(2, [1, 3, 5, 7, 9, 11, 13, 15], .30);
        at(5, [2, 6, 10, 14], .31);
        at(6, [3, 7, 11, 15], .40);
        at(8, [2, 10], .38);
        at(7, [0, 3, 6, 11, 14], .58);
        at(9, [4, 12], .18);
        at(10, [1, 9], .30);
    }
    else if (genre === 'DEEP MINIMAL') {
        at(0, [0, 4, 8, 12], .82);
        at(1, [12], .42);
        at(2, [2, 6, 10, 14], .16);
        at(5, [6, 14], .24);
        at(4, [0, 7, 10], .63);
        at(7, [3, 11], .42);
        at(6, [15], .24);
    }
    else if (genre === 'RAVE') {
        at(0, [0, 4, 8, 12], .95);
        at(1, [4, 12], .72);
        at(2, [2, 6, 10, 14], .30);
        at(5, [6, 14], .46);
        at(7, [0, 4, 8, 11, 12], .60);
        at(12, [0, 8], .32);
        at(3, [12, 14, 15], .36);
        at(14, [7, 15], .17);
    }
    else {
        at(0, [0, 4, 8, 12], hard ? .97 : .92);
        at(1, [4, 12], .62);
        at(2, genre === 'WAREHOUSE' ? [1, 3, 5, 7, 9, 11, 13, 15] : [2, 6, 10, 14], .26);
        at(5, [6, 14], .28);
        at(4, [0, 7, 10, 14], .55);
        at(7, [3, 6, 11, 14], .52);
        if (hard) {
            at(3, [4, 12], .23);
            at(6, [7, 15], .34);
            at(9, [3, 11], .21);
        }
    }
    return out;
}
/** Bounded, normalized patches; no ear-piercing digital lead oscillators. */
export function synthVoice(id, sampleRate = 44100, tone = 0) {
    const key = TRACKS.find(t => t.id === id);
    if (!key)
        throw new Error('Unknown voice ' + id);
    const duration = key.kind === 'bass' ? .48 : key.kind === 'kick' ? .52 : key.kind === 'hat' ? (id === 'oh' ? .35 : id === 'ride' ? .48 : .12) : key.kind === 'fx' ? .9 : .24;
    const n = Math.ceil(duration * sampleRate), data = new Float32Array(n), noise = rand(1417 + id.split('').reduce((s, c) => s + c.charCodeAt(0), 0));
    let lp = 0, hp = 0, last = 0, phase = 0;
    const twoPi = 2 * Math.PI;
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate, fade = Math.pow(clip(1 - t / duration, 0, 1), key.kind === 'bass' ? 1.8 : 2.3);
        let s = 0;
        if (key.kind === 'kick') {
            // Short transient + low fundamental; no high-pitched drop whistle.
            const freq = (id === 'kick2' ? 62 : 52) + 115 * Math.exp(-t * 53);
            phase += twoPi * freq / sampleRate;
            const click = (noise() * .13) * Math.exp(-t * 190);
            s = (Math.sin(phase) * .80 + Math.sin(phase * .5) * .09 + click) * Math.exp(-t * (id === 'kick2' ? 11 : 7.4));
        }
        else if (key.kind === 'bass') {
            const freq = clip(51.9 * Math.pow(2, (tone + key.tone) / 12), 30, 290);
            phase += twoPi * freq / sampleRate;
            const raw = Math.sin(phase) * .64 + Math.sin(phase * 2) * .14 + Math.sin(phase * .5) * .09;
            lp += clip(900 / sampleRate, 0, .2) * (raw - lp);
            s = lp * Math.min(1, t * 180) * fade * .81;
        }
        else if (key.kind === 'hat') {
            const white = noise();
            lp += (id === 'oh' ? .26 : .37) * (white - lp);
            hp = white - lp;
            const tail = (id === 'ride' ? (.68 + .32 * Math.sin(twoPi * 520 * t)) : 1);
            s = hp * .36 * fade * tail;
        }
        else if (key.kind === 'clap' || key.kind === 'snare') {
            const white = noise();
            lp += .18 * (white - lp);
            const snap = white - lp;
            const burst = key.kind === 'clap' ? (.55 + .45 * Math.max(0, Math.sin(twoPi * 34 * t))) : 1;
            s = (snap * .47 * burst + (key.kind === 'snare' ? Math.sin(twoPi * 170 * t) * .16 : 0)) * fade;
        }
        else if (key.kind === 'fx') {
            const white = noise();
            lp += .04 * (white - lp);
            s = (lp * .65 + Math.sin(twoPi * 53 * t) * .1) * fade;
        }
        else {
            const freq = id === 'tom' ? 125 : id === 'rim' ? 460 : id === 'click' ? 1350 : 340;
            const white = noise();
            lp += .23 * (white - lp);
            s = (Math.sin(twoPi * freq * t) * .25 + (white - lp) * .19) * fade;
        }
        // Soft limiting, normalize for pad velocity and low device volume.
        data[i] = Math.tanh(s * 1.35) * .8;
        last = data[i];
    }
    return data;
}
function encodeWav(buffer) {
    const frames = buffer.length, chan = Math.min(buffer.numberOfChannels, 2), out = new ArrayBuffer(44 + frames * chan * 2), v = new DataView(out);
    const str = (p, s) => { for (let i = 0; i < s.length; i++)
        v.setUint8(p + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    v.setUint32(4, 36 + frames * chan * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, chan, true);
    v.setUint32(24, buffer.sampleRate, true);
    v.setUint32(28, buffer.sampleRate * chan * 2, true);
    v.setUint16(32, chan * 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, frames * chan * 2, true);
    const chans = Array.from({ length: chan }, (_, i) => buffer.getChannelData(i));
    let o = 44;
    for (let i = 0; i < frames; i++)
        for (let c = 0; c < chan; c++) {
            const x = clip(chans[c][i], -1, 1);
            v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true);
            o += 2;
        }
    return new Blob([out], { type: 'audio/wav' });
}
export class Engine {
    ctx = null;
    bus = null;
    masterNode = null;
    lowpass = null;
    compressor = null;
    mediaDest = null;
    cache = new Map();
    imported = new Map();
    active = new Set();
    timer = null;
    next = 0;
    count = 0;
    epoch = 0;
    starting = false;
    recorder = null;
    pieces = [];
    recording = false;
    pcmProcessor = null;
    pcmSilence = null;
    pcmLeft = [];
    pcmRight = [];
    playing = false;
    onStep = () => { };
    onTransport = () => { };
    onRecording = () => { };
    state = { bpm: 136, swing: 0, master: .82, filter: 1, space: .10, pattern: presetPattern('RAW TECHNO'), genre: 'RAW TECHNO' };
    async unlock() {
        if (this.ctx?.state === 'closed') {
            this.ctx = null;
            this.bus = null;
            this.cache.clear();
        }
        if (!this.ctx) {
            const AudioCtor = window.AudioContext;
            if (!AudioCtor)
                throw new Error('Web Audio недоступен в этом браузере');
            this.ctx = new AudioCtor({ latencyHint: 'interactive' });
            const ctx = this.ctx;
            this.bus = ctx.createGain();
            this.lowpass = ctx.createBiquadFilter();
            this.lowpass.type = 'lowpass';
            this.lowpass.Q.value = .42;
            this.compressor = ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -13;
            this.compressor.ratio.value = 4;
            this.compressor.attack.value = .003;
            this.compressor.release.value = .15;
            this.masterNode = ctx.createGain();
            this.mediaDest = ctx.createMediaStreamDestination();
            this.bus.connect(this.lowpass).connect(this.compressor).connect(this.masterNode);
            this.masterNode.connect(ctx.destination);
            this.masterNode.connect(this.mediaDest);
            this.setFx();
        }
        if (this.ctx.state !== 'running')
            await this.ctx.resume();
        if (this.ctx.state !== 'running')
            throw Error('Нажми PLAY или PAD для включения звука');
        return this.ctx;
    }
    setFx() {
        const c = this.ctx;
        if (!c || !this.masterNode || !this.lowpass)
            return;
        const t = c.currentTime;
        this.lowpass.frequency.setTargetAtTime(190 + this.state.filter * this.state.filter * 16300, t, .018);
        this.masterNode.gain.setTargetAtTime(clip(this.state.master, 0, 1), t, .018);
    }
    sample(ctx, slot) {
        const custom = this.imported.get(slot);
        if (custom && ctx === this.ctx)
            return custom;
        if (custom) {
            const buf = ctx.createBuffer(custom.numberOfChannels, custom.length, ctx.sampleRate);
            for (let c = 0; c < custom.numberOfChannels; c++)
                buf.copyToChannel(custom.getChannelData(c), c);
            return buf;
        }
        const track = TRACKS[slot];
        const key = `${ctx.sampleRate}|${track.id}`;
        if (ctx === this.ctx && this.cache.has(key))
            return this.cache.get(key);
        const samples = synthVoice(track.id, ctx.sampleRate);
        const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
        buf.copyToChannel(samples, 0);
        if (ctx === this.ctx)
            this.cache.set(key, buf);
        return buf;
    }
    hit(ctx, output, slot, time, velocity = .9, offline = false) {
        const source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = this.sample(ctx, slot);
        gain.gain.value = clip(velocity, 0, 1) * .76;
        source.connect(gain).connect(output);
        source.start(Math.max(time, ctx.currentTime));
        if (!offline) {
            this.active.add(source);
            source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
        }
    }
    async pad(slot, velocity = 1) { const c = await this.unlock(); if (!Number.isInteger(slot) || slot < 0 || slot >= TRACKS.length)
        return; this.hit(c, this.bus, slot, c.currentTime + .002, velocity); }
    stepSchedule() {
        const ctx = this.ctx;
        if (!ctx || !this.playing || !this.bus)
            return;
        const stepTime = 60 / clip(this.state.bpm, 60, 200) / 4;
        if (this.next < ctx.currentTime - .06) {
            const jump = Math.floor((ctx.currentTime - this.next) / stepTime) + 1;
            this.count += jump;
            this.next += jump * stepTime;
        }
        let guard = 0;
        while (this.next < ctx.currentTime + .11 && guard++ < 24) {
            const step = this.count % 16, bar = Math.floor(this.count / 16), when = this.next + (step % 2 ? stepTime * this.state.swing : 0);
            for (let slot = 0; slot < TRACKS.length; slot++) {
                const velocity = this.state.pattern[slot]?.[step] || 0;
                if (velocity > 0)
                    this.hit(ctx, this.bus, slot, when, velocity);
            }
            this.onStep(step, bar);
            this.next += stepTime;
            this.count++;
        }
    }
    async play() {
        if (this.playing || this.starting)
            return;
        this.starting = true;
        const epoch = this.epoch;
        try {
            const c = await this.unlock();
            if (epoch !== this.epoch)
                return;
            this.count = 0;
            this.next = c.currentTime + .055;
            this.playing = true;
            this.stepSchedule();
            this.timer = window.setInterval(() => this.stepSchedule(), 25);
            this.onTransport(true);
        }
        finally {
            this.starting = false;
        }
    }
    stop() {
        this.epoch++;
        this.playing = false;
        if (this.timer !== null)
            clearInterval(this.timer);
        this.timer = null;
        this.count = 0;
        for (const node of this.active) {
            try {
                node.stop();
            }
            catch { }
        }
        this.active.clear();
        this.onStep(-1, 0);
        this.onTransport(false);
    }
    async setImportedSample(slot, file) {
        if (!Number.isInteger(slot) || slot < 0 || slot >= 16)
            throw Error('Некорректный слот');
        if (!file || file.size > 12 * 1024 * 1024)
            throw Error('Максимальный размер файла — 12 МБ');
        const ctx = await this.unlock();
        let audio;
        try {
            audio = await ctx.decodeAudioData(await file.arrayBuffer());
        }
        catch {
            throw Error('Не удалось открыть аудио: WAV, MP3, M4A');
        }
        if (audio.duration > 7)
            throw Error('Длина сэмпла — максимум 7 секунд');
        this.imported.set(slot, audio);
    }
    clearImported(slot) { this.imported.delete(slot); }
    startPcmRecording() {
        // Safari / WebKit fallback if MediaRecorder is absent or rejects audio-only streams.
        // Connected to silence: capture never doubles monitoring volume.
        const ctx = this.ctx, master = this.masterNode;
        if (!ctx || !master)
            throw Error('Audio engine is not running');
        const processor = ctx.createScriptProcessor(2048, 2, 2);
        const silence = ctx.createGain();
        silence.gain.value = 0;
        this.pcmLeft = [];
        this.pcmRight = [];
        processor.onaudioprocess = e => {
            if (!this.recording)
                return;
            const input = e.inputBuffer;
            this.pcmLeft.push(new Float32Array(input.getChannelData(0)));
            this.pcmRight.push(new Float32Array(input.getChannelData(Math.min(1, input.numberOfChannels - 1))));
        };
        master.connect(processor);
        processor.connect(silence);
        silence.connect(ctx.destination);
        this.pcmProcessor = processor;
        this.pcmSilence = silence;
        this.recording = true;
        this.onRecording(true);
    }
    finishPcmRecording() {
        const proc = this.pcmProcessor, silence = this.pcmSilence, ctx = this.ctx;
        if (!proc || !ctx)
            return;
        this.recording = false;
        proc.onaudioprocess = null;
        try {
            this.masterNode?.disconnect(proc);
            proc.disconnect();
            silence?.disconnect();
        }
        catch { }
        this.pcmProcessor = null;
        this.pcmSilence = null;
        const count = this.pcmLeft.reduce((s, c) => s + c.length, 0);
        if (!count) {
            this.onRecording(false);
            return;
        }
        const buffer = ctx.createBuffer(2, count, ctx.sampleRate);
        let cursor = 0;
        for (let i = 0; i < this.pcmLeft.length; i++) {
            buffer.copyToChannel(this.pcmLeft[i], 0, cursor);
            buffer.copyToChannel(this.pcmRight[i], 1, cursor);
            cursor += this.pcmLeft[i].length;
        }
        this.pcmLeft = [];
        this.pcmRight = [];
        this.onRecording(false, encodeWav(buffer));
    }
    async startRecording() {
        if (this.recording)
            return;
        await this.unlock();
        if (!this.mediaDest)
            throw Error('Audio engine unavailable');
        if (typeof MediaRecorder === 'undefined') {
            this.startPcmRecording();
            return;
        }
        try {
            const types = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
            const mime = types.find(type => MediaRecorder.isTypeSupported(type));
            this.pieces = [];
            const rec = new MediaRecorder(this.mediaDest.stream, mime ? { mimeType: mime } : undefined);
            this.recorder = rec;
            rec.ondataavailable = e => { if (e.data.size > 0)
                this.pieces.push(e.data); };
            rec.onstop = () => { this.recording = false; const blob = this.pieces.length ? new Blob(this.pieces, { type: rec.mimeType || 'audio/webm' }) : undefined; this.onRecording(false, blob); this.recorder = null; };
            rec.onerror = () => { this.recording = false; this.onRecording(false); this.recorder = null; };
            rec.start(250);
            this.recording = true;
            this.onRecording(true);
        }
        catch {
            this.recorder = null;
            this.startPcmRecording();
        }
    }
    stopRecording() {
        if (this.recorder?.state === 'recording') {
            this.recorder.stop();
            return;
        }
        if (this.pcmProcessor)
            this.finishPcmRecording();
    }
    get isRecording() { return this.recording; }
    async renderWav(bars = 4) {
        const count = clip(Math.round(bars), 1, 16);
        const bpm = clip(this.state.bpm, 60, 200), rate = 44100, duration = count * 4 * 60 / bpm + .95;
        const offline = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
        const bus = offline.createGain(), filter = offline.createBiquadFilter(), comp = offline.createDynamicsCompressor(), out = offline.createGain();
        filter.type = 'lowpass';
        filter.frequency.value = 190 + this.state.filter * this.state.filter * 16300;
        filter.Q.value = .42;
        comp.threshold.value = -13;
        comp.ratio.value = 4;
        out.gain.value = this.state.master;
        bus.connect(filter).connect(comp).connect(out).connect(offline.destination);
        const stepTime = 60 / bpm / 4;
        for (let i = 0; i < count * 16; i++) {
            const step = i % 16, when = .04 + i * stepTime + (step % 2 ? stepTime * this.state.swing : 0);
            for (let slot = 0; slot < 16; slot++) {
                const v = this.state.pattern[slot]?.[step] || 0;
                if (v > 0)
                    this.hit(offline, bus, slot, when, v, true);
            }
        }
        return encodeWav(await offline.startRendering());
    }
    dispose() { this.stop(); this.stopRecording(); void this.ctx?.close(); this.ctx = null; this.cache.clear(); this.imported.clear(); }
}
export const engine = new Engine();