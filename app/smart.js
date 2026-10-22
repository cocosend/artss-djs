const minmax = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ROLES = ['kick', 'sub', 'clap', 'hat', 'open', 'perc', 'acid', 'hit'];
/** Deterministic signal-feature analysis. It is not neural source separation. */
export function analyzeAudio(channels, sampleRate) {
    const src = channels[0];
    if (!src || !src.length || !Number.isFinite(sampleRate) || sampleRate < 8000)
        throw Error('Файл не содержит подходящее аудио');
    const duration = src.length / sampleRate, hop = Math.max(1, Math.floor(sampleRate / 1000));
    let peak = 0, sum = 0, early = 0, earlyCount = 0, change = 0, prev = 0, prevSample = 0, low = 0, high = 0;
    let first = -1, last = src.length - 1;
    for (let i = 0; i < src.length; i += hop) {
        let mono = 0;
        for (const c of channels)
            mono += (c[i] ?? 0);
        mono /= channels.length;
        const a = Math.abs(mono);
        peak = Math.max(peak, a);
        sum += mono * mono;
        if (a > .015 && first < 0)
            first = i;
        if (a > .008)
            last = i;
        if (i < sampleRate * .075) {
            early += mono * mono;
            earlyCount++;
        }
        const d = mono - prev;
        change += d * d;
        low += (mono + prev) * .5 * (mono + prev) * .5;
        high += d * d;
        prev = mono;
    }
    const count = Math.ceil(src.length / hop), rms = Math.sqrt(sum / count), attack = Math.sqrt(early / Math.max(earlyCount, 1)), sharpness = Math.sqrt(change / Math.max(sum, 1e-9)), brightness = high / Math.max(low + high, 1e-9);
    const trimmedDuration = (last - (first < 0 ? 0 : first)) / sampleRate;
    let role;
    if (duration > 1.65 && brightness < .45)
        role = 'acid';
    else if (brightness > .86 && duration < .34)
        role = 'hat';
    else if (brightness > .75 && duration < 1.25)
        role = 'open';
    else if (brightness < .23 && attack > .055)
        role = 'kick';
    else if (brightness < .24)
        role = 'sub';
    else if (sharpness > 1.0 && duration < .9)
        role = 'clap';
    else if (brightness > .5)
        role = 'perc';
    else
        role = 'hit';
    const pad = ROLES.indexOf(role);
    // RMS target tuned for mixed pads, never amplify a near-silent sample excessively.
    const target = role === 'kick' ? .18 : role === 'sub' ? .13 : role === 'hat' ? .085 : .115;
    const gain = peak < .004 ? 1 : minmax(target / Math.max(rms, .02), .25, 2.2) * minmax(.90 / Math.max(peak, 1e-6), 0, 1);
    const highCut = role === 'kick' ? 13500 : role === 'sub' ? 720 : role === 'hat' || role === 'open' ? 19000 : role === 'acid' ? 11500 : 16000;
    const lowCut = role === 'kick' ? 20 : role === 'sub' ? 25 : role === 'hat' || role === 'open' ? 1900 : role === 'clap' ? 180 : role === 'acid' ? 65 : 55;
    // Very inexpensive zero-crossing based pitch estimate, only display as tentative.
    let zeroes = 0;
    const end = Math.min(src.length, Math.floor(sampleRate * .25));
    for (let i = 1; i < end; i += 4) {
        const a = src[i - 1] ?? 0, b = src[i] ?? 0;
        if (a <= 0 && b > 0)
            zeroes++;
    }
    const estimate = zeroes * 4 / (Math.max(1, end) / sampleRate);
    const estimatedHz = estimate >= 35 && estimate <= 1600 ? Math.round(estimate) : null;
    return { role, pad, confidence: .52, peak, rms, duration, centroid: brightness, start: Math.max(0, first < 0 ? 0 : first), end: Math.min(src.length, last + Math.round(sampleRate * .035)), estimatedHz, gain, lowCut, highCut };
}
export function withFades(buffer, analysis, ctx) {
    const maxLength = Math.min(buffer.length - analysis.start, Math.round(ctx.sampleRate * 8));
    const n = Math.max(1, Math.min(maxLength, analysis.end - analysis.start));
    const output = ctx.createBuffer(Math.min(buffer.numberOfChannels, 2), n, buffer.sampleRate), fadeIn = Math.min(n, Math.round(buffer.sampleRate * .002)), fadeOut = Math.min(n, Math.round(buffer.sampleRate * .008));
    for (let c = 0; c < output.numberOfChannels; c++) {
        const src = buffer.getChannelData(c), dst = output.getChannelData(c);
        for (let i = 0; i < n; i++) {
            const fade = Math.min(1, i / Math.max(1, fadeIn), (n - 1 - i) / Math.max(1, fadeOut));
            dst[i] = (src[analysis.start + i] ?? 0) * Math.max(0, fade);
        }
    }
    return output;
}
export function choosePad(analysis) { return analysis.pad; }
