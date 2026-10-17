import {PAD_COUNT, PAD_NAMES, PAD_SHORT, KEYS, COLORS, PRESETS, SCENES, createGrid, presetPattern, makePCM, noteOffset} from './sound-design.js';
import {analyzeTrack, MAX_TRACK_BYTES, serializeClips, deserializeClips} from './track-slicer.js';
// ARTSS LIVE 11 — one Web Audio engine, 8 finger pads, 16/32-step overdub loop recording.
const $=(sel,root=document)=>root.querySelector(sel);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const bound=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(+n)?+n:min));
const key='artss-live-session-v12';
const previousKeys=['artss-live-session-v11','artss-studio-session-v10','artss-studio-session-v9'];
const MAX_STEPS=32;
const to32=(row)=>Array.from({length:MAX_STEPS},(_,i)=>bound(row?.[i]??0,0,1));
function blank(bank=0){const p=PRESETS[bank];return {bank,bpm:p.bpm,scene:'GROOVE',steps:16,auto:false,swing:0,master:.75,filter:1,drive:.05,space:.09,delay:.02,mutes:Array(PAD_COUNT).fill(false),solos:Array(PAD_COUNT).fill(false),trackVolumes:Array(PAD_COUNT).fill(.85),trackPitch:Array(PAD_COUNT).fill(0),sampleMode:false,samplePage:0,patterns:Object.fromEntries(SCENES.map(scene=>[scene,presetPattern(p,scene).map(to32)]))};}
function restore(data){if(!data||!Number.isInteger(data.bank)||!PRESETS[data.bank]||!data.patterns)return null;
 const out=blank(data.bank);out.bpm=Math.round(bound(data.bpm,65,195));out.scene=SCENES.includes(data.scene)?data.scene:'GROOVE';out.steps=data.steps===32?32:16;out.auto=!!data.auto;
 for(const f of ['swing','master','filter','drive','space','delay'])out[f]=bound(data[f]??out[f],0,f==='swing'?.45:1);
 out.mutes=Array.from({length:PAD_COUNT},(_,i)=>!!data.mutes?.[i]);out.solos=Array.from({length:PAD_COUNT},(_,i)=>!!data.solos?.[i]);
 out.trackVolumes=Array.from({length:PAD_COUNT},(_,i)=>bound(data.trackVolumes?.[i]??.85,0,1));
 out.trackPitch=Array.from({length:PAD_COUNT},(_,i)=>Math.round(bound(data.trackPitch?.[i]??0,-12,12)));out.sampleMode=!!data.sampleMode;out.samplePage=Math.max(0,Math.min(3,Math.floor(data.samplePage||0)));
 for(const scene of SCENES){const grid=data.patterns[scene];if(!Array.isArray(grid)||![PAD_COUNT,16].includes(grid.length))return null;
  const legacy=[0,1,2,3,7,6,8,data.bank===7?11:9];
  out.patterns[scene]=Array.from({length:PAD_COUNT},(_,i)=>to32(grid[grid.length===16?legacy[i]:i]));}
 return out;}
function readSession(){for(const name of [key,...previousKeys]){try{const value=localStorage.getItem(name);if(value){const restored=restore(JSON.parse(value));if(restored)return restored;}}catch{}}return blank();}
let state=readSession(),engine,activeTab='pads',selectedPad=0,activeStep=-1,clockBase=0,tapTimes=[],undoStack=[],toastTimer=0,saveTimer=0,rendering=false,recordReady=null,stepPage=0,liveRec=false,clearArmed=false,clearTimer=0,sliceCount=16,analyzing=false,trackName='';
function store(){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,140);}
function saveNow(){clearTimeout(saveTimer);try{localStorage.setItem(key,JSON.stringify(state));}catch{announce('Не удалось сохранить сессию. Освободи место в Safari.',true);}}

