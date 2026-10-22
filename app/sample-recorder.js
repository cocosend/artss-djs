/** Safari and all iOS browsers share WebKit's fragile short MediaRecorder pipeline. Use lossless PCM. */
export function preferPcmRecording(userAgent, mediaRecorderAvailable) {
    const ios = /iPhone|iPad|iPod/i.test(userAgent);
    const safari = /AppleWebKit/i.test(userAgent) && /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Android/i.test(userAgent);
    return !mediaRecorderAvailable || ios || safari;
}
export const pcmWav = (chunks, frameCount, sampleRate) => {
    const bytes = new ArrayBuffer(44 + frameCount * 4);
    const view = new DataView(bytes);
    const ascii = (index, s) => { for (let i = 0; i < s.length; i++)
        view.setUint8(index + i, s.charCodeAt(i)); };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + frameCount * 4, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, frameCount * 4, true);
    let offset = 44;
    for (const chunk of chunks)
        for (let i = 0; i < chunk.length; i++) {
            const a = Math.max(-1, Math.min(1, chunk[i] ?? 0));
            view.setInt16(offset, Math.round(a * (a < 0 ? 32768 : 32767)), true);
            offset += 2;
        }
    return new Blob([bytes], { type: 'audio/wav' });
};
export class SampleRecorder {
    recorder = null;
    chunks = [];
    stopPromise = null;
    timeout = null;
    finish = null;
    fail = null;
    capturingPCM = false;
    sourceNode = null;
    processor = null;
    worklet = null;
    workletInput = null;
    sink = null;
    pcm = [];
    frames = 0;
    sampleRate = 44100;
    get active() { return this.capturingPCM || this.recorder?.state === 'recording'; }
    async start(source, liveStream, context, onLimit, onFailure = () => { }, directInput = null, maxDurationMs = 12000) {
        if (this.active || this.stopPromise)
            throw Error('Запись сэмпла уже идёт');
        if (source !== 'live')
            throw Error('Доступна только запись внутреннего микса');
        const stream = liveStream;
        try {
            if (preferPcmRecording(navigator.userAgent, typeof MediaRecorder !== 'undefined')) {
                this.pcm = [];
                this.frames = 0;
                this.sampleRate = context.sampleRate;
                if (context.audioWorklet) {
                    // WebKit's live MediaStream roundtrip can crash during short captures.
                    // Connect the post-limiter master directly to a capture-only worklet.
                    await context.audioWorklet.addModule('/app/pcm-capture.js');
                    this.worklet = new AudioWorkletNode(context, 'artss-pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
                    this.worklet.port.onmessage = event => {
                        if (!this.capturingPCM || !(event.data instanceof ArrayBuffer))
                            return;
                        const packet = new Float32Array(event.data);
                        if (packet.length < 2 || packet.length % 2 !== 0)
                            return;
                        this.pcm.push(packet);
                        this.frames += packet.length / 2;
                    };
                    this.workletInput = directInput ?? (stream ? context.createMediaStreamSource(stream) : null);
                    if (!this.workletInput)
                        throw Error('Источник аудиозаписи недоступен');
                    this.sink = context.createGain();
                    this.sink.gain.value = 0;
                    this.capturingPCM = true;
                    this.workletInput.connect(this.worklet);
                    this.worklet.connect(this.sink).connect(context.destination);
                }
                else {
                    if (!stream)
                        throw Error('Аудиопоток для резервной записи недоступен');
                    this.sourceNode = context.createMediaStreamSource(stream);
                    this.processor = context.createScriptProcessor(2048, 2, 2);
                    this.sink = context.createGain();
                    this.sink.gain.value = 0;
                    this.processor.onaudioprocess = event => {
                        if (!this.capturingPCM)
                            return;
                        const block = event.inputBuffer, left = block.getChannelData(0);
                        const right = block.numberOfChannels > 1 ? block.getChannelData(1) : left;
                        const packet = new Float32Array(block.length * 2);
                        for (let i = 0; i < block.length; i++) {
                            packet[2 * i] = left[i] ?? 0;
                            packet[2 * i + 1] = right[i] ?? 0;
                        }
                        this.pcm.push(packet);
                        this.frames += block.length;
                    };
                    this.capturingPCM = true;
                    this.sourceNode.connect(this.processor);
                    this.processor.connect(this.sink).connect(context.destination);
                }
            }
            else {
                const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
                const mime = types.find(type => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type));
                if (!stream)
                    throw Error('Аудиопоток недоступен');
                const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
                this.recorder = recorder;
                this.chunks = [];
                recorder.ondataavailable = event => { if (event.data.size > 0)
                    this.chunks.push(event.data); };
                recorder.onerror = () => {
                    const error = Error('Ошибка захвата аудио');
                    const rejectStop = this.fail;
                    this.dispose();
                    rejectStop?.(error);
                    onFailure(error);
                };
                recorder.onstop = () => {
                    const result = new Blob(this.chunks, { type: recorder.mimeType || this.chunks[0]?.type || 'audio/webm' });
                    this.finish?.(result);
                    this.dispose();
                };
                recorder.start(100);
            }
            this.timeout = window.setTimeout(onLimit, Math.max(500, Math.min(90000, maxDurationMs)));
        }
        catch (error) {
            this.dispose();
            throw error;
        }
    }
    stop() {
        if (this.stopPromise)
            return this.stopPromise;
        if (this.capturingPCM) {
            const worklet = this.worklet;
            if (worklet) {
                this.stopPromise = new Promise(resolve => {
                    let finished = false;
                    const original = worklet.port.onmessage;
                    const done = () => {
                        if (finished)
                            return;
                        finished = true;
                        window.clearTimeout(timeout);
                        const blob = pcmWav(this.pcm, this.frames, this.sampleRate);
                        this.dispose();
                        resolve(blob);
                    };
                    worklet.port.onmessage = event => {
                        if (event.data === 'flushed') {
                            done();
                            return;
                        }
                        if (original)
                            original.call(worklet.port, event);
                    };
                    const timeout = window.setTimeout(done, 350);
                    try {
                        worklet.port.postMessage('flush');
                    }
                    catch {
                        done();
                    }
                });
                return this.stopPromise;
            }
            const blob = pcmWav(this.pcm, this.frames, this.sampleRate);
            this.dispose();
            return Promise.resolve(blob);
        }
        const recorder = this.recorder;
        if (!recorder || recorder.state !== 'recording')
            return Promise.reject(Error('Сначала включи запись сэмпла'));
        if (this.timeout !== null) {
            window.clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.stopPromise = new Promise((resolve, reject) => {
            this.finish = resolve;
            this.fail = reject;
            try {
                recorder.stop();
            }
            catch (e) {
                reject(e);
                this.dispose();
            }
        });
        return this.stopPromise;
    }
    dispose() {
        if (this.timeout !== null)
            window.clearTimeout(this.timeout);
        this.timeout = null;
        this.capturingPCM = false;
        if (this.processor) {
            this.processor.onaudioprocess = null;
            this.processor.disconnect();
        }
        if (this.worklet) {
            this.worklet.port.onmessage = null;
            this.worklet.disconnect();
        }
        // For live recording the worklet input may be the shared master; only disconnect its worklet branch.
        if (this.workletInput && this.worklet)
            try {
                this.workletInput.disconnect(this.worklet);
            }
            catch { }
        this.sourceNode?.disconnect();
        this.sink?.disconnect();
        this.processor = null;
        this.worklet = null;
        this.workletInput = null;
        this.sourceNode = null;
        this.sink = null;
        this.recorder = null;
        this.stopPromise = null;
        this.chunks = [];
        this.pcm = [];
        this.frames = 0;
        this.finish = null;
        this.fail = null;
    }
}
