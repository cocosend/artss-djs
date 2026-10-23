import { PAD_COUNT, STEPS, STYLES } from './model.js';
const validStyle = (style) => Number.isInteger(style) && style >= 0 && style < STYLES.length ? style : 0;
/** Deterministic role-based 16-step patterns, style aware and locally generated. */
export function composeGroove(style, density = .65, variation = 0) {
    const s = validStyle(style), g = STYLES[s], d = Number.isFinite(density) ? Math.max(0, Math.min(1, density)) : 0;
    const p = Array.from({ length: PAD_COUNT }, () => Array(STEPS).fill(0));
    const place = (pad, steps, velocity) => { for (const step of steps)
        if (step >= 0 && step < STEPS)
            p[pad][step] = velocity; };
    place(0, g.kick, 1);
    place(2, g.snare, .77 + (s === 5 ? .08 : 0));
    place(3, g.hat, .38 + d * .31);
    const seed = Math.abs(Math.trunc(Number.isFinite(variation) ? variation : 0));
    const turn = seed % 4, fill = (seed >>> 2) % 4;
    // New EDM genres use distinct bass, backbeat and syncopation, while each
    // repeated Generate press changes a meaningful phrase rather than one note.
    if (s === 15) {
        p[2][4] = 0;
        p[2][12] = 0;
        place(2, [6, 14], .93);
    }
    if (s === 13) {
        place(3, [1, 5, 9, 13], .32 + d * .2);
        place(4, [7, 15], .38 + d * .14);
    }
    else if (s === 14) {
        place(3, [0, 4, 8, 12], .28);
        place(4, [6, 14], .36);
    }
    else if (d > .40) {
        place(4, [6, 14], .26 + d * .14);
    }
    if (d > .40)
        place(5, s === 12 ? [3, 7, 11, 15] : s === 15 ? [3, 10, 15] : [3, 11], .28 + d * .16);
    if (d > .48) {
        place(1, g.bass, .60 + d * .13);
        place(6, g.acid, Math.min(.78, .25 + d * .42));
    }
    if (d > .70) {
        for (const x of (s === 15 ? [1, 7, 9, 15] : [1, 5, 9, 13]))
            p[3][x] = Math.max(p[3][x] ?? 0, .23);
        p[7][15] = .52;
    }
    if (seed > 0) {
        const accents = [3, 7, 11, 15];
        p[5][accents[fill]] = .35 + .07 * turn;
        if (d > .57)
            p[6][(accents[turn] + 2) % STEPS] = .43 + .06 * fill;
        if (turn === 1 || turn === 3) {
            p[0][15] = .56;
            p[3][15] = .46;
        }
        if (turn === 2) {
            p[0][7] = .65;
            p[1][14] = .46;
        }
        if (fill === 2 && d > .65) {
            p[2][15] = .58;
            p[4][15] = .48;
        }
    }
    return p;
}
const ROLE_STEPS = { 0: [0, 4, 8, 12], 1: [0, 8], 2: [4, 12], 3: [2, 6, 10, 14], 4: [6, 14], 5: [3, 11], 6: [3, 7, 11, 15], 7: [15] };
/** Insert imported sample lane while preserving existing recorded layers. */
export function placeSample(pattern, pad, style) {
    if (!Number.isInteger(pad) || pad < 0 || pad >= PAD_COUNT)
        return 0;
    const row = pattern[pad];
    if (!row || row.length !== STEPS)
        return 0;
    const steps = pad === 6 && validStyle(style) === 2 ? [3, 6, 11, 14] : (ROLE_STEPS[pad] ?? [0]);
    for (const step of steps)
        row[step] = Math.max(row[step] ?? 0, pad === 0 ? 1 : .7);
    return steps.length;
}