function announce(message,isError=false){const target=$('#toast');target.textContent=message;target.hidden=false;target.style.borderColor=isError?'#ff4b5d':'#8edbda';clearTimeout(toastTimer);toastTimer=setTimeout(()=>target.hidden=true,3000)}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),40000)}
function ramp(t,atk,rel,dur){return Math.min(1,t/atk)*Math.min(1,Math.max(0,(dur-t)/rel))}
function xorshift(seed){let s=seed|0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967295*2-1}}
function createBuffer(ctx,pcm){const b=ctx.createBuffer(1,pcm.length,ctx.sampleRate);b.copyToChannel(pcm,0);return b}
function impulse(ctx){const n=Math.round(ctx.sampleRate*.45),b=ctx.createBuffer(2,n,ctx.sampleRate);for(let ch=0;ch<2;ch++){let rnd=xorshift(317+ch);const a=b.getChannelData(ch);for(let i=0;i<n;i++)a[i]=rnd()*Math.exp(-i/n*8)*.35;}const c=ctx.createConvolver();c.buffer=b;return c}
function graph(ctx,destination,current){
 const bus=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.65;
 const dry=ctx.createGain(),wet=ctx.createGain(),shape=ctx.createWaveShaper();const table=new Float32Array(2048);
 for(let i=0;i<table.length;i++){const v=2*i/(table.length-1)-1;table[i]=Math.tanh(v*1.6)/Math.tanh(1.6)}shape.curve=table;shape.oversample='2x';
 const mix=ctx.createGain(),delay=ctx.createDelay(1),feedback=ctx.createGain(),delaySend=ctx.createGain(),delayReturn=ctx.createGain(),reverb=impulse(ctx),roomSend=ctx.createGain(),roomReturn=ctx.createGain();
 const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-11;compressor.knee.value=9;compressor.ratio.value=5;compressor.attack.value=.002;compressor.release.value=.16;
 const master=ctx.createGain(),analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.67;
 bus.connect(filter);filter.connect(dry).connect(mix);filter.connect(shape).connect(wet).connect(mix);
 mix.connect(compressor);mix.connect(delaySend).connect(delay);delay.connect(feedback).connect(delay);delay.connect(delayReturn).connect(compressor);
 mix.connect(roomSend).connect(reverb).connect(roomReturn).connect(compressor);
 compressor.connect(master).connect(analyser).connect(destination);
 function set(s){const t=ctx.currentTime;
  filter.frequency.setTargetAtTime(130+18500*Math.pow(bound(s.filter,0,1),2.7),t,.018);
  dry.gain.setTargetAtTime(1-bound(s.drive,0,1)*.35,t,.018);wet.gain.setTargetAtTime(bound(s.drive,0,1)*.3,t,.018);
  delay.delayTime.setTargetAtTime(60/bound(s.bpm,65,195)*.75,t,.03);feedback.gain.value=.21;
  delaySend.gain.setTargetAtTime(bound(s.delay,0,.8)*.32,t,.018);delayReturn.gain.value=.39;
  roomSend.gain.setTargetAtTime(bound(s.space,0,.8)*.32,t,.018);roomReturn.gain.value=.34;
  master.gain.setTargetAtTime(bound(s.master,0,1)*.85,t,.016);
 }
 set(current);return {bus,master,analyser,set};
}
class AudioStudio {
 constructor(){this.ctx=null;this.nodes=null;this.stream=null;this.cache=new Map();this.custom=new Map();this.sources=new Set();this.clips=[];this.clipCache=new WeakMap();this.offlineVoices=new WeakMap();this.trackName='';this.playing=false;this.startPending=false;this.epoch=0;this.tickId=null;this.nextTime=0;this.stepIndex=0;this.lastStepAt=0;this.lastAbsoluteStep=0;this.elapsed=0;this.lastStart=0;this.onStep=()=>{};this.onTransport=()=>{};this.onHitRecorded=()=>{};this.recorder=null;this.recChunks=[];this.recPhase='idle';this.onRecord=()=>{};this.onRecordingReady=()=>{};}
 async unlock(){if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Web Audio API is unavailable');this.ctx=new C({latencyHint:'interactive'});this.stream=this.ctx.createMediaStreamDestination();this.nodes=graph(this.ctx,this.ctx.destination,state);this.nodes.master.connect(this.stream);}
  if(this.ctx.state!=='running')await this.ctx.resume();if(this.ctx.state!=='running')throw Error('Audio suspended: touch a pad again');return this.ctx;}
 set(){if(this.nodes)this.nodes.set(state)}
 buffer(ctx,slot,pitch=0){if(state.sampleMode&&this.clips.length){const index=state.samplePage*PAD_COUNT+slot,clip=this.clips[index];if(clip){let cache=this.clipCache.get(ctx);if(!cache){cache=new Map();this.clipCache.set(ctx,cache);}if(!cache.has(index)){const b=ctx.createBuffer(1,clip.pcm.length,clip.sampleRate);b.copyToChannel(clip.pcm,0);cache.set(index,b);}return cache.get(index);}}
 const user=this.custom.get(slot);if(user)return user;const k=`${ctx.sampleRate}-${state.bank}-${slot}-${pitch}`;if(!this.cache.has(k)){this.cache.set(k,createBuffer(ctx,makePCM(slot,ctx.sampleRate,state.bank,pitch)));if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value)}return this.cache.get(k)}
 note(ctx,out,slot,when,velocity,step,track=true,bar=0){
  const pitch=noteOffset(state.bank,slot,step%16,bar),src=ctx.createBufferSource(),gain=ctx.createGain();
  src.buffer=this.buffer(ctx,slot,pitch);src.playbackRate.value=Math.pow(2,bound(state.trackPitch?.[slot]??0,-12,12)/12);
  gain.gain.value=bound(velocity,0,1)*.57*(slot===0?1.12:slot===1?.86:1)*state.trackVolumes[slot];
  const playAt=Math.max(when,ctx.currentTime);
 // Choke a previous long slice of the same slot to avoid 6s overlapping blasts.
 if(state.sampleMode&&this.clips.length){
   let previous=[];
   if(track)previous=Array.from(this.sources).filter(voice=>voice.slot===slot);
   else{let map=this.offlineVoices.get(ctx);if(!map){map=new Map();this.offlineVoices.set(ctx,map);}const old=map.get(slot);if(old)previous=[old];map.set(slot,{src,gain,slot});}
   for(const voice of previous){try{voice.gain.gain.cancelScheduledValues(playAt);voice.gain.gain.setTargetAtTime(0,playAt,.008);voice.src.stop(playAt+.045);}catch{}}
  }
 src.connect(gain).connect(out);src.start(playAt);
 if(state.sampleMode&&this.clips.length){gain.gain.setValueAtTime(0,playAt);gain.gain.linearRampToValueAtTime(bound(velocity,0,1)*.57*state.trackVolumes[slot],playAt+.012);const dur=src.buffer.duration/src.playbackRate.value;gain.gain.setTargetAtTime(0,playAt+Math.max(.02,dur-.035),.009);}
  if(track){const voice={src,gain,slot};this.sources.add(voice);src.onended=()=>{this.sources.delete(voice);try{src.disconnect();gain.disconnect()}catch{}};}
 }
 quantizedStep(){if(!this.playing||!this.ctx)return 0;const duration=60/state.bpm/4;
  return ((Math.round(this.lastAbsoluteStep+(this.ctx.currentTime-this.lastStepAt)/duration)%state.steps)+state.steps)%state.steps;}
 async hit(slot,velocity=1){await this.unlock();const now=this.ctx.currentTime;this.note(this.ctx,this.nodes.bus,slot,now+.003,velocity,0);
  if(liveRec&&this.playing){const step=this.quantizedStep();const scene=this.scene(Math.floor(this.stepIndex/16));const row=state.patterns[scene][slot];
   row[step]=Math.max(row[step],bound(velocity,0,1));this.onHitRecorded(slot,step,scene);store();}}
 scene(bar){return state.auto?SCENES[[0,0,1,1,1,2,2,3,3,3,3,4][bar%12]]:state.scene;}
 canPlay(slot){return !state.mutes[slot]&&(!state.solos.some(Boolean)||state.solos[slot]);}
 scheduler(){if(!this.playing||!this.ctx||this.ctx.state!=='running')return;
  const beat=60/state.bpm/4,now=this.ctx.currentTime;
  if(this.nextTime<now-.1){const missed=Math.floor((now-this.nextTime)/beat)+1;this.stepIndex+=missed;this.nextTime+=missed*beat;}
  let guard=0;while(this.nextTime<now+.105&&guard++<20){const step=this.stepIndex%state.steps,bar=Math.floor(this.stepIndex/16),scene=this.scene(bar),swing=step%2?state.swing*beat*.56:0;
   for(let slot=0;slot<PAD_COUNT;slot++){const velocity=state.patterns[scene]?.[slot]?.[step]??0;
    if(velocity>.01&&this.canPlay(slot))this.note(this.ctx,this.nodes.bus,slot,this.nextTime+swing,velocity,step,true,bar);}
   this.lastStepAt=this.nextTime;this.lastAbsoluteStep=this.stepIndex;
   this.onStep(step,bar,scene);this.stepIndex++;this.nextTime+=beat;
  }
 }
 async start(){if(this.playing||this.startPending)return false;this.startPending=true;const epoch=this.epoch;
  try{await this.unlock();if(epoch!==this.epoch||this.playing)return false;this.playing=true;this.lastStart=performance.now();this.nextTime=this.ctx.currentTime+.045;this.nodes.set(state);this.scheduler();this.tickId=setInterval(()=>this.scheduler(),25);this.onTransport(true);return true;}finally{this.startPending=false}}
 halt(reset){this.epoch++;if(this.playing)this.elapsed+=performance.now()-this.lastStart;
  this.playing=false;clearInterval(this.tickId);this.tickId=null;liveRec=false;this.onTransport(false);this.clearSources();
  if(reset){this.stepIndex=0;this.elapsed=0;this.onStep(-1,0,state.scene);}
  saveNow();}
 pause(){this.halt(false)}
 stop(){this.halt(true);if(this.recPhase==='recording'){this.record().catch(()=>{});}}
 clearSources(){const voices=Array.from(this.sources);this.sources.clear();if(this.ctx){const t=this.ctx.currentTime;for(const {src,gain} of voices){try{gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.008);src.stop(t+.055)}catch{}}}}

 async record(){if(this.recPhase==='stopping')return;if(this.recPhase==='recording'){this.recPhase='stopping';this.onRecord('stopping');this.recorder.stop();return;}
  await this.unlock();if(typeof MediaRecorder==='undefined')throw Error('Audio capture unavailable; use EXPORT WAV');
  const types=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'];const type=types.find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(this.stream.stream,type?{mimeType:type}:undefined),chunks=[];this.recChunks=chunks;this.recorder=recorder;
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  recorder.onerror=()=>{this.recPhase='idle';this.onRecord('error')};
  recorder.onstop=()=>{this.recPhase='idle';const mime=recorder.mimeType||type||'audio/webm',ext=mime.includes('mp4')?'m4a':'webm';
   if(chunks.length){const blob=new Blob(chunks,{type:mime});this.onRecord('ready');this.onRecordingReady(blob,ext);}else this.onRecord('empty');};
  recorder.start(300);this.recPhase='recording';this.onRecord('recording');}
 async offline(bars){if(this.playing)throw Error('Pause transport before exporting');const count=bound(bars,8,32),sr=44100,O=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!O)throw Error('Offline WAV unsupported');const seconds=count*4*60/state.bpm+1.3,ctx=new O(2,Math.ceil(seconds*sr),sr),nodes=graph(ctx,ctx.destination,state);
  for(let bar=0;bar<count;bar++){for(let s=0;s<16;s++){const step=(bar*16+s)%state.steps,t=bar*4*60/state.bpm+s*60/state.bpm/4+.04+(s%2?state.swing*60/state.bpm/4*.56:0);
    for(let slot=0;slot<PAD_COUNT;slot++){const scene=this.scene(bar),v=state.patterns[scene]?.[slot]?.[step]??0;
     if(v>.01&&this.canPlay(slot))this.note(ctx,nodes.bus,slot,t,v,step,false,bar);}}}
  return wav(await ctx.startRendering());}
 meter(){if(!this.nodes)return 0;this.meterData??=new Uint8Array(this.nodes.analyser.fftSize);this.nodes.analyser.getByteTimeDomainData(this.meterData);let s=0;for(const k of this.meterData){const v=(k-128)/128;s+=v*v}return Math.min(1,Math.sqrt(s/this.meterData.length)*2.2)}
}

