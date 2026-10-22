import {SampleRecorder,preferPcmRecording,type CaptureSource} from './sample-recorder.js';
import {STEPS,STYLES,type Session,note} from './model.js';
import {placeSample} from './arranger.js';
import {SoundBank,type Sound} from './sounds.js';
import {AUDIO_HEADROOM,crossfadeGains,voiceGain,lowpassHz,recordingExtension} from './audio-quality.js';
export type EngineEvents={onStep?:(step:number)=>void;onState?:(state:string)=>void;onMeter?:(value:number)=>void;onClip?:(pad:number)=>void;onSamples?:()=>void};
const clamp=(x:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,x));
const sampleRate=44100;
function wavExport(buffer:AudioBuffer):Blob {
 const channels=2,n=buffer.length,ab=new ArrayBuffer(44+n*channels*2),view=new DataView(ab);let p=0;
 const str=(s:string)=>{for(const c of s)view.setUint8(p++,c.charCodeAt(0));};const u16=(v:number)=>{view.setUint16(p,v,true);p+=2;};const u32=(v:number)=>{view.setUint32(p,v,true);p+=4;};
 str('RIFF');u32(36+n*4);str('WAVE');str('fmt ');u32(16);u16(1);u16(channels);u32(buffer.sampleRate);u32(buffer.sampleRate*4);u16(4);u16(16);str('data');u32(n*4);
 const l=buffer.getChannelData(0),r=buffer.numberOfChannels>1?buffer.getChannelData(1):l;
 for(let i=0;i<n;i++){const x=clamp(l[i]??0,-.999,.999),y=clamp(r[i]??0,-.999,.999);u16((Math.round(x*(x<0?32768:32767)))&65535);u16((Math.round(y*(y<0?32768:32767)))&65535);}
 return new Blob([ab],{type:'audio/wav'});
}
function createBus(ctx:BaseAudioContext,destination:AudioNode,settings:Session){
 const a=ctx.createGain(),b=ctx.createGain(),input=ctx.createGain();
 const channels=Array.from({length:8},(_,pad)=>{
  const channel=ctx.createGain();channel.gain.value=settings.muted[pad]?0:clamp(settings.levels[pad]??1,0,1.2);
  channel.connect((pad===1||pad>=6)?b:a);return channel;
 });
 // DC/subsonic energy eats headroom and is inaudible on mobile speakers.
 const dc=ctx.createBiquadFilter();dc.type='highpass';dc.frequency.value=20;dc.Q.value=.707;
 const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.58;
 const eqLow=ctx.createBiquadFilter();eqLow.type='lowshelf';eqLow.frequency.value=110;
 const eqMid=ctx.createBiquadFilter();eqMid.type='peaking';eqMid.frequency.value=1100;eqMid.Q.value=.82;
 const eqHigh=ctx.createBiquadFilter();eqHigh.type='highshelf';eqHigh.frequency.value=6800;
 const dry=ctx.createGain();dry.gain.value=1;
 const echoSend=ctx.createGain(),echo=ctx.createDelay(1),feedback=ctx.createGain(),returnGain=ctx.createGain();
 echo.delayTime.value=.23;feedback.gain.value=AUDIO_HEADROOM.feedback;returnGain.gain.value=AUDIO_HEADROOM.wet;
 const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-8;compressor.ratio.value=2;compressor.knee.value=9;compressor.attack.value=.012;compressor.release.value=.18;
 const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-2.4;limiter.ratio.value=18;limiter.knee.value=1.2;limiter.attack.value=.002;limiter.release.value=.085;
 const master=ctx.createGain();master.gain.value=AUDIO_HEADROOM.master;
 const meter=ctx.createAnalyser();meter.fftSize=256;meter.smoothingTimeConstant=.2;
 a.connect(input);b.connect(input);input.connect(dc).connect(filter).connect(eqLow).connect(eqMid).connect(eqHigh);
 eqHigh.connect(dry).connect(compressor);
 eqHigh.connect(echoSend).connect(echo);echo.connect(feedback).connect(echo);echo.connect(returnGain).connect(compressor);
 compressor.connect(limiter).connect(master).connect(meter).connect(destination);
 function update(st:Session){
  const t=ctx.currentTime,[gainA,gainB]=crossfadeGains(st.crossfader);
  a.gain.setTargetAtTime(gainA,t,.012);b.gain.setTargetAtTime(gainB,t,.012);
  channels.forEach((channel,pad)=>channel.gain.setTargetAtTime(st.muted[pad]?0:clamp(st.levels[pad]??1,0,1.2),t,.008));
  filter.frequency.setTargetAtTime(lowpassHz(st.filter,ctx.sampleRate),t,.024);
  echoSend.gain.setTargetAtTime(AUDIO_HEADROOM.echoSend*clamp(st.echo,0,1),t,.028);
  eqLow.gain.setTargetAtTime(clamp(st.eqLow,-12,12),t,.017);
  eqMid.gain.setTargetAtTime(clamp(st.eqMid,-12,12),t,.017);
  eqHigh.gain.setTargetAtTime(clamp(st.eqHigh,-12,12),t,.017);
  echo.delayTime.setTargetAtTime(.75*60/clamp(st.tempo,80,175),t,.024);
 }
 update(settings);
 return {input,a,b,channels,master,meter,update};
}

