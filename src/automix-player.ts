import {analyzeBuffer,crossfadeCurve,normalizeGain,planTransition,type TrackAnalysis} from './automix.js';
import type {Engine} from './engine.js';
export type LoadedTrack={name:string;buffer:AudioBuffer;analysis:TrackAnalysis};
export type AutoMixState='idle'|'loading'|'ready'|'playing'|'error';
type Scheduled={source:AudioBufferSourceNode;volume:GainNode;bass:BiquadFilterNode};
type Timeline={track:LoadedTrack;time:number;offset:number;rate:number;fadeStart:number;fadeDuration:number};
export class AutoMixPlayer {
 private tracks:LoadedTrack[]=[];private scheduled:Scheduled[]=[];
 private mixOutput:GainNode|null=null;private detach:(()=>void)|null=null;
 private generation=0;private status:AutoMixState='idle';private ticker:number|null=null;private timeline:Timeline[]=[];
 constructor(private engine:Engine,private onStatus:(state:AutoMixState,message:string)=>void){}
 get state(){return this.status}
 get position(){
  const now=this.engine.ctx?.currentTime??0;
  const index=this.timeline.reduce((current,item,i)=>now>=item.time?i:current,0);
  const item=this.timeline[index];
  if(!item)return {index:0,percent:0};
  const at=Math.max(0,item.offset+(now-item.time)*item.rate);
  return {index,percent:Math.min(100,Math.max(0,Math.round(100*at/item.track.buffer.duration)))};
 }
 /** Music makes space for active drum pads, without muting or stopping the DJ track. */
 setPadOverlay(playing:boolean){if(!this.mixOutput||!this.engine.ctx)return;
  this.mixOutput.gain.setTargetAtTime(playing?.55:.76,this.engine.ctx.currentTime,.08);
 }
 get loaded(){return this.tracks.map(t=>({name:t.name,bpm:t.analysis.bpm,confidence:t.analysis.confidence,rms:t.analysis.rms}))}
 private update(state:AutoMixState,message:string){this.status=state;this.onStatus(state,message)}
 async load(files:FileList|File[]):Promise<void>{
  const selected=Array.from(files);if(selected.length<1||selected.length>3)throw Error('Выбери от одного до трёх треков');
  this.stop(false);this.tracks=[];const epoch=++this.generation;
  this.update('loading','Анализ темпа и музыкальных фраз…');
  try{
   await this.engine.unlock();const ctx=this.engine.ctx;if(!ctx)throw Error('Аудиодвижок недоступен');
   let total=0,totalBytes=0;const decoded:LoadedTrack[]=[];
   for(const file of selected){
    if(epoch!==this.generation)return;
    totalBytes+=file.size;
    if(file.size>45*1024*1024||totalBytes>100*1024*1024)throw Error('Лимит памяти: 45 МБ на трек, 100 МБ вместе');
    if(!/^audio\//i.test(file.type)&&!/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name))throw Error('Нужны аудиофайлы');
    let buffer:AudioBuffer;
    try{buffer=await ctx.decodeAudioData(await file.arrayBuffer())}catch{throw Error('Не удалось прочитать '+file.name)}
    if(buffer.duration<4||!Number.isFinite(buffer.duration))throw Error('Аудиотрек слишком короткий: '+file.name);
    total+=buffer.duration;if(total>720)throw Error('Для памяти iPhone суммарная длина ограничена 12 минутами');
    decoded.push({name:file.name,buffer,analysis:analyzeBuffer(buffer)});
   }
   if(epoch!==this.generation)return;
   this.tracks=decoded;this.update('ready',decoded.map(t=>t.name.slice(0,22)+' · '+t.analysis.bpm+' BPM').join(' → '));
  }catch(error){if(epoch===this.generation){this.tracks=[];this.update('error',error instanceof Error?error.message:'Ошибка анализа')}throw error}
 }
 async start(joinPads=false,intro=true,cue=0):Promise<void>{
  if(this.status==='loading')throw Error('Подожди завершения анализа');
  if(this.tracks.length<1)throw Error('Загрузи аудиотрек');
  this.stop(false);const epoch=++this.generation;
  await this.engine.unlock();if(epoch!==this.generation)return;
  if(joinPads&&this.engine.state!=='PLAY')await this.engine.start();
  if(epoch!==this.generation)return;
  const ctx=this.engine.ctx;if(!ctx)throw Error('Аудиодвижок недоступен');
  const sync=joinPads?this.engine.getMusicSyncPoint():{time:ctx.currentTime+.09,tempo:this.tracks[0]!.analysis.bpm,playing:false};
  const mix=ctx.createGain();mix.gain.value=sync.playing?.55:.76;
  this.mixOutput=mix;this.detach=this.engine.connectMusicSource(mix);
  const first=this.tracks[0]!,initialRate=sync.playing&&first.analysis.confidence>=.17
   ?Math.min(1.06,Math.max(.94,sync.tempo/first.analysis.bpm)):1;
  const bar=240/first.analysis.bpm;
  const desired=Math.min(.85,Math.max(0,cue))*first.buffer.duration;
  const cueOffset=cue>0?first.analysis.firstBeat+Math.floor(Math.max(0,desired-first.analysis.firstBeat)/bar)*bar:0;
  const firstOffset=cue>0?Math.min(cueOffset,Math.max(0,first.buffer.duration-2)):
   intro||sync.playing?Math.min(first.analysis.firstBeat,Math.max(0,first.buffer.duration-2)):0;
  const introBeat=60/(sync.playing?sync.tempo:first.analysis.bpm);
  if(intro){
   const cue=['/samples/performance/fx-01.wav','/samples/performance/fx-02.wav','/samples/performance/fx-03.wav'];
   await Promise.all(cue.map(path=>this.engine.preparePerformance(path)));
   if(epoch!==this.generation)return;
   for(let beat=0;beat<8;beat++){
    const at=sync.time+beat*introBeat;
    void this.engine.playPerformance(cue[0]!,1,at,beat>=6?.32:.18);
    if(beat%2===0)void this.engine.playPerformance(cue[1]!,1,at,.22);
   }
   void this.engine.playPerformance(cue[2]!,1,sync.time+introBeat*6.5,.3);
  }
  const sequence:Timeline[]=[];
  sequence.push({track:first,time:sync.time+(intro?introBeat*8:0),offset:firstOffset,rate:initialRate,fadeStart:0,fadeDuration:0});
  for(let i=1;i<this.tracks.length;i++){
   const prev=sequence[i-1]!,next=this.tracks[i]!;
   const plan=planTransition({...prev.track.analysis,bpm:prev.track.analysis.bpm*prev.rate},next.analysis);
   const elapsed=Math.max(.5,(plan.startNext-prev.offset)/prev.rate);
   const duration=Math.max(.35,Math.min(plan.fadeSeconds/prev.rate,(prev.track.buffer.duration-prev.offset)/prev.rate-elapsed-.05));
   const start=prev.time+elapsed;
   prev.fadeStart=start;prev.fadeDuration=duration;
   sequence.push({track:next,time:start,offset:plan.offsetNext,rate:plan.playbackRate,fadeStart:0,fadeDuration:0});
  }
  this.timeline=sequence;const {incoming,outgoing}=crossfadeCurve();
  if(sequence.length>1)await Promise.all(['/samples/performance/fx-03.wav','/samples/performance/fx-01.wav'].map(path=>this.engine.preparePerformance(path)));
  if(epoch!==this.generation)return;
  try{
   for(let i=0;i<sequence.length;i++){
    const entry=sequence[i]!,source=ctx.createBufferSource(),bass=ctx.createBiquadFilter(),volume=ctx.createGain();
    source.buffer=entry.track.buffer;source.playbackRate.value=entry.rate;
    bass.type='lowshelf';bass.frequency.value=150;
    source.connect(bass).connect(volume).connect(mix);
    const level=normalizeGain(entry.track.analysis);
    if(i===0){volume.gain.setValueAtTime(level*.81,entry.time);bass.gain.setValueAtTime(0,entry.time)}
    else {
     const prev=sequence[i-1]!;
     volume.gain.setValueAtTime(0,entry.time);
     volume.gain.setValueCurveAtTime(Float32Array.from(incoming,x=>x*level),entry.time,prev.fadeDuration);
     bass.gain.setValueAtTime(-8,entry.time);bass.gain.linearRampToValueAtTime(0,entry.time+prev.fadeDuration*.75);
    }
    if(entry.fadeDuration>0){
     volume.gain.setValueCurveAtTime(Float32Array.from(outgoing,x=>x*level),entry.fadeStart,entry.fadeDuration);
     bass.gain.setValueAtTime(0,entry.fadeStart);
     bass.gain.linearRampToValueAtTime(-9,entry.fadeStart+entry.fadeDuration*.6);
    }
    source.start(entry.time,entry.offset);
    source.onended=()=>{if(epoch===this.generation&&i===sequence.length-1)this.stop()};
    this.scheduled.push({source,volume,bass});
    if(i>0){const prev=sequence[i-1]!;
     void this.engine.playPerformance('/samples/performance/fx-03.wav',1,Math.max(entry.time,prev.fadeStart+prev.fadeDuration-1.55),.16);
     void this.engine.playPerformance('/samples/performance/fx-01.wav',1,prev.fadeStart+prev.fadeDuration,.24);
    }
   }
   if(epoch!==this.generation)return;
   this.update('playing','Автосводка · '+sequence[0]!.track.name);
   this.ticker=window.setInterval(()=>{
    if(epoch!==this.generation||this.status!=='playing')return;
    const now=ctx.currentTime;
    const index=sequence.reduce((acc,x,i)=>now>=x.time?i:acc,0);
    const end=sequence.at(-1)!;
    const remaining=Math.max(0,Math.ceil(end.time+(end.track.buffer.duration-end.offset)/end.rate-now));
    this.onStatus('playing','Автосводка · '+sequence[index]!.track.name+' · '+remaining+' с');
   },700);
  }catch(error){this.stop();throw error}
 }
 stop(report=true){
  ++this.generation;
  if(this.ticker!==null){window.clearInterval(this.ticker);this.ticker=null}
  for(const item of this.scheduled){item.source.onended=null;try{item.source.stop()}catch{}try{item.source.disconnect();item.bass.disconnect();item.volume.disconnect()}catch{}}
  this.scheduled=[];this.timeline=[];
  this.engine.stopPerformance();
  this.detach?.();this.detach=null;try{this.mixOutput?.disconnect()}catch{}this.mixOutput=null;
  if(report)this.update(this.tracks.length>=1?'ready':'idle','Автосводка остановлена');
 }
 dispose(){this.stop(false);this.tracks=[];this.update('idle','')}
}
