import {SampleRecorder,type CaptureSource} from './sample-recorder.js';
import {STEPS,STYLES,type Session,note} from './model.js';
import {placeSample} from './arranger.js';
import {SoundBank,type Sound} from './sounds.js';
import {AUDIO_HEADROOM,crossfadeGains,voiceGain,lowpassHz} from './audio-quality.js';
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
 // DC/subsonic energy eats headroom and is inaudible on mobile speakers.
 const dc=ctx.createBiquadFilter();dc.type='highpass';dc.frequency.value=23;dc.Q.value=.707;
 const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.58;
 const eqLow=ctx.createBiquadFilter();eqLow.type='lowshelf';eqLow.frequency.value=110;
 const eqMid=ctx.createBiquadFilter();eqMid.type='peaking';eqMid.frequency.value=1100;eqMid.Q.value=.82;
 const eqHigh=ctx.createBiquadFilter();eqHigh.type='highshelf';eqHigh.frequency.value=6800;
 const dry=ctx.createGain();dry.gain.value=1;
 const echoSend=ctx.createGain(),echo=ctx.createDelay(1),feedback=ctx.createGain(),returnGain=ctx.createGain();
 echo.delayTime.value=.23;feedback.gain.value=AUDIO_HEADROOM.feedback;returnGain.gain.value=AUDIO_HEADROOM.wet;
 const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-10;compressor.ratio.value=3;compressor.knee.value=10;compressor.attack.value=.006;compressor.release.value=.14;
 const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-2.8;limiter.ratio.value=18;limiter.knee.value=1.2;limiter.attack.value=.002;limiter.release.value=.085;
 const master=ctx.createGain();master.gain.value=AUDIO_HEADROOM.master;
 const meter=ctx.createAnalyser();meter.fftSize=256;meter.smoothingTimeConstant=.2;
 a.connect(input);b.connect(input);input.connect(dc).connect(filter).connect(eqLow).connect(eqMid).connect(eqHigh);
 eqHigh.connect(dry).connect(compressor);
 eqHigh.connect(echoSend).connect(echo);echo.connect(feedback).connect(echo);echo.connect(returnGain).connect(compressor);
 compressor.connect(limiter).connect(master).connect(meter).connect(destination);
 function update(st:Session){
  const t=ctx.currentTime,[gainA,gainB]=crossfadeGains(st.crossfader);
  a.gain.setTargetAtTime(gainA,t,.012);b.gain.setTargetAtTime(gainB,t,.012);
  filter.frequency.setTargetAtTime(lowpassHz(st.filter,ctx.sampleRate),t,.024);
  echoSend.gain.setTargetAtTime(AUDIO_HEADROOM.echoSend*clamp(st.echo,0,1),t,.028);
  eqLow.gain.setTargetAtTime(clamp(st.eqLow,-12,12),t,.017);
  eqMid.gain.setTargetAtTime(clamp(st.eqMid,-12,12),t,.017);
  eqHigh.gain.setTargetAtTime(clamp(st.eqHigh,-12,12),t,.017);
  echo.delayTime.setTargetAtTime(.75*60/clamp(st.tempo,80,175),t,.024);
 }
 update(settings);
 return {input,a,b,master,meter,update};
}