function wav(buffer){const count=buffer.length,channels=2,out=new ArrayBuffer(44+count*4),view=new DataView(out);let ptr=0;const put=s=>{for(const c of s)view.setUint8(ptr++,c.charCodeAt(0))};const u16=n=>{view.setUint16(ptr,n,true);ptr+=2};const u32=n=>{view.setUint32(ptr,n,true);ptr+=4};put('RIFF');u32(out.byteLength-8);put('WAVE');put('fmt ');u32(16);u16(1);u16(2);u32(buffer.sampleRate);u32(buffer.sampleRate*4);u16(4);u16(16);put('data');u32(count*4);const l=buffer.getChannelData(0),r=buffer.numberOfChannels===2?buffer.getChannelData(1):l;for(let i=0;i<count;i++){for(const v of [l[i],r[i]]){const x=bound(v,-.96,.96);view.setInt16(ptr,x<0?x*32768:x*32767,true);ptr+=2}}return new Blob([out],{type:'audio/wav'})}
engine=new AudioStudio();
function showTab(view){if(!['pads','sequence','sounds','mix','export'].includes(view))return;activeTab=view;
 $$('[data-panel]').forEach(p=>p.classList.toggle('hide',p.dataset.panel!==view));
 $$('[data-tab]').forEach(b=>{const on=b.dataset.tab===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 if(view==='sequence')renderSequence();if(view==='sounds')renderSlices();
 window.scrollTo({top:0,behavior:'instant'});}

function renderPresets(){$('#presets').replaceChildren(...PRESETS.map((p,i)=>{const b=document.createElement('button');b.type='button';b.className='bank'+(i===state.bank?' selected':'');b.dataset.bank=String(i);b.innerHTML=`<small>${p.tag} · ${p.bpm} BPM</small><b>${p.name}</b>`;return b}));$('#presetLabel').textContent=PRESETS[state.bank].name}
function renderScenes(){$('#scenes').replaceChildren(...SCENES.map(s=>{const b=document.createElement('button');b.type='button';b.dataset.scene=s;b.className='scene'+(s===state.scene?' selected':'');b.textContent=s;return b}));$('#autoScene').checked=state.auto}
function renderSequence(){const root=$('#sequence'),header=document.createElement('div');header.className='seq-row seq-header';
 const spacer=document.createElement('span');spacer.className='seq-name';header.append(spacer);const offset=stepPage*16;
 for(let j=0;j<16;j++){const h=document.createElement('span');h.className='seq-cell';h.textContent=String(offset+j+1).padStart(2,'0');header.append(h)}
 root.replaceChildren(header);
 for(let i=0;i<PAD_COUNT;i++){const row=document.createElement('div'),name=document.createElement('button');row.className='seq-row';name.type='button';name.className='seq-name'+(state.mutes[i]?' muted':'');name.dataset.mute=String(i);name.textContent=PAD_SHORT[i];row.append(name);
  for(let j=0;j<16;j++){const step=offset+j,v=state.patterns[state.scene][i][step],b=document.createElement('button');b.type='button';b.dataset.row=String(i);b.dataset.step=String(step);b.className='seq-cell'+(j%4===0?' quarter':'')+(v?' on':'');b.setAttribute('aria-label',`${PAD_NAMES[i]} шаг ${step+1}`);b.setAttribute('aria-pressed',String(v>0));row.append(b)}root.append(row)}
 $$('#stepLengths [data-length]').forEach(b=>{const current=+b.dataset.length===state.steps;b.classList.toggle('selected',current);b.setAttribute('aria-pressed',String(current))});
 $$('#stepPages [data-page]').forEach(b=>{const current=+b.dataset.page===stepPage;b.classList.toggle('selected',current);b.disabled=state.steps===16&&+b.dataset.page===1;b.setAttribute('aria-pressed',String(current))});
 $('#seqDetail').textContent=`8 × ${state.steps}`;$('#loopLengthLabel').textContent=`${state.steps} STEP LOOP`;
}
function renderTrackMixer(){const root=$('#trackMixer');root.replaceChildren(...PAD_NAMES.map((name,i)=>{
 const row=document.createElement('div');row.className='mix-channel';row.style.setProperty('--track-accent',COLORS[i]);
 row.innerHTML=`<div class="mix-channel-title"><span>${String(i+1).padStart(2,'0')}</span><strong>${PAD_SHORT[i]}</strong></div><button type="button" class="channel-solo${state.solos[i]?' selected':''}" data-solo="${i}" aria-pressed="${state.solos[i]}">S</button><button type="button" class="channel-mute${state.mutes[i]?' selected':''}" data-channel-mute="${i}" aria-pressed="${state.mutes[i]}">M</button><label class="channel-level" for="track-level-${i}"><input id="track-level-${i}" type="range" min="0" max="100" value="${Math.round(state.trackVolumes[i]*100)}" data-track-volume="${i}" aria-label="Громкость ${name}"/><output>${Math.round(state.trackVolumes[i]*100)}%</output></label><label class="channel-pitch" for="track-pitch-${i}"><span>KEY</span><input id="track-pitch-${i}" type="range" min="-12" max="12" step="1" value="${state.trackPitch[i]}" data-track-pitch="${i}" aria-label="Тональность ${name}"/><output>${state.trackPitch[i]>0?'+':''}${state.trackPitch[i]} ST</output></label>`;
 return row;}));}
function padLabel(i){if(state.sampleMode&&engine.clips.length){const index=state.samplePage*8+i;const c=engine.clips[index];return c?`SLICE ${String(index+1).padStart(2,'0')}`:PAD_SHORT[i]}return PAD_NAMES[i];}
function renderSlices(){const count=engine.clips.length;const root=$('#sliceGrid');root.replaceChildren();
 $('#sliceTrackName').textContent=engine.trackName||(count?'TRACK SLICES':'NO TRACK LOADED');
 $('#sampleMode').textContent=state.sampleMode&&count?'TRACK SLICES · ON':'KIT SOUNDS · ON';$('#sampleMode').setAttribute('aria-pressed',String(state.sampleMode&&count));
 $('#sliceBankLabel').textContent=`PAD BANK ${state.samplePage+1} / ${Math.max(2,Math.ceil((count||sliceCount)/8))}`;
 $('#bankPrev').disabled=state.samplePage===0;$('#bankNext').disabled=state.samplePage>=Math.max(2,Math.ceil((count||sliceCount)/8))-1;
 $$('#sliceCounts [data-slice-count]').forEach(b=>{const on=+b.dataset.sliceCount===sliceCount;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on))});
 if(!count){const empty=document.createElement('p');empty.className='hint';empty.textContent='Загрузи полную композицию — получишь 16 или 32 автоматически найденных фрагмента.';root.append(empty);return;}
 for(let i=0;i<count;i++){const c=engine.clips[i],b=document.createElement('button');b.type='button';b.dataset.slice=String(i);b.className='slice-cell'+(Math.floor(i/8)===state.samplePage?' current-bank':'');b.innerHTML=`<span class="slice-index">${String(i+1).padStart(2,'0')}</span><strong>${c.hz?Math.round(c.hz)+' Hz':'TONE '+String(i+1).padStart(2,'0')}</strong><small>${formatSeconds(c.start)} → ${formatSeconds(c.start+6)}</small>`;b.setAttribute('aria-label',`Сэмпл ${i+1}, ${formatSeconds(c.start)} от начала трека, воспроизвести`);root.append(b)}
}
function formatSeconds(t){const x=Math.max(0,Math.floor(t));return `${Math.floor(x/60)}:${String(x%60).padStart(2,'0')}`;}
function renderPads(){const root=$('#pads');root.replaceChildren(...PAD_NAMES.map((name,i)=>{const b=document.createElement('button');b.type='button';b.className='pad'+(state.sampleMode?' imported':'');b.dataset.pad=String(i);b.style.setProperty('--pad-color',COLORS[i]);b.setAttribute('aria-label',padLabel(i));b.innerHTML=`<span class="pad-index">${String(state.sampleMode?state.samplePage*8+i+1:i+1).padStart(2,'0')}</span><strong class="pad-label">${padLabel(i)}</strong><span class="pad-key">${KEYS[i]} / PLAY</span>`;return b}));}
const SAMPLE_DB='artss-track-slices-v1';
function sampleStore(mode,callback){return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(Error('IndexedDB unavailable'));const open=indexedDB.open(SAMPLE_DB,1);open.onupgradeneeded=()=>{open.result.createObjectStore('sampleBanks',{keyPath:'id'});};open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('sampleBanks',mode),request=callback(tx.objectStore('sampleBanks'));let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)};};});}
async function restoreSlices(){try{const saved=await sampleStore('readonly',store=>store.get('active'));if(!saved)return;
 engine.clips=deserializeClips(saved.clips);engine.trackName=saved.name;trackName=saved.name;sliceCount=engine.clips.length;state.samplePage=Math.min(state.samplePage,Math.max(0,Math.ceil(sliceCount/8)-1));
 renderSlices();renderPads();$('#sliceStatus').textContent=`ВОССТАНОВЛЕНО: ${saved.name} · ${sliceCount} CLIPS`;}
 catch(e){state.sampleMode=false;renderPads();$('#sliceStatus').textContent='Не удалось восстановить нарезку. Повтори импорт.';}}
