import {defaultSession,importSession,PAD_NAMES,STYLES,SCENES,toggle,STEPS,sanitizeSession,type Session} from './model.js';
import {Engine} from './engine.js';
import { composeGroove } from './arranger.js';
import {knobDragValue} from './touch.js';
import {language,setLanguage,t,translateStatic,type Language} from './i18n.js';
const $=<T extends HTMLElement=HTMLElement>(q:string)=>document.querySelector<T>(q)!;
const getStorage=():Session=>{for(const key of ['artss-live-session-v19','artss-live-session-v18']){try{const v=localStorage.getItem(key);if(v)return importSession(v)}catch{}}return defaultSession()};
const state=getStorage();const engine=new Engine(()=>state);
const STYLE_LABELS=['АНДЕГРАУНД','ЖЁСТКОЕ ТЕХНО','ЭЙСИД','ТЁМНОЕ ТЕХНО','РЕЙВ','ФОНК','ИНДАСТРИАЛ','ГИПНОТИК','ПИК-ТАЙМ','БРЕЙКС','МИНИМАЛ','ЭЛЕКТРО'] as const;
const SCENE_LABELS=['ГРУВ','ВСТУПЛЕНИЕ','РАЗГОН','ДРОП','БРЕЙК'] as const;
const PAD_EN=['KICK','SUB','CLAP','HAT','OPEN HAT','PERC','ACID','HIT'] as const;
const padLabel=(i:number)=>t(PAD_NAMES[i]??'ПЭД',PAD_EN[i]??'PAD');
const styleLabel=(i:number)=>t(STYLE_LABELS[i]??'СТИЛЬ',STYLES[i]?.name??'STYLE');
const sceneLabel=(i:number)=>t(SCENE_LABELS[i]??'РИТМ',SCENES[i]??'GROOVE');
const localStatus=(value:string):string=>{
 if(language()==='en')return value;
 const map:Record<string,string>={'PLAY':'ИГРАЕТ','PAUSE':'ПАУЗА','STOP':'ОСТАНОВЛЕНО','AUDIO READY':'ЗВУК ГОТОВ','REC ON':'ЗАПИСЬ ПЭДОВ','REC OFF':'ЛУП СОХРАНЁН','TAKE SAVED':'ДУБЛЬ СОХРАНЁН','TAKE RECORDING':'ЗАПИСЬ АУДИО','STORAGE FULL':'ПАМЯТЬ ЗАПОЛНЕНА','ERROR':'ОШИБКА','TAP AGAIN TO SET BPM':'НАЖМИ ЕЩЁ РАЗ ДЛЯ ТЕМПА','TAP PLAY TO RESTORE AUDIO':'НАЖМИ ПУСК ДЛЯ ВОЗОБНОВЛЕНИЯ ЗВУКА'};
 const direct=map[value];if(direct!==undefined)return direct;
 for(const [en,ru] of [['SAMPLE SAVED','СЭМПЛ СОХРАНЁН'],['SAMPLE REC','ЗАПИСЬ СЭМПЛА'],['SAMPLE ERROR','ОШИБКА СЭМПЛА'],['ORIGINAL RESTORED','ОРИГИНАЛ ВОССТАНОВЛЕН'],['LOADING CUSTOM AUDIO','ЗАГРУЗКА ЗВУКА'],['REPLACED ','ЗАМЕНЁН '],['RESTORE AVAILABLE','МОЖНО ВОССТАНОВИТЬ'],['RANDOM IDEA READY','СЛУЧАЙНЫЙ РИТМ ГОТОВ'],['AUTO GROOVE READY','РИТМ СОЗДАН'],['GROOVE RESTORED','РИТМ ВОССТАНОВЛЕН'],['RENDERING WAV','СОЗДАНИЕ WAV'],['WAV EXPORTED','WAV СОХРАНЁН'],['PAD BANK ','БАНК ПЭДОВ '],['AUTO MIX ENABLED','АВТОМИКС ВКЛЮЧЁН'],['AUTO MIX OFF','АВТОМИКС ВЫКЛЮЧЕН'],['PAD ','ПЭД ']] as const)value=value.replace(en,ru);
 return value;
};
type Pane='main'|'sounds'|'library'|'takes'|'mix'|'profile';
let page=0,importSlot:number|undefined,pane:Pane='main',busy=false;
const KIT_KEY='artss-nexus-pattern-banks-v23',clonePattern=(v:number[][])=>v.map(row=>row.slice());
const loadKits=():{active:number;patterns:number[][][]}=>{
 try{const raw=JSON.parse(localStorage.getItem(KIT_KEY)??'null') as {active?:number;patterns?:unknown[]}|null;
  if(raw&&Array.isArray(raw.patterns)&&raw.patterns.length===4){
   const active=Math.max(0,Math.min(3,Number.isInteger(raw.active)?Number(raw.active):0));
   const patterns=raw.patterns.map(value=>sanitizeSession({pattern:value}).pattern);
   patterns[active]=clonePattern(state.pattern);return {active,patterns};
  }
 }catch{}
 return {active:0,patterns:[clonePattern(state.pattern),composeGroove(state.style,.7,1),composeGroove(state.style,.82,2),composeGroove(state.style,.6,3)]};
};
const kits=loadKits();
const refreshKitButtons=()=>{for(const btn of document.querySelectorAll<HTMLButtonElement>('[data-kit]')){const active=Number(btn.dataset.kit)===kits.active;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active))}};
const persistKits=()=>{kits.patterns[kits.active]=clonePattern(state.pattern);try{localStorage.setItem(KIT_KEY,JSON.stringify(kits))}catch{}};

