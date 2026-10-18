import {analyzeAudio,choosePad,withFades,type AudioAnalysis} from './smart.js';
const paths=[
 ['/samples/kicks/punch-01.wav','/samples/kicks/punch-03.wav','/samples/kicks/deep-01.wav','/samples/kicks/tight-02.wav'],
 [],['/samples/claps/classic-01.wav','/samples/claps/classic-03.wav','/samples/snares/snap-01.wav'],
 ['/samples/hats/closed-01.wav','/samples/hats/closed-05.wav'],
 ['/samples/hats/open-01.wav','/samples/hats/open-03.wav'],
 ['/samples/percs/tom-01.wav','/samples/percs/shaker-01.wav','/samples/percs/tick-02.wav','/samples/percs/blip-01.wav'],
 [],['/samples/cymbals/ride-01.wav']
];
export type Sound={buffer:AudioBuffer;gain:number;lowCut:number;highCut:number;name:string;user:boolean};
export class SoundBank {
 private restored=false;private defaultBuffers=new Map<string,AudioBuffer>();private warming:Promise<void>|null=null;private raw=new Map<string,Promise<ArrayBuffer>>();private custom=new Map<number,Sound>();
 constructor(){this.preload();}
 private preload(){for(const row of paths)for(const path of row){if(!this.raw.has(path))this.raw.set(path,fetch(path,{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('sample unavailable');return r.arrayBuffer()}).catch(()=>new ArrayBuffer(0)));}}
 async warm(ctx:AudioContext):Promise<void>{if(this.warming)return this.warming;const needed=new Set(paths.flat());const promise=Promise.allSettled([...needed].map(async path=>{if(this.defaultBuffers.has(path))return;const raw=await this.raw.get(path);if(!raw?.byteLength)return;const buff=await ctx.decodeAudioData(raw.slice(0));this.defaultBuffers.set(path,buff);})).then(()=>{});this.warming=promise;await promise;}
 resolve(pad:number,style:number):Sound|null {
 const imported=this.custom.get(pad);if(imported)return imported;
 const options=paths[pad];if(!options?.length)return null;
 const url=options[style%options.length];const buffer=url?this.defaultBuffers.get(url):null;if(!buffer)return null;
 return {buffer,gain:.85,lowCut:pad===3||pad===4?3800:pad===0?22:80,highCut:pad===0?500:19000,name:url!.split('/').at(-1)??'',user:false};
 }
 async importFile(file:File,ctx:AudioContext,overridePad?:number):Promise<{pad:number;analysis:AudioAnalysis;name:string}> {
  if(file.size>16*1024*1024)throw Error('Один сэмпл — максимум 16 МБ');
  const supported=/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name)||file.type.startsWith('audio/');if(!supported)throw Error('Выбери аудиофайл');
  const decoded=await ctx.decodeAudioData(await file.arrayBuffer());if(decoded.duration>30)throw Error('Загрузи отдельный звук до 30 сек., не полный трек');
  const a=analyzeAudio(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);
  const pad=overridePad??choosePad(a);const buffer=withFades(decoded,a,ctx);
  this.custom.set(pad,{buffer,gain:a.gain,lowCut:a.lowCut,highCut:a.highCut,name:file.name.replace(/\.[^.]+$/,''),user:true});
  void this.persist(pad,file);
  return {pad,analysis:a,name:file.name};
 }
 private async database():Promise<IDBDatabase|null>{
  if(!('indexedDB' in window))return null;
  return new Promise(resolve=>{const request=indexedDB.open('artss-live-user-samples',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('pads'))request.result.createObjectStore('pads')};
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
  });
 }
 private async persist(pad:number,file:File):Promise<void>{
  const db=await this.database();if(!db)return;
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('pads','readwrite');tx.objectStore('pads').put(file,pad);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}catch{}finally{db.close()}
 }
 async restore(ctx:AudioContext):Promise<void>{
  if(this.restored)return;this.restored=true;const db=await this.database();if(!db)return;
  try{const entries=await new Promise<Array<{key:IDBValidKey;value:File}>>(resolve=>{const result:Array<{key:IDBValidKey;value:File}>=[];const req=db.transaction('pads','readonly').objectStore('pads').openCursor();req.onsuccess=()=>{const c=req.result;if(c){result.push({key:c.key,value:c.value as File});c.continue()}else resolve(result)};req.onerror=()=>resolve(result)});
   for(const item of entries){const index=Number(item.key);if(index>=0&&index<8&&!this.custom.has(index)&&item.value&&item.value.size){
    try{const decoded=await ctx.decodeAudioData(await item.value.arrayBuffer());const analysis=analyzeAudio(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);
     this.custom.set(index,{buffer:withFades(decoded,analysis,ctx),gain:analysis.gain,lowCut:analysis.lowCut,highCut:analysis.highCut,name:item.value.name?.replace(/\.[^.]+$/,'')??'USER',user:true});}catch{}
   }}
  }finally{db.close()}
 }
 customInfo(pad:number){return this.custom.get(pad)?.name??null;}
 clearCustom(){this.custom.clear();}
}