async function importFullTrack(file){if(analyzing)return;if(!file) return;if(file.size>MAX_TRACK_BYTES)throw Error('Трек больше 80 МБ: нужен меньший файл');
 analyzing=true;$('#importTrack').disabled=true;$('#sliceProgress').hidden=false;$('#sliceProgress').value=0;$('#sliceStatus').textContent='ЗАГРУЗКА И АНАЛИЗ...';
 try{await engine.unlock();const bytes=await file.arrayBuffer();$('#sliceStatus').textContent='ДЕКОДИРОВАНИЕ ТРЕКА...';const decoded=await engine.ctx.decodeAudioData(bytes);
  if(decoded.duration>2700)throw Error('Трек длиннее 45 минут не поддерживается');
  const clips=await analyzeTrack(decoded,sliceCount,n=>{$('#sliceProgress').value=n;$('#sliceStatus').textContent=`АНАЛИЗ ${n}% · ПОИСК ФРАГМЕНТОВ`});
  const bank={id:'active',name:file.name.slice(0,120),created:Date.now(),clips:serializeClips(clips)};
  // Keep the previous bank intact until the next one is fully constructed.
  engine.stop();engine.clips=clips;engine.clipCache=new WeakMap();engine.trackName=bank.name;trackName=bank.name;state.sampleMode=true;state.samplePage=0;
  renderPads();renderSlices();renderTransport(false);saveNow();
  try{await sampleStore('readwrite',store=>store.put(bank));$('#sliceStatus').textContent=`READY · ${clips.length} × 6 SEC · ${file.name}`;}
  catch{ $('#sliceStatus').textContent=`READY · ${clips.length} CLIPS (не сохранилось, экспортируй или освободи память Safari)`; }
 }finally{analyzing=false;$('#importTrack').disabled=false;$('#sliceProgress').hidden=true;}
}
const controls=[['master','MASTER VOLUME'],['filter','LOW PASS'],['drive','SATURATION'],['space','ROOM REVERB'],['delay','ECHO DELAY'],['swing','SWING']];
function renderFx(){$('#fxList').replaceChildren(...controls.map(([name,label])=>{const wrap=document.createElement('div');wrap.className='fx-row';const n=Math.round(state[name]*100);wrap.innerHTML=`<label for="ctrl-${name}">${label}</label><span id="value-${name}">${n}%</span><input id="ctrl-${name}" type="range" data-fx="${name}" min="0" max="${name==='swing'?45:100}" value="${n}" aria-label="${label}" />`;return wrap}))}
function renderBpm(){$('#bpm').textContent=state.bpm}
function updateState(){engine.set();store();}
function setBank(i){if(!PRESETS[i])return;const steps=state.steps;engine.stop();state=blank(i);state.steps=steps;engine.cache.clear();undoStack.length=0;updateState();renderBpm();renderPresets();renderScenes();renderSequence();renderTrackMixer();renderFx();renderTransport(false);announce(`${PRESETS[i].name} · ${state.bpm} BPM`);}
function remember(){undoStack.push({scene:state.scene,pattern:state.patterns[state.scene].map(r=>r.slice())});if(undoStack.length>40)undoStack.shift();}
function updateStep(step,bar=0){activeStep=step;$$('#progressBars i').forEach((b,i)=>b.classList.toggle('now',i===step));
 $$('.seq-cell.current').forEach(c=>c.classList.remove('current'));if(step>=0)$$(`.seq-cell[data-step="${step}"]`).forEach(b=>b.classList.add('current'));
 $('#position').textContent=step<0?'BAR 01 · STEP 01':`BAR ${String(bar+1).padStart(2,'0')} · STEP ${String(step+1).padStart(2,'0')}`;
 
}
function renderTransport(on){$('#play').classList.toggle('is-playing',on);$('#playGlyph').textContent=on?'Ⅱ':'▶';$('#playText').textContent=on?'PAUSE':'PLAY';$('#play').setAttribute('aria-pressed',String(on));
 $('#audioState').classList.toggle('on',on||engine.ctx?.state==='running');$('#audioState').innerHTML=`<i></i> ${engine.ctx?.state==='running'?'AUDIO ON':'AUDIO OFF'}`;
 renderLiveRec();}