export class Engine{
 ctx:AudioContext|null=null;bank=new SoundBank();private bus:ReturnType<typeof createBus>|null=null;
 private clock:AudioWorkletNode|null=null;private fallback:number|null=null;
 private pending=false;private running=false;private recordArmed=false;private origin=0;private nextStep=0;private nextTime=0;private stopAt=0;
 private active=new Set<{stop:()=>void;until:number;when:number}>();
 private generation=0;private scheduledTempo=136;private recorder:MediaRecorder|null=null;private capture:MediaStreamAudioDestinationNode|null=null;
 private recorded:Blob[]=[];private currentChunks:Blob[]=[];
 private gain=1;private sampleRecorder=new SampleRecorder();private takeCapture=new SampleRecorder();private takeActive=false;
 private offlineSampleActive=false;private offlineSampleAt=0;private offlineSampleTimer:number|null=null;
 private offlineSampleHits:Array<{pad:number;at:number;velocity:number;style:number;level:number}>=[];
 private sampleTarget:{pad:number;style:number}|null=null;events:EngineEvents={};
 private performanceBuffers=new Map<string,AudioBuffer>();
 private performanceVoices=new Set<{stop:()=>void;until:number;when:number}>();
 private cueStream:MediaStream|null=null;private cueSource:MediaStreamAudioSourceNode|null=null;private cueGain:GainNode|null=null;private cueEpoch=0;
 constructor(readonly getSession:()=>Session){if(typeof indexedDB!=='undefined')void this.restoreTakes();}
 get state(){return this.running?'PLAY':this.stopAt?'PAUSE':'STOP';}
 get recording(){return this.recordArmed;}
 get sampling(){return this.offlineSampleActive||this.sampleRecorder.active;}
 get cueMicActive(){return this.cueStream!==null;}
 get taking(){return this.takeActive||this.recorder?.state==='recording';}
 /** Explicit opt-in live microphone overdub into the existing master, recorder and limiter. */
 async startCueMic():Promise<void>{
  if(this.cueStream)return;
  if(!navigator.mediaDevices?.getUserMedia)throw Error('CUE: микрофон недоступен — нужен HTTPS и разрешение');
  const epoch=++this.cueEpoch;
  await this.unlock();
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
  if(epoch!==this.cueEpoch||!this.ctx||!this.bus){stream.getTracks().forEach(track=>track.stop());return;}
  try{
   const source=this.ctx.createMediaStreamSource(stream),gain=this.ctx.createGain();
   gain.gain.value=.3;source.connect(gain).connect(this.bus.input);
   this.cueStream=stream;this.cueSource=source;this.cueGain=gain;
   for(const track of stream.getAudioTracks())track.addEventListener('ended',()=>{if(this.cueStream===stream)this.stopCueMic()},{once:true});
   this.events.onState?.('CUE MIC ON');
  }catch(error){stream.getTracks().forEach(track=>track.stop());throw error;}
 }
 stopCueMic():void{
  ++this.cueEpoch;
  try{this.cueSource?.disconnect();this.cueGain?.disconnect();}catch{}
  this.cueStream?.getTracks().forEach(track=>track.stop());
  const wasActive=this.cueStream!==null;this.cueStream=null;this.cueSource=null;this.cueGain=null;
  if(wasActive)this.events.onState?.('CUE MIC OFF');
 }
 /** Music and instrument previews share the existing master EQ, limiter and meter. */
 connectMusicSource(node:AudioNode):()=>void{
  if(!this.ctx||!this.bus||this.ctx.state!=='running')throw Error('Аудиодвижок недоступен');
  const level=this.ctx.createGain();level.gain.value=.72;
  node.connect(level).connect(this.bus.input);
  return ()=>{try{node.disconnect(level);level.disconnect()}catch{}};
 }
 getMusicSyncPoint():{time:number;tempo:number;playing:boolean}{
  const tempo=this.getSession().tempo,now=this.ctx?.currentTime??0,d=60/tempo/4;
  if(!this.running||!this.ctx)return {time:now+.12,tempo,playing:false};
  this.pump();
  const delta=(STEPS-this.nextStep%STEPS)%STEPS;
  let at=this.nextTime+delta*d;
  while(at<now+.12)at+=STEPS*d;
  return {time:at,tempo,playing:true};
 }
 async preparePerformance(path:string):Promise<void>{
  if(!/^\/samples\/performance\/(acid|piano|fx)-0[1-8]\.wav$/.test(path))throw Error('Неизвестный звук');
  await this.unlock();if(this.performanceBuffers.has(path))return;
  const response=await fetch(path);if(!response.ok)throw Error('Звук недоступен: '+path);
  this.performanceBuffers.set(path,await this.ctx!.decodeAudioData(await response.arrayBuffer()));
 }
 /** A real bundled WAV, rate-shifted only when a musical key is selected. */
 async playPerformance(path:string,rate=1,at?:number,level=.53):Promise<void>{
  await this.preparePerformance(path);
  const ctx=this.ctx!,bus=this.bus!,buffer=this.performanceBuffers.get(path)!;
  if(this.active.size>=28){const oldest=this.active.values().next().value;if(oldest){oldest.stop();this.active.delete(oldest)}}
  const when=Math.max(ctx.currentTime+.002,at??ctx.currentTime+.002);
  const source=ctx.createBufferSource(),amp=ctx.createGain();source.buffer=buffer;
  source.playbackRate.value=clamp(rate,.5,2);
  const peak=clamp(level,0,.75),end=when+buffer.duration/source.playbackRate.value;
  amp.gain.setValueAtTime(0,when);amp.gain.linearRampToValueAtTime(peak,when+.005);
  amp.gain.setValueAtTime(peak,Math.max(when+.005,end-.018));amp.gain.linearRampToValueAtTime(0,end);
  source.connect(amp).connect(bus.input);
  const voice={when,until:end+.02,stop:()=>{try{source.stop()}catch{}}};
  source.onended=()=>{source.disconnect();amp.disconnect();this.active.delete(voice);this.performanceVoices.delete(voice)};
  this.active.add(voice);this.performanceVoices.add(voice);source.start(when);source.stop(end+.004);
 }
 stopPerformance(){for(const voice of this.performanceVoices){voice.stop();this.active.delete(voice)}this.performanceVoices.clear()}
 updateMix(){
  const tempo=this.getSession().tempo;
  if(this.running&&this.ctx&&tempo!==this.scheduledTempo)this.rephase(tempo);
  this.bus?.update(this.getSession());
 }
 private rephase(tempo:number){
  if(!this.ctx||!this.running)return;
  const now=this.ctx.currentTime,oldStep=60/this.scheduledTempo/4,newStep=60/tempo/4;
  const beforeFirstStep=now<this.origin;
  const phase=Math.max(0,(now-this.origin)/oldStep);
  for(const voice of [...this.active])if(voice.when>now){voice.stop();this.active.delete(voice)}
  if(!beforeFirstStep)this.origin=now-phase*newStep;
  this.nextStep=beforeFirstStep?0:Math.max(0,Math.ceil(phase+1e-7));
  this.nextTime=this.origin+this.nextStep*newStep;
  this.scheduledTempo=tempo;
  this.pump();
 }
 get takes(){return this.recorded.slice();}
 get time(){return this.ctx?.currentTime??0;}
 private meterData=new Uint8Array(256);
 get meterLevel(){if(!this.bus)return 0;this.bus.meter.getByteTimeDomainData(this.meterData);let energy=0;for(let i=0;i<this.meterData.length;i++){const v=(this.meterData[i]!-128)/128;energy+=v*v;}return Math.min(1,Math.sqrt(energy/this.meterData.length)*2.8);}
 readWaveform(output:Uint8Array):boolean{if(!this.bus||!this.ctx||this.ctx.state!=='running')return false;this.bus.meter.getByteTimeDomainData(output);return true;}
 get currentStep(){if(!this.ctx||!this.running)return 0;const d=60/this.getSession().tempo/4;return ((Math.floor((this.time-this.origin)/d+1e-4)%STEPS)+STEPS)%STEPS;}
 async unlock():Promise<void>{
  if(!this.ctx){const C=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!C)throw Error('Web Audio недоступен');this.ctx=new C({latencyHint:'interactive'});void this.bank.restore(this.ctx).then(()=>this.events.onSamples?.()).catch(()=>{});this.bus=createBus(this.ctx,this.ctx.destination,this.getSession());}
  if(this.ctx.state!=='running')await this.ctx.resume();
  if(this.ctx.state!=='running')throw Error('Разреши воспроизведение звука в Safari');
  // Decoding is demand-driven: a pad never waits for all eight WAV decoders.
  if(!this.clock&&this.fallback===null){
   this.fallback=window.setInterval(()=>this.pump(),25); // reliable on the very first gesture
   // WebKit/iOS AudioWorklet can terminate during short pad recording in automated
   // WebKit. A 25 ms lookahead pump avoids a second rendering thread on Safari.
   // Chrome/Android retain low-cost AudioWorklet clocking.
   const agent=typeof navigator!=='undefined'?navigator.userAgent:'';
   if(!/AppleWebKit/i.test(agent)||/Chrome|Chromium|Edg|OPR|Android/i.test(agent))
    void this.enableWorklet(this.ctx);
  }
  this.events.onState?.('AUDIO READY');
 }
 private async enableWorklet(ctx:AudioContext):Promise<void>{
  try{if(!ctx.audioWorklet)return;await ctx.audioWorklet.addModule('/app/clock.js');if(this.ctx!==ctx)return;
   const worklet=new AudioWorkletNode(ctx,'artss-pulse',{numberOfOutputs:1,outputChannelCount:[1]});
   const silent=ctx.createGain();silent.gain.value=0;worklet.connect(silent).connect(ctx.destination);worklet.port.onmessage=()=>this.pump();this.clock=worklet;worklet.port.postMessage(this.running?'start':'pause');
   if(this.fallback!==null){window.clearInterval(this.fallback);this.fallback=null;}
  }catch{}
 }
 async start(){const generation=this.generation;await this.unlock();if(this.running||this.generation!==generation)return;await this.bank.warm(this.ctx!);if(this.running||this.generation!==generation)return;const d=60/this.getSession().tempo/4;
  if(this.stopAt>0){const progress=this.stopAt-this.origin;this.origin=this.time-progress;this.nextStep=Math.max(0,Math.ceil((this.time-this.origin)/d));this.nextTime=this.origin+this.nextStep*d;}
  else{this.origin=this.time+.05;this.nextStep=0;this.nextTime=this.origin;}
  this.scheduledTempo=this.getSession().tempo;this.running=true;this.stopAt=0;this.generation++;this.clock?.port.postMessage('start');this.pump();this.events.onState?.('PLAY');
 }
 pause(){this.stopCueMic();if(!this.running)return;this.running=false;this.stopAt=this.time;this.generation++;this.clock?.port.postMessage('pause');this.silence();this.events.onState?.('PAUSE');}
 stop(){this.stopCueMic();this.running=false;this.stopAt=0;this.recordArmed=false;this.nextStep=0;this.nextTime=0;this.generation++;this.clock?.port.postMessage('pause');this.silence();this.events.onState?.('STOP');}
 async toggleRecord(){const generation=this.generation;await this.unlock();if(generation!==this.generation)return this.recordArmed;if(!this.running)await this.start();if(!this.running)return this.recordArmed;this.recordArmed=!this.recordArmed;this.events.onState?.(this.recordArmed?'REC ON':'REC OFF');return this.recordArmed;}
 async hit(pad:number,velocity=1){if(!Number.isInteger(pad)||pad<0||pad>7||this.getSession().muted[pad])return;
  const generation=this.generation;
  // Do not await resume or worklet setup once AudioContext is already running. Trigger voice on pointerdown.
  if(!this.ctx||this.ctx.state!=='running'||!this.bus)await this.unlock();
  if(!this.bank.resolve(pad,this.getSession().style))await this.bank.ensurePad(this.ctx!,pad);
  if(generation!==this.generation||this.getSession().muted[pad])return;
  const now=this.ctx!.currentTime+.002;
  this.voice(this.ctx!,this.bus!.channels[pad]!,pad,now,velocity,this.getSession().style,1);
  if(this.recordArmed&&this.running){const d=60/this.getSession().tempo/4;
   const quant=this.getSession().quantize?Math.round((now-this.origin)/d):Math.floor((now-this.origin)/d);
   const at=((quant%STEPS)+STEPS)%STEPS;note(this.getSession().pattern,pad,at,Math.min(1,velocity));this.events.onClip?.(pad);}
 }
 private silence(){for(const v of this.active){try{v.stop();}catch{}}this.active.clear();}
 private pump(){if(!this.ctx||!this.running||!this.bus)return;
  const now=this.ctx.currentTime;const tempo=this.getSession().tempo;const d=60/tempo/4;
  if(this.scheduledTempo!==tempo){this.rephase(tempo);return;}
  // Safari background suspension: fast-forward stale transport steps instead of bursting delayed notes.
  if(this.nextTime<now-.035){const skip=Math.max(1,Math.ceil((now-this.nextTime-.008)/d));this.nextStep+=skip;this.nextTime+=skip*d;}
  while(this.nextTime<now+.115){const step=this.nextStep%STEPS,session=this.getSession();
   for(let p=0;p<8;p++){const velocity=session.pattern[p]?.[step]??0;if(session.muted[p]||velocity===0)continue;
    this.voice(this.ctx,this.bus.channels[p]!,p,this.nextTime,velocity,session.style,1);
   }
   this.events.onStep?.(step);this.nextStep++;this.nextTime+=d;
  }
  for(const a of [...this.active])if(a.until<now)this.active.delete(a);
 }
 private voice(ctx:BaseAudioContext,bus:AudioNode,pad:number,when:number,velocity:number,style:number,level:number){
  const live=ctx===this.ctx;
  if(live&&this.active.size>=28){const oldest=this.active.values().next().value;if(oldest){oldest.stop();this.active.delete(oldest);}}
  const sample=this.bank.resolve(pad,style);if(!sample)return;
  if(live&&this.offlineSampleActive){const at=when-this.offlineSampleAt;
   if(at>=0&&at<12.25)this.offlineSampleHits.push({pad,at,velocity,style,level});
  }
  const amp=ctx.createGain();
  const low=ctx.createBiquadFilter(),high=ctx.createBiquadFilter();
  low.type='highpass';high.type='lowpass';
  low.frequency.value=sample?.lowCut??(pad===1?24:pad===6?55:pad===0?22:85);
  high.frequency.value=Math.min(ctx.sampleRate*.46,sample?.highCut??(pad===1?640:pad===6?15500:17000));
  low.Q.value=.707;high.Q.value=.707;
  const baseline=voiceGain(velocity,level,sample?.gain??(pad===1?.64:pad===6?.33:.78));
  const attack=.003,release=.012;
  low.connect(high).connect(amp).connect(bus);
  const playing:{stop:()=>void;until:number;when:number}={stop:()=>{},until:when+1,when};
  const cleanup=()=>{try{source.disconnect();low.disconnect();high.disconnect();amp.disconnect()}catch{}this.active.delete(playing)};
  amp.gain.setValueAtTime(0,when);amp.gain.linearRampToValueAtTime(Math.max(.00001,baseline),when+attack);

   const source=ctx.createBufferSource();source.buffer=sample.buffer;source.connect(low);
   const end=when+sample.buffer.duration;const fade=Math.min(release,Math.max(.003,sample.buffer.duration*.25));
   amp.gain.setValueAtTime(Math.max(.00001,baseline),Math.max(when+attack,end-fade));
   amp.gain.linearRampToValueAtTime(0,end);
   source.onended=cleanup;source.start(when);source.stop(end+.004);
   playing.until=end+.025;
   playing.stop=()=>{try{
    const now=ctx.currentTime;
    // A scheduled note must never start after STOP or voice stealing.
    if(now<=when){source.stop(now);cleanup();return;}
    if(typeof amp.gain.cancelAndHoldAtTime==='function')amp.gain.cancelAndHoldAtTime(now);
    else {
     // Preserve the envelope level when cancelling an attack/release ramp.
     const peak=Math.max(.00001,baseline),releaseAt=Math.max(when+attack,end-fade);
     const held=now<when+attack?peak*(now-when)/attack:now<releaseAt?peak:peak*Math.max(0,(end-now)/(end-releaseAt));
     amp.gain.cancelScheduledValues(now);amp.gain.setValueAtTime(held,now);
    }
    amp.gain.linearRampToValueAtTime(0,now+.012);source.stop(now+.018);
   }catch{cleanup()}};
  if(live)this.active.add(playing);
 }

 async addSamples(files:FileList|File[],slot?:number):Promise<Array<{pad:number;name:string}>>{
  if(slot===undefined)throw Error('Импорт разрешён только через REPLACE выбранного пэда.');
  const file=Array.from(files)[0];if(!file)throw Error('Выбери аудиофайл');
  await this.unlock();const result=await this.bank.importFile(file,this.ctx!,slot,this.getSession().style);
  return [{pad:result.pad,name:file.name}];
 }
 async restoreFactorySound(pad:number):Promise<void>{await this.bank.restoreFactory(pad,this.getSession().style);this.events.onSamples?.();}
 private ensureCapture():MediaStreamAudioDestinationNode{
  // Ordinary playback never enters WebKit's capture pipeline; allocate only for an explicit recording.
  if(!this.ctx||!this.bus)throw Error('Audio engine not initialized');
  if(!this.capture){this.capture=this.ctx.createMediaStreamDestination();this.bus.master.connect(this.capture);}
  return this.capture;
 }
 async beginSampleCapture(source:CaptureSource, pad:number):Promise<void>{
  if(!Number.isInteger(pad)||pad<0||pad>=8)throw Error('Выбери пэд');
  if(this.sampling)throw Error('Запись уже идёт');
  await this.unlock();
  if(source==='live'&&!this.running)await this.start();
  const target={pad,style:this.getSession().style};
  // WebKit process crashes during continuous live PCM routing. Capture deterministic pad events
  // and render them through the same master DSP offline when Stop is pressed. No microphone.
  if(preferPcmRecording(navigator.userAgent,typeof MediaRecorder!=='undefined')){
   this.offlineSampleHits=[];this.offlineSampleAt=this.ctx!.currentTime;this.offlineSampleActive=true;
   this.sampleTarget=target;
   this.offlineSampleTimer=window.setTimeout(()=>{void this.endSampleCapture().catch(e=>this.events.onState?.(e instanceof Error?'SAMPLE ERROR · '+e.message:'SAMPLE ERROR'))},12000);
   this.events.onState?.(`SAMPLE REC · ${target.pad+1}`);return;
  }
  const capture=this.ensureCapture();
  await this.sampleRecorder.start(source,capture.stream,this.ctx!,
   ()=>{void this.endSampleCapture().catch(e=>this.events.onState?.(e instanceof Error?'SAMPLE ERROR · '+e.message:'SAMPLE ERROR'));},
   error=>{this.sampleTarget=null;this.events.onState?.('SAMPLE ERROR · '+error.message);});
  this.sampleTarget=target;
  this.events.onState?.(`SAMPLE REC · ${target.pad+1}`);
 }
 async endSampleCapture():Promise<{pad:number;style:number;name:string}>{
  const target=this.sampleTarget;
  if(!target)throw Error('Запись сэмпла не запущена');
  this.sampleTarget=null;
  let blob:Blob;
  if(this.offlineSampleActive){
   this.offlineSampleActive=false;
   if(this.offlineSampleTimer!==null){window.clearTimeout(this.offlineSampleTimer);this.offlineSampleTimer=null;}
   const hits=this.offlineSampleHits;this.offlineSampleHits=[];
   if(!hits.length)throw Error('Нажми пэд во время записи');
   const duration=Math.min(12,Math.max(.1,(this.ctx?.currentTime??this.offlineSampleAt)-this.offlineSampleAt));
   const length=Math.ceil((duration+.2)*sampleRate);
   const offline=new OfflineAudioContext(2,length,sampleRate);
   const mix=createBus(offline,offline.destination,this.getSession());
   for(const hit of hits){
    if(hit.at>=duration)continue;
    const when=Math.max(.004,hit.at);
    this.voice(offline,mix.channels[hit.pad]!,hit.pad,when,hit.velocity,hit.style,1);
   }
   blob=wavExport(await offline.startRendering());
  }else blob=await this.sampleRecorder.stop();
  if(blob.size<2048)throw Error('Запись слишком короткая');
  if(!this.ctx)throw Error('Нет аудиоконтекста');
  const extension=recordingExtension(blob.type);
  const file=new File([blob],`REC-PAD-${target.pad+1}.${extension}`,{type:blob.type});
  const result=await this.bank.importFile(file,this.ctx,target.pad,target.style);
  placeSample(this.getSession().pattern,target.pad,target.style);
  this.events.onState?.(`SAMPLE SAVED · PAD ${target.pad+1}`);
  return {pad:result.pad,style:target.style,name:file.name};
 }
 async beginTake():Promise<void>{
  await this.unlock();if(this.taking)return;
  if(preferPcmRecording(navigator.userAgent,typeof MediaRecorder!=='undefined')){
   if(!this.bus||!this.ctx)throw Error('Аудиодвижок не готов');
   this.takeActive=true;
   try{
    // Safari: post-limiter PCM direct to capture-only worklet; no MediaStream roundtrip.
    const fallbackStream=this.ctx.audioWorklet?null:this.ensureCapture().stream;
    await this.takeCapture.start('live',fallbackStream,this.ctx,
     ()=>{void this.endTake().catch(error=>this.events.onState?.('ERROR · '+String(error)))},
     error=>{this.takeActive=false;this.events.onState?.('ERROR · '+error.message)},
     this.bus.master,60000);
   }catch(error){this.takeActive=false;throw error}
   this.events.onState?.('TAKE RECORDING');return;
  }
  const capture=this.ensureCapture();
  const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];const type=types.find(t=>MediaRecorder.isTypeSupported(t));
  const r=new MediaRecorder(capture.stream,type?{mimeType:type}:{});this.currentChunks=[];
  r.ondataavailable=e=>{if(e.data.size)this.currentChunks.push(e.data)};
  r.onstop=()=>{const blob=new Blob(this.currentChunks,{type:r.mimeType||'audio/webm'});this.recorder=null;
   if(blob.size){this.recorded.unshift(blob);void this.storeTake(blob);this.events.onState?.('TAKE SAVED');}
  };
  r.onerror=()=>this.events.onState?.('ERROR · аудиозапись прервана');
  r.start(250);this.recorder=r;this.events.onState?.('TAKE RECORDING');
 }
 async endTake():Promise<void>{
  if(this.takeActive){
   this.takeActive=false;
   const blob=await this.takeCapture.stop();
   if(blob.size>2048){this.recorded.unshift(blob);void this.storeTake(blob);this.events.onState?.('TAKE SAVED');}
   return;
  }
  if(this.recorder?.state==='recording'){
   const recorder=this.recorder;
   await new Promise<void>((resolve,reject)=>{
    const previous=recorder.onstop;
    recorder.onstop=event=>{previous?.call(recorder,event);resolve()};
    recorder.addEventListener('error',()=>reject(Error('Ошибка аудиозаписи')),{once:true});
    try{recorder.stop()}catch(error){reject(error)}
   });
  }
 }
 private openTakes():Promise<IDBDatabase|null>{return new Promise(resolve=>{const r=indexedDB.open('artss-live-takes-v18',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('takes'))r.result.createObjectStore('takes',{autoIncrement:true})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);r.onblocked=()=>resolve(null)})}
 private async storeTake(blob:Blob){const db=await this.openTakes();if(!db)return;try{const tx=db.transaction('takes','readwrite');tx.objectStore('takes').add(blob)}catch{}finally{db.close()}}
 private async restoreTakes(){const db=await this.openTakes();if(!db)return;try{const r=db.transaction('takes','readonly').objectStore('takes').getAll();r.onsuccess=()=>{for(const b of (r.result as Blob[]).reverse())if(b.size)this.recorded.push(b)};}catch{}finally{db.close()}}

 async exportWav(bars=4):Promise<Blob>{await this.unlock();await this.bank.warm(this.ctx!);const state=this.getSession();const rate=sampleRate;const d=60/state.tempo/4;const length=Math.ceil((bars*16*d+2)*rate);
  const offline=new OfflineAudioContext(2,length,rate),bus=createBus(offline,offline.destination,state);
  for(let step=0;step<bars*16;step++)for(let pad=0;pad<8;pad++){
   const velocity=state.pattern[pad]?.[step%16]??0;if(!velocity||state.muted[pad])continue;
   this.voice(offline,bus.channels[pad]!,pad,step*d+.02,velocity,state.style,1);
  }
  return wavExport(await offline.startRendering());
 }
}
