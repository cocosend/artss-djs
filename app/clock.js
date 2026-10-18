"use strict";
class Pulse extends AudioWorkletProcessor {
    frames = 0;
    process() { this.frames += 128; if (this.frames >= 2048) {
        this.frames = 0;
        this.port.postMessage(currentTime);
    } return true; }
}
registerProcessor('artss-pulse', Pulse);