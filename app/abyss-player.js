import { ABYSS_PADS, ABYSS_BPM, ABYSS_FX } from './abyss.js';
function roomImpulse(ctx) {
    const frames = Math.round(ctx.sampleRate * 1.25), ir = ctx.createBuffer(2, frames, ctx.sampleRate);
    let seed = 0xAB155;
    const damping = Math.exp(-2 * Math.PI * ABYSS_FX.reverb.damping / ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
        const data = ir.getChannelData(c);
        let low = 0;
        for (let i = 0; i < frames; i++) {
            seed ^= seed << 13;
            seed ^= seed >>> 17;
            seed ^= seed << 5;
            low = low * damping + ((seed >>> 0) / 2147483648 - 1) * (1 - damping);
            data[i] = low * Math.exp(-i / ctx.sampleRate * (8 - 3 * ABYSS_FX.reverb.room_size)) * .18;
        }
    }
    return ir;
}
const kickReduction = 10 ** (-Math.max(0, -8 - ABYSS_FX.sidechain_compressor.threshold) * (1 - 1 / ABYSS_FX.sidechain_compressor.ratio) / 20);
function duck(g, when) {
    g.cancelScheduledValues(when);
    g.setValueAtTime(1, when);
    g.linearRampToValueAtTime(kickReduction, when + ABYSS_FX.sidechain_compressor.attack_ms / 1000);
    g.setTargetAtTime(1, when + .015, ABYSS_FX.sidechain_compressor.release_ms / 3000);
}
/** A dedicated two-page performance sampler routed into the existing protected master. */
export class AbyssPlayer {
    engine;
    buffers = new Map();
    loads = new Map();
    voices = new Map();
    generations = new Map();
    context = null;
    input = null;
    filter = null;
    sidechain = null;
    anchor = 0;
    kickTimer = null;
    lastKickAt = -1;
    onChange = () => { };
    constructor(engine) {
        this.engine = engine;
        engine.renderSamplerOffline = (ctx, bus, seconds) => this.renderOffline(ctx, bus, seconds);
    }
    isActive(id) { return this.voices.has(id); }
    connect() {
        const { context, output } = this.engine.getSamplerOutput();
        if (this.context === context)
            return;
        this.context = context;
        this.anchor = context.currentTime + .045;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = ABYSS_FX.lowpass_filter.cutoff;
        filter.Q.value = ABYSS_FX.lowpass_filter.resonance;
        const sidechain = context.createGain(), input = context.createGain(), dry = context.createGain(), send = context.createGain(), delay = context.createDelay(2), feedback = context.createGain();
        const room = context.createConvolver(), wet = context.createGain(), master = context.createGain();
        // Deterministic, damped stereo room impulse. No external capture or missing sample fallback.
        room.buffer = roomImpulse(context);
        delay.delayTime.value = 60 / ABYSS_BPM * .75;
        feedback.gain.value = ABYSS_FX.delay.feedback;
        send.gain.value = ABYSS_FX.delay.dry_wet;
        wet.gain.value = ABYSS_FX.reverb.dry_wet;
        dry.gain.value = .85;
        master.gain.value = .33;
        input.connect(filter).connect(sidechain);
        sidechain.connect(dry).connect(master);
        sidechain.connect(send).connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(master);
        sidechain.connect(room).connect(wet).connect(master);
        master.connect(output);
        this.input = input;
        this.filter = filter;
        this.sidechain = sidechain;
        this.kickTimer = window.setInterval(() => this.pumpKick(), 40);
    }
    pumpKick() {
        if (!this.context || !this.sidechain || !this.filter || !this.voices.has(1))
            return;
        const now = this.context.currentTime, bar = 240 / ABYSS_BPM;
        const next = Math.ceil((now + .01 - this.anchor) / bar * 4) * (bar / 4) + this.anchor;
        if (next <= now + .09 && next > now && next !== this.lastKickAt) {
            this.lastKickAt = next;
            duck(this.sidechain.gain, next);
            const f = this.filter.frequency;
            f.cancelScheduledValues(next);
            f.setValueAtTime(6200, next);
            f.setTargetAtTime(8000, next + .015, .09);
        }
    }
    async load(pad) {
        const cached = this.buffers.get(pad.id);
        if (cached)
            return cached;
        const pending = this.loads.get(pad.id);
        if (pending)
            return pending;
        const task = (async () => {
            const response = await fetch('/samples/abyss/' + pad.file, { cache: 'force-cache' });
            if (!response.ok)
                throw Error('WAV не загружен: ' + pad.file);
            const data = await response.arrayBuffer(), context = this.context;
            if (!context)
                throw Error('Аудиодвижок не готов');
            const buffer = await context.decodeAudioData(data);
            this.buffers.set(pad.id, buffer);
            return buffer;
        })();
        this.loads.set(pad.id, task);
        try {
            return await task;
        }
        finally {
            this.loads.delete(pad.id);
        }
    }
    boundary(quantize) {
        const now = this.context.currentTime;
        if (quantize === 'none')
            return now + .003;
        const bars = quantize === '1/2' ? .5 : quantize === '2/1' ? 2 : 1, length = 240 / ABYSS_BPM * bars;
        return this.anchor + Math.max(0, Math.ceil((now + .025 - this.anchor) / length)) * length;
    }
    stopVoice(id, when) {
        const voice = this.voices.get(id);
        if (!voice)
            return;
        this.voices.delete(id);
        const at = Math.max(when, this.context?.currentTime ?? when);
        voice.gain.gain.cancelScheduledValues(at);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
        voice.gain.gain.linearRampToValueAtTime(0, at + .018);
        try {
            voice.source.stop(at + .022);
        }
        catch { }
        this.onChange();
    }
    async trigger(id) {
        const pad = ABYSS_PADS[id - 1];
        if (!pad)
            throw Error('Неизвестный пэд');
        await this.engine.unlock();
        this.connect();
        const epoch = (this.generations.get(id) ?? 0) + 1;
        this.generations.set(id, epoch);
        if (this.voices.has(id)) {
            this.stopVoice(id, this.boundary(pad.quantize));
            return;
        }
        const buffer = await this.load(pad);
        if (this.generations.get(id) !== epoch)
            return;
        const ctx = this.context, when = this.boundary(pad.quantize);
        if (pad.choke_group)
            for (const [other, voice] of this.voices)
                if (other !== id && voice.pad.choke_group === pad.choke_group)
                    this.stopVoice(other, when);
        const source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = buffer;
        source.loop = pad.type === 'loop';
        source.playbackRate.value = 1;
        source.connect(gain).connect(this.input);
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(pad.group === 'Bass' ? .72 : 1, when + .012);
        const voice = { source, gain, pad, when };
        this.voices.set(id, voice);
        source.onended = () => { if (this.voices.get(id) === voice) {
            this.voices.delete(id);
            this.onChange();
        } source.disconnect(); gain.disconnect(); };
        source.start(when);
        this.onChange();
    }
    stop() { for (const id of [...this.voices.keys()])
        this.stopVoice(id, this.context?.currentTime ?? 0); this.generations.clear(); }
    renderOffline(ctx, bus, seconds) {
        if (!this.voices.size)
            return;
        const filter = ctx.createBiquadFilter(), level = ctx.createGain(), delay = ctx.createDelay(2), send = ctx.createGain(), feedback = ctx.createGain(), room = ctx.createConvolver(), wet = ctx.createGain(), side = ctx.createGain();
        filter.type = 'lowpass';
        filter.frequency.value = ABYSS_FX.lowpass_filter.cutoff;
        filter.Q.value = ABYSS_FX.lowpass_filter.resonance;
        level.gain.value = .33;
        delay.delayTime.value = 60 / ABYSS_BPM * .75;
        send.gain.value = ABYSS_FX.delay.dry_wet;
        feedback.gain.value = ABYSS_FX.delay.feedback;
        room.buffer = roomImpulse(ctx);
        wet.gain.value = ABYSS_FX.reverb.dry_wet;
        filter.connect(side).connect(level).connect(bus);
        side.connect(send).connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(level);
        side.connect(room).connect(wet).connect(level);
        if (this.voices.has(1))
            for (let t = .02; t < seconds; t += 60 / ABYSS_BPM)
                duck(side.gain, t);
        for (const voice of this.voices.values()) {
            const source = ctx.createBufferSource();
            source.buffer = voice.source.buffer;
            source.loop = voice.pad.type === 'loop';
            const volume = ctx.createGain();
            volume.gain.value = voice.pad.group === 'Bass' ? .72 : 1;
            source.connect(volume).connect(filter);
            source.start(.02);
            source.stop(Math.min(seconds + .015, voice.pad.type === 'loop' ? seconds + .015 : voice.source.buffer.duration + .02));
        }
    }
    dispose() { this.stop(); if (this.kickTimer !== null)
        clearInterval(this.kickTimer); this.kickTimer = null; this.input?.disconnect(); this.context = null; this.engine.renderSamplerOffline = null; }
}
