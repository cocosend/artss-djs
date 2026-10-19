/** Single-use sample capture. Prefer MediaRecorder; capture lossless WAV when unavailable (Safari/WebKit). */
export type CaptureSource = 'live' | 'mic';

const pcmWav = (chunks: Float32Array[], frameCount: number, sampleRate: number): Blob => {
  const bytes = new ArrayBuffer(44 + frameCount * 4);
  const view = new DataView(bytes);
  const ascii = (index:number,s:string) => {for(let i=0;i<s.length;i++)view.setUint8(index+i,s.charCodeAt(i));};
  ascii(0,'RIFF');view.setUint32(4,36+frameCount*4,true);ascii(8,'WAVE');
  ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);
  ascii(36,'data');view.setUint32(40,frameCount*4,true);
  let offset=44;
  for(const chunk of chunks)for(let i=0;i<chunk.length;i++){
    const a=Math.max(-1,Math.min(1,chunk[i]??0));
    view.setInt16(offset,Math.round(a*(a<0?32768:32767)),true);offset+=2;
  }
  return new Blob([bytes],{type:'audio/wav'});
};

export class SampleRecorder {
  private recorder: MediaRecorder | null = null;
  private ownedStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private stopPromise: Promise<Blob> | null = null;
  private timeout: number | null = null;
  private finish: ((blob: Blob) => void) | null = null;
  private fail: ((error: Error) => void) | null = null;
  private capturingPCM = false;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private pcm: Float32Array[] = [];
  private frames=0;
  private sampleRate=44100;

  get active(): boolean {return this.capturingPCM || this.recorder?.state === 'recording';}

  async start(source: CaptureSource, liveStream: MediaStream, context: AudioContext, onLimit: () => void): Promise<void> {
    if (this.active || this.stopPromise) throw Error('Запись сэмпла уже идёт');
    let stream: MediaStream;
    if (source === 'mic') {
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Микрофон недоступен');
      stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      this.ownedStream = stream;
    } else stream = liveStream;
    try {
      if(typeof MediaRecorder === 'undefined') {
        // Safari / WebKit builds without MediaRecorder still get uncompressed, 44/48kHz PCM.
        this.sourceNode = context.createMediaStreamSource(stream);
        this.processor = context.createScriptProcessor(2048,2,2);
        this.sink = context.createGain();this.sink.gain.value=0;
        this.pcm=[];this.frames=0;this.sampleRate=context.sampleRate;
        this.processor.onaudioprocess = event => {
          if(!this.capturingPCM)return;
          const block=event.inputBuffer,left=block.getChannelData(0);
          const right=block.numberOfChannels>1?block.getChannelData(1):left;
          const packet=new Float32Array(block.length*2);
          for(let i=0;i<block.length;i++){packet[2*i]=left[i]??0;packet[2*i+1]=right[i]??0;}
          this.pcm.push(packet);this.frames+=block.length;
        };
        this.capturingPCM=true;
        this.sourceNode.connect(this.processor);this.processor.connect(this.sink);this.sink.connect(context.destination);
      } else {
        const types = ['audio/mp4','audio/webm;codecs=opus','audio/webm'];
        const mime = types.find(type => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, mime ? {mimeType:mime} : undefined);
        this.recorder = recorder;this.chunks=[];
        recorder.ondataavailable = event => {if(event.data.size > 0)this.chunks.push(event.data);};
        recorder.onerror = () => this.fail?.(Error('Ошибка захвата аудио'));
        recorder.onstop = () => {
          const result = new Blob(this.chunks, {type:recorder.mimeType || this.chunks[0]?.type || 'audio/webm'});
          this.finish?.(result);this.dispose();
        };
        recorder.start(100);
      }
      this.timeout=window.setTimeout(onLimit,12000);
    } catch(error) {this.dispose();throw error;}
  }

  stop(): Promise<Blob> {
    if(this.stopPromise)return this.stopPromise;
    if(this.capturingPCM){
      const blob=pcmWav(this.pcm,this.frames,this.sampleRate);
      this.dispose();
      return Promise.resolve(blob);
    }
    const recorder=this.recorder;
    if(!recorder || recorder.state!=='recording')return Promise.reject(Error('Сначала включи запись сэмпла'));
    if(this.timeout!==null){window.clearTimeout(this.timeout);this.timeout=null;}
    this.stopPromise=new Promise<Blob>((resolve,reject)=>{
      this.finish=resolve;this.fail=reject;
      try{recorder.stop();}catch(e){reject(e);this.dispose();}
    });
    return this.stopPromise;
  }

  private dispose():void {
    if(this.timeout!==null)window.clearTimeout(this.timeout);
    this.timeout=null;
    this.capturingPCM=false;
    if(this.processor){this.processor.onaudioprocess=null;this.processor.disconnect();}
    this.sourceNode?.disconnect();this.sink?.disconnect();
    this.processor=null;this.sourceNode=null;this.sink=null;
    this.ownedStream?.getTracks().forEach(track=>track.stop());this.ownedStream=null;
    this.recorder=null;this.stopPromise=null;this.chunks=[];this.pcm=[];this.frames=0;
    this.finish=null;this.fail=null;
  }
}