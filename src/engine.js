import {makePCM,noteOffset,PAD_COUNT} from './sound-design.js';
import {clamp,STEPS} from './session.js';
import {warmDrums,getDrumSample} from './sample-library.js';

const XSR=44100;
function impulse(ctx){const len=Math.round(ctx.sampleRate*.28),buffer=ctx.createBuffer(2,len,ctx.sampleRate);for(let c=0;c<2;c++){const d=buffer.getChannelData(c);let seed=(9931+c*1611)|0;for(let i=0;i<len;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;d[i]=(seed/2147483648)*Math.exp(-7*i/len)*.17;}}const node=ctx.createConvolver();node.buffer=buffer;return node;}
function graph(ctx,dest,settings){
 const input=ctx.createGain(),filter=ctx.createBiquadFilter(),drive=ctx.createWaveShaper();filter.type='lowpass';filter.Q.value=.58;
 const curve=new Float32Array(1024);for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.tanh(1.45*x)/Math.tanh(1.45);}
 drive.curve=curve;drive.oversample='2x';
 const dry=ctx.createGain(),wet=ctx.createGain(),mix=ctx.createGain();
 const delay=ctx.createDelay(1),delaySend=ctx.createGain(),delayFeedback=ctx.createGain(),delayReturn=ctx.createGain();
 const room=impulse(ctx),roomSend=ctx.createGain(),roomReturn=ctx.createGain();
 const comp=ctx.createDynamicsCompressor(),master=ctx.createGain(),meter=ctx.createAnalyser();
 comp.threshold.value=-12;comp.knee.value=6;comp.ratio.value=5;comp.attack.value=.003;comp.release.value=.14;meter.fftSize=256;
 input.connect(filter);filter.connect(dry).connect(mix);filter.connect(drive).connect(wet).connect(mix);
 mix.connect(comp);mix.connect(delaySend).connect(delay);delay.connect(delayFeedback).connect(delay);delay.connect(delayReturn).connect(comp);
 mix.connect(roomSend).connect(room).connect(roomReturn).connect(comp);
 comp.connect(master).connect(meter).connect(dest);
 function update(s){const t=ctx.currentTime;
  filter.frequency.setTargetAtTime(160+18500*Math.pow(clamp(s.filter,0,1),2.4),t,.016);
  dry.gain.setTargetAtTime(1-clamp(s.drive,0,1)*.4,t,.016);wet.gain.setTargetAtTime(clamp(s.drive,0,1)*.28,t,.016);
  delay.delayTime.setTargetAtTime(60/clamp(s.bpm,65,195)*.75,t,.02);
  delayFeedback.gain.value=.2;delaySend.gain.setTargetAtTime(clamp(s.delay,0,1)*.22,t,.02);delayReturn.gain.value=.36;
  roomSend.gain.setTargetAtTime(clamp(s.space,0,1)*.3,t,.02);roomReturn.gain.value=.34;
  master.gain.setTargetAtTime(clamp(s.master,0,1)*.78,t,.016);
 }
 update(settings);return {input,master,meter,update};
}
function writeWav(buffer){
 const n=buffer.length,dataBytes=n*4;const output=new ArrayBuffer(44+dataBytes),v=new DataView(output);
 const str=(index,s)=>{for(let i=0;i<s.length;i++)v.setUint8(index+i,s.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,36+dataBytes,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
 v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,dataBytes,true);
 const a=buffer.getChannelData(0),b=buffer.numberOfChannels>1?buffer.getChannelData(1):a;
 for(let i=0;i<n;i++){let x=clamp(a[i],-.985,.985),y=clamp(b[i],-.985,.985);v.setInt16(44+i*4,Math.round(x*(x<0?32768:32767)),true);v.setInt16(46+i*4,Math.round(y*(y<0?32768:32767)),true);}
 return new Blob([output],{type:'audio/wav'});
}
export class AudioEngine{
 constructor(getState){this.getState=getState;this.ctx=null;this.bus=null;this.capture=null;this.buffers=new WeakMap();this.voices=new Set();this.playing=false;this.pending=false;this.generation=0;this.timer=null;this.absolute=0;this.nextTime=0;this.lastScheduledTime=0;this.lastScheduledIndex=0;this.onStep=()=>{};this.onScene=()=>{};this.pendingScene=null;this.onChange=()=>{};this.onRecording=()=>{};this.onTake=()=>{};this.recording=null;this.recordPhase='idle';this.elapsed=0;this.startClock=0;this.meterBytes=null;this.prewarmedBank=-1;this.prewarmBusy=false;this.drumsReady=-1;}
 prime(){
  if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
   this.ctx=new C({latencyHint:'interactive'});this.capture=this.ctx.createMediaStreamDestination();this.bus=graph(this.ctx,this.ctx.destination,this.getState());this.bus.master.connect(this.capture);
  }
  const bank=this.getState().bank;
  if(this.drumsReady!==bank){this.drumsReady=bank;warmDrums(this.ctx,bank).catch(()=>{if(this.drumsReady===bank)this.drumsReady=-1;});}
 }
 async unlock(){this.prime();if(!this.ctx)throw Error('Web Audio недоступен');
  if(this.ctx.state!=='running')await this.ctx.resume();
  if(this.ctx.state!=='running')throw Error('Нажми пэд для включения звука');
  this.schedulePrewarm();return this.ctx;
 }
 update(){this.bus?.update(this.getState());}
 schedulePrewarm(){if(!this.ctx||this.prewarmBusy||this.prewarmedBank===this.getState().bank)return;this.prewarmBusy=true;const bank=this.getState().bank;let slot=0;const prepare=()=>{if(!this.ctx||this.getState().bank!==bank){this.prewarmBusy=false;return;}try{for(let n=0;n<2&&slot<PAD_COUNT;n++,slot++){const s=this.getState(),pitch=noteOffset(s.bank,slot,0,0);this.getBuffer(this.ctx,slot,pitch);}}catch{}if(slot<PAD_COUNT)setTimeout(prepare,15);else{this.prewarmedBank=bank;this.prewarmBusy=false;this.drumsReady=-1;}};setTimeout(prepare,0);}
 queueScene(scene){const s=this.getState();if(!s.patterns[scene])return false;if(!this.playing){s.scene=scene;this.pendingScene=null;this.onScene(scene);return true;}this.pendingScene=scene;this.onScene(scene);return true;}
 getBuffer(ctx,slot,pitch){let cache=this.buffers.get(ctx);if(!cache){cache=new Map();this.buffers.set(ctx,cache);}const s=this.getState();const key=`${s.bank}:${slot}:${pitch}`;
  // Predecoded CC0 drum buffers, no per-hit network access or DSP synthesis.
  const recorded=getDrumSample(s.bank,slot);if(recorded)return recorded;
  if(!cache.has(key)){const pcm=makePCM(slot,ctx.sampleRate,s.bank,pitch),buf=ctx.createBuffer(1,pcm.length,ctx.sampleRate);buf.copyToChannel(pcm,0);cache.set(key,buf);if(cache.size>64)cache.delete(cache.keys().next().value);}return cache.get(key);}
 // Use the same synthesis, pitch and velocity path for realtime and WAV.
 voice(ctx,dest,slot,time,velocity,step,bar=0,track=true){const s=this.getState();const pitch=noteOffset(s.bank,slot,step,bar);const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.getBuffer(ctx,slot,pitch);source.playbackRate.value=Math.pow(2,(s.trackPitch[slot]||0)/12);
  const when=Math.max(time,ctx.currentTime+.001);gain.gain.value=clamp(velocity,0,1)*.60*(slot===0?1.02:1)*s.trackVolumes[slot];source.connect(gain).connect(dest);source.start(when);
  if(track){if(this.voices.size>=28){const oldest=this.voices.values().next().value;try{oldest.gain.gain.setTargetAtTime(0,ctx.currentTime,.005);oldest.source.stop(ctx.currentTime+.02);}catch{}}const item={source,gain,when};this.voices.add(item);source.onended=()=>{this.voices.delete(item);source.disconnect();gain.disconnect();}}return source;}
 canPlay(slot){const s=this.getState();return !s.mutes[slot]&&(!s.solos.includes(true)||s.solos[slot]);}
 async hit(slot,velocity=1){if(!Number.isInteger(slot)||slot<0||slot>=PAD_COUNT)throw Error('Некорректный пэд');await this.unlock();if(!this.canPlay(slot))return false;this.voice(this.ctx,this.bus.input,slot,this.ctx.currentTime,velocity,this.currentStep());return true;}
 currentStep(){if(!this.playing||!this.ctx)return this.absolute%STEPS;const beat=60/this.getState().bpm/4;const delta=Math.round((this.ctx.currentTime-this.lastScheduledTime)/beat);return ((this.lastScheduledIndex+delta)%STEPS+STEPS)%STEPS;}
 tick(){if(!this.playing||this.ctx?.state!=='running')return;const s=this.getState(),beat=60/s.bpm/4,now=this.ctx.currentTime;
  if(this.nextTime<now-.09){const skipped=Math.floor((now-this.nextTime)/beat)+1;this.absolute+=skipped;this.nextTime+=skipped*beat;}
  let limit=0;while(this.nextTime<now+.085&&limit++<16){const step=this.absolute%STEPS,bar=Math.floor(this.absolute/STEPS);if(step===0&&this.pendingScene){s.scene=this.pendingScene;this.pendingScene=null;this.onScene(s.scene);}const swing=step%2?s.swing*beat*.52:0,pattern=s.patterns[s.scene];
   for(let slot=0;slot<PAD_COUNT;slot++){const v=pattern[slot][step];if(v>.001&&this.canPlay(slot))this.voice(this.ctx,this.bus.input,slot,this.nextTime+swing,v,step,bar);}
   this.lastScheduledIndex=this.absolute;this.lastScheduledTime=this.nextTime;this.onStep(step,bar);this.absolute++;this.nextTime+=beat;
  }
 }
 async play(){if(this.playing||this.pending)return;this.pending=true;const gen=this.generation;try{await this.unlock();if(gen!==this.generation)return;this.playing=true;this.startClock=performance.now();this.nextTime=this.ctx.currentTime+.05;this.tick();this.timer=setInterval(()=>this.tick(),24);this.onChange(true);}finally{this.pending=false;}}
 silence(){const now=this.ctx?.currentTime??0;for(const v of this.voices){try{v.gain.gain.cancelScheduledValues(now);v.gain.gain.setTargetAtTime(0,now,.006);v.source.stop(Math.max(now+.025,v.when+.008));}catch{}}}
 pause(reset=false){this.generation++;if(reset)this.pendingScene=null;if(this.playing)this.elapsed+=performance.now()-this.startClock;this.playing=false;clearInterval(this.timer);this.timer=null;this.silence();if(reset){this.absolute=0;this.elapsed=0;this.onStep(-1,0);}this.onChange(false);}
 async toggleCapture(){if(this.recordPhase==='stopping')return;if(this.recordPhase==='recording'){this.recordPhase='stopping';this.onRecording('stopping');this.recording?.stop();return;}
  await this.unlock();if(typeof MediaRecorder==='undefined')throw Error('Аудиозапись недоступна. Используй WAV экспорт.');
  const type=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'].find(v=>MediaRecorder.isTypeSupported(v));const recorder=new MediaRecorder(this.capture.stream,type?{mimeType:type}:undefined),parts=[];this.recording=recorder;
  recorder.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};recorder.onerror=()=>{this.recordPhase='idle';this.onRecording('error');};
  recorder.onstop=()=>{this.recordPhase='idle';this.recording=null;const mime=recorder.mimeType||type||'audio/webm';const blob=new Blob(parts,{type:mime});this.onRecording(blob.size?'ready':'empty');if(blob.size)this.onTake(blob,mime.includes('mp4')?'m4a':'webm');};
  recorder.start(250);this.recordPhase='recording';this.onRecording('recording');}
 async exportWav(bars=8){if(this.playing)throw Error('Сначала останови воспроизведение');await this.unlock();await warmDrums(this.ctx,this.getState().bank).catch(()=>{});const O=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!O)throw Error('WAV экспорт недоступен');const s=this.getState(),count=clamp(bars,1,16),len=Math.ceil((count*4*60/s.bpm+1)*XSR),ctx=new O(2,len,XSR),nodes=graph(ctx,ctx.destination,s);
  for(let bar=0;bar<count;bar++)for(let step=0;step<STEPS;step++){const t=.04+bar*4*60/s.bpm+step*60/s.bpm/4+(step%2?s.swing*60/s.bpm/4*.52:0);
   for(let slot=0;slot<PAD_COUNT;slot++){const v=s.patterns[s.scene][slot][step];if(v>.001&&this.canPlay(slot))this.voice(ctx,nodes.input,slot,t,v,step,bar,false);}}
  return writeWav(await ctx.startRendering());}
 meter(){if(!this.bus)return 0;this.meterBytes??=new Uint8Array(this.bus.meter.fftSize);this.bus.meter.getByteTimeDomainData(this.meterBytes);let sum=0;for(const byte of this.meterBytes){const v=(byte-128)/128;sum+=v*v;}return Math.min(1,Math.sqrt(sum/this.meterBytes.length)*2.1);}
}