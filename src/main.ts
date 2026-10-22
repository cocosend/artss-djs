import {defaultSession,importSession,PAD_NAMES,STYLES,toggle,STEPS,sanitizeSession,type Session} from './model.js';
import {Engine} from './engine.js';
import {AutoMixPlayer} from './automix-player.js';
import { composeGroove } from './arranger.js';
import {mountPresetVault} from './preset-vault.js';
import {knobDragValue} from './touch.js';
const $=<T extends HTMLElement=HTMLElement>(q:string)=>document.querySelector<T>(q)!;
const getStorage=():Session=>{for(const key of ['artss-live-session-v19','artss-live-session-v18']){try{const v=localStorage.getItem(key);if(v)return importSession(v)}catch{}}return defaultSession()};
const state=getStorage();const engine=new Engine(()=>state);
const autoMix=new AutoMixPlayer(engine,(status,message)=>{
 const line=document.querySelector<HTMLElement>('#mixStatus');if(line)line.textContent=message;
 const start=document.querySelector<HTMLButtonElement>('#startAutoMix'),stop=document.querySelector<HTMLButtonElement>('#stopAutoMix');
 if(start)start.disabled=status==='loading'||status==='playing'||status==='idle'||status==='error';
 if(stop)stop.disabled=status!=='playing';
 const cue=document.querySelector<HTMLInputElement>('#trackCue');if(cue)cue.disabled=status==='playing'||status==='loading';
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-cue]'))button.disabled=status==='playing'||status==='loading';
 const fill=document.querySelector<HTMLElement>('#mixProgressFill');if(fill)fill.style.width=status==='playing'?autoMix.position.percent+'%':'0%';
});
const SOUND_LABELS={acid:['SUB 303','SLIDE','RESONANCE','PULSE','SQUELCH','STAB','DRIVE','OCTAVE'],piano:['C','D','E♭','F','G','A♭','B♭','C⁵'],fx:['METAL HIT','MINOR STAB','RISER','SUB DROP','CLAP HIT','DARK CHORD','FALL','IMPACT']} as const;
type SoundPage=keyof typeof SOUND_LABELS;
let soundPage:SoundPage='acid';
const STYLE_LABELS=['АНДЕГРАУНД','ЖЁСТКОЕ ТЕХНО','ЭЙСИД','ТЁМНОЕ ТЕХНО','РЕЙВ','ФОНК','ИНДАСТРИАЛ','ГИПНОТИК','ПИК-ТАЙМ','БРЕЙКС','МИНИМАЛ','ЭЛЕКТРО'] as const;
const styleLabel=(i:number)=>STYLE_LABELS[i]??'ПАТТЕРН';
const localStatus=(value:string):string=>{
 const map:Record<string,string>={'PLAY':'ИГРАЕТ','PAUSE':'ПАУЗА','STOP':'ОСТАНОВЛЕНО','AUDIO READY':'ЗВУК ГОТОВ','REC ON':'ЗАПИСЬ ПЭДОВ','REC OFF':'ЛУП СОХРАНЁН','TAKE SAVED':'ДУБЛЬ СОХРАНЁН','TAKE RECORDING':'ЗАПИСЬ АУДИО','STORAGE FULL':'ПАМЯТЬ ЗАПОЛНЕНА','ERROR':'ОШИБКА','TAP AGAIN TO SET BPM':'НАЖМИ ЕЩЁ РАЗ ДЛЯ ТЕМПА','TAP PLAY TO RESTORE AUDIO':'НАЖМИ ПУСК ДЛЯ ВОЗОБНОВЛЕНИЯ ЗВУКА'};
 const direct=map[value];if(direct!==undefined)return direct;
 for(const [en,ru] of [['SAMPLE SAVED','СЭМПЛ СОХРАНЁН'],['SAMPLE REC','ЗАПИСЬ СЭМПЛА'],['SAMPLE ERROR','ОШИБКА СЭМПЛА'],['ORIGINAL RESTORED','ОРИГИНАЛ ВОССТАНОВЛЕН'],['LOADING CUSTOM AUDIO','ЗАГРУЗКА ЗВУКА'],['REPLACED ','ЗАМЕНЁН '],['RESTORE AVAILABLE','МОЖНО ВОССТАНОВИТЬ'],['PATTERN LOADED','ПАТТЕРН ЗАГРУЖЕН'],['PATTERN CLEARED','ПАТТЕРН ОЧИЩЕН'],['PATTERN RESTORED','ПАТТЕРН ВОССТАНОВЛЕН'],['RENDERING WAV','СОЗДАНИЕ WAV'],['WAV EXPORTED','WAV СОХРАНЁН'],['PAD BANK ','БАНК ПЭДОВ '],['PAD ','ПЭД ']] as const)value=value.replace(en,ru);
 return value;
};
const languageKey='artss-nexus-language';
type Language='ru'|'en';
let language:Language=(()=>{try{return localStorage.getItem(languageKey)==='en'?'en':'ru'}catch{return 'ru'}})();
const englishLabels:Record<string,string>={
 'ПУСК':'PLAY','ПАУЗА':'PAUSE','СТОП':'STOP','ЗАПИСЬ':'REC','СТОП ЗАПИСИ':'STOP REC','ГОТОВО':'READY','ИГРАЕТ':'PLAYING','ОСТАНОВЛЕНО':'STOPPED','ЗАПИСЬ ПЭДОВ':'PAD RECORDING','ЛУП СОХРАНЁН':'LOOP SAVED','ДРАМ-ПЭДЫ':'DRUM PADS','ШАГОВЫЙ СЕКВЕНСОР':'STEP SEQUENCER','ЗВУКИ':'SOUNDS','ПРЕСЕТЫ':'PRESETS','ПРОЕКТ':'PROJECT','МИКС':'MIX','ЗАДАТЬ ТЕМП':'TAP TEMPO','ПАТТЕРН':'PATTERN','ПАТТЕРНЫ':'PATTERNS','ЗАПИСИ':'RECORDINGS','НИЗ':'LOW','СЕР':'MID','ВЕРХ':'HIGH','СИГНАЛ':'SIGNAL','ПЭДЫ':'PADS','ЗВУКИ ПЭДОВ':'PAD SOUNDS','НАСТРОЙКИ':'SETTINGS','МИКШЕР И FX':'MIX & FX','ЗАПИСАТЬ СЭМПЛ':'RECORD SAMPLE','ОТКРЫТЬ ЗАПИСЬ':'OPEN RECORDER','ЗАПИСАТЬ АУДИО':'RECORD AUDIO','НАЧАТЬ':'START','ЗАВЕРШИТЬ ДУБЛЬ':'FINISH TAKE','ЭКСПОРТ WAV':'EXPORT WAV','ДОБАВИТЬ СЭМПЛ':'ADD SAMPLE','ИСТОЧНИК':'SOURCE','ЗВУК ПЭДОВ':'PAD MIX','СВОЙ':'CUSTOM','ОРИГИНАЛ':'ORIGINAL','БОЧКА':'KICK','САБ':'SUB','ХЛОПОК':'CLAP','ХЭТ':'HAT','ОТКР. ХЭТ':'OPEN HAT','ПЕРК':'PERC','ЭЙСИД':'ACID','УДАР':'HIT','АНДЕГРАУНД':'UNDERGROUND','ЖЁСТКОЕ ТЕХНО':'HARD TECHNO','ТЁМНОЕ ТЕХНО':'DARK TECHNO','РЕЙВ':'RAVE','ФОНК':'PHONK','ИНДАСТРИАЛ':'INDUSTRIAL','ГИПНОТИК':'HYPNOTIC','ПИК-ТАЙМ':'PEAK TIME','БРЕЙКС':'BREAKS','МИНИМАЛ':'MINIMAL','ЭЛЕКТРО':'ELECTRO','ТЕМП':'TEMPO','УРОВЕНЬ':'LEVEL','ВКЛ':'ON','ВЫКЛ':'OFF','ПЛОТНОСТЬ':'DENSITY','ЗВУК ГОТОВ':'AUDIO READY','БИБЛИОТЕКА ЗВУКОВ':'SOUND LIBRARY','ЗАПИСЬ ВЫСТУПЛЕНИЯ':'PERFORMANCE RECORDING','ЗАГРУЗИТЬ ПАТТЕРН':'LOAD PATTERN','ВЫБРАННЫЙ СТИЛЬ':'SELECTED STYLE','ОЧИСТИТЬ':'CLEAR','ШАГИ':'STEPS','ОТМЕНИТЬ':'UNDO','ИЗМЕНЕНИЕ':'CHANGE','КВАНТАЙЗ':'QUANTIZE','ТОЧНО В 16 ШАГОВ':'SNAP TO 16 STEPS','РУЧНОЕ УПРАВЛЕНИЕ':'MANUAL CONTROL','БЕЗ AI':'NO AI'};
