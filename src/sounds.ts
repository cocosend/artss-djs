import {analyzeAudio,type AudioAnalysis} from './smart.js';
// Every factory pad plays a known shipped sample; never substitute an oscillator.
const paths=[
 ['/samples/kicks/punch-01.wav'],
 ['/samples/kicks/deep-01.wav'],
 ['/samples/claps/classic-01.wav'],
 ['/samples/hats/closed-01.wav'],
 ['/samples/hats/open-01.wav'],
 ['/samples/percs/tom-01.wav'],
 ['/samples/percs/blip-01.wav'],
 ['/samples/cymbals/ride-01.wav']
];

/** Original WAV timbre changes with A-D banks; all assets are shipped locally. */
export const KIT_VARIANTS:readonly (readonly string[])[]=[
 ['/samples/kicks/punch-01.wav','/samples/kicks/deep-01.wav','/samples/claps/classic-01.wav','/samples/hats/closed-01.wav','/samples/hats/open-01.wav','/samples/percs/tom-01.wav','/samples/percs/blip-01.wav','/samples/cymbals/ride-01.wav'],
 ['/samples/kicks/punch-03.wav','/samples/kicks/tight-02.wav','/samples/claps/classic-03.wav','/samples/hats/closed-05.wav','/samples/hats/open-03.wav','/samples/percs/shaker-01.wav','/samples/percs/tick-02.wav','/samples/snares/snap-01.wav'],
 ['/samples/kicks/deep-01.wav','/samples/kicks/punch-03.wav','/samples/snares/snap-01.wav','/samples/hats/closed-05.wav','/samples/hats/open-01.wav','/samples/percs/tick-02.wav','/samples/percs/blip-01.wav','/samples/cymbals/ride-01.wav'],
 ['/samples/kicks/tight-02.wav','/samples/kicks/punch-01.wav','/samples/claps/classic-03.wav','/samples/hats/closed-01.wav','/samples/hats/open-03.wav','/samples/percs/tom-01.wav','/samples/percs/shaker-01.wav','/samples/snares/snap-01.wav']
];
export type Sound={buffer:AudioBuffer;gain:number;lowCut:number;highCut:number;name:string;user:boolean};
export class SoundBank {
 private kit=0;private restored=false;private deleted=new Set<string>();private decoding=new Map<string,Promise<void>>();private defaultBuffers=new Map<string,AudioBuffer>();private warming:Promise<void>|null=null;private raw=new Map<string,Promise<ArrayBuffer>>();private custom=new Map<string,Sound>();
 constructor(){this.preload();}
 setKit(index:number){if(Number.isInteger(index)&&index>=0&&index<KIT_VARIANTS.length)this.kit=index;}
 private kitPath(pad:number){return KIT_VARIANTS[this.kit]?.[pad]??paths[pad]?.[0];}
 private preload(){for(const path of new Set(KIT_VARIANTS.flat())){if(!this.raw.has(path))this.raw.set(path,fetch(path,{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('sample unavailable');return r.arrayBuffer()}).catch(()=>new ArrayBuffer(0)));}}
 private async decodePath(ctx:AudioContext,path:string):Promise<void>{
  if(this.defaultBuffers.has(path))return;
  const existing=this.decoding.get(path);if(existing)return existing;
  const pending=(async()=>{const raw=await this.raw.get(path);if(!raw?.byteLength)throw Error('Factory WAV not available: '+path);
   const buffer=await ctx.decodeAudioData(raw.slice(0));this.defaultBuffers.set(path,buffer);
  })();this.decoding.set(path,pending);
  try{await pending}finally{this.decoding.delete(path)}
 }
 async ensurePad(ctx:AudioContext,pad:number):Promise<void>{
  if(!Number.isInteger(pad)||pad<0||pad>=8)return;
  const path=this.kitPath(pad);if(path)await this.decodePath(ctx,path);
 }
 async warm(ctx:AudioContext):Promise<void>{
  // Switching quickly must warm the newest kit, without concurrent decoder spikes.
  if(this.warming)await this.warming;
  const files=[...new Set(KIT_VARIANTS[this.kit]??KIT_VARIANTS[0])].filter(path=>!this.defaultBuffers.has(path));
  if(!files.length)return;
  const pending=(async()=>{for(let i=0;i<files.length;i+=2)await Promise.allSettled(files.slice(i,i+2).map(path=>this.decodePath(ctx,path)));})();
  this.warming=pending;try{await pending}finally{if(this.warming===pending)this.warming=null}
 }
 resolve(pad:number,style:number):Sound|null {
 const imported=this.custom.get(`${style}:${pad}`) ?? this.custom.get(`legacy:${pad}`);if(imported)return imported;
 const options=paths[pad];if(!options?.length)return null;
 // Keep each pad's factory timbre stable across genre/preset changes.
 const url=this.kitPath(pad);const defaultPath=options[0];const buffer=(url?this.defaultBuffers.get(url):null)??(defaultPath?this.defaultBuffers.get(defaultPath):null);if(!buffer)return null;
 return {buffer,gain:.85,lowCut:pad===3||pad===4?3800:pad<=1?22:60,highCut:pad===1?650:pad===0?15000:19000,name:(buffer===this.defaultBuffers.get(url??'')?url:defaultPath)?.split('/').at(-1)??'',user:false};
 }
 async importFile(file:File,ctx:AudioContext,overridePad?:number,style=0):Promise<{pad:number;analysis:AudioAnalysis;name:string}> {
  if(file.size>16*1024*1024)throw Error('Один сэмпл — максимум 16 МБ');
  const supported=/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(file.name)||file.type.startsWith('audio/');if(!supported)throw Error('Выбери аудиофайл');
  const decoded=await ctx.decodeAudioData(await file.arrayBuffer());if(decoded.duration>30)throw Error('Загрузи отдельный звук до 30 сек., не полный трек');
  const a=analyzeAudio(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);
  if(overridePad===undefined)throw Error('Выбери пэд и явно нажми REPLACE. Автоматическая замена отключена.');
  const pad=overridePad;if(!Number.isInteger(pad)||pad<0||pad>7)throw Error('Некорректный пэд');
  // Preserve imported timbre; no automatic classifier EQ, gain boost or hard trimming.
  const custom:Sound={buffer:decoded,gain:1,lowCut:20,highCut:Math.min(20000,decoded.sampleRate*.46),name:file.name.replace(/\.[^.]+$/,''),user:true};
  const key=`${style}:${pad}`;await this.persist(key,file);this.deleted.delete(key);this.custom.set(key,custom);
  return {pad,analysis:a,name:file.name};
 }
 private async database():Promise<IDBDatabase|null>{
  if(!('indexedDB' in window))return null;
  return new Promise(resolve=>{let request:IDBOpenDBRequest;try{request=indexedDB.open('artss-live-user-samples',1)}catch{resolve(null);return;}
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('pads'))request.result.createObjectStore('pads')};
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
  });
 }
 private async persist(key:string,file:File):Promise<void>{
  const db=await this.database();if(!db)throw Error('Сохранение сэмпла на устройстве недоступно');
  // Store binary PCM/compressed data as structured-clone-safe ArrayBuffer. WebKit may
  // silently fail to restore File objects persisted across navigation.
  const value={data:await file.arrayBuffer(),name:file.name,type:file.type};
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('pads','readwrite');tx.objectStore('pads').put(value,key);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}
  finally{db.close()}
 }
 async restore(ctx:AudioContext):Promise<void>{
  if(this.restored)return;this.restored=true;const db=await this.database();if(!db)return;
  try{const entries=await new Promise<Array<{key:IDBValidKey;value:unknown}>>(resolve=>{const result:Array<{key:IDBValidKey;value:unknown}>=[];const req=db.transaction('pads','readonly').objectStore('pads').openCursor();req.onsuccess=()=>{const c=req.result;if(c){result.push({key:c.key,value:c.value});c.continue()}else resolve(result)};req.onerror=()=>resolve(result)});
   for(const item of entries){
    const key=typeof item.key==='number'?`legacy:${item.key}`:String(item.key);
    const scoped=/^(?:[0-9]|1[01]):[0-7]$/.test(key),legacy=/^legacy:[0-7]$/.test(key);
    if(!(scoped||legacy)||this.deleted.has(key)||this.custom.has(key)||!item.value)continue;
    const entry=item.value as {data?:unknown;name?:string;type?:string;size?:number;arrayBuffer?:()=>Promise<ArrayBuffer>};
    let data:ArrayBuffer|null=null;
    if(entry.data instanceof ArrayBuffer)data=entry.data;
    else if(typeof entry.arrayBuffer==='function')data=await entry.arrayBuffer(); // legacy stored File/Blob
    if(!data||!data.byteLength)continue;
    try{const decoded=await ctx.decodeAudioData(data.slice(0));const analysis=analyzeAudio(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);
     // A user may replace this pad while a legacy file is decoding; never let stale storage win.
     if(!this.deleted.has(key)&&!this.custom.has(key))this.custom.set(key,{buffer:decoded,gain:1,lowCut:20,highCut:Math.min(20000,decoded.sampleRate*.46),name:entry.name?.replace(/\.[^.]+$/,'')??'USER',user:true});}catch{}
   }
  }finally{db.close()}
 }
 customInfo(pad:number,style:number){return (this.custom.get(`${style}:${pad}`)??this.custom.get(`legacy:${pad}`))?.name??null;}
 /** Remove a specific style override AND any legacy override without touching other pads/styles. */
 async restoreFactory(pad:number,style:number):Promise<boolean>{
  if(!Number.isInteger(pad)||pad<0||pad>7||!Number.isInteger(style)||style<0||style>11)throw Error('Некорректный пэд');
  const keys=[`${style}:${pad}`,`legacy:${pad}`];
  const found=keys.some(key=>this.custom.has(key));
  // Prevent asynchronous IDB restore from reintroducing deleted overrides.
  for(const key of keys){this.deleted.add(key);this.custom.delete(key);}
  const db=await this.database();if(!db)return found;
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('pads','readwrite');const store=tx.objectStore('pads');
   for(const key of keys)store.delete(key);
   // Older versions wrote numeric keys; those are read as legacy:<pad>.
   store.delete(pad);
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close()}
  return found;
 }
 clearCustom(){this.custom.clear();}
}