export class Engine{
 ctx:AudioContext|null=null;bank=new SoundBank();private bus:ReturnType<typeof createBus>|null=null;
 private clock:AudioWorkletNode|null=null;private fallback:number|null=null;
 private pending=false;private running=false;private recordArmed=false;private origin=0;private nextStep=0;private nextTime=0;private stopAt=0;
 private active=new Set<{stop:()=>void;until:number}>();
 private generation=0;private scheduledTempo=136;private recorder:MediaRecorder|null=null;private capture:MediaStreamAudioDestinationNode|null=null;
 private recorded:Blob[]=[];private currentChunks:Blob[]=[];
 private gain=1;private sampleRecorder=new SampleRecorder();private sampleTarget:{pad:number;style:number}|null=null;events:EngineEvents={};
 constructor(readonly getSession:()=>Session){if(typeof indexedDB!=='undefined')void this.restoreTakes();}
 get state(){return this.running?'PLAY':this.stopAt?'PAUSE':'STOP';}
 get recording(){return this.recordArmed;}
 get sampling(){return this.sampleRecorder.active;}
 updateMix(){this.bus?.update(this.getSession());}
 get takes(){return this.recorded.slice();}
 get time(){return this.ctx?.currentTime??0;}
 private meterData=new Uint8Array(256);
 get meterLevel(){if(!this.bus)return 0;this.bus.meter.getByteTimeDomainData(this.meterData);let energy=0;for(let i=0;i<this.meterData.length;i++){const v=(this.meterData[i]!-128)/128;energy+=v*v;}return Math.min(1,Math.sqrt(energy/this.meterData.length)*2.8);}
 readWaveform(output:Uint8Array):boolean{if(!this.bus||!this.ctx||this.ctx.state!=='running')return false;this.bus.meter.getByteTimeDomainData(output);return true;}
 get currentStep(){if(!this.ctx||!this.running)return 0;const d=60/this.getSession().tempo/4;return ((Math.floor((this.time-this.origin)/d+1e-4)%STEPS)+STEPS)%STEPS;}
 async unlock():Promise<void>{
  if(!this.ctx){const C=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!C)throw Error('Web Audio недоступен');this.ctx=new C({latencyHint:'interactive'});this.capture=this.ctx.createMediaStreamDestination();void this.bank.restore(this.ctx).then(()=>this.events.onSamples?.()).catch(()=>{});this.bus=createBus(this.ctx,this.ctx.destination,this.getSession());this.bus.master.connect(this.capture);}
  if(this.ctx.state!=='running')await this.ctx.resume();
  if(this.ctx.state!=='running')throw Error('Разреши воспроизведение звука в Safari');
  // Keep the audio context gesture-driven. Sample arrays are fetched before first play.
  void this.bank.warm(this.ctx).catch(()=>{});
  if(!this.clock&&this.fallback===null){
   this.fallback=window.setInterval(()=>this.pump(),25); // reliable on the very first gesture
   void this.enableWorklet(this.ctx);
  }
  this.events.onState?.('AUDIO READY');
 }
 private async enableWorklet(ctx:AudioContext):Promise<void>{
  try{if(!ctx.audioWorklet)return;await ctx.audioWorklet.addModule('/app/clock.js');if(this.ctx!==ctx)return;
   const worklet=new AudioWorkletNode(ctx,'artss-pulse',{numberOfOutputs:1,outputChannelCount:[1]});
   const silent=ctx.createGain();silent.gain.value=0;worklet.connect(silent).connect(ctx.destination);worklet.port.onmessage=()=>this.pump();this.clock=worklet;
   if(this.fallback!==null){window.clearInterval(this.fallback);this.fallback=null;}
  }catch{}
 }
 async start(){const generation=this.generation;await this.unlock();if(this.running||this.generation!==generation)return;await this.bank.warm(this.ctx!);if(this.running||this.generation!==generation)return;const d=60/this.getSession().tempo/4;
  if(this.stopAt>0){const progress=this.stopAt-this.origin;this.origin=this.time-progress;this.nextStep=Math.max(0,Math.ceil((this.time-this.origin)/d));this.nextTime=this.origin+this.nextStep*d;}
  else{this.origin=this.time+.05;this.nextStep=0;this.nextTime=this.origin;}
  this.scheduledTempo=this.getSession().tempo;this.running=true;this.stopAt=0;this.generation++;this.pump();this.events.onState?.('PLAY');
 }
 pause(){if(!this.running)return;this.running=false;this.stopAt=this.time;this.generation++;this.silence();this.events.onState?.('PAUSE');}
 stop(){this.running=false;this.stopAt=0;this.recordArmed=false;this.nextStep=0;this.nextTime=0;this.generation++;this.silence();this.events.onState?.('STOP');}
 async toggleRecord(){await this.unlock();if(!this.running)await this.start();if(!this.running)return this.recordArmed;this.recordArmed=!this.recordArmed;this.events.onState?.(this.recordArmed?'REC ON':'REC OFF');return this.recordArmed;}
 async hit(pad:number,velocity=1){if(!Number.isInteger(pad)||pad<0||pad>7||this.getSession().muted[pad])return;
  // Do not await resume or worklet setup once AudioContext is already running. Trigger voice on pointerdown.
  if(!this.ctx||this.ctx.state!=='running'||!this.bus)await this.unlock();
  if(pad!==1&&pad!==6&&!this.bank.resolve(pad,this.getSession().style))await this.bank.warm(this.ctx!);
  const now=this.ctx!.currentTime+.002;
  this.voice(this.ctx!,((pad===1||pad>=6)?this.bus!.b:this.bus!.a),pad,now,velocity,this.getSession().style,this.getSession().levels[pad]??1);
  if(this.recordArmed&&this.running){const d=60/this.getSession().tempo/4;
   const quant=this.getSession().quantize?Math.round((now-this.origin)/d):Math.floor((now-this.origin)/d);
   const at=((quant%STEPS)+STEPS)%STEPS;note(this.getSession().pattern,pad,at,Math.min(1,velocity));this.events.onClip?.(pad);}
 }
 private silence(){for(const v of this.active){try{v.stop();}catch{}}this.active.clear();}
 private pump(){if(!this.ctx||!this.running||!this.bus)return;
  const now=this.ctx.currentTime;const tempo=this.getSession().tempo;const d=60/tempo/4;
  if(this.scheduledTempo!==tempo){this.origin=this.nextTime-this.nextStep*d;this.scheduledTempo=tempo;}
  // Safari background suspension: fast-forward stale transport steps instead of bursting delayed notes.
  if(this.nextTime<now-.035){const skip=Math.max(1,Math.ceil((now-this.nextTime-.008)/d));this.nextStep+=skip;this.nextTime+=skip*d;}
  while(this.nextTime<now+.115){const step=this.nextStep%STEPS,session=this.getSession();
   for(let p=0;p<8;p++){let velocity=session.pattern[p]?.[step]??0;if(session.muted[p]||velocity===0)continue;
    if(session.scene===1&&p>3)continue; // intro reduced
    if(session.scene===4&&p===0&&step%8!==0)continue; // break
    if(session.scene===2&&p===3&&step%2===1)velocity=.48; // build
    this.voice(this.ctx,((p===1||p>=6)?this.bus.b:this.bus.a),p,this.nextTime,velocity,session.style,session.levels[p]??1);
   }
   this.events.onStep?.(step);this.nextStep++;this.nextTime+=d;
  }
  for(const a of [...this.active])if(a.until<now)this.active.delete(a);
 }
 private voice(ctx:BaseAudioContext,bus:AudioNode,pad:number,when:number,velocity:number,style:number,level:number){
  const live=ctx===this.ctx;
  if(live&&this.active.size>=28){const oldest=this.active.values().next().value;if(oldest){oldest.stop();this.active.delete(oldest);}}
  const sample=this.bank.resolve(pad,style),amp=ctx.createGain();
  const low=ctx.createBiquadFilter(),high=ctx.createBiquadFilter();
  low.type='highpass';high.type='lowpass';
  low.frequency.value=sample?.lowCut??(pad===1?24:pad===6?55:pad===0?22:85);
  high.frequency.value=Math.min(ctx.sampleRate*.46,sample?.highCut??(pad===1?640:pad===6?15500:17000));
  low.Q.value=.707;high.Q.value=.707;
  const baseline=voiceGain(velocity,level,sample?.gain??(pad===1?.64:pad===6?.33:.78));
  const attack=.003,release=.012;
  low.connect(high).connect(amp).connect(bus);
  const playing:{stop:()=>void;until:number}={stop:()=>{},until:when+1};
  const cleanup=()=>{try{low.disconnect();high.disconnect();amp.disconnect()}catch{}this.active.delete(playing)};
  amp.gain.setValueAtTime(0,when);amp.gain.linearRampToValueAtTime(Math.max(.00001,baseline),when+attack);
  if(sample){
   const source=ctx.createBufferSource();source.buffer=sample.buffer;source.connect(low);
   const end=when+sample.buffer.duration;const fade=Math.min(release,Math.max(.003,sample.buffer.duration*.25));
   amp.gain.setValueAtTime(Math.max(.00001,baseline),Math.max(when+attack,end-fade));
   amp.gain.linearRampToValueAtTime(0,end);
   source.onended=cleanup;source.start(when);source.stop(end+.004);
   playing.until=end+.025;
   playing.stop=()=>{try{const now=Math.max(ctx.currentTime,when);amp.gain.cancelScheduledValues(now);amp.gain.setTargetAtTime(0,now,.003);source.stop(now+.018)}catch{cleanup()}};
  }else{
   const osc=ctx.createOscillator(),osc2=ctx.createOscillator(),tone=ctx.createBiquadFilter();
   const isAcid=pad===6,root=[41.2,43.65,49,46.25,43.65,49][style%6]??43.65;
   const progression=isAcid?[0,0,7,3,0,10,7,3]:[0,0,0,-5,0,0,7,-5];
   const step=Math.abs(Math.round(when/(60/this.getSession().tempo/4)))%8;
   const freq=root*Math.pow(2,(progression[step]??0)/12)*(isAcid?2:1);
   osc.type=isAcid?'sawtooth':'sine';osc2.type=isAcid?'triangle':'sine';
   osc.frequency.setValueAtTime(freq,when);osc2.frequency.setValueAtTime(freq*(isAcid?1.003:.5002),when);
   tone.type='lowpass';tone.Q.value=isAcid?3.1:.7;
   const length=isAcid?.24:.35;
   if(isAcid){tone.frequency.setValueAtTime(2600,when);tone.frequency.exponentialRampToValueAtTime(350,when+length*.88)}
   else tone.frequency.setValueAtTime(320,when);
   const oscGain=ctx.createGain();oscGain.gain.value=isAcid?.24:.58;
   osc.connect(oscGain);osc2.connect(oscGain);oscGain.connect(tone).connect(low);
   osc.start(when);osc2.start(when);
   amp.gain.setValueAtTime(Math.max(.0001,baseline),when+attack);
   amp.gain.exponentialRampToValueAtTime(.0001,when+length);
   osc.stop(when+length+.006);osc2.stop(when+length+.006);
   playing.until=when+length+.025;
   osc.onended=()=>{try{tone.disconnect();oscGain.disconnect()}catch{}cleanup()};
   playing.stop=()=>{try{const now=Math.max(ctx.currentTime,when);amp.gain.cancelScheduledValues(now);amp.gain.setTargetAtTime(0,now,.003);osc.stop(now+.018);osc2.stop(now+.018)}catch{cleanup()}};
  }
  if(live)this.active.add(playing);
 }

 async addSamples(files:FileList|File[],slot?:number):Promise<Array<{pad:number;name:string}>>{
  await this.unlock();const result=[];for(const file of Array.from(files).slice(0,8)){
   const a=await this.bank.importFile(file,this.ctx!,slot,this.getSession().style);placeSample(this.getSession().pattern,a.pad,this.getSession().style);result.push({pad:a.pad,name:file.name});slot=undefined;
  }return result;
 }
 async beginSampleCapture(source:CaptureSource, pad:number):Promise<void>{
  if(!Number.isInteger(pad)||pad<0||pad>=8)throw Error('Выбери пэд');
  if(this.sampling)throw Error('Запись уже идёт');
  await this.unlock();
  if(source==='live'&&!this.running)await this.start();
  if(!this.capture)throw Error('Аудиозахват недоступен');
  const target={pad,style:this.getSession().style};
  await this.sampleRecorder.start(source,this.capture.stream,this.ctx!,()=>{void this.endSampleCapture().catch(e=>this.events.onState?.(e instanceof Error?e.message:'SAMPLE ERROR'));});
  this.sampleTarget=target;
  this.events.onState?.(`SAMPLE REC · ${target.pad+1}`);
 }
 async endSampleCapture():Promise<{pad:number;style:number;name:string}>{
  const target=this.sampleTarget;
  if(!target)throw Error('Запись сэмпла не запущена');
  this.sampleTarget=null;
  const blob=await this.sampleRecorder.stop();
  if(blob.size<2048)throw Error('Запись слишком короткая');
  if(!this.ctx)throw Error('Нет аудиоконтекста');
  const extension=blob.type.includes('mp4')?'m4a':'webm';
  const file=new File([blob],`REC-PAD-${target.pad+1}.${extension}`,{type:blob.type});
  const result=await this.bank.importFile(file,this.ctx,target.pad,target.style);
  placeSample(this.getSession().pattern,target.pad,target.style);
  this.events.onState?.(`SAMPLE SAVED · PAD ${target.pad+1}`);
  return {pad:result.pad,style:target.style,name:file.name};
 }
 async beginTake():Promise<void>{await this.unlock();if(!this.capture||typeof MediaRecorder==='undefined')throw Error('Audio take недоступен — используй EXPORT WAV');if(this.recorder?.state==='recording')return;
  const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];const type=types.find(t=>MediaRecorder.isTypeSupported(t));
  const r=new MediaRecorder(this.capture.stream,type?{mimeType:type}:{});this.currentChunks=[];
  r.ondataavailable=e=>{if(e.data.size)this.currentChunks.push(e.data)};
  r.onstop=()=>{const blob=new Blob(this.currentChunks,{type:r.mimeType||'audio/webm'});if(blob.size){this.recorded.unshift(blob);void this.storeTake(blob);this.events.onState?.('TAKE SAVED');}};
  r.start(250);this.recorder=r;this.events.onState?.('TAKE RECORDING');
 }
 endTake(){if(this.recorder?.state==='recording')this.recorder.stop();}
 private openTakes():Promise<IDBDatabase|null>{return new Promise(resolve=>{const r=indexedDB.open('artss-live-takes-v18',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('takes'))r.result.createObjectStore('takes',{autoIncrement:true})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);r.onblocked=()=>resolve(null)})}
 private async storeTake(blob:Blob){const db=await this.openTakes();if(!db)return;try{const tx=db.transaction('takes','readwrite');tx.objectStore('takes').add(blob)}catch{}finally{db.close()}}
 private async restoreTakes(){const db=await this.openTakes();if(!db)return;try{const r=db.transaction('takes','readonly').objectStore('takes').getAll();r.onsuccess=()=>{for(const b of (r.result as Blob[]).reverse())if(b.size)this.recorded.push(b)};}catch{}finally{db.close()}}

 async exportWav(bars=4):Promise<Blob>{await this.unlock();await this.bank.warm(this.ctx!);const state=this.getSession();const rate=sampleRate;const d=60/state.tempo/4;const length=Math.ceil((bars*16*d+2)*rate);
  const offline=new OfflineAudioContext(2,length,rate),bus=createBus(offline,offline.destination,state);
  for(let step=0;step<bars*16;step++)for(let pad=0;pad<8;pad++){
   const velocity=state.pattern[pad]?.[step%16]??0;if(!velocity||state.muted[pad])continue;
   this.voice(offline,((pad===1||pad>=6)?bus.b:bus.a),pad,step*d+.02,velocity,state.style,state.levels[pad]??1);
  }
  return wavExport(await offline.startRendering());
 }
}