const save=()=>{try{localStorage.setItem('artss-live-session-v19',JSON.stringify(state));persistKits()}catch{setStatus('STORAGE FULL')}};
let pendingSave:ReturnType<typeof setTimeout>|null=null;
const scheduleSave=()=>{if(pendingSave!==null)clearTimeout(pendingSave);pendingSave=setTimeout(()=>{pendingSave=null;save()},250)};
const flushSave=()=>{if(pendingSave!==null){clearTimeout(pendingSave);pendingSave=null;save()}};
let lastStatus='READY';
const setStatus=(v:string)=>{lastStatus=v;$('#status').textContent=localStatus(v);$('#status').classList.toggle('live',v.includes('REC')||v==='PLAY')};
const h=(name:string,text:string,cls='')=>{const el=document.createElement(name);el.className=cls;el.textContent=text;return el;};
function paintPads(){const wrap=$('#pads');wrap.replaceChildren();for(let i=0;i<8;i++){const name=padLabel(i);
 const p=h('button','','pad') as HTMLButtonElement;p.type='button';p.style.setProperty('--tone',['#fd3f59','#7df7e4','#f7faff','#79f6e1','#effbff','#aabacc','#f46b91','#6adfd5'][i]??'#f7faff');p.setAttribute('aria-label',`Играть ${name}`);p.dataset.pad=String(i);
 const top=h('span',`${String(i+1).padStart(2,'0')}`,'pad-number'),short=h('span',name,'pad-name');
 const dot=h('span',engine.bank.customInfo(i,state.style)?t('СВОЙ','OWN'):'','pad-own');
 const glyphPaths=[
  '<circle cx="12" cy="12" r="7"/><path d="M7 6 4 3M17 6l3-3M6 19l-2 2m14-2 2 2"/>',
  '<path d="M2 13h3l2-6 4 11 4-13 3 8h4"/>',
  '<path d="M6 8c-2-2-3-1-3 1v5c0 4 4 7 9 7 5 0 9-3 9-7v-4c0-2-2-3-3-1V6c0-2-3-2-3 0V4c0-2-3-2-3 0v2c0-2-3-2-3 0v2"/>',
  '<path d="M3 10c5-5 13-5 18 0-4 3-14 3-18 0ZM12 10v10m-4 0h8M12 3v3"/>',
  '<path d="M3 10c5-4 13-4 18 0m-18 4c5 4 13 4 18 0m-9 0v7m-5 0h10"/>',
  '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v11c0 4 14 4 14 0V7M9 10v9m6-9v9"/>',
  '<path d="M3 17 7 7l4 10 4-10 4 10M4 20h16"/>',
  '<path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4"/><circle cx="12" cy="12" r="3"/>'
 ] as const;
 const glyph=h('span','','pad-glyph');glyph.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+glyphPaths[i]+'</svg>';
 const bar=h('span','','pad-bar');p.append(top,glyph,short,dot,bar);
 if(i===state.selected)p.classList.add('selected');if(state.muted[i])p.classList.add('muted');
 const pointers=new Set<number>();let releaseTimer:number|undefined;let pressedAt=0;
 const release=(pointerId:number)=>{pointers.delete(pointerId);if(pointers.size)return;
  if(releaseTimer!==undefined)clearTimeout(releaseTimer);
  releaseTimer=window.setTimeout(()=>{if(!pointers.size)p.classList.remove('pressed');releaseTimer=undefined},Math.max(0,75-(performance.now()-pressedAt)));
 };
 p.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;if(pointers.has(e.pointerId))return;
  e.preventDefault();pointers.add(e.pointerId);pressedAt=performance.now();
  if(releaseTimer!==undefined){clearTimeout(releaseTimer);releaseTimer=undefined;}
  p.classList.add('pressed');
  // Begin sound before touching layout or storage; hold state ends on pointerup/cancel.
  const playing=engine.hit(i,Math.min(1,.65+(e.pressure>0?e.pressure*.32:.3)));
  if(state.selected!==i)selectPad(i);
  try{p.setPointerCapture(e.pointerId)}catch{}
  void playing.catch(err=>setStatus(err instanceof Error?err.message:'AUDIO ERROR'));
 },{passive:false});
 for(const eventName of ['pointerup','pointercancel','lostpointercapture'] as const)p.addEventListener(eventName,e=>release(e.pointerId));
 // Long press must never open the device sample picker or switch away from performance.
 p.addEventListener('contextmenu',e=>e.preventDefault());
 wrap.append(p);
 }
 $('#selectedPad').textContent=padLabel(state.selected);updateSampleTarget();
}
function updateSampleTarget(){
 $('#sampleRecordHint').textContent=`${t('ПЭД','PAD')} ${String(state.selected+1).padStart(2,'0')} · ${styleLabel(state.style)}`;
 const pad=Number($<HTMLSelectElement>('#replaceTarget').value);const custom=engine.bank.customInfo(pad,state.style);
 $('#soundInfo').textContent=custom?`${t('СВОЙ','CUSTOM')} · ${custom}`:`${t('ОРИГИНАЛ','ORIGINAL')} · ${padLabel(pad)}`;
 $<HTMLButtonElement>('#restoreSound').disabled=!custom;
}
/** O(8) class sync. Never rebuild pad/step nodes while a finger is triggering audio. */
function syncSelectedSteps(){
 for(const btn of document.querySelectorAll<HTMLButtonElement>('#steps .step')){
  const step=Number(btn.dataset.step);
  btn.classList.toggle('on',(state.pattern[state.selected]?.[step]??0)>0);
 }
 for(const btn of document.querySelectorAll<HTMLButtonElement>('.pattern-lane-name'))btn.classList.toggle('active',Number(btn.dataset.pad)===state.selected);
}
function selectPad(pad:number){
 if(!Number.isInteger(pad)||pad<0||pad>=8||state.selected===pad)return;
 state.selected=pad;$<HTMLSelectElement>('#replaceTarget').value=String(pad);
 for(const btn of document.querySelectorAll<HTMLButtonElement>('#pads .pad'))btn.classList.toggle('selected',Number(btn.dataset.pad)===pad);
 $('#selectedPad').textContent=padLabel(pad);updateSampleTarget();syncSelectedSteps();scheduleSave();
}
function syncPatternCells(pad:number,step:number){
 const on=(state.pattern[pad]?.[step]??0)>0;
 for(const cell of document.querySelectorAll<HTMLButtonElement>('.pattern-cell'))if(Number(cell.dataset.pad)===pad&&Number(cell.dataset.step)===step)cell.classList.toggle('on',on);
 if(pad===state.selected)for(const btn of document.querySelectorAll<HTMLButtonElement>('#steps .step'))if(Number(btn.dataset.step)===step)btn.classList.toggle('on',on);
}
const overviewPads=[0,2,3,5] as const;
function paintPatternOverview(){
 const host=$('#patternOverview');const fragment=document.createDocumentFragment();
 const timeline=h('div','','timeline-row');timeline.append(h('span','', 'timeline-spacer'));
 const numbers=h('div','','timeline-numbers');for(let i=1;i<=STEPS;i++)numbers.append(h('span',String(i)));
 timeline.append(numbers);fragment.append(timeline);
 for(const pad of overviewPads){
  const lane=h('div','','pattern-lane');
  const name=h('button',padLabel(pad),'pattern-lane-name') as HTMLButtonElement;name.dataset.pad=String(pad);
  name.type='button';name.setAttribute('aria-label',`${t('Редактировать','Edit')} ${padLabel(pad)}`);
  name.classList.toggle('active',state.selected===pad);
  name.addEventListener('click',()=>selectPad(pad));
  const blocks=h('div','','pattern-lane-steps');
  for(let step=0;step<STEPS;step++){
   const cell=h('button','','pattern-cell') as HTMLButtonElement;
   cell.type='button';cell.dataset.pad=String(pad);cell.dataset.step=String(step);
   cell.setAttribute('aria-label',`${padLabel(pad)} ${t('шаг','step')} ${step+1}`);
   if((state.pattern[pad]?.[step]??0)>0)cell.classList.add('on');
   cell.style.setProperty('--accent',pad===0?'#ff2934':pad===2?'#ffdf00':pad===3?'#f8faff':'#929aa8');
   cell.addEventListener('click',()=>{toggle(state.pattern,pad,step);selectPad(pad);syncPatternCells(pad,step);scheduleSave()});
   blocks.append(cell);
  }
  lane.append(name,blocks);fragment.append(lane);
 }
 host.replaceChildren(fragment);
}
function paintSteps(refreshOverview=true){
 if(refreshOverview)paintPatternOverview();else syncSelectedSteps();
 const wrap=$('#steps');wrap.replaceChildren();for(let col=0;col<8;col++){
 const step=col+page*8,velocity=state.pattern[state.selected]?.[step]??0;
 const btn=h('button',String(step+1).padStart(2,'0'),'step') as HTMLButtonElement;btn.type='button';btn.dataset.step=String(step);
 if(velocity>0)btn.classList.add('on');btn.addEventListener('click',()=>{toggle(state.pattern,state.selected,step);syncPatternCells(state.selected,step);scheduleSave()});wrap.append(btn);
 }
 $('#pageA').classList.toggle('active',page===0);$('#pageB').classList.toggle('active',page===1);
 $('#stepLabel').textContent=`${page===0?'01–08':'09–16'} / 16`;
}
const fanIds:{[K in Exclude<Pane,'main'>]:string}={sounds:'soundsFan',mix:'mixFan',takes:'takesFan',library:'libraryFan',profile:'profileFan'};
function setPane(next:Pane){
 pane=next;
 for(const [key,id] of Object.entries(fanIds))$<HTMLDetailsElement>('#'+id).open=key===next;
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-pane]')){
  const active=b.dataset.pane===next;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');
 }
 if(next==='mix')paintMix();if(next==='takes')paintTakes();if(next==='library')paintLibrary();if(next==='sounds')updateSampleTarget();
 if(next==='profile')$('#deviceStatus').textContent=t(`Сессия хранится на устройстве · ${engine.takes.length} дублей · ${STYLES.length} стилей`,`Session on device · ${engine.takes.length} takes · ${STYLES.length} styles`);
 if(next!=='main')$<HTMLDetailsElement>('#'+fanIds[next]).scrollIntoView({block:'nearest',behavior:'auto'});
}
function paintMix(){const wrap=$('#mixRows');wrap.replaceChildren();PAD_NAMES.forEach((name,i)=>{
 const row=h('div','','mixrow');const label=h('span',padLabel(i),'mix-name');const range=document.createElement('input');range.type='range';range.min='0';range.max='120';range.step='1';range.value=String(Math.round((state.levels[i]??1)*100));
 range.setAttribute('aria-label',`${t('Громкость','Volume')} ${padLabel(i)}`);range.addEventListener('input',()=>{state.levels[i]=Number(range.value)/100;scheduleSave()});
 const mute=h('button',state.muted[i]?'ON':'OFF',state.muted[i]?'mute active':'mute') as HTMLButtonElement;mute.setAttribute('aria-label',`${t('Заглушить','Mute')} ${padLabel(i)}`);mute.addEventListener('click',()=>{state.muted[i]=!state.muted[i];save();paintMix();paintPads()});row.append(label,range,mute);wrap.append(row);
 });}
