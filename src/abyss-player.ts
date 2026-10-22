import {ABYSS_PADS,ABYSS_BPM,ABYSS_FX,type AbyssPad} from './abyss.js';
import type {Engine} from './engine.js';
type Voice={source:AudioBufferSourceNode;gain:GainNode;pad:AbyssPad;when:number};
/** A dedicated two-page performance sampler routed into the existing protected master. */
export class AbyssPlayer{
 private buffers=new Map<number,AudioBuffer>();private loads=new Map<number,Promise<AudioBuffer>>();
 private voices=new Map<number,Voice>();private generations=new Map<number,number>();
 private context:AudioContext|null=null;private input:GainNode|null=null;private filter:BiquadFilterNode|null=null;
 private sidechain:GainNode|null=null;private anchor=0;private kickTimer:number|null=null;private lastKickAt=-1;
 onChange:()=>void=()=>{};
 constructor(private engine:Engine){engine.renderSamplerOffline=(ctx,bus,seconds)=>this.renderOffline(ctx,bus,seconds);}
 isActive(id:number){return this.voices.has(id)}
 private connect(){const {context,output}=this.engine.getSamplerOutput();if(this.context===context)return;
  this.context=context;this.anchor=context.currentTime+.045;
  const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=8000;filter.Q.value=1.2;
  const sidechain=context.createGain(),input=context.createGain(),dry=context.createGain(),send=context.createGain(),delay=context.createDelay(2),feedback=context.createGain();
  const room=context.createConvolver(),wet=context.createGain(),master=context.createGain();
  // Deterministic, damped stereo room impulse. No external capture or missing sample fallback.
  const frames=Math.round(context.sampleRate*1.25),ir=context.createBuffer(2,frames,context.sampleRate);let seed=0xAB155;
  for(let c=0;c<2;c++){const data=ir.getChannelData(c);let low=0;for(let i=0;i<frames;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;low=low*.38+((seed>>>0)/2147483648-1)*.62;data[i]=low*Math.exp(-i/context.sampleRate*5.5)*.18;}}
  room.buffer=ir;delay.delayTime.value=60/ABYSS_BPM*.75;feedback.gain.value=ABYSS_FX.delay.feedback;send.gain.value=ABYSS_FX.delay.dry_wet;wet.gain.value=ABYSS_FX.reverb.dry_wet;dry.gain.value=.85;master.gain.value=.33;
  input.connect(filter).connect(sidechain);sidechain.connect(dry).connect(master);
  sidechain.connect(send).connect(delay);delay.connect(feedback).connect(delay);delay.connect(master);
  sidechain.connect(room).connect(wet).connect(master);master.connect(output);
  this.input=input;this.filter=filter;this.sidechain=sidechain;
  this.kickTimer=window.setInterval(()=>this.pumpKick(),40);
 }
 private pumpKick(){if(!this.context||!this.sidechain||!this.filter||!this.voices.has(1))return;
  const now=this.context.currentTime,bar=240/ABYSS_BPM;
  const next=Math.ceil((now+.01-this.anchor)/bar*4)*(bar/4)+this.anchor;
  if(next<=now+.09&&next>now&&next!==this.lastKickAt){this.lastKickAt=next;const g=this.sidechain.gain;g.cancelScheduledValues(next);g.setValueAtTime(1,next);g.linearRampToValueAtTime(.64,next+ABYSS_FX.sidechain_compressor.attack_ms/1000);g.setTargetAtTime(1,next+.015,ABYSS_FX.sidechain_compressor.release_ms/3000);
   const f=this.filter.frequency;f.cancelScheduledValues(next);f.setValueAtTime(6200,next);f.setTargetAtTime(8000,next+.015,.09);
  }
 }
 private async load(pad:AbyssPad):Promise<AudioBuffer>{const cached=this.buffers.get(pad.id);if(cached)return cached;const pending=this.loads.get(pad.id);if(pending)return pending;
  const task=(async()=>{const response=await fetch('/samples/abyss/'+pad.file,{cache:'force-cache'});if(!response.ok)throw Error('WAV не загружен: '+pad.file);
   const data=await response.arrayBuffer(),context=this.context;if(!context)throw Error('Аудиодвижок не готов');const buffer=await context.decodeAudioData(data);this.buffers.set(pad.id,buffer);return buffer;})();
  this.loads.set(pad.id,task);try{return await task}finally{this.loads.delete(pad.id)}
 }
 private boundary(quantize:AbyssPad['quantize']):number{const now=this.context!.currentTime;if(quantize==='none')return now+.003;
  const bars=quantize==='1/2'?.5:quantize==='2/1'?2:1,length=240/ABYSS_BPM*bars;
  return this.anchor+Math.max(0,Math.ceil((now+.025-this.anchor)/length))*length;
 }
 private stopVoice(id:number,when:number){const voice=this.voices.get(id);if(!voice)return;this.voices.delete(id);
  const at=Math.max(when,this.context?.currentTime??when);voice.gain.gain.cancelScheduledValues(at);voice.gain.gain.setValueAtTime(voice.gain.gain.value,at);
  voice.gain.gain.linearRampToValueAtTime(0,at+.018);try{voice.source.stop(at+.022)}catch{}this.onChange();
 }
 async trigger(id:number):Promise<void>{const pad=ABYSS_PADS[id-1];if(!pad)throw Error('Неизвестный пэд');
  await this.engine.unlock();this.connect();const epoch=(this.generations.get(id)??0)+1;this.generations.set(id,epoch);
  if(this.voices.has(id)){this.stopVoice(id,this.boundary(pad.quantize));return;}
  const buffer=await this.load(pad);if(this.generations.get(id)!==epoch)return;
  const ctx=this.context!,when=this.boundary(pad.quantize);
  if(pad.choke_group)for(const [other,voice] of this.voices)if(other!==id&&voice.pad.choke_group===pad.choke_group)this.stopVoice(other,when);
  const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.loop=pad.type==='loop';source.playbackRate.value=1;
  source.connect(gain).connect(this.input!);gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(pad.group==='Bass'?.72:1,when+.012);
  const voice={source,gain,pad,when};this.voices.set(id,voice);
  source.onended=()=>{if(this.voices.get(id)===voice){this.voices.delete(id);this.onChange()}source.disconnect();gain.disconnect()};
  source.start(when);this.onChange();
 }
 stop(){for(const id of [...this.voices.keys()])this.stopVoice(id,this.context?.currentTime??0);this.generations.clear();}
 private renderOffline(ctx:OfflineAudioContext,bus:AudioNode,seconds:number){if(!this.voices.size)return;
  const filter=ctx.createBiquadFilter(),level=ctx.createGain(),delay=ctx.createDelay(2),send=ctx.createGain(),feedback=ctx.createGain();
  filter.type='lowpass';filter.frequency.value=ABYSS_FX.lowpass_filter.cutoff;filter.Q.value=ABYSS_FX.lowpass_filter.resonance;
  level.gain.value=.33;delay.delayTime.value=60/ABYSS_BPM*.75;send.gain.value=ABYSS_FX.delay.dry_wet;feedback.gain.value=ABYSS_FX.delay.feedback;
  filter.connect(level).connect(bus);filter.connect(send).connect(delay);delay.connect(feedback).connect(delay);delay.connect(level);
  for(const voice of this.voices.values()){const source=ctx.createBufferSource();source.buffer=voice.source.buffer;source.loop=voice.pad.type==='loop';
   const volume=ctx.createGain();volume.gain.value=voice.pad.group==='Bass'?.72:1;source.connect(volume).connect(filter);source.start(.02);source.stop(Math.min(seconds+.015,voice.pad.type==='loop'?seconds+.015:voice.source.buffer!.duration+.02));
  }
 }
 dispose(){this.stop();if(this.kickTimer!==null)clearInterval(this.kickTimer);this.kickTimer=null;this.input?.disconnect();this.context=null;this.engine.renderSamplerOffline=null;}
}
