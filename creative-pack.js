/** Original, self-contained 120 BPM / F minor performance pack. No missing sample URLs. */
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const hz=note=>440*2**((note-69)/12);
const make=(id,name,kind,type,group,choke,quantize,note,color)=>Object.freeze({id,name,kind,type,group,choke,quantize,note,color});
export const CREATIVE_PADS=Object.freeze([
 make(1,'Deep Sub Kick','kick','loop','DRUMS',0,16,41,'#ff544f'),
 make(2,'Retro Clap','clap','loop','DRUMS',0,16,53,'#ff544f'),
 make(3,'Tech Hats','hat','loop','DRUMS',0,8,77,'#ff9c42'),
 make(4,'Perc Groove','perc','loop','DRUMS',0,8,65,'#ff9c42'),
 make(5,'Sub Foundation','sub','loop','BASS',1,16,29,'#4e9fff'),
 make(6,'Slap Bassline','slap','loop','BASS',1,16,41,'#4e9fff'),
 make(7,'Acid Mid Bass','acid','loop','BASS',1,16,41,'#68d4ee'),
 make(8,'Drone Bass','drone','loop','BASS',1,32,29,'#68d4ee'),
 make(9,'Original Pluck','pluck','loop','MELODY',2,16,53,'#69df91'),
 make(10,'Brass Hook','brass','loop','MELODY',2,16,53,'#69df91'),
 make(11,'Chord Stabs','chord','loop','MELODY',2,16,53,'#69df91'),
 make(12,'Arpeggio Drive','arp','loop','MELODY',2,8,65,'#69df91'),
 make(13,'Synth Choir','choir','loop','VOICE',3,16,53,'#f17db3'),
 make(14,'Vowel Chops','vox','loop','VOICE',3,8,65,'#f17db3'),
 make(15,'Dark Atmosphere','atmos','loop','TEXTURE',0,32,53,'#a69eff'),
 make(16,'String Sustain','strings','loop','TEXTURE',0,32,65,'#a69eff'),
 make(17,'Pluck F3','pluck','one_shot','LEAD',4,0,53,'#c58bff'),
 make(18,'Pluck Ab3','pluck','one_shot','LEAD',4,0,56,'#c58bff'),
 make(19,'Pluck Bb3','pluck','one_shot','LEAD',4,0,58,'#c58bff'),
 make(20,'Pluck C4','pluck','one_shot','LEAD',4,0,60,'#c58bff'),
 make(21,'Brass F3','brass','one_shot','BRASS',5,0,53,'#ffd36d'),
 make(22,'Brass C4','brass','one_shot','BRASS',5,0,60,'#ffd36d'),
 make(23,'Sub Drop','subdrop','one_shot','BASS FX',0,0,29,'#68d4ee'),
 make(24,'Reverse Bass','reverse','one_shot','BASS FX',0,0,41,'#68d4ee'),
 make(25,'Vowel Ah','vox','one_shot','VOICE FX',6,0,53,'#ff6a97'),
 make(26,'Vowel Oh','vox','one_shot','VOICE FX',6,0,56,'#ff6a97'),
 make(27,'Vowel Ee','vox','one_shot','VOICE FX',6,0,60,'#ff6a97'),
 make(28,'Vocal Synth FX','vocoder','one_shot','VOICE FX',6,0,65,'#ff6a97'),
 make(29,'Impact Climax','impact','one_shot','TRANSITION',0,0,29,'#c5cad4'),
 make(30,'Riser · 4 Bars','riser','one_shot','TRANSITION',0,16,65,'#c5cad4'),
 make(31,'Laser Down','laser','one_shot','TRANSITION',0,0,77,'#c5cad4'),
 make(32,'Glitch · 1 Bar','glitch','one_shot','TRANSITION',0,16,65,'#c5cad4')
]);
export const CREATIVE_PACK=Object.freeze({id:'artss-creative-fm',name:'CREATIVE / F MINOR',bpm:120,key:'Fm',pages:['LOOPS & FOUNDATION','ONE-SHOTS & LIVE FX'],pads:CREATIVE_PADS});
const sceneLoops={INTRO:[1,3,15],GROOVE:[1,2,3,5,9],BUILD:[1,2,3,4,7,12,15],DROP:[1,2,3,4,6,10,16],BREAK:[9,13,15]};
const padById=id=>CREATIVE_PADS.find(p=>p.id===id);
const patterns={1:[0,4,8,12],2:[4,12],3:[2,6,10,14,15],4:[3,7,10,15],5:[0,6,10,14],6:[2,5,7,10,14],7:[0,3,6,9,11,14],9:[0,3,6,10,12,15],10:[0,6,8,14],11:[0,8,12],12:[0,2,4,6,8,10,12,14],14:[2,7,10,15]};
const minor=[0,2,3,5,7,8,10];
export function creativeEvents(pad,step,bar=0){
 if(!pad||pad.type!=='loop')return [];
 if([8,13,15,16].includes(pad.id))return step===0&&bar%2===0?[{note:pad.note,velocity:.55}]:[];
 if(!patterns[pad.id]?.includes(step))return [];
 const phrase=[0,3,0,4][Math.floor((bar%8)/2)],melodic=pad.id>=5;
 const degree=(pad.id===5?0:pad.id===6?[0,0,2,4,3][step%5]:[0,2,4,1,3,5,2,0][(step+bar%2*3)%8])+phrase;
 const note=pad.note+(melodic?minor[degree%7]+12*Math.floor(degree/7):0);
 return [{note,velocity:step%4===0?.88:step%4===2?.72:.6}];
}
const durationFor=(p,bpm)=>p.kind==='riser'?60/bpm*16:p.kind==='glitch'?60/bpm*4:
 ['atmos','strings','drone','choir'].includes(p.kind)?60/bpm*8:p.kind==='impact'?1.5:p.kind==='subdrop'?1.1:p.kind==='laser'?.85:
 p.kind==='hat'?.13:p.kind==='clap'?.26:p.kind==='perc'?.23:p.kind==='chord'?.65:p.kind==='reverse'?.55:.4;
