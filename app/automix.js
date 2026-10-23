const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const median = (v) => { const x = [...v].sort((a, b) => a - b); return x[Math.floor(x.length / 2)] ?? 0; };
const SAMPLE_HZ = 100;
export function estimateTempoFromPulses(pulses, hz = SAMPLE_HZ) {
    if (pulses.length < 150 || hz < 10)
        return { bpm: 120, confidence: 0, firstBeat: 0 };
    const mean = pulses.reduce((a, b) => a + b, 0) / pulses.length;
    const diff = new Float32Array(pulses.length);
    let prev = 0, peak = 0;
    for (let i = 0; i < pulses.length; i++) {
        const x = Math.max(0, pulses[i] - prev * .95 - mean * .08);
        diff[i] = x;
        peak = Math.max(peak, x);
        prev = pulses[i];
    }
    if (peak < 1e-5)
        return { bpm: 120, confidence: 0, firstBeat: 0 };
    const onset = new Float32Array(diff.length);
    const cut = peak * .11;
    for (let i = 2; i < diff.length - 2; i++) {
        const v = diff[i];
        if (v > cut && v >= diff[i - 1] && v >= diff[i + 1]) {
            onset[i] = v / peak;
            i += 2;
        }
    }
    const maxLag = Math.floor(hz * 60 / 80), minLag = Math.floor(hz * 60 / 175);
    let best = 0, bestLag = 0, runner = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
        let score = 0;
        for (let i = lag; i < onset.length; i++)
            score += onset[i] * (onset[i - lag] ?? 0);
        // Prefer less severe tempo normalization instead of octave errors.
        score *= 1 - Math.abs(120 - 60 * hz / lag) / 1600;
        if (score > best) {
            runner = best;
            best = score;
            bestLag = lag;
        }
        else if (score > runner)
            runner = score;
    }
    if (!bestLag || best < .008)
        return { bpm: 120, confidence: 0, firstBeat: 0 };
    const bpm = clamp(Math.round(60 * hz / bestLag), 80, 175);
    const prominent = [];
    const threshold = peak * .14;
    for (let i = 0; i < diff.length; i++)
        if (diff[i] > threshold && onset[i] > 0)
            prominent.push(i / hz);
    const firstBeat = prominent.find(time => time <= 8) ?? 0;
    const confidence = clamp(best / (best + Math.max(.025, runner * .9)), 0, 1);
    return { bpm, confidence, firstBeat };
}
export function analyzeBuffer(buffer) {
    const sr = buffer.sampleRate, length = Math.min(buffer.length, Math.floor(sr * 100)), channels = Math.max(1, buffer.numberOfChannels);
    const blocks = Math.ceil(length / sr * SAMPLE_HZ), window = Math.max(1, Math.floor(sr / SAMPLE_HZ));
    const env = new Float32Array(blocks), samples = Array.from({ length: Math.min(2, channels) }, (_, i) => buffer.getChannelData(i));
    let sum = 0, peak = 0, count = 0;
    for (let block = 0; block < blocks; block++) {
        const start = block * window, end = Math.min(length, start + window);
        let power = 0, n = 0;
        for (let i = start; i < end; i += 2) {
            let sample = 0;
            for (const arr of samples)
                sample += (arr[i] ?? 0) / samples.length;
            const a = Math.abs(sample);
            peak = Math.max(peak, a);
            sum += sample * sample;
            count++;
            power += sample * sample;
            n++;
        }
        env[block] = Math.sqrt(power / Math.max(1, n));
    }
    const estimated = estimateTempoFromPulses(env);
    return { ...estimated, rms: Math.sqrt(sum / Math.max(1, count)), peak, duration: buffer.duration };
}
/** Gain target -17dB RMS, limited by peak to preserve transients and avoid hard limiting. */
export function normalizeGain(analysis) {
    if (analysis.rms < .0001 || analysis.peak < .001)
        return .62;
    return clamp(Math.min(.1413 / analysis.rms, .82 / analysis.peak), .22, 1.18);
}
export function planTransition(a, b) {
    const beat = 60 / clamp(a.bpm, 80, 175), bar = 4 * beat;
    const matched = a.confidence >= .17 && b.confidence >= .17;
    const natural = matched ? a.bpm / b.bpm : 1;
    const matchable = matched && natural >= .94 && natural <= 1.06;
    const playbackRate = matchable ? clamp(natural, .94, 1.06) : 1;
    const targetFade = 16 * beat, fadeSeconds = clamp(Math.min(targetFade, a.duration * .30, b.duration * .30), .35, 12);
    const head = Math.max(0, a.firstBeat);
    // A transition begins on a downbeat, leaving a safe tail for both tracks.
    const maxStart = Math.max(0, a.duration - fadeSeconds - .08);
    const bars = Math.floor((maxStart - head) / bar);
    const startNext = bars >= 1 ? Math.min(maxStart, head + bars * bar) : Math.max(0, maxStart);
    const offsetNext = clamp(b.firstBeat, 0, Math.max(0, b.duration - fadeSeconds / playbackRate - .05));
    return { startNext, fadeSeconds, playbackRate, offsetNext, matchable };
}
export function crossfadeCurve(points = 64) {
    const n = Math.max(4, Math.min(256, Math.floor(points))), incoming = new Float32Array(n), outgoing = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = i / (n - 1);
        incoming[i] = Math.sin(x * Math.PI / 2) * .81;
        outgoing[i] = Math.cos(x * Math.PI / 2) * .81;
    }
    return { incoming, outgoing };
}
export const BPM_ANALYSIS_WINDOW_SECONDS = 100;