const translateText=(input:string)=>{if(language==='ru')return input;return input.replace(/[А-ЯЁ][А-ЯЁ.\s-]*/g,segment=>{const key=segment.trim();const translated=englishLabels[key];return translated?segment.replace(key,translated):segment})};
const originalText=new WeakMap<Text,string>();
const originalAttributes=new WeakMap<Element,Map<string,string>>();
const applyLanguage=()=>{
 document.documentElement.lang=language;
 const toggle=document.querySelector<HTMLButtonElement>('#languageToggle');
 if(toggle){const markup=language==='ru'?'<b>RU</b><span>/</span>EN':'RU<span>/</span><b>EN</b>';if(toggle.innerHTML!==markup)toggle.innerHTML=markup;toggle.setAttribute('aria-pressed',String(language==='en'));}
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 let node:Node|null;
 while((node=walker.nextNode())){if(node.parentElement?.closest('script,style,#languageToggle'))continue;const t=node as Text;let source=originalText.get(t);if(source===undefined){source=t.nodeValue??'';if(language==='en'&&/[А-ЯЁ]/.test(source))source=source;originalText.set(t,source)}const translated=translateText(source);if(t.nodeValue!==translated)t.nodeValue=translated;}
 document.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder]').forEach(el=>{let cache=originalAttributes.get(el);if(!cache){cache=new Map();originalAttributes.set(el,cache)}for(const attr of ['aria-label','title','placeholder']){const value=el.getAttribute(attr);if(value===null)continue;if(!cache.has(attr))cache.set(attr,value);const translated=translateText(cache.get(attr)??value);if(value!==translated)el.setAttribute(attr,translated)}});
};
document.querySelector('#languageToggle')?.addEventListener('click',()=>{language=language==='ru'?'en':'ru';try{localStorage.setItem(languageKey,language)}catch{}applyLanguage()});
let languageRefreshPending=false;
const languageObserver=new MutationObserver(records=>{
 // Numeric transport updates and playhead changes never require translation.
 const hasLabels=records.some(record=>Array.from(record.addedNodes).some(node=>/[А-ЯЁа-яё]/.test(node.textContent??'')));
 if(language==='en'&&hasLabels&&!languageRefreshPending){
  languageRefreshPending=true;
  requestAnimationFrame(()=>{languageRefreshPending=false;if(language==='en')applyLanguage()});
 }
});
languageObserver.observe(document.body,{childList:true,subtree:true});
queueMicrotask(applyLanguage);
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
const setStatus=(v:string)=>{$('#status').textContent=localStatus(v);$('#status').classList.toggle('live',v.includes('REC')||v==='PLAY')};
const h=(name:string,text:string,cls='')=>{const el=document.createElement(name);el.className=cls;el.textContent=text;return el;};
function paintPads(){const wrap=$('#pads');wrap.replaceChildren();for(let i=0;i<8;i++){const name=PAD_NAMES[i]??'PAD';
 const p=h('button','','pad') as HTMLButtonElement;p.type='button';p.style.setProperty('--tone',['#fd3f59','#7df7e4','#f7faff','#79f6e1','#effbff','#aabacc','#f46b91','#6adfd5'][i]??'#f7faff');p.setAttribute('aria-label',`Играть ${name}`);p.dataset.pad=String(i);
 const top=h('span',`${String(i+1).padStart(2,'0')}`,'pad-number'),short=h('span',name,'pad-name');
 const dot=h('span',engine.bank.customInfo(i,state.style)?'СВОЙ':'','pad-own');
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
 $('#selectedPad').textContent=PAD_NAMES[state.selected]??'KICK';updateSampleTarget();
}
function updateSampleTarget(){
 const pad=Number($<HTMLSelectElement>('#replaceTarget').value);const custom=engine.bank.customInfo(pad,state.style);
 $('#soundInfo').textContent=custom?`СВОЙ · ${custom}`:`ОРИГИНАЛ · ${PAD_NAMES[pad]}`;
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
 $('#selectedPad').textContent=PAD_NAMES[pad]??'KICK';updateSampleTarget();syncSelectedSteps();scheduleSave();
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
  const name=h('button',PAD_NAMES[pad],'pattern-lane-name') as HTMLButtonElement;name.dataset.pad=String(pad);
  name.type='button';name.setAttribute('aria-label',`Редактировать ${PAD_NAMES[pad]}`);
  name.classList.toggle('active',state.selected===pad);
  name.addEventListener('click',()=>selectPad(pad));
  const blocks=h('div','','pattern-lane-steps');
  for(let step=0;step<STEPS;step++){
   const cell=h('button','','pattern-cell') as HTMLButtonElement;
   cell.type='button';cell.dataset.pad=String(pad);cell.dataset.step=String(step);
   cell.setAttribute('aria-label',`${PAD_NAMES[pad]} step ${step+1}`);
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
 if(next==='profile')$('#deviceStatus').textContent=`Session stored locally · ${engine.takes.length} audio takes · ${STYLES.length} music styles`;
 if(next!=='main')$<HTMLDetailsElement>('#'+fanIds[next]).scrollIntoView({block:'nearest',behavior:'auto'});
}
function paintMix(){const wrap=$('#mixRows');wrap.replaceChildren();PAD_NAMES.forEach((name,i)=>{
 const row=h('div','','mixrow');const label=h('span',name,'mix-name');const range=document.createElement('input');range.type='range';range.min='0';range.max='120';range.step='1';range.value=String(Math.round((state.levels[i]??1)*100));
 range.setAttribute('aria-label',`Громкость ${name}`);range.addEventListener('input',()=>{state.levels[i]=Number(range.value)/100;engine.updateMix();scheduleSave()});
 const mute=h('button',state.muted[i]?'ON':'OFF',state.muted[i]?'mute active':'mute') as HTMLButtonElement;mute.setAttribute('aria-label',`Mute ${name}`);mute.addEventListener('click',()=>{state.muted[i]=!state.muted[i];engine.updateMix();save();paintMix();paintPads()});row.append(label,range,mute);wrap.append(row);
 });}
let takeUrls:string[]=[];
function paintTakes(){for(const url of takeUrls)URL.revokeObjectURL(url);takeUrls=[];const el=$('#takesList');el.replaceChildren();for(let i=0;i<engine.takes.length;i++){
 const blob=engine.takes[i]!;const a=h('a',`TAKE ${String(i+1).padStart(2,'0')}  ·  ${Math.round(blob.size/1024)} KB`,'take') as HTMLAnchorElement;
 a.href=URL.createObjectURL(blob);takeUrls.push(a.href);a.download=`artss-live-take-${i+1}.${blob.type.includes('mp4')?'m4a':'webm'}`;el.append(a);
 }if(!engine.takes.length)el.append(h('p','Запиши первый дубль.','dim'));
}
async function safe(task:()=>Promise<void>){if(busy)return;busy=true;try{await task()}catch(e){setStatus(e instanceof Error?e.message:'ERROR')}finally{busy=false;}}
const paintLibrary=()=>{const host=$('#libraryStyles');const frag=document.createDocumentFragment();
 STYLES.forEach((style,i)=>{const btn=h('button',styleLabel(i),'library-style') as HTMLButtonElement;btn.classList.toggle('on',i===state.style);btn.addEventListener('click',()=>{($<HTMLSelectElement>('#bank')).value=String(i);$('#bank').dispatchEvent(new Event('change'));setPane('main')});frag.append(btn)});
 host.replaceChildren(frag);
};
const init=()=>{
engine.updateMix();refreshKitButtons();
 const renderSoundPads=()=>{
  const host=$('#musicPads'),fragment=document.createDocumentFragment();
  SOUND_LABELS[soundPage].forEach((label,index)=>{
   const button=h('button','','music-pad') as HTMLButtonElement;
   button.type='button';button.setAttribute('aria-label',`Играть ${soundPage} ${label}`);
   button.append(h('small',String(index+1).padStart(2,'0')),h('strong',label));
   button.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();button.classList.add('pressed');
    const path=`/samples/performance/${soundPage}-${String(index+1).padStart(2,'0')}.wav`;
    const shift=soundPage==='fx'?0:Number($<HTMLSelectElement>('#musicKey').value);
    void engine.playPerformance(path,2**(shift/12)).catch(error=>setStatus(error instanceof Error?error.message:'ЗВУК НЕДОСТУПЕН'));
   },{passive:false});
   for(const action of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(action,()=>button.classList.remove('pressed'));
   button.addEventListener('click',event=>{if((event as PointerEvent).detail!==0)return;const path=`/samples/performance/${soundPage}-${String(index+1).padStart(2,'0')}.wav`;void engine.playPerformance(path,soundPage==='fx'?1:2**(Number($<HTMLSelectElement>('#musicKey').value)/12)).catch(error=>setStatus(String(error)))});
   button.addEventListener('contextmenu',event=>event.preventDefault());fragment.append(button);
  });host.replaceChildren(fragment);
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-sound-page]'))button.classList.toggle('active',button.dataset.soundPage===soundPage);
 };
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-sound-page]'))button.addEventListener('click',()=>{soundPage=button.dataset.soundPage as SoundPage;renderSoundPads()});
 renderSoundPads();
 const updateCue=()=>{const value=Number($<HTMLInputElement>('#trackCue').value);
  const labels:Record<number,string>={0:'INTRO',25:'BREAK',50:'DROP',85:'OUTRO'};
  $('#cuePosition').textContent=`${labels[value]??'ТОЧКА'} · ${value}%`;
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-cue]'))button.classList.toggle('active',Number(button.dataset.cue)===value);
 };
 $('#trackCue').addEventListener('input',updateCue);
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-cue]'))button.addEventListener('click',()=>{const slider=$<HTMLInputElement>('#trackCue');slider.value=button.dataset.cue??'0';updateCue()});
 updateCue();
 $('#chooseTracks').addEventListener('click',()=>$<HTMLInputElement>('#trackInput').click());
 $('#trackInput').addEventListener('change',()=>void safe(async()=>{
  const input=$<HTMLInputElement>('#trackInput');try{
   if(!input.files?.length)return;
   $('#trackQueue').textContent='Анализ треков…';
   try{await autoMix.load(input.files)}catch(error){$('#trackQueue').textContent='Треки не загружены';throw error}
   $('#trackQueue').replaceChildren(...autoMix.loaded.map((track,index)=>h('div',`${String(index+1).padStart(2,'0')} · ${track.name} · ${track.confidence>=.17?`${track.bpm} BPM`:'BPM вручную / без синхронизации'}`,'track-chip')));
  }finally{input.value='';}
 }));
 $('#startAutoMix').addEventListener('click',()=>void safe(async()=>{
  await autoMix.start($<HTMLInputElement>('#mixPads').checked,$<HTMLInputElement>('#mixIntro').checked,Number($<HTMLInputElement>('#trackCue').value)/100);
  updateTransport();
 }));
 $('#stopAutoMix').addEventListener('click',()=>{autoMix.stop();updateTransport()});
 $('#filter').addEventListener('input',()=>{state.filter=Number(($<HTMLInputElement>('#filter')).value)/100;$('#filterValue').textContent=state.filter>.97?'ОТКРЫТ':`${Math.round(state.filter*100)}%`;engine.updateMix();scheduleSave()});
 ($('#filter') as HTMLInputElement).value=String(Math.round(state.filter*100));$('#filterValue').textContent=state.filter>.97?'ОТКРЫТ':`${Math.round(state.filter*100)}%`;
 $('#echo').addEventListener('input',()=>{state.echo=Number(($<HTMLInputElement>('#echo')).value)/100;$('#echoValue').textContent=`${Math.round(state.echo*100)}%`;engine.updateMix();scheduleSave()});
 ($('#echo') as HTMLInputElement).value=String(Math.round(state.echo*100));$('#echoValue').textContent=`${Math.round(state.echo*100)}%`;
 const canvas=$<HTMLCanvasElement>('#waveform'),pen=canvas.getContext('2d',{alpha:false});
 const signalData=new Uint8Array(256),width=canvas.width,height=canvas.height;
 const drawSignal=()=>{
  if(!pen)return;
  pen.fillStyle='#000000';pen.fillRect(0,0,width,height);
  pen.strokeStyle='#28292e';pen.lineWidth=1;pen.beginPath();
  for(let x=0;x<width;x+=48){pen.moveTo(x,0);pen.lineTo(x,height);}
  pen.stroke();pen.strokeStyle='#454750';pen.beginPath();pen.moveTo(0,height/2);pen.lineTo(width,height/2);pen.stroke();
  const hasAudio=engine.readWaveform(signalData);
  // Batch strokes; avoid per-bar shadowBlur, which stalls WebKit during audio capture.
  pen.lineWidth=3;pen.strokeStyle='#00d9cd';pen.beginPath();
  for(let i=0;i<104;i+=4){
   const x=i*width/256;const y=hasAudio?((signalData[i]??128)-128)/128:0;
   const amp=hasAudio?Math.max(2,Math.abs(y)*(height*.37)):2;
   pen.moveTo(x,height/2-amp);pen.lineTo(x,height/2+amp);
  }
  pen.stroke();pen.strokeStyle='#ffffff';pen.beginPath();
  for(let i=104;i<256;i+=4){
   const x=i*width/256;const y=hasAudio?((signalData[i]??128)-128)/128:0;
   const amp=hasAudio?Math.max(2,Math.abs(y)*(height*.37)):2;
   pen.moveTo(x,height/2-amp);pen.lineTo(x,height/2+amp);
  }
  pen.stroke();pen.strokeStyle='#d41432';pen.lineWidth=2.5;pen.beginPath();pen.moveTo(width*.52,2);pen.lineTo(width*.52,height-2);pen.stroke();
 };
 let visualAt=0,meterAt=0,meterPercent=-1;
  const vu=(now:number)=>{requestAnimationFrame(vu);
   if(document.visibilityState!=='visible'||pane!=='main')return;
   paintPlayhead();
   if(now-meterAt>=55){meterAt=now;const value=Math.round(Math.min(100,engine.meterLevel*100));
    if(value!==meterPercent){meterPercent=value;$('#outputMeter').style.width=value+'%';}
    $('#pulseDot').classList.toggle('on',engine.state==='PLAY');
   }
   if(now-visualAt>=42){visualAt=now;drawSignal();}
  };drawSignal();requestAnimationFrame(vu);
 $('#bank').replaceChildren(...STYLES.map((s,i)=>{const o=h('option',styleLabel(i)) as HTMLOptionElement;o.value=String(i);return o}));
 ($('#bank') as HTMLSelectElement).value=String(state.style);
 $('#bpm').textContent=String(state.tempo);
 const showTrack=()=>{$('#trackName').textContent=`${styleLabel(state.style)} · BANK ${'ABCD'[kits.active]}`;($('#bpmRange') as HTMLInputElement).value=String(state.tempo);$('#bpm').textContent=String(state.tempo);
  const nodes=document.querySelectorAll('#styleLights i');nodes.forEach((el,i)=>el.classList.toggle('active',i===state.style%nodes.length));};
 const changeTempo=(tempo:number)=>{state.tempo=Math.max(80,Math.min(175,Math.round(tempo)));showTrack();engine.updateMix();scheduleSave()};
 const jog=$<HTMLButtonElement>('#jogWheel');
 type JogMode='filter'|'tempo'|'echo'|'cue';
 let jogMode:JogMode='filter',jogPointer:number|null=null,lastAngle=0;
 const jogInput=()=>jogMode==='filter'?$<HTMLInputElement>('#filter'):jogMode==='tempo'?$<HTMLInputElement>('#bpmRange'):jogMode==='echo'?$<HTMLInputElement>('#echo'):$<HTMLInputElement>('#trackCue');
 const renderJog=()=>{
  const input=jogInput(),min=Number(input.min)||0,max=Number(input.max)||100,value=Number(input.value);
  const fraction=(value-min)/(max-min);
  jog.style.setProperty('--jog-turn',String(-135+fraction*270)+'deg');
  $('#jogValue').textContent=(jogMode==='tempo'?'BPM ':jogMode.toUpperCase()+' ')+Math.round(value)+(jogMode==='tempo'?'':'%');
  jog.setAttribute('aria-valuemin',String(min));jog.setAttribute('aria-valuemax',String(max));jog.setAttribute('aria-valuenow',String(value));
  jog.setAttribute('aria-valuetext',$('#jogValue').textContent??'');
 };
 const turnJog=(delta:number)=>{
  const input=jogInput();if(input.disabled)return;
  const min=Number(input.min)||0,max=Number(input.max)||100;
  const value=Math.round(Math.min(max,Math.max(min,Number(input.value)+delta*(max-min)/100)));
  if(value!==Number(input.value)){input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));}
  renderJog();
 };
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-jog-mode]'))button.addEventListener('click',()=>{
  jogMode=button.dataset.jogMode as JogMode;
  for(const item of document.querySelectorAll<HTMLButtonElement>('[data-jog-mode]'))item.classList.toggle('active',item===button);
  renderJog();
 });
 const pointerAngle=(event:PointerEvent)=>{const rect=jog.getBoundingClientRect();return Math.atan2(event.clientY-(rect.top+rect.height/2),event.clientX-(rect.left+rect.width/2));};
 jog.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0||jogPointer!==null)return;
  event.preventDefault();jogPointer=event.pointerId;lastAngle=pointerAngle(event);jog.classList.add('turning');
  try{jog.setPointerCapture(event.pointerId)}catch{}
 },{passive:false});
 jog.addEventListener('pointermove',event=>{
  if(jogPointer!==event.pointerId)return;
  event.preventDefault();const next=pointerAngle(event);
  const diff=Math.atan2(Math.sin(next-lastAngle),Math.cos(next-lastAngle));
  lastAngle=next;turnJog(diff*100/(Math.PI*1.5));
 },{passive:false});
 for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)jog.addEventListener(type,event=>{
  if(jogPointer!==event.pointerId)return;jogPointer=null;jog.classList.remove('turning');
 });
 jog.addEventListener('keydown',event=>{
  if(event.key==='ArrowUp'||event.key==='ArrowRight'){event.preventDefault();turnJog(1);}
  if(event.key==='ArrowDown'||event.key==='ArrowLeft'){event.preventDefault();turnJog(-1);}
  if(event.key==='Home'){event.preventDefault();turnJog(-100);}
  if(event.key==='End'){event.preventDefault();turnJog(100);}
 });
 for(const id of ['filter','echo','bpmRange','trackCue'])$('#'+id).addEventListener('input',()=>{if(jogInput().id===id)renderJog()});
 renderJog();
 const changeStyle=(offset:number)=>{const el=$<HTMLSelectElement>('#bank');el.value=String((state.style+offset+STYLES.length)%STYLES.length);el.dispatchEvent(new Event('change'))};
 $('#stylePrev').addEventListener('click',()=>changeStyle(-1));$('#styleNext').addEventListener('click',()=>changeStyle(1));
 let generation=0,previousPattern:number[][]|null=null;
 const undoButton=$<HTMLButtonElement>('#undoGroove');
 const rememberPattern=()=>{previousPattern=clonePattern(state.pattern);undoButton.disabled=false};
 mountPresetVault({capture:()=>({style:state.style,tempo:state.tempo,pattern:clonePattern(state.pattern)}),apply:({style,tempo,pattern})=>{
  rememberPattern();state.style=style;state.tempo=tempo;state.pattern=clonePattern(pattern);
  $<HTMLSelectElement>('#bank').value=String(style);showTrack();engine.updateMix();save();paintPads();paintSteps();setStatus('PATTERN LOADED');
 }});
 const applySelectedPattern=()=>{rememberPattern();generation++;const energy=Number($<HTMLInputElement>('#density').value)/100;state.pattern=composeGroove(state.style,energy,generation);save();paintSteps();setStatus('PATTERN LOADED')};
 $('#bank').addEventListener('change',()=>{rememberPattern();state.style=Number($<HTMLSelectElement>('#bank').value);state.tempo=STYLES[state.style]?.bpm??136;state.pattern=composeGroove(state.style,Number($<HTMLInputElement>('#density').value)/100,0);showTrack();engine.updateMix();save();paintPads();paintSteps();updateSampleTarget();setStatus('PATTERN LOADED')});
 $('#applyPattern').addEventListener('click',applySelectedPattern);
 $('#clearGroove').addEventListener('click',()=>{rememberPattern();state.pattern=Array.from({length:8},()=>Array(16).fill(0));save();paintSteps();setStatus('PATTERN CLEARED')});
 undoButton.addEventListener('click',()=>{if(!previousPattern)return;const current=clonePattern(state.pattern);state.pattern=previousPattern;previousPattern=current;save();paintSteps();setStatus('PATTERN RESTORED')});
 const quantize=$<HTMLButtonElement>('#quantize');
 const paintQuantize=()=>{quantize.setAttribute('aria-pressed',String(state.quantize));quantize.classList.toggle('active',state.quantize);quantize.querySelector('b')!.textContent=state.quantize?'ВКЛ':'ВЫКЛ'};
 paintQuantize();quantize.addEventListener('click',()=>{state.quantize=!state.quantize;paintQuantize();save()});
 showTrack();
 $('#seqEdit').addEventListener('click',()=>{const advanced=$<HTMLDetailsElement>('#advancedEditor');advanced.open=!advanced.open;if(advanced.open)advanced.scrollIntoView({block:'nearest',behavior:'smooth'})});
 for(const btn of document.querySelectorAll<HTMLButtonElement>('[data-kit]'))btn.addEventListener('click',()=>{
  const to=Number(btn.dataset.kit);if(to===kits.active||!Number.isInteger(to)||to<0||to>3)return;
  kits.patterns[kits.active]=clonePattern(state.pattern);kits.active=to;state.pattern=clonePattern(kits.patterns[to]??state.pattern);save();refreshKitButtons();paintSteps();showTrack();setStatus(`PAD BANK ${'ABCD'[to]}`);
 });
 $('#tempoDown').addEventListener('click',()=>changeTempo(state.tempo-1));
 $('#tempoUp').addEventListener('click',()=>changeTempo(state.tempo+1));
 $('#bpmRange').addEventListener('input',()=>changeTempo(Number(($<HTMLInputElement>('#bpmRange')).value)));
 let lastTap=0;const recentTaps:number[]=[];
 $('#tapTempo').addEventListener('click',()=>{const now=performance.now(),elapsed=now-lastTap;lastTap=now;if(elapsed>2000){recentTaps.length=0;setStatus('TAP AGAIN TO SET BPM');return;}if(elapsed<300||elapsed>1000)return;recentTaps.push(elapsed);if(recentTaps.length>4)recentTaps.shift();const sorted=[...recentTaps].sort((a,b)=>a-b);const median=sorted[Math.floor(sorted.length/2)]??elapsed;changeTempo(60000/median);setStatus(`BPM ${state.tempo}`)});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();else if(engine.state==='PLAY'&&engine.ctx?.state==='suspended')setStatus('TAP PLAY TO RESTORE AUDIO')});
 window.addEventListener('pagehide',()=>{flushSave();for(const url of takeUrls)URL.revokeObjectURL(url);takeUrls=[]});
 $('#play').addEventListener('click',()=>void safe(async()=>{if(engine.state==='PLAY'&&engine.ctx?.state==='suspended')await engine.unlock();else if(engine.state==='PLAY')engine.pause();else await engine.start();updateTransport()}));
 $('#record').addEventListener('click',()=>void safe(async()=>{await engine.toggleRecord();updateTransport()}));
 $('#cueOverdub').addEventListener('click',()=>void safe(async()=>{
  if(engine.cueMicActive)engine.stopCueMic();else await engine.startCueMic();
  updateTransport();
 }));
 $('#stop').addEventListener('click',()=>{autoMix.stop();engine.stop();updateTransport()});
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
 $('#drawerSettings').addEventListener('click',()=>{closeDrawer();setPane('profile')});
 $('#drawerFX').addEventListener('click',()=>{closeDrawer();setPane('mix')});
 $('#drawerPresets').addEventListener('click',()=>{closeDrawer();setPane('library')});
 $('#libraryImport').addEventListener('click',()=>setPane('sounds'));
 $('#goToRecording').addEventListener('click',()=>setPane('takes'));
 $('#pageA').addEventListener('click',()=>{page=0;paintSteps()});$('#pageB').addEventListener('click',()=>{page=1;paintSteps()});
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
 $('#take').addEventListener('click',()=>void safe(async()=>{if(($('#take') as HTMLButtonElement).classList.contains('on')){engine.endTake();$('#take').classList.remove('on');$('#take').textContent='● ЗАПИСАТЬ АУДИО';window.setTimeout(paintTakes,400)}else{await engine.beginTake();$('#take').classList.add('on');$('#take').textContent='■ ЗАВЕРШИТЬ ДУБЛЬ'}}));
 $('#export').addEventListener('click',()=>void safe(async()=>{setStatus('RENDERING WAV');const blob=await engine.exportWav();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ARTSS-NEXUS-LIVE.wav';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);setStatus('WAV EXPORTED')}));
 $('#reset').addEventListener('click',()=>{if(!confirm('Очистить записанные шаги?'))return;state.pattern=Array.from({length:8},()=>Array(16).fill(0));save();paintSteps()});
 for(const el of document.querySelectorAll('[data-pane]'))el.addEventListener('click',()=>{closeDrawer();setPane((el as HTMLElement).dataset.pane as Pane)});
 let lastStep:number|null=null;
 // Read the audible clock every visible frame, never the ahead-of-time scheduling pulse.
 const paintPlayhead=()=>{
  const current=engine.state==='PLAY'?engine.currentStep:null;
  if(current===lastStep)return;
  if(lastStep!==null)for(const el of document.querySelectorAll<HTMLElement>(`[data-step="${lastStep}"].playhead`))el.classList.remove('playhead');
  lastStep=current;if(current===null)return;
  for(const el of document.querySelectorAll<HTMLElement>(`#steps .step[data-step="${current}"],#patternOverview .pattern-cell[data-step="${current}"]`))el.classList.add('playhead');
  const total=60/state.tempo/4*16,elapsed=current*60/state.tempo/4;
  const timeText=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')} / ${String(Math.floor(total/60)).padStart(2,'0')}:${String(Math.ceil(total%60)).padStart(2,'0')}`;
  const timeLabel=$('#transportTime');if(timeLabel.textContent!==timeText)timeLabel.textContent=timeText;
 };
 engine.events.onClip=(pad)=>{scheduleSave();for(let step=0;step<STEPS;step++)syncPatternCells(pad,step)};engine.events.onSamples=paintPads;engine.events.onState=v=>{setStatus(v);};
 paintPads();paintSteps();setPane('main');updateTransport();
 if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
};
function updateTransport(){const play=$('#play');play.querySelector('.deck-label')!.textContent=engine.state==='PLAY'?'ПАУЗА':'ПУСК';play.querySelector('.deck-play-icon')!.textContent=engine.state==='PLAY'?'Ⅱ':'▶';play.classList.toggle('on',engine.state==='PLAY');$('#record').classList.toggle('on',engine.recording);$('#record').querySelector('.deck-label')!.textContent=engine.recording?'СТОП ЗАПИСИ':'ЗАПИСЬ';const cue=$<HTMLButtonElement>('#cueOverdub');cue.classList.toggle('on',engine.cueMicActive);cue.setAttribute('aria-pressed',String(engine.cueMicActive));cue.textContent=engine.cueMicActive?'● CUE · MIC ON':'CUE · MIC';$('#runState').textContent=localStatus(engine.state);if(engine.state==='STOP')$('#transportTime').textContent='00:00 / ЦИКЛ';}
init();