function blep(t,d){if(t<d){const x=t/d;return 2*x-x*x-1}if(t>1-d){const x=(t-1)/d;return x*x+2*x+1}return 0}
/** Generate once per note, cache at the context sample rate; never fetch fictitious WAVs. */
export function synthCreativePCM(pad,note=pad.note,sampleRate=44100,bpm=120){
 const duration=durationFor(pad,bpm),pcm=new Float32Array(Math.ceil(duration*sampleRate)),f=hz(note);
 let seed=(pad.id*2654435761+note*991)>>>0,phase=0,phase2=0,lp=0,peak=0;
 for(let i=0;i<pcm.length;i++){
  const t=i/sampleRate,u=t/duration;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed/2147483648-1;
  const freq=pad.kind==='kick'?46+120*Math.exp(-t*35):pad.kind==='subdrop'?Math.max(23,f*3*Math.exp(-t*5)):pad.kind==='laser'?180+2200*Math.exp(-t*7):f;
  const dt=Math.min(.45,freq/sampleRate);phase=(phase+dt)%1;phase2=(phase2+dt*1.003)%1;
  const sine=Math.sin(TAU*phase),saw=2*phase-1-blep(phase,dt),saw2=2*phase2-1-blep(phase2,dt);
  let v=0,env=Math.min(1,t/.006)*Math.min(1,(duration-t)/.025);
  switch(pad.kind){
   case 'kick':v=(sine*.9+noise*.22*Math.exp(-t*160))*Math.exp(-t*9);break;
   case 'clap':v=noise*(Math.exp(-t*24)+.5*Math.exp(-Math.abs(t-.024)*180)+.3*Math.exp(-Math.abs(t-.049)*160))*.6;break;
   case 'hat':lp+=.16*(noise-lp);v=(noise-lp)*Math.exp(-t*35)*.65;break;
   case 'perc':v=(Math.sin(TAU*phase*(1+2*Math.exp(-t*30)))+.3*noise)*Math.exp(-t*22)*.55;break;
   case 'sub':v=(sine+.28*Math.sin(TAU*phase*2))*.65*Math.exp(-t*7);break;
   case 'slap':v=Math.tanh((saw*.8+sine*.5)*2)*Math.exp(-t*10)*.7;break;
   case 'acid':{const cf=300+3000*Math.exp(-t*14);lp+=(1-Math.exp(-TAU*Math.min(cf,sampleRate*.2)/sampleRate))*(saw-lp);v=Math.tanh(lp*2)*Math.exp(-t*7)*.65;break;}
   case 'drone':v=(sine+.32*Math.sin(TAU*phase*2)+saw2*.18)*.55;env*=Math.min(1,t/.12)*Math.min(1,(duration-t)/.2);break;
   case 'brass':{const osc=saw*.55+saw2*.25+sine*.2;lp+=(1-Math.exp(-TAU*1800/sampleRate))*(osc-lp);v=lp*Math.exp(-t*4)*.8;break;}
   case 'chord':v=(sine+Math.sin(TAU*f*2**(3/12)*t)*.7+Math.sin(TAU*f*2**(7/12)*t)*.6)*Math.exp(-t*5)*.35;break;
   case 'atmos':case 'strings':v=(saw+saw2)*.22+.14*Math.sin(TAU*f*.5*t);env*=Math.min(1,t/.28)*Math.min(1,(duration-t)/.4);break;
   case 'choir':v=(sine+.23*Math.sin(TAU*phase*3))*(.7+.2*Math.sin(TAU*4.1*t))*.55;env*=Math.min(1,t/.14)*Math.min(1,(duration-t)/.3);break;
   case 'vox':case 'vocoder':{const formant=[3.1,4.3,6.2,7.4][pad.id%4];v=(sine*.25+Math.sin(TAU*phase*formant)*.45+Math.sin(TAU*phase*(formant+2))*.2)*Math.exp(-t*8);break;}
   case 'reverse':v=(saw*.4+sine*.5)*u*u;break;
   case 'impact':v=sine*.6*Math.exp(-t*5)+noise*.35*Math.exp(-t*11);break;
   case 'riser':{lp+=(.008+u*.3)*(noise-lp);v=(noise-lp)*u*.65+Math.sin(TAU*(180*t+240*t*t))*u*.13;break;}
   case 'laser':v=sine*Math.exp(-t*6)*.65;break;
   case 'glitch':v=((Math.floor(t/(60/bpm/8))%3===0)?noise*.6:Math.sin(TAU*f*t)*.5)*Math.exp(-(t%(60/bpm/8))*50);break;
   default:v=(sine+.32*Math.sin(TAU*phase*2)+.14*Math.sin(TAU*phase*3))*Math.exp(-t*(pad.kind==='arp'?16:10))*.7;
  }
  pcm[i]=v*env;peak=Math.max(peak,Math.abs(pcm[i]));
 }
 const gain=peak>0?Math.min(2,.72/peak):1;
 for(let i=0;i<pcm.length;i++)pcm[i]=clamp(pcm[i]*gain,-.75,.75);
 return pcm;
}
export class CreativePackEngine{
 constructor(engine,onChange=()=>{}){this.engine=engine;this.enabled=false;this.loops=new Set();this.pending=new Map();this.patterns={};this.buffers=new Map();this.custom=new Map();this.graphs=new WeakMap();this.voices=new Set();this.onChange=onChange;this.ribbon=null;this.importEpoch=0;}
 restore(ids){this.loops=new Set();for(const id of Array.isArray(ids)?ids:[]){const p=padById(id);if(p?.type!=='loop')continue;if(p.choke)for(const other of this.loops)if(padById(other).choke===p.choke)this.loops.delete(other);this.loops.add(id)}this.pending.clear();this.onChange();}
 selection(){return [...this.loops].sort((a,b)=>a-b);}
 events(pad,step,bar=0){const row=this.patterns[pad.id],base=creativeEvents(pad,step,bar+(this.engine.state.melodyVariation||0));return row?row[step]>0?[{note:base[0]?.note??pad.note,velocity:row[step]}]:[]:base;}
 pattern(id){const p=padById(id);return this.patterns[id]??Array.from({length:16},(_,step)=>creativeEvents(p,step,0)[0]?.velocity??0);}
 setStep(id,step){if(!padById(id)||id>16||step<0||step>15)return;const row=this.pattern(id).slice();row[step]=row[step]>0?0:.75;this.patterns[id]=row;this.onChange();}
 requestScene(scene){const target=new Set(sceneLoops[scene]??sceneLoops.GROOVE);for(let id=1;id<=16;id++){const active=this.pending.has(id)?this.pending.get(id).active:this.loops.has(id);if(active!==target.has(id))this.queue(id)}if(!this.engine.running)this.applyPending(0,this.engine.ctx,this.engine.graph?.bus,0);}
 queue(id){const p=padById(id);if(!p)return;
  if(p.type==='one_shot'){if(p.quantize&&this.engine.running){this.pending.set(id,{at:Math.ceil(this.engine.count/p.quantize)*p.quantize,shot:true});this.onChange()}else this.play(this.engine.ctx,this.engine.graph.bus,p,this.engine.ctx.currentTime+.003,p.note,.85,true);return}
  const active=this.pending.has(id)?this.pending.get(id).active:this.loops.has(id),at=this.engine.running?Math.ceil(this.engine.count/p.quantize)*p.quantize:0;
  if(p.choke)for(const [other] of this.pending)if(other!==id&&padById(other)?.choke===p.choke)this.pending.delete(other);
  this.pending.set(id,{at,active:!active});this.onChange();
 }
 applyPending(index,ctx,out,time){let changed=false;
  for(const [id,request] of this.pending){if(request.at>index)continue;this.pending.delete(id);const p=padById(id);
   if(request.shot){this.play(ctx,out,p,time,p.note,.85,true);changed=true;continue}
   if(request.active){if(p.choke)for(const other of [...this.loops])if(padById(other).choke===p.choke)this.loops.delete(other);this.loops.add(id)}else this.loops.delete(id);
   this.choke(ctx,id,request.active?p.choke:0,time,!request.active);changed=true;
  }
  if(changed)this.onChange();
 }
 graph(ctx,out){let g=this.graphs.get(ctx);if(!g||g.out!==out){const tonal=ctx.createGain();tonal.connect(out);g={tonal,out};this.graphs.set(ctx,g)}return g;}
 choke(ctx,id,group,time,onlyId=false,includeSelf=false){for(const v of this.voices){if(v.ctx!==ctx||v.time>time+.001)continue;if((onlyId&&v.id===id)||(!onlyId&&group&&v.group===group&&(includeSelf||v.id!==id))){const t=Math.max(time,ctx.currentTime);v.gain.gain.cancelScheduledValues(t);v.gain.gain.setTargetAtTime(0,t,.004);try{v.source.stop(t+.025)}catch{}}}}
 buffer(ctx,p,note,bpm){const custom=this.custom.get(p.id);if(custom)return custom;if(p.kind==='kick'&&this.engine.getBuffer)return this.engine.getBuffer(ctx,0,0);
  const key=[ctx.sampleRate,p.id,note,Math.round(bpm)].join(':');let b=this.buffers.get(key);
  if(!b){const rate=durationFor(p,bpm)>2?Math.min(22050,ctx.sampleRate):ctx.sampleRate;const pcm=synthCreativePCM(p,note,rate,bpm);b=ctx.createBuffer(1,pcm.length,rate);b.copyToChannel(pcm,0);this.buffers.set(key,b);if(this.buffers.size>96)this.buffers.delete(this.buffers.keys().next().value)}return b;
 }
 play(ctx,out,p,time,note,velocity,live){const graph=this.graph(ctx,out),source=ctx.createBufferSource(),gain=ctx.createGain(),t=Math.max(time,ctx.currentTime);
  source.buffer=this.buffer(ctx,p,note,this.engine.state.bpm);gain.gain.value=clamp(velocity,0,1)*.36;
  if(this.custom.has(p.id))source.playbackRate.value=2**((note-p.note)/12);
  if(live&&p.type==='one_shot')this.choke(ctx,p.id,p.choke,t,false,true);
  source.connect(gain).connect(p.group==='DRUMS'?out:graph.tonal);
  if(p.kind==='kick'){const duck=graph.tonal.gain;duck.cancelScheduledValues(t);duck.setValueAtTime(1,t);duck.linearRampToValueAtTime(.3,t+.002);duck.setTargetAtTime(1,t+.007,.047);}
  const voice={ctx,id:p.id,group:p.choke,time:t,source,gain};if(live)this.voices.add(voice);
  source.onended=()=>{this.voices.delete(voice);source.disconnect();gain.disconnect()};source.start(t);
 }
 schedule(ctx,out,time,step,bar,live=true){if(live){if(this.engine.state.autoScene&&step===0){const scene=this.engine.getScene(bar);if(scene!==this.lastScene){this.requestScene(scene);this.lastScene=scene}}this.applyPending(bar*16+step,ctx,out,time);}
  const ids=!live&&this.engine.state.autoScene?sceneLoops[this.engine.getScene(bar)]??sceneLoops.GROOVE:this.loops;
  for(const id of ids){const p=padById(id);if(this.custom.has(id)){const bars=Math.max(1,Math.ceil(this.custom.get(id).duration/(60/this.engine.state.bpm*4)));if(step===0&&bar%bars===0)this.play(ctx,out,p,time,p.note,.75,live);continue}
   for(const e of this.events(p,step,bar))this.play(ctx,out,p,time,e.note,e.velocity,live);
  }
 }
 stop(){this.pending.clear();this.lastScene=null;this.endRibbon();for(const v of this.voices){const t=v.ctx.currentTime;try{v.gain.gain.cancelScheduledValues(t);v.gain.gain.setTargetAtTime(0,t,.005);v.source.stop(t+.04)}catch{}}this.voices.clear();this.onChange();}
 async importSample(id,file){if(!padById(id)||!file||file.size>25*1024*1024)throw Error('Выбери аудио до 25 МБ');const epoch=++this.importEpoch;await this.engine.unlock();const data=await file.arrayBuffer();let b;try{b=await this.engine.ctx.decodeAudioData(data)}catch{throw Error('Не удалось прочитать аудио. Выбери WAV, MP3 или M4A.')}if(b.duration>16)throw Error('Максимальная длина сэмпла 16 секунд');if(epoch!==this.importEpoch)return false;this.custom.set(id,b);this.onChange();return true;}
 startRibbon(position){const ctx=this.engine.ctx;this.endRibbon();const carrier=ctx.createOscillator(),mod=ctx.createOscillator(),depth=ctx.createGain(),gain=ctx.createGain();carrier.type='triangle';mod.type='sine';gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(.12,ctx.currentTime+.015);mod.connect(depth).connect(carrier.frequency);carrier.connect(gain).connect(this.engine.graph.bus);carrier.start();mod.start();this.ribbon={ctx,carrier,mod,depth,gain};this.moveRibbon(position);}
 moveRibbon(position){if(!this.ribbon)return;const {ctx,carrier,mod,depth}=this.ribbon;const degree=Math.round(clamp(position,0,1)*14),note=53+minor[degree%7]+12*Math.floor(degree/7),freq=hz(note);carrier.frequency.setTargetAtTime(freq,ctx.currentTime,.009);mod.frequency.setTargetAtTime(freq*2,ctx.currentTime,.009);depth.gain.setTargetAtTime(freq*.65,ctx.currentTime,.009);return note;}
 endRibbon(){const v=this.ribbon;if(!v)return;this.ribbon=null;const t=v.ctx.currentTime;v.gain.gain.cancelScheduledValues(t);v.gain.gain.setTargetAtTime(0,t,.012);v.carrier.stop(t+.08);v.mod.stop(t+.08);v.carrier.onended=()=>{v.carrier.disconnect();v.mod.disconnect();v.depth.disconnect();v.gain.disconnect()};}
}
