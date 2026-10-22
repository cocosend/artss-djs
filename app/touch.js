/** Finger movement in CSS pixels; stable across viewport density and devicePixelRatio. */
export function knobDragValue(start, deltaY, min = -12, max = 12, pixelsPerStep = 7) {
    if (!Number.isFinite(start) || !Number.isFinite(deltaY) || !Number.isFinite(pixelsPerStep) || pixelsPerStep <= 0)
        return Number.isFinite(start) ? Math.min(max, Math.max(min, start)) : 0;
    const next = Math.round(start - deltaY / pixelsPerStep);
    return Math.max(min, Math.min(max, next));
}
