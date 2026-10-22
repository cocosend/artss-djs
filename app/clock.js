"use strict";
class Pulse extends AudioWorkletProcessor {
    frames = 0;
    active = false;
    constructor() { super(); this.port.onmessage = event => { this.active = event.data === 'start'; this.frames = 0; }; }
    process() {
        if (!this.active)
            return true;
        this.frames += 128;
        if (this.frames >= 2048) {
            this.frames = 0;
            this.port.postMessage(currentTime);
        }
        return true;
    }
}
registerProcessor('artss-pulse', Pulse);
