/** Bounded, deterministic audio control math shared by realtime and offline renders. */
const clamp = (n, low, high) => Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : low;
/** Equal-power A/B blend with 1.8 dB summed-bus headroom at center. */
export function crossfadeGains(position) {
    const x = clamp(position, 0, 1), trim = .82;
    return [Math.cos(x * Math.PI / 2) * trim, Math.sin(x * Math.PI / 2) * trim];
}
/** Envelope peak limit before dynamics processing; avoids overdriving on imported samples. */
export function voiceGain(velocity, level, sampleGain) {
    return Math.min(.94, clamp(velocity, 0, 1) * clamp(level, 0, 1.2) * clamp(sampleGain, 0, 2.2) * .86);
}
/** True logarithmic control covering audible warmth through nearly open high end. */
export function lowpassHz(open, sampleRate) {
    const value = clamp(open, 0, 1), nyquist = Math.max(4000, clamp(sampleRate, 8000, 192000) * .45);
    return Math.min(nyquist, 40 * Math.pow(nyquist / 40, value));
}
export const AUDIO_HEADROOM = { master: .74, wet: .18, feedback: .16, echoSend: .17 };
/** Eight-bar equal-power automation with cosine ease and a full bar for each transition. */
export function autoMixPosition(beat) { if (!Number.isFinite(beat))
    return .5; const bar = ((beat / 4) % 8 + 8) % 8; const smooth = (v) => .5 - .5 * Math.cos(Math.PI * Math.max(0, Math.min(1, v))); if (bar < 3)
    return 0; if (bar < 4)
    return smooth(bar - 3); if (bar < 7)
    return 1; return 1 - smooth(bar - 7); }
/** Preserve the container announced by Safari/Chrome media capture, including PCM fallbacks. */
export function recordingExtension(mime) {
    const format = mime.toLowerCase().split(';', 1)[0]?.trim();
    if (format === 'audio/wav' || format === 'audio/wave' || format === 'audio/x-wav' || format === 'audio/vnd.wave')
        return 'wav';
    if (format === 'audio/mp4' || format === 'audio/x-m4a' || format === 'audio/aac')
        return 'm4a';
    if (format === 'audio/webm')
        return 'webm';
    throw Error('Формат аудиозаписи не поддерживается');
}