function renderLiveRec(){const b=$('#liveRec');b.classList.toggle('armed',liveRec);b.setAttribute('aria-pressed',String(liveRec));$('#liveRecText').textContent=liveRec?'● LIVE REC ON':'● LIVE REC OFF';
 $('#liveRecStatus').textContent=liveRec?`RECORDING PADS · ${state.steps} STEPS`:engine.playing?'Loop playing · recording OFF':'Нажми REC, затем играй на пэдах';}
function highlightPad(i){const b=$(`[data-pad="${i}"]`);if(!b)return;b.classList.add('hot');clearTimeout(b.hotTimer);b.hotTimer=setTimeout(()=>b.classList.remove('hot'),125);$('#lastPad').textContent=padLabel(i);}
function triggerPad(i,v=1){selectedPad=i;highlightPad(i);engine.hit(i,v).then(()=>{$('#audioState').classList.add('on');$('#audioState').innerHTML='<i></i> AUDIO ON';}).catch(e=>announce(e.message,true));}
let clockFrame=0,lastMeter=0;
function meterLoop(timestamp){clockFrame=requestAnimationFrame(meterLoop);if(timestamp-lastMeter<110)return;lastMeter=timestamp;const peak=engine.meter();$('#levelFill').style.width=`${Math.round(peak*100)}%`;
 $('#meterValue').textContent=peak>.0008?`${Math.round(20*Math.log10(peak))} dB`:'−∞ dB';const ms=engine.elapsed+(engine.playing?performance.now()-engine.lastStart:0);
 $('#time').textContent=`${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;}
function openTakeStore(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(Error('IndexedDB unavailable'));const req=indexedDB.open('artss-live-takes-v1',1);
 req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('takes'))req.result.createObjectStore('takes',{keyPath:'id',autoIncrement:true});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('IndexedDB failed'));});}
async function takeTransaction(mode,run){const db=await openTakeStore();return new Promise((resolve,reject)=>{const tx=db.transaction('takes',mode),store=tx.objectStore('takes'),req=run(store);let result;
 req.onsuccess=()=>result=req.result;req.onerror=()=>reject(req.error);tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)};});}
const addTake=take=>takeTransaction('readwrite',store=>store.add(take));
const getTake=id=>takeTransaction('readonly',store=>store.get(id));
const removeTake=id=>takeTransaction('readwrite',store=>store.delete(id));
const listTakes=()=>takeTransaction('readonly',store=>store.getAll());
async function renderTakeList(){const root=$('#takeList');let takes=[];
 try{takes=await listTakes();}catch(e){root.textContent='Нет доступа к локальному хранилищу. Скачивай аудиофайлы вручную.';return;}
 $('#takeCount').textContent=`${takes.length} TAKES`;root.replaceChildren();
 if(!takes.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='Аудиодублей пока нет. Запись касаний остаётся в паттернах секвенсора.';root.append(empty);return;}
 for(const item of takes.slice().reverse()){const row=document.createElement('div');row.className='take-row';const title=document.createElement('div');title.innerHTML=`<strong>TAKE ${String(item.id).padStart(3,'0')}</strong><small>${new Date(item.time).toLocaleString('ru-RU')} · ${(item.blob.size/1024).toFixed(0)} KB</small>`;
 const actions=document.createElement('div');actions.className='take-actions';for(const [act,label] of [['play','▶'],['download','↓'],['delete','×']]){const button=document.createElement('button');button.type='button';button.dataset.takeAction=act;button.dataset.takeId=String(item.id);button.textContent=label;button.setAttribute('aria-label',`${label} запись ${item.id}`);actions.append(button)}row.append(title,actions);root.append(row);}}
let takePlayer=null,takeUrl=null;
async function actOnTake(action,id){const take=await getTake(id);if(!take)return;if(action==='download')saveBlob(take.blob,`ARTSS-TAKE-${String(id).padStart(3,'0')}.${take.ext}`);
 else if(action==='delete'){if(takePlayer){takePlayer.pause();takePlayer=null;}if(takeUrl){URL.revokeObjectURL(takeUrl);takeUrl=null;}await removeTake(id);await renderTakeList();announce('TAKE DELETED');}
 else if(action==='play'){if(takePlayer)takePlayer.pause();if(takeUrl)URL.revokeObjectURL(takeUrl);takeUrl=URL.createObjectURL(take.blob);takePlayer=new Audio(takeUrl);takePlayer.onended=()=>{if(takeUrl){URL.revokeObjectURL(takeUrl);takeUrl=null;}};await takePlayer.play();}}

function setup(){for(let i=0;i<32;i++){$('#progressBars').append(document.createElement('i'));}
 renderPads();renderPresets();renderScenes();renderSequence();renderSlices();renderTrackMixer();renderFx();renderBpm();showTab('pads');renderLiveRec();renderTakeList();
 $('#navigation').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});
 $('#pads').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-pad]');if(!b||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();triggerPad(+b.dataset.pad);});
 $('#pads').addEventListener('click',e=>{if(e.detail!==0)return;const b=e.target.closest('[data-pad]');if(b)triggerPad(+b.dataset.pad)});
 $('#presets').addEventListener('click',e=>{const b=e.target.closest('[data-bank]');if(b)setBank(+b.dataset.bank)});
 
 $('#scenes').addEventListener('click',e=>{const b=e.target.closest('[data-scene]');if(!b)return;state.scene=b.dataset.scene;state.auto=false;$('#autoScene').checked=false;updateState();renderScenes();renderSequence();});
 $('#stepLengths').addEventListener('click',e=>{const b=e.target.closest('[data-length]');if(!b)return;state.steps=+b.dataset.length;if(state.steps===16)stepPage=0;updateState();renderSequence();updateProgressSize();announce(`${state.steps} STEP LOOP`);});
 $('#stepPages').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b||b.disabled)return;stepPage=+b.dataset.page;renderSequence();});
 $('#sequence').addEventListener('click',e=>{const b=e.target.closest('[data-row][data-step]');if(b){const row=+b.dataset.row,col=+b.dataset.step;remember();const cells=state.patterns[state.scene][row];cells[col]=cells[col]?0:.8;updateState();renderSequence();return;}const mute=e.target.closest('[data-mute]');if(mute){const i=+mute.dataset.mute;state.mutes[i]=!state.mutes[i];updateState();renderSequence();renderTrackMixer();}});
 $('#undo').addEventListener('click',()=>{const prev=undoStack.pop();if(!prev)return;state.scene=prev.scene;state.patterns[prev.scene]=prev.pattern;updateState();renderScenes();renderSequence();});
 $('#fill').addEventListener('click',()=>{remember();let seed=Date.now()|0;for(const row of [3,4,5])for(let j=0;j<state.steps;j++){seed=Math.imul(seed,1664525)+1013904223|0;if((seed>>>0)%100<10)state.patterns[state.scene][row][j]=.25+(seed>>>8&63)/100;}updateState();renderSequence();announce('PERC FILL ADDED');});
 $('#clear').addEventListener('click',()=>{if(!clearArmed){clearArmed=true;$('#clear').textContent='CONFIRM CLEAR';clearTimeout(clearTimer);clearTimer=setTimeout(()=>{clearArmed=false;$('#clear').textContent='× CLEAR SCENE';},3000);return;}clearTimeout(clearTimer);clearArmed=false;$('#clear').textContent='× CLEAR SCENE';remember();state.patterns[state.scene].forEach(row=>row.fill(0));updateState();renderSequence();announce('SCENE CLEARED');});
 $('#autoScene').addEventListener('change',e=>{state.auto=e.target.checked;updateState()});
 $('#bpmUp').addEventListener('click',()=>{state.bpm=Math.min(195,state.bpm+1);renderBpm();updateState()});$('#bpmDown').addEventListener('click',()=>{state.bpm=Math.max(65,state.bpm-1);renderBpm();updateState()});
 $('#tap')?.addEventListener('click',()=>{const now=performance.now();tapTimes=tapTimes.filter(t=>now-t<2200);tapTimes.push(now);if(tapTimes.length>=3){const dt=tapTimes.slice(1).map((t,i)=>t-tapTimes[i]);state.bpm=Math.round(bound(60000/(dt.reduce((a,b)=>a+b)/dt.length),65,195));renderBpm();updateState();}});
 let pending=false;$('#play').addEventListener('click',async()=>{if(pending)return;pending=true;try{if(engine.playing)engine.pause();else if(await engine.start())$('#audioState').textContent='AUDIO ON';renderTransport(engine.playing);}catch(e){announce(e.message,true)}finally{pending=false;}});
 $('#stop').addEventListener('click',()=>{engine.stop();renderTransport(false);$('#time').textContent='00:00';announce('STOP · LOOP SAVED');});
 $('#liveRec').addEventListener('click',async()=>{if(pending)return;pending=true;try{if(liveRec){liveRec=false;saveNow();announce('LIVE REC OFF · LOOP SAVED');}
 else{state.auto=false;$('#autoScene').checked=false;if(!engine.playing)await engine.start();remember();liveRec=true;store();announce('LIVE REC ON · PLAY YOUR PADS');}renderLiveRec();}catch(e){announce(e.message,true)}finally{pending=false;}});
 engine.onStep=(step,bar)=>updateStep(step,bar);engine.onTransport=on=>renderTransport(on);
 engine.onHitRecorded=(slot,step,scene)=>{if(activeTab==='sequence'&&scene===state.scene&&Math.floor(step/16)===stepPage){const b=$(`[data-row="${slot}"][data-step="${step}"]`);if(b){b.classList.add('on');b.setAttribute('aria-pressed','true');}}$('#liveRecStatus').textContent=`${PAD_SHORT[slot]} → STEP ${String(step+1).padStart(2,'0')} · SAVED`;};
 $('#sliceCounts').addEventListener('click',e=>{const b=e.target.closest('[data-slice-count]');if(!b||analyzing)return;sliceCount=Number(b.dataset.sliceCount);renderSlices();});
 $('#importTrack').addEventListener('click',()=>$('#trackFile').click());
 $('#trackFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await importFullTrack(file);announce(`${engine.clips.length} SLICES READY`);}catch(err){$('#sliceStatus').textContent=err.message;announce(err.message,true)}finally{e.target.value='';}});
 $('#sampleMode').addEventListener('click',()=>{if(!engine.clips.length){announce('Загрузи трек в SLICES',true);return;}state.sampleMode=!state.sampleMode;saveNow();renderPads();renderSlices();});
 $('#bankPrev').addEventListener('click',()=>{state.samplePage=Math.max(0,state.samplePage-1);saveNow();renderPads();renderSlices();});
 $('#bankNext').addEventListener('click',()=>{state.samplePage=Math.min(Math.max(1,Math.ceil((engine.clips.length||sliceCount)/8)-1),state.samplePage+1);saveNow();renderPads();renderSlices();});
 $('#sliceGrid').addEventListener('click',async e=>{const b=e.target.closest('[data-slice]');if(!b)return;const i=Number(b.dataset.slice);state.samplePage=Math.floor(i/8);state.sampleMode=true;saveNow();renderPads();renderSlices();triggerPad(i%8);});
 $('#clearSamples').addEventListener('click',async()=>{if(analyzing)return;engine.clips=[];engine.clipCache=new WeakMap();engine.trackName='';state.sampleMode=false;state.samplePage=0;saveNow();renderPads();renderSlices();$('#sliceStatus').textContent='Сэмплы удалены · KIT SOUNDS';try{await sampleStore('readwrite',store=>store.delete('active'));}catch{} });
 $('#trackMixer').addEventListener('click',e=>{const solo=e.target.closest('[data-solo]'),mute=e.target.closest('[data-channel-mute]');if(!solo&&!mute)return;const i=Number((solo||mute).dataset[solo?'solo':'channelMute']);if(solo)state.solos[i]=!state.solos[i];if(mute)state.mutes[i]=!state.mutes[i];updateState();renderTrackMixer();renderSequence();});
 $('#trackMixer').addEventListener('input',e=>{const volume=e.target.closest('[data-track-volume]'),pitch=e.target.closest('[data-track-pitch]');if(volume){const i=+volume.dataset.trackVolume;state.trackVolumes[i]=bound(+volume.value/100,0,1);volume.closest('.channel-level').querySelector('output').textContent=volume.value+'%';store();}if(pitch){const i=+pitch.dataset.trackPitch;state.trackPitch[i]=Math.round(bound(+pitch.value,-12,12));pitch.closest('.channel-pitch').querySelector('output').textContent=`${state.trackPitch[i]>0?'+':''}${state.trackPitch[i]} ST`;store();}});
 $('#fxList').addEventListener('input',e=>{const f=e.target.dataset.fx;if(!f)return;state[f]=bound(+e.target.value/100,0,f==='swing'?.45:1);$(`#value-${f}`).textContent=`${Math.round(state[f]*100)}%`;engine.set();store();});
 engine.onRecord=phase=>{$('#recordDot').classList.toggle('live',phase==='recording');$('#recordStatus').textContent=({recording:'Записывается весь мастер-звук…',stopping:'Сохраняю аудиодубль…',ready:'Аудиодубль завершён',empty:'Пустая запись',error:'Ошибка записи'})[phase]||'Запись мастер-аудио';$('#record').textContent=phase==='recording'?'■ STOP & SAVE TAKE':'● START AUDIO TAKE';$('#record').classList.toggle('live',phase==='recording');};
 engine.onRecordingReady=async(blob,ext)=>{try{const id=await addTake({blob,ext,time:Date.now()});await renderTakeList();announce(`TAKE ${String(id).padStart(3,'0')} SAVED`);}catch(e){recordReady={blob,ext};$('#record').textContent='↓ DOWNLOAD UNSAVED TAKE';announce('Storage unavailable · download your take',true);}};
 $('#record').addEventListener('click',async()=>{if(recordReady){saveBlob(recordReady.blob,`ARTSS-TAKE-${Date.now()}.${recordReady.ext}`);recordReady=null;engine.onRecord('idle');return;}try{await engine.record()}catch(e){announce(e.message,true)}});
 $('#takeList').addEventListener('click',e=>{const b=e.target.closest('[data-take-action]');if(!b)return;actOnTake(b.dataset.takeAction,+b.dataset.takeId).catch(err=>announce(err.message,true));});
 $('#render').addEventListener('click',async()=>{if(rendering)return;rendering=true;const b=$('#render');b.disabled=true;b.textContent='RENDERING WAV…';try{const blob=await engine.offline(+$('#bars').value);saveBlob(blob,`ARTSS-LIVE-${PRESETS[state.bank].name}-${state.bpm}BPM.wav`);announce('WAV EXPORTED');}catch(e){announce(e.message,true)}finally{rendering=false;b.disabled=false;b.textContent='↗ EXPORT WAV';}});
 $('#save').addEventListener('click',()=>{saveNow();saveBlob(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`ARTSS-SESSION-${Date.now()}.json`);});
 $('#load').addEventListener('click',()=>$('#projectFile').click());$('#projectFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>350000)throw Error('Project file too large');const loaded=restore(JSON.parse(await file.text()));if(!loaded)throw Error('Invalid project file');engine.stop();state=loaded;engine.cache.clear();undoStack=[];stepPage=0;updateState();renderBpm();renderPresets();renderScenes();renderSequence();renderTrackMixer();renderFx();renderPads();renderSlices();updateProgressSize();renderTransport(false);announce('PROJECT LOADED');}catch(err){announce(err.message,true)}finally{e.target.value='';}});
 let installPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});$('#install').addEventListener('click',async()=>{if(installPrompt){try{installPrompt.prompt();await installPrompt.userChoice}catch{}installPrompt=null;return;}$('#installDialog').showModal();});$('#closeInstall').addEventListener('click',()=>$('#installDialog').close());if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)$('#install').hidden=true;
 document.addEventListener('keydown',e=>{if(e.repeat||e.altKey||e.metaKey||e.ctrlKey||['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;const idx=KEYS.indexOf(e.key.toUpperCase());if(idx>=0){e.preventDefault();triggerPad(idx)}else if(e.code==='Space'){e.preventDefault();$('#play').click()}else if(e.key.toLowerCase()==='l'){e.preventDefault();$('#liveRec').click();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){saveNow();if(engine.playing){engine.pause();renderTransport(false);}if(engine.recPhase==='recording')engine.record().catch(()=>{});}});
 window.addEventListener('pagehide',saveNow);
 updateProgressSize();restoreSlices().catch(()=>{});clockFrame=requestAnimationFrame(meterLoop);
}
function updateProgressSize(){const bars=$$('#progressBars i');bars.forEach((b,i)=>b.hidden=i>=state.steps);$('#progressBars').style.setProperty('--steps',state.steps);}

setup();if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));