export const PAD_NAMES = ['KICK', 'SUB', 'CLAP', 'HAT', 'OPEN HAT', 'PERC', 'ACID', 'HIT'];
export const PAD_COUNT = 8, STEPS = 16;
export const STYLES = [
    { name: 'WAREHOUSE', bpm: 136, kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], snare: [4, 12], bass: [0, 7, 8], acid: [3, 11] },
    { name: 'HARD TECHNO', bpm: 150, kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], snare: [4, 12], bass: [0, 8], acid: [7, 15] },
    { name: 'ACID', bpm: 140, kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], snare: [4, 12], bass: [0, 5, 8, 13], acid: [3, 6, 11, 14] },
    { name: 'DARK', bpm: 132, kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], snare: [4, 12], bass: [0, 8, 11], acid: [7, 15] },
    { name: 'RAVE', bpm: 146, kick: [0, 4, 8, 12], hat: [2, 6, 10, 14], snare: [4, 12], bass: [0, 8], acid: [2, 6, 10, 14] },
    { name: 'PHONK', bpm: 142, kick: [0, 3, 8, 11], hat: [2, 6, 10, 14], snare: [4, 12], bass: [0, 6, 8, 14], acid: [7, 15] }
];
export const SCENES = ['GROOVE', 'INTRO', 'BUILD', 'DROP', 'BREAK'];
const clone = (v) => JSON.parse(JSON.stringify(v));
export function createPattern(style = 0) {
    const g = STYLES[style] ?? STYLES[0];
    const p = Array.from({ length: PAD_COUNT }, () => Array(STEPS).fill(0));
    for (const i of g.kick)
        p[0][i] = 1;
    for (const i of g.bass)
        p[1][i] = .88;
    for (const i of g.snare)
        p[2][i] = .9;
    for (const i of g.hat)
        p[3][i] = .58;
    p[4][14] = .42;
    for (const i of [3, 11])
        p[5][i] = .42;
    for (const i of g.acid)
        p[6][i] = .6;
    p[7][15] = .72;
    return p;
}
export function defaultSession() { return { version: 18, tempo: 136, style: 0, scene: 0, pattern: createPattern(), levels: [1, .82, .8, .65, .6, .65, .65, .7], muted: Array(PAD_COUNT).fill(false), selected: 0, quantize: true }; }
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export function sanitizeSession(input) {
    const o = (typeof input === 'object' && input !== null ? input : {});
    const fallback = defaultSession();
    const rawPattern = Array.isArray(o.pattern) ? o.pattern : Array.isArray(o.grids) ? o.grids : [];
    const p = Array.from({ length: PAD_COUNT }, (_, pad) => Array.from({ length: STEPS }, (_, step) => {
        const raw = rawPattern[pad]?.[step];
        return typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, 0, 1) : 0;
    }));
    const getInt = (v, lo, hi, def) => typeof v === 'number' && Number.isFinite(v) ? Math.floor(clamp(v, lo, hi)) : def;
    const tempo = getInt(o.tempo ?? o.bpm, 80, 175, 136), style = getInt(o.style ?? o.bank, 0, STYLES.length - 1, 0);
    const srcLevels = Array.isArray(o.levels) ? o.levels : [];
    const srcMute = Array.isArray(o.muted) ? o.muted : [];
    return { version: 18, tempo, style, scene: getInt(o.scene, 0, SCENES.length - 1, 0), pattern: Array.isArray(rawPattern) && rawPattern.length ? p : createPattern(style), levels: Array.from({ length: PAD_COUNT }, (_, i) => { const v = srcLevels[i]; return typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1.2) : fallback.levels[i]; }), muted: Array.from({ length: PAD_COUNT }, (_, i) => srcMute[i] === true), selected: getInt(o.selected, 0, 7, 0), quantize: o.quantize !== false };
}
export function note(pattern, pad, step, velocity = 1) {
    if (!Number.isInteger(pad) || pad < 0 || pad >= PAD_COUNT || !Number.isInteger(step) || step < 0 || step >= STEPS)
        return false;
    pattern[pad][step] = Math.max(pattern[pad][step] ?? 0, clamp(velocity, 0, 1));
    return true;
}
export function toggle(pattern, pad, step) {
    if (!Number.isInteger(pad) || pad < 0 || pad >= PAD_COUNT || !Number.isInteger(step) || step < 0 || step >= STEPS)
        return;
    pattern[pad][step] = (pattern[pad][step] ?? 0) > 0 ? 0 : .8;
}
export function importSession(text) { return sanitizeSession(clone(JSON.parse(text))); }