class PcmCapture extends AudioWorkletProcessor {
    samples = new Float32Array(4096);
    offset = 0;
    process(inputs) {
        const channels = inputs[0], left = channels?.[0];
        if (!left)
            return true;
        const right = channels?.[1] ?? left;
        for (let i = 0; i < left.length; i++) {
            this.samples[this.offset++] = left[i] ?? 0;
            this.samples[this.offset++] = right[i] ?? 0;
            if (this.offset === this.samples.length) {
                const chunk = this.samples;
                this.samples = new Float32Array(4096);
                this.offset = 0;
                this.port.postMessage(chunk.buffer, [chunk.buffer]);
            }
        }
        return true;
    }
}
registerProcessor('artss-pcm-capture', PcmCapture);
export {};