let takeUrls:string[]=[];
function paintTakes(){for(const url of takeUrls)URL.revokeObjectURL(url);takeUrls=[];const el=$('#takesList');el.replaceChildren();for(let i=0;i<engine.takes.length;i++){
 const blob=engine.takes[i]!;const a=h('a',`${t('ДУБЛЬ','TAKE')} ${String(i+1).padStart(2,'0')}  ·  ${Math.round(blob.size/1024)} KB`,'take') as HTMLAnchorElement;
 a.href=URL.createObjectURL(blob);takeUrls.push(a.href);a.download=`artss-live-take-${i+1}.${blob.type.includes('mp4')?'m4a':'webm'}`;el.append(a);
 }if(!engine.takes.length)el.append(h('p',t('Запиши первый дубль.','Record your first take.'),'dim'));
}
async function safe(task:()=>Promise<void>){if(busy)return;busy=true;try{await task()}catch(e){setStatus(e instanceof Error?e.message:'ERROR')}finally{busy=false;}}
const paintLibrary=()=>{const host=$('#libraryStyles');const frag=document.createDocumentFragment();
 STYLES.forEach((style,i)=>{const btn=h('button',styleLabel(i),'library-style') as HTMLButtonElement;btn.classList.toggle('on',i===state.style);btn.addEventListener('click',()=>{($<HTMLSelectElement>('#bank')).value=String(i);$('#bank').dispatchEvent(new Event('change'));setPane('main')});frag.append(btn)});
 host.replaceChildren(frag);
};
const init=()=>{
engine.updateMix();refreshKitButtons();
 $('#filter').addEventListener('input',()=>{state.filter=Number(($<HTMLInputElement>('#filter')).value)/100;$('#filterValue').textContent=state.filter>.97?t('ОТКРЫТ','OPEN'):`${Math.round(state.filter*100)}%`;engine.updateMix();scheduleSave()});
 ($('#filter') as HTMLInputElement).value=String(Math.round(state.filter*100));$('#filterValue').textContent=state.filter>.97?t('ОТКРЫТ','OPEN'):`${Math.round(state.filter*100)}%`;
 $('#echo').addEventListener('input',()=>{state.echo=Number(($<HTMLInputElement>('#echo')).value)/100;$('#echoValue').textContent=`${Math.round(state.echo*100)}%`;engine.updateMix();scheduleSave()});
 ($('#echo') as HTMLInputElement).value=String(Math.round(state.echo*100));$('#echoValue').textContent=`${Math.round(state.echo*100)}%`;
 const canvas=$<HTMLCanvasElement>('#waveform'),pen=canvas.getContext('2d',{alpha:false});
 const signalData=new Uint8Array(256),width=canvas.width,height=canvas.height;
 const drawSignal=()=>{
  if(!pen)return;
  pen.fillStyle='#010103';pen.fillRect(0,0,width,height);
  pen.strokeStyle='#28292e';pen.lineWidth=1;pen.beginPath();
  for(let x=0;x<width;x+=48){pen.moveTo(x,0);pen.lineTo(x,height);}
  pen.stroke();pen.strokeStyle='#454750';pen.beginPath();pen.moveTo(0,height/2);pen.lineTo(width,height/2);pen.stroke();
  const hasAudio=engine.readWaveform(signalData);
  // Batch strokes; avoid per-bar shadowBlur, which stalls WebKit during audio capture.
  pen.lineWidth=3;pen.strokeStyle='#ffe400';pen.beginPath();
  for(let i=0;i<104;i+=4){
   const x=i*width/256;const y=hasAudio?((signalData[i]??128)-128)/128:0;
   const amp=hasAudio?Math.max(2,Math.abs(y)*(height*.37)):2;
   pen.moveTo(x,height/2-amp);pen.lineTo(x,height/2+amp);
  }
  pen.stroke();pen.strokeStyle='#f8faff';pen.beginPath();
  for(let i=104;i<256;i+=4){
   const x=i*width/256;const y=hasAudio?((signalData[i]??128)-128)/128:0;
   const amp=hasAudio?Math.max(2,Math.abs(y)*(height*.37)):2;
   pen.moveTo(x,height/2-amp);pen.lineTo(x,height/2+amp);
  }
  pen.stroke();pen.strokeStyle='#ff2736';pen.lineWidth=2.5;pen.beginPath();pen.moveTo(width*.52,2);pen.lineTo(width*.52,height-2);pen.stroke();
 };
 let visualAt=0,meterAt=0,meterPercent=-1;
  const vu=(now:number)=>{requestAnimationFrame(vu);
   if(document.visibilityState!=='visible'||pane!=='main')return;
   if(now-meterAt>=55){meterAt=now;const value=Math.round(Math.min(100,engine.meterLevel*100));
    if(value!==meterPercent){meterPercent=value;$('#outputMeter').style.width=value+'%';}
    $('#pulseDot').classList.toggle('on',engine.state==='PLAY');
   }
   if(now-visualAt>=42){visualAt=now;drawSignal();}
  };drawSignal();requestAnimationFrame(vu);
 $('#bank').replaceChildren(...STYLES.map((s,i)=>{const o=h('option',styleLabel(i)) as HTMLOptionElement;o.value=String(i);return o}));
 ($('#bank') as HTMLSelectElement).value=String(state.style);
 $('#scene').replaceChildren(...SCENES.map((s,i)=>{const o=h('option',sceneLabel(i)) as HTMLOptionElement;o.value=String(i);return o}));
 ($('#scene') as HTMLSelectElement).value=String(state.scene);$('#bpm').textContent=String(state.tempo);
 const showTrack=()=>{$('#trackName').textContent=`${styleLabel(state.style)} · ${sceneLabel(state.scene)}`;($('#bpmRange') as HTMLInputElement).value=String(state.tempo);$('#bpm').textContent=String(state.tempo);
  for(const [id,index] of [['styleLights',state.style],['sceneLights',state.scene]] as const){const nodes=document.querySelectorAll('#'+id+' i');nodes.forEach((el,i)=>el.classList.toggle('active',i===index%nodes.length));}};
 const changeTempo=(tempo:number)=>{state.tempo=Math.max(80,Math.min(175,Math.round(tempo)));showTrack();engine.updateMix();scheduleSave()};
 const changeStyle=(offset:number)=>{const el=$<HTMLSelectElement>('#bank');el.value=String((state.style+offset+STYLES.length)%STYLES.length);el.dispatchEvent(new Event('change'))};
 const changeScene=(offset:number)=>{const el=$<HTMLSelectElement>('#scene');el.value=String((state.scene+offset+SCENES.length)%SCENES.length);el.dispatchEvent(new Event('change'))};
 $('#stylePrev').addEventListener('click',()=>changeStyle(-1));$('#styleNext').addEventListener('click',()=>changeStyle(1));
 $('#scenePrev').addEventListener('click',()=>changeScene(-1));$('#sceneNext').addEventListener('click',()=>changeScene(1));
 $('#bank').addEventListener('change',()=>{state.style=Number(($<HTMLSelectElement>('#bank')).value);state.tempo=STYLES[state.style]?.bpm??136;showTrack();engine.updateMix();save();paintPads();paintSteps();updateSampleTarget()});
 showTrack();
 let generation=0,previousPattern:number[][]|null=null;
 const generateGroove=(random=false)=>{previousPattern=clonePattern(state.pattern);generation++;const energy=Number(($<HTMLInputElement>('#density')).value)/100;const variation=random?Math.floor(Math.random()*10000)+1:generation;state.pattern=composeGroove(state.style,random ? 0.35+Math.random()*.65 : energy,variation);save();paintSteps();$('#undoGroove').hidden=false;setStatus(random?'RANDOM IDEA READY':'AUTO GROOVE READY')};
 $('#autoGroove').addEventListener('click',()=>generateGroove());
 $('#randomGroove').addEventListener('click',()=>generateGroove(true));
 $('#editGroove').addEventListener('click',()=>{setPane('main');$('#advancedEditor').setAttribute('open','');$('#advancedEditor').scrollIntoView({block:'center',behavior:'smooth'})});
 $('#seqEdit').addEventListener('click',()=>{const advanced=$<HTMLDetailsElement>('#advancedEditor');advanced.open=!advanced.open;if(advanced.open)advanced.scrollIntoView({block:'nearest',behavior:'smooth'})});
 for(const btn of document.querySelectorAll<HTMLButtonElement>('[data-kit]'))btn.addEventListener('click',()=>{
  const to=Number(btn.dataset.kit);if(to===kits.active||!Number.isInteger(to)||to<0||to>3)return;
  kits.patterns[kits.active]=clonePattern(state.pattern);kits.active=to;state.pattern=clonePattern(kits.patterns[to]??state.pattern);save();refreshKitButtons();paintSteps();setStatus(`PAD BANK ${'ABCD'[to]}`);
 });
 $('#undoGroove').addEventListener('click',()=>{if(!previousPattern)return;state.pattern=previousPattern;previousPattern=null;save();paintSteps();$('#undoGroove').hidden=true;setStatus('GROOVE RESTORED')});
 $('#scene').addEventListener('change',()=>{state.scene=Number(($<HTMLSelectElement>('#scene')).value);showTrack();save()});
 $('#tempoDown').addEventListener('click',()=>changeTempo(state.tempo-1));
 $('#tempoUp').addEventListener('click',()=>changeTempo(state.tempo+1));
 $('#bpmRange').addEventListener('input',()=>changeTempo(Number(($<HTMLInputElement>('#bpmRange')).value)));
 let lastTap=0;const recentTaps:number[]=[];
 $('#tapTempo').addEventListener('click',()=>{const now=performance.now(),elapsed=now-lastTap;lastTap=now;if(elapsed>2000){recentTaps.length=0;setStatus('TAP AGAIN TO SET BPM');return;}if(elapsed<300||elapsed>1000)return;recentTaps.push(elapsed);if(recentTaps.length>4)recentTaps.shift();const sorted=[...recentTaps].sort((a,b)=>a-b);const median=sorted[Math.floor(sorted.length/2)]??elapsed;changeTempo(60000/median);setStatus(`BPM ${state.tempo}`)});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();else if(engine.state==='PLAY'&&engine.ctx?.state==='suspended')setStatus('TAP PLAY TO RESTORE AUDIO')});
 window.addEventListener('pagehide',()=>{flushSave();for(const url of takeUrls)URL.revokeObjectURL(url);takeUrls=[]});
 $('#play').addEventListener('click',()=>void safe(async()=>{if(engine.state==='PLAY'&&engine.ctx?.state==='suspended')await engine.unlock();else if(engine.state==='PLAY')engine.pause();else await engine.start();updateTransport()}));
 $('#record').addEventListener('click',()=>void safe(async()=>{await engine.toggleRecord();updateTransport()}));
 $('#stop').addEventListener('click',()=>{engine.stop();updateTransport()});
 const cross=$<HTMLInputElement>('#crossfade');cross.value=String(Math.round(state.crossfader*100));cross.addEventListener('input',()=>{state.crossfader=Number(cross.value)/100;engine.updateMix();scheduleSave()});
 for(const field of ['eqLow','eqMid','eqHigh'] as const){
  const input=$<HTMLInputElement>('#'+field);input.value=String(state[field]);
  const renderKnob=()=>{input.parentElement?.style.setProperty('--knob-angle',`${-135+(Number(input.value)+12)*270/24}deg`);
   input.setAttribute('aria-valuetext',`${input.value} dB`);};
  renderKnob();input.addEventListener('input',()=>{state[field]=Number(input.value);renderKnob();engine.updateMix();scheduleSave()});
  // Real rotary-control gesture: up boosts, down cuts; touch never scrolls or mis-sets on first contact.
  let activePointer:number|null=null,atY=0,atValue=0;
  input.addEventListener('pointerdown',event=>{
   if(event.pointerType==='mouse'&&event.button!==0)return;
   if(activePointer!==null)return;event.preventDefault();
   activePointer=event.pointerId;atY=event.clientY;atValue=Number(input.value);
   input.parentElement?.classList.add('adjusting');try{input.setPointerCapture(event.pointerId)}catch{}
  },{passive:false});
  input.addEventListener('pointermove',event=>{
   if(activePointer!==event.pointerId)return;event.preventDefault();
   const next=knobDragValue(atValue,event.clientY-atY);
   if(next!==Number(input.value)){input.value=String(next);input.dispatchEvent(new Event('input',{bubbles:true}));}
  },{passive:false});
  const finish=(event:PointerEvent)=>{if(activePointer!==event.pointerId)return;
   activePointer=null;input.parentElement?.classList.remove('adjusting');
  };
  input.addEventListener('pointerup',finish);input.addEventListener('pointercancel',finish);
  input.addEventListener('lostpointercapture',finish);
 }
 const drawer=$('#drawer');$('#menuToggle').addEventListener('click',()=>{drawer.hidden=!drawer.hidden;$('#menuToggle').setAttribute('aria-expanded',String(!drawer.hidden))});
 const closeDrawer=()=>{drawer.hidden=true;$('#menuToggle').setAttribute('aria-expanded','false')};
 $('#quickUpload').addEventListener('click',()=>setPane('sounds'));
 $('#quickSettings').addEventListener('click',()=>setPane('profile'));
 $('#drawerImport').addEventListener('click',()=>{closeDrawer();setPane('sounds')});
 $('#drawerRecord').addEventListener('click',()=>{closeDrawer();setPane('takes')});
 $('#drawerSample').addEventListener('click',()=>{closeDrawer();setPane('main');const panel=$<HTMLDetailsElement>('.sample-recorder');panel.open=true;panel.scrollIntoView({block:'nearest',behavior:'smooth'});});
 $('#drawerSettings').addEventListener('click',()=>{closeDrawer();setPane('profile')});
 $('#drawerFX').addEventListener('click',()=>{closeDrawer();setPane('mix')});
 $('#drawerPresets').addEventListener('click',()=>{closeDrawer();setPane('library')});
 $('#libraryImport').addEventListener('click',()=>setPane('sounds'));
 $('#goToRecording').addEventListener('click',()=>setPane('takes'));
 $('#pageA').addEventListener('click',()=>{page=0;paintSteps()});$('#pageB').addEventListener('click',()=>{page=1;paintSteps()});
 const renderCapture=()=>{const active=engine.sampling;
  const start=$<HTMLButtonElement>('#sampleStart'),stop=$<HTMLButtonElement>('#sampleStop');
  start.disabled=active;stop.disabled=!active;start.classList.toggle('on',active);
  ($('#sampleSource') as HTMLSelectElement).disabled=active;
  start.textContent=active?t('● ЗАПИСЬ','● RECORDING'):t('● НАЧАТЬ','● START');
 };
 $('#sampleStart').addEventListener('click',()=>void safe(async()=>{
  const source='live' as const;
  await engine.beginSampleCapture(source,state.selected);renderCapture();setStatus(`SAMPLE REC · PAD ${state.selected+1}`);
 }));
 $('#sampleStop').addEventListener('click',()=>void safe(async()=>{
  try{const result=await engine.endSampleCapture();save();paintSteps();setStatus(`SAMPLE SAVED · PAD ${result.pad+1}`);paintPads();}
  finally{renderCapture();}
 }));
 $('#addSound').addEventListener('click',()=>setPane('sounds'));
 $('#replaceTarget').addEventListener('change',updateSampleTarget);
 $('#replaceSound').addEventListener('click',()=>{importSlot=Number($<HTMLSelectElement>('#replaceTarget').value);$('#sampleInput').click()});
 $('#restoreSound').addEventListener('click',()=>void safe(async()=>{
  const pad=Number($<HTMLSelectElement>('#replaceTarget').value);await engine.restoreFactorySound(pad);
  paintPads();updateSampleTarget();setStatus('ORIGINAL RESTORED · '+PAD_NAMES[pad]);
 }));
 $('#sampleInput').addEventListener('change',()=>void safe(async()=>{
  const input=$<HTMLInputElement>('#sampleInput');const pad=importSlot;
  try{
   if(!input.files?.length||pad===undefined)return;
   setStatus('LOADING CUSTOM AUDIO');const added=await engine.addSamples(input.files,pad);
   setStatus(`REPLACED ${PAD_NAMES[added[0]!.pad]} · RESTORE AVAILABLE`);
   paintPads();updateSampleTarget();
  }finally{input.value='';importSlot=undefined;}
 }));
 $('#take').addEventListener('click',()=>void safe(async()=>{if(($('#take') as HTMLButtonElement).classList.contains('on')){engine.endTake();$('#take').classList.remove('on');$('#take').textContent=t('● ЗАПИСАТЬ АУДИО','● RECORD AUDIO');window.setTimeout(paintTakes,400)}else{await engine.beginTake();$('#take').classList.add('on');$('#take').textContent=t('■ ЗАВЕРШИТЬ ДУБЛЬ','■ FINISH TAKE')}}));
 $('#export').addEventListener('click',()=>void safe(async()=>{setStatus('RENDERING WAV');const blob=await engine.exportWav();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ARTSS-NEXUS-LIVE.wav';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);setStatus('WAV EXPORTED')}));
 $('#reset').addEventListener('click',()=>{if(!confirm('Очистить записанные шаги?'))return;state.pattern=Array.from({length:8},()=>Array(16).fill(0));save();paintSteps()});
 for(const el of document.querySelectorAll('[data-pane]'))el.addEventListener('click',()=>{closeDrawer();setPane((el as HTMLElement).dataset.pane as Pane)});
 let pendingStep:number|null=null,lastStep:number|null=null,stepFrame=0;
 engine.events.onStep=step=>{
  if(document.visibilityState!=='visible'||pane!=='main')return;
  pendingStep=step;if(stepFrame)return;
  stepFrame=requestAnimationFrame(()=>{stepFrame=0;const current=engine.currentStep;pendingStep=null;if(current===null||current===lastStep)return;
   if(lastStep!==null)for(const el of document.querySelectorAll<HTMLElement>(`[data-step="${lastStep}"].playhead`))el.classList.remove('playhead');
   for(const el of document.querySelectorAll<HTMLElement>(`#steps .step[data-step="${current}"],#patternOverview .pattern-cell[data-step="${current}"]`))el.classList.add('playhead');
   lastStep=current;
   const total=60/state.tempo/4*16,elapsed=current*60/state.tempo/4;
   $('#transportTime').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')} / ${String(Math.floor(total/60)).padStart(2,'0')}:${String(Math.ceil(total%60)).padStart(2,'0')}`;
  });
 };
 engine.events.onClip=(pad)=>{scheduleSave();for(let step=0;step<STEPS;step++)syncPatternCells(pad,step)};engine.events.onSamples=paintPads;engine.events.onState=v=>{setStatus(v);if(v.startsWith('SAMPLE SAVED')||v.startsWith('SAMPLE ERROR')){renderCapture();paintPads();}};
 paintPads();paintSteps();setPane('main');updateTransport();renderCapture();
 if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
};
function updateTransport(){const play=$('#play');play.querySelector('.deck-label')!.textContent=engine.state==='PLAY'?t('ПАУЗА','PAUSE'):t('ПУСК','PLAY');play.querySelector('.deck-play-icon')!.textContent=engine.state==='PLAY'?'Ⅱ':'▶';play.classList.toggle('on',engine.state==='PLAY');$('#record').classList.toggle('on',engine.recording);$('#record').querySelector('.deck-label')!.textContent=engine.recording?t('СТОП ЗАПИСИ','STOP REC'):t('ЗАПИСЬ','REC');$('#runState').textContent=localStatus(engine.state);if(engine.state==='STOP')$('#transportTime').textContent='00:00 / ЦИКЛ';}
init();