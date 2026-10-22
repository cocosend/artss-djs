export function loopedStep(absoluteStep, length, anchor) {
    const step = Math.max(0, Math.floor(Number.isFinite(absoluteStep) ? absoluteStep : 0));
    if (!length)
        return step % 16;
    const safeAnchor = Math.max(0, Math.floor(Number.isFinite(anchor) ? anchor : 0));
    if (step < safeAnchor)
        return step % 16;
    return (safeAnchor + (step - safeAnchor) % length) % 16;
}
export function loopAnchor(step, length) {
    if (!length)
        return 0;
    return Math.floor(Math.max(0, Math.floor(step)) / length) * length;
}
