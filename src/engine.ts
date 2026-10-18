import {STEPS,STYLES,type Session,note} from './model.js';
import {SoundBank,type Sound} from './sounds.js';
export type EngineEvents={onStep?:(step:number)=>void;onState?:(state:string)=>void;onMeter?:(value:number)=>void;onClip?:(pad:number)=>void};
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
function createBus(ctx:BaseAudioContext, destination:AudioNode){
 const input=ctx.createGain(),eq=ctx.createBiquadFilter(),compressor=ctx.createDynamicsCompressor(),master=ctx.createGain();
 eq.type='highpass';eq.frequency.value=19;compressor.threshold.value=-11;compressor.ratio.value=3;compressor.attack.value=.0025;compressor.release.value=.16;compressor.knee.value=7;
 master.gain.value=.82;input.connect(eq).connect(compressor).connect(master).connect(destination);
 return {input,master};
}
export class Engine{
 ctx:AudioContext|null=null;bank=new SoundBank();private bus:ReturnType<typeof createBus>|null=null;
 private clock:AudioWorkletNode|null=null;private fallback:number|null=null;
 private pending=false;private running=false;private recordArmed=false;private origin=0;private nextStep=0;private nextTime=0;private stopAt=0;
 private active=new Set<{stop:()=>void;until:number}>();
 private generation=0;private recorder:MediaRecorder|null=null;private capture:MediaStreamAudioDestinationNode|null=null;
 private recorded:Blob[]=[];private currentChunks:Blob[]=[];
 private gain=1;events:EngineEvents={};
 constructor(readonly getSession:()=>Session){if(typeof indexedDB!=='undefined')void this.restoreTakes();}
 get state(){return this.running?'PLAY':this.stopAt?'PAUSE':'STOP';}
 get recording(){return this.recordArmed;}
 get takes(){return this.recorded.slice();}
 get time(){return this.ctx?.currentTime??0;}
 get currentStep(){if(!this.ctx||!this.running)return 0;const d=60/this.getSession().tempo/4;return ((Math.floor((this.time-this.origin)/d+1e-4)%STEPS)+STEPS)%STEPS;}
 async unlock():Promise<void>{
  if(!this.ctx){const C=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!C)throw Error('Web Audio недоступен');this.ctx=new C({latencyHint:'interactive'});this.capture=this.ctx.createMediaStreamDestination();void this.bank.restore(this.ctx).catch(()=>{});this.bus=createBus(this.ctx,this.ctx.destination);this.bus.master.connect(this.capture);}
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
 async start(){await this.unlock();if(this.running)return;await this.bank.warm(this.ctx!); const d=60/this.getSession().tempo/4;
  if(this.stopAt>0){const progress=this.stopAt-this.origin;this.origin=this.time-progress;this.nextStep=Math.max(0,Math.ceil((this.time-this.origin)/d));this.nextTime=this.origin+this.nextStep*d;}
  else{this.origin=this.time+.05;this.nextStep=0;this.nextTime=this.origin;}
  this.running=true;this.stopAt=0;this.generation++;this.pump();this.events.onState?.('PLAY');
 }
 pause(){if(!this.running)return;this.running=false;this.stopAt=this.time;this.generation++;this.silence();this.events.onState?.('PAUSE');}
 stop(){this.running=false;this.stopAt=0;this.recordArmed=false;this.nextStep=0;this.nextTime=0;this.generation++;this.silence();this.events.onState?.('STOP');}
 async toggleRecord(){await this.unlock();if(!this.running)await this.start();this.recordArmed=!this.recordArmed;this.events.onState?.(this.recordArmed?'REC ON':'REC OFF');return this.recordArmed;}
 async hit(pad:number,velocity=1){await this.unlock();if(pad<0||pad>7||this.getSession().muted[pad])return;
  if(pad!==1&&pad!==6)await this.bank.warm(this.ctx!);
  const now=this.ctx!.currentTime+.002;
  this.voice(this.ctx!,this.bus!.input,pad,now,velocity,this.getSession().style,this.getSession().levels[pad]??1);
  if(this.recordArmed&&this.running){const d=60/this.getSession().tempo/4;
   const quant=this.getSession().quantize?Math.round((now-this.origin)/d):Math.floor((now-this.origin)/d);
   const at=((quant%STEPS)+STEPS)%STEPS;note(this.getSession().pattern,pad,at,Math.min(1,velocity));this.events.onClip?.(pad);}
 }
 private silence(){for(const v of this.active){try{v.stop();}catch{}}this.active.clear();}
 private pump(){if(!this.ctx||!this.running||!this.bus)return;
  const now=this.ctx.currentTime;const d=60/this.getSession().tempo/4;
  while(this.nextTime<now+.115){const step=this.nextStep%STEPS,session=this.getSession();
   for(let p=0;p<8;p++){let velocity=session.pattern[p]?.[step]??0;if(session.muted[p]||velocity===0)continue;
    if(session.scene===1&&p>3)continue; // intro reduced
    if(session.scene===4&&p===0&&step%8!==0)continue; // break
    if(session.scene===2&&p===3&&step%2===1)velocity=.48; // build
    this.voice(this.ctx,this.bus.input,p,this.nextTime,velocity,session.style,session.levels[p]??1);
   }
   this.events.onStep?.(step);this.nextStep++;this.nextTime+=d;
  }
  for(const a of [...this.active])if(a.until<now)this.active.delete(a);
 }
 private voice(ctx:BaseAudioContext,bus:AudioNode,pad:number,when:number,velocity:number,style:number,level:number){
  const live=ctx===this.ctx;
  if(live&&this.active.size>=28){const first=this.active.values().next().value;if(first){first.stop();this.active.delete(first);}}
  const s=this.bank.resolve(pad,style);const amp=ctx.createGain();const loud=clamp(velocity*level*this.gain,0,1.3);
  amp.gain.setValueAtTime(0,when);amp.gain.linearRampToValueAtTime(Math.max(.0001,loud*(s?.gain??(pad===1?.65:pad===6?.35:.7))),when+.002);
  const low=ctx.createBiquadFilter(),high=ctx.createBiquadFilter();low.type='highpass';high.type='lowpass';low.frequency.value=s?.lowCut??(pad===1?25:pad===6?60:90);high.frequency.value=s?.highCut??(pad===1?400:pad===6?12000:16000);
  low.connect(high).connect(amp).connect(bus);
  const playing:{stop:()=>void;until:number}={stop:()=>{},until:when+1};
  const cleanup=()=>{try{low.disconnect();high.disconnect();amp.disconnect()}catch{}this.active.delete(playing)};
  if(s){const source=ctx.createBufferSource();source.buffer=s.buffer;source.connect(low);
   const end=when+s.buffer.duration;playing.until=end+.06;
   amp.gain.setValueAtTime(loud*s.gain,Math.max(when+.003,end-.014));amp.gain.linearRampToValueAtTime(0,Math.max(when+.005,end));
   source.onended=cleanup;source.start(when);source.stop(end+.01);playing.stop=()=>{try{source.stop()}catch{}cleanup()};
  }else{const osc=ctx.createOscillator(),osc2=ctx.createOscillator();osc.type=pad===6?'sawtooth':'sine';osc2.type='triangle';
   const notes=pad===6?[55,65.406,73.416,82.407,98]:[41.203,43.654,49,55];const freq=notes[(style+(Math.floor(when*4)%notes.length))%notes.length]??55;
   osc.frequency.setValueAtTime(freq,when);osc2.frequency.setValueAtTime(freq*.5,when);osc.connect(low);osc2.connect(low);
   const length=pad===6?.23:.37;osc.start(when);osc2.start(when);amp.gain.exponentialRampToValueAtTime(.0001,when+length);osc.stop(when+length+.005);osc2.stop(when+length+.005);
   playing.until=when+length+.02;osc.onended=cleanup;playing.stop=()=>{try{osc.stop();osc2.stop()}catch{}cleanup()};
  }
  if(live)this.active.add(playing);
 }
 async addSamples(files:FileList|File[],slot?:number):Promise<Array<{pad:number;name:string}>>{
  await this.unlock();const result=[];for(const file of Array.from(files).slice(0,8)){
   const a=await this.bank.importFile(file,this.ctx!,slot);result.push({pad:a.pad,name:file.name});slot=undefined;
  }return result;
 }
 async beginTake():Promise<void>{await this.unlock();if(!this.capture)throw Error('Запись недоступна');if(this.recorder?.state==='recording')return;
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

 async exportWav(bars=4):Promise<Blob>{const state=this.getSession();const rate=sampleRate;const d=60/state.tempo/4;const length=Math.ceil((bars*16*d+2)*rate);
  const offline=new OfflineAudioContext(2,length,rate),bus=createBus(offline,offline.destination);
  for(let step=0;step<bars*16;step++)for(let pad=0;pad<8;pad++){
   const velocity=state.pattern[pad]?.[step%16]??0;if(!velocity||state.muted[pad])continue;
   this.voice(offline,bus.input,pad,step*d+.02,velocity,state.style,state.levels[pad]??1);
  }
  return wavExport(await offline.startRendering());
 }
}