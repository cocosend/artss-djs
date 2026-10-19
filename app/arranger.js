import { PAD_COUNT, STEPS } from './model.js';
const KICK = [0, 4, 8, 12];
const HAT = [2, 6, 10, 14];
const CLAP = [4, 12];
const ACID = [[3, 11], [7, 15], [3, 6, 11, 14], [7, 15], [2, 6, 10, 14], [7, 15]];
function validStyle(style) { return (Number.isInteger(style) && style >= 0 && style < 6 ? style : 0); }
/** Predictable, musical role-based 16-step groove. No cloud or ML claims. */
export function composeGroove(style, density = .65, variation = 0) {
    const s = validStyle(style), d = Number.isFinite(density) ? Math.max(0, Math.min(1, density)) : 0;
    const p = Array.from({ length: PAD_COUNT }, () => Array(STEPS).fill(0));
    const place = (pad, steps, velocity) => { for (const step of steps)
        p[pad][step] = velocity; };
    place(0, s === 5 ? [0, 3, 8, 11] : KICK, 1);
    place(2, CLAP, s === 5 ? .84 : .76);
    place(3, HAT, .45 + (d * .25));
    if (d > .4) {
        place(4, [6, 14], .26 + d * .14);
        place(5, [3, 11], .26 + d * .18);
    }
    if (d > .5) {
        place(1, s === 2 ? [0, 5, 8, 13] : [0, 8], .65);
        place(6, ACID[s], Math.min(.78, .3 + d * .4));
    }
    if (d > .73) {
        place(3, [1, 5, 9, 13], .24);
        place(5, [15], .45);
        place(7, [15], .55);
    }
    if (variation > 0) {
        const offsets = [5, 13, 7, 15];
        const k = offsets[(variation - 1) % offsets.length] ?? 7;
        p[5][k] = .42;
        if (d > .6)
            p[6][(k + 2) % STEPS] = .42;
    }
    return p;
}
const ROLE_STEPS = {
    0: [0, 4, 8, 12], 1: [0, 8], 2: [4, 12], 3: [2, 6, 10, 14], 4: [6, 14], 5: [3, 11], 6: [3, 7, 11, 15], 7: [15]
};
/** Populate newly imported sound's lane without overwriting other recorded layers. */
export function placeSample(pattern, pad, style) {
    if (!Number.isInteger(pad) || pad < 0 || pad >= PAD_COUNT)
        return 0;
    const row = pattern[pad];
    if (!row || row.length !== STEPS)
        return 0;
    const steps = pad === 6 && validStyle(style) === 2 ? [3, 6, 11, 14] : (ROLE_STEPS[pad] ?? [0]);
    for (const step of steps) {
        row[step] = Math.max(row[step] ?? 0, pad === 0 ? 1 : .7);
    }
    return steps.length;
}