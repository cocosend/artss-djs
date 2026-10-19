/** Single-use MediaRecorder capture that never routes microphone input to speakers. */
export type CaptureSource = 'live' | 'mic';

export class SampleRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private ownedStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private stopPromise: Promise<Blob> | null = null;
  private timeout: number | null = null;
  private finish: ((blob: Blob) => void) | null = null;
  private fail: ((error: Error) => void) | null = null;
  private onLimit: (() => void) | null = null;

  get active(): boolean { return this.recorder?.state === 'recording'; }

  async start(source: CaptureSource, liveStream: MediaStream, onLimit: () => void): Promise<void> {
    if (this.recorder || this.stopPromise) throw Error('Запись сэмпла уже идёт');
    this.onLimit = onLimit;
    let stream: MediaStream;
    if (source === 'mic') {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Микрофон недоступен');
      stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      this.ownedStream = stream;
    } else stream = liveStream;
    try {
      const types = ['audio/mp4','audio/webm;codecs=opus','audio/webm'];
      if (typeof MediaRecorder === 'undefined') throw Error('Запись сэмплов не поддерживается');
      const mime = types.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? {mimeType:mime} : undefined);
      this.recorder = recorder;
      this.stream = stream;
      this.chunks = [];
      recorder.ondataavailable = event => {if(event.data.size > 0)this.chunks.push(event.data);};
      recorder.onerror = () => {this.fail?.(Error('Ошибка захвата аудио'));};
      recorder.onstop = () => {
        const result = new Blob(this.chunks, {type:recorder.mimeType || this.chunks[0]?.type || 'audio/webm'});
        this.finish?.(result);
        this.dispose();
      };
      recorder.start(100);
      this.timeout = window.setTimeout(onLimit, 12000);
    } catch(error) {
      this.dispose();
      throw error;
    }
  }

  stop(): Promise<Blob> {
    if (this.stopPromise) return this.stopPromise;
    const recorder = this.recorder;
    if (!recorder || recorder.state !== 'recording') return Promise.reject(Error('Сначала включи запись сэмпла'));
    if (this.timeout !== null) {window.clearTimeout(this.timeout);this.timeout=null;}
    this.stopPromise = new Promise<Blob>((resolve, reject) => {
      this.finish = resolve;
      this.fail = reject;
      try {recorder.stop();} catch(e) {reject(e);this.dispose();}
    });
    return this.stopPromise;
  }

  private dispose(): void {
    if (this.timeout !== null) window.clearTimeout(this.timeout);
    this.timeout = null;
    this.ownedStream?.getTracks().forEach(track => track.stop());
    this.ownedStream = null;
    this.stream = null;
    this.recorder = null;
    this.stopPromise = null;
    this.chunks = [];
    this.finish = null;
    this.fail = null;
    this.onLimit = null;
  }
}