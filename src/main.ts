import {defaultSession,importSession,PAD_NAMES,STYLES,SCENES,toggle,STEPS,type Session} from './model.js';
import {Engine} from './engine.js';
import { composeGroove } from './arranger.js';
const $=<T extends HTMLElement=HTMLElement>(q:string)=>document.querySelector<T>(q)!;
const getStorage=():Session=>{for(const key of ['artss-live-session-v19','artss-live-session-v18']){try{const v=localStorage.getItem(key);if(v)return importSession(v)}catch{}}return defaultSession()};
const state=getStorage();const engine=new Engine(()=>state);
let page=0,importSlot:number|undefined,pane:'main'|'mix'|'takes'='main',busy=false;
const save=()=>{try{localStorage.setItem('artss-live-session-v19',JSON.stringify(state))}catch{setStatus('STORAGE FULL')}};
const setStatus=(v:string)=>{$('#status').textContent=v;$('#status').classList.toggle('live',v.includes('REC')||v==='PLAY')};
const h=(name:string,text:string,cls='')=>{const el=document.createElement(name);el.className=cls;el.textContent=text;return el;};
function paintPads(){const wrap=$('#pads');wrap.replaceChildren();PAD_NAMES.forEach((name,i)=>{
 const p=h('button','','pad') as HTMLButtonElement;p.type='button';p.style.setProperty('--tone',['#ff936b','#91f0c8','#ffc489','#a4bce8','#ff8c73','#91dcc7','#eb9ea8','#a1b5fc'][i]??'#ff936b');p.setAttribute('aria-label',`Играть ${name}`);p.dataset.pad=String(i);
 const top=h('span',`${String(i+1).padStart(2,'0')}`,'pad-number'),short=h('span',name,'pad-name');
 const dot=h('span',engine.bank.customInfo(i,state.style)?'OWN':'','pad-own');
 p.append(top,short,dot);
 if(i===state.selected)p.classList.add('selected');if(state.muted[i])p.classList.add('muted');
 p.addEventListener('pointerdown',async e=>{if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();state.selected=i;save();for(const other of wrap.querySelectorAll('.pad'))other.classList.toggle('selected',other===p);$('#selectedPad').textContent=name;updateSampleTarget();paintSteps();p.classList.add('pressed');
  try{await engine.hit(i,Math.min(1,.65+(e.pressure>0?e.pressure*.32:.3)));setStatus(engine.recording?'REC ON':'AUDIO READY')}catch(err){setStatus(err instanceof Error?err.message:'AUDIO ERROR')}
  window.setTimeout(()=>p.classList.remove('pressed'),90);
 },{passive:false});
 p.addEventListener('contextmenu',e=>{e.preventDefault();importSlot=i;$('#sampleInput').click();});
 wrap.append(p);
 });
 $('#selectedPad').textContent=PAD_NAMES[state.selected]??'KICK';updateSampleTarget();
}
function updateSampleTarget(){const target=$('#sampleRecordHint');target.textContent=`PAD ${String(state.selected+1).padStart(2,'0')} · ${STYLES[state.style]?.name??'PRESET'}`;}
function paintSteps(){const wrap=$('#steps');wrap.replaceChildren();for(let col=0;col<8;col++){
 const step=col+page*8,velocity=state.pattern[state.selected]?.[step]??0;
 const btn=h('button',String(step+1).padStart(2,'0'),'step') as HTMLButtonElement;btn.type='button';btn.dataset.step=String(step);
 if(velocity>0)btn.classList.add('on');btn.addEventListener('click',()=>{toggle(state.pattern,state.selected,step);save();paintSteps()});wrap.append(btn);
 }
 $('#pageA').classList.toggle('active',page===0);$('#pageB').classList.toggle('active',page===1);
 $('#stepLabel').textContent=`${page===0?'01–08':'09–16'} / 16`;
}
function setPane(next:typeof pane){pane=next;$('#mainPanel').hidden=pane!=='main';$('#mixPanel').hidden=pane!=='mix';$('#takesPanel').hidden=pane!=='takes';
 for(const b of document.querySelectorAll('[data-pane]')){const btn=b as HTMLButtonElement;btn.classList.toggle('active',btn.dataset.pane===pane)};
 if(next==='mix')paintMix();if(next==='takes')paintTakes();
}
function paintMix(){const wrap=$('#mixRows');wrap.replaceChildren();PAD_NAMES.forEach((name,i)=>{
 const row=h('div','','mixrow');const label=h('span',name,'mix-name');const range=document.createElement('input');range.type='range';range.min='0';range.max='120';range.step='1';range.value=String(Math.round((state.levels[i]??1)*100));
 range.setAttribute('aria-label',`Громкость ${name}`);range.addEventListener('input',()=>{state.levels[i]=Number(range.value)/100;save()});
 const mute=h('button',state.muted[i]?'ON':'OFF',state.muted[i]?'mute active':'mute') as HTMLButtonElement;mute.setAttribute('aria-label',`Mute ${name}`);mute.addEventListener('click',()=>{state.muted[i]=!state.muted[i];save();paintMix();paintPads()});row.append(label,range,mute);wrap.append(row);
 });}
let takeUrls:string[]=[];
function paintTakes(){for(const url of takeUrls)URL.revokeObjectURL(url);takeUrls=[];const el=$('#takesList');el.replaceChildren();for(let i=0;i<engine.takes.length;i++){
 const blob=engine.takes[i]!;const a=h('a',`TAKE ${String(i+1).padStart(2,'0')}  ·  ${Math.round(blob.size/1024)} KB`,'take') as HTMLAnchorElement;
 a.href=URL.createObjectURL(blob);takeUrls.push(a.href);a.download=`artss-live-take-${i+1}.${blob.type.includes('mp4')?'m4a':'webm'}`;el.append(a);
 }if(!engine.takes.length)el.append(h('p','Запиши первый дубль.','dim'));
}
async function safe(task:()=>Promise<void>){if(busy)return;busy=true;try{await task()}catch(e){setStatus(e instanceof Error?e.message:'ERROR')}finally{busy=false;}}
const init=()=>{
state.crossfader=.5;engine.updateMix();
 $('#filter').addEventListener('input',()=>{state.filter=Number(($<HTMLInputElement>('#filter')).value)/100;$('#filterValue').textContent=state.filter>.97?'OPEN':`${Math.round(state.filter*100)}%`;engine.updateMix();save()});
 ($('#filter') as HTMLInputElement).value=String(Math.round(state.filter*100));$('#filterValue').textContent=state.filter>.97?'OPEN':`${Math.round(state.filter*100)}%`;
 $('#echo').addEventListener('input',()=>{state.echo=Number(($<HTMLInputElement>('#echo')).value)/100;$('#echoValue').textContent=`${Math.round(state.echo*100)}%`;engine.updateMix();save()});
 ($('#echo') as HTMLInputElement).value=String(Math.round(state.echo*100));$('#echoValue').textContent=`${Math.round(state.echo*100)}%`;
 let vuClock=0;const vu=()=>{const now=performance.now();if(document.visibilityState==='visible'&&now-vuClock>90){vuClock=now;const v=engine.meterLevel;$('#outputMeter').style.width=`${Math.round(Math.min(100,v*100))}%`;$('#pulseDot').classList.toggle('on',engine.state==='PLAY');}requestAnimationFrame(vu);};requestAnimationFrame(vu);
 $('#bank').replaceChildren(...STYLES.map((s,i)=>{const o=h('option',s.name) as HTMLOptionElement;o.value=String(i);return o}));
 ($('#bank') as HTMLSelectElement).value=String(state.style);
 $('#scene').replaceChildren(...SCENES.map((s,i)=>{const o=h('option',s) as HTMLOptionElement;o.value=String(i);return o}));
 ($('#scene') as HTMLSelectElement).value=String(state.scene);$('#bpm').textContent=String(state.tempo);
 $('#bank').addEventListener('change',()=>{state.style=Number(($('#bank') as HTMLSelectElement).value);state.tempo=STYLES[state.style]?.bpm??136;$('#bpm').textContent=String(state.tempo);save();paintPads();updateSampleTarget();});
 let generation=0,previousPattern:number[][]|null=null;
 $('#autoGroove').addEventListener('click',()=>{previousPattern=state.pattern.map(row=>row.slice());generation++;const energy=Number(($<HTMLInputElement>('#density')).value)/100;state.pattern=composeGroove(state.style,energy,generation);save();paintSteps();$('#undoGroove').hidden=false;setStatus('AUTO GROOVE READY');});
 $('#undoGroove').addEventListener('click',()=>{if(!previousPattern)return;state.pattern=previousPattern;previousPattern=null;save();paintSteps();$('#undoGroove').hidden=true;setStatus('GROOVE RESTORED')});
 $('#scene').addEventListener('change',()=>{state.scene=Number(($('#scene') as HTMLSelectElement).value);save();});
 $('#tempoDown').addEventListener('click',()=>{state.tempo=Math.max(80,state.tempo-1);$('#bpm').textContent=String(state.tempo);save()});
 $('#tempoUp').addEventListener('click',()=>{state.tempo=Math.min(175,state.tempo+1);$('#bpm').textContent=String(state.tempo);save()});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&engine.state==='PLAY'&&engine.ctx?.state==='suspended')setStatus('TAP PLAY TO RESTORE AUDIO')});
 window.addEventListener('pagehide',()=>{save();for(const url of takeUrls)URL.revokeObjectURL(url);takeUrls=[]});
 $('#play').addEventListener('click',()=>void safe(async()=>{if(engine.state==='PLAY'&&engine.ctx?.state==='suspended')await engine.unlock();else if(engine.state==='PLAY')engine.pause();else await engine.start();updateTransport()}));
 $('#record').addEventListener('click',()=>void safe(async()=>{await engine.toggleRecord();updateTransport()}));
 $('#stop').addEventListener('click',()=>{engine.stop();updateTransport()});
 $('#pageA').addEventListener('click',()=>{page=0;paintSteps()});$('#pageB').addEventListener('click',()=>{page=1;paintSteps()});
 const renderCapture=()=>{const active=engine.sampling;
  const start=$<HTMLButtonElement>('#sampleStart'),stop=$<HTMLButtonElement>('#sampleStop');
  start.disabled=active;stop.disabled=!active;start.classList.toggle('on',active);
  ($('#sampleSource') as HTMLSelectElement).disabled=active;
  start.textContent=active?'● RECORDING':'● START';
 };
 $('#sampleStart').addEventListener('click',()=>void safe(async()=>{
  const source=$<HTMLSelectElement>('#sampleSource').value==='mic'?'mic':'live';
  await engine.beginSampleCapture(source,state.selected);renderCapture();setStatus(`SAMPLE REC · PAD ${state.selected+1}`);
 }));
 $('#sampleStop').addEventListener('click',()=>void safe(async()=>{
  try{const result=await engine.endSampleCapture();save();paintSteps();setStatus(`SAMPLE SAVED · PAD ${result.pad+1}`);paintPads();}
  finally{renderCapture();}
 }));
 $('#addSound').addEventListener('click',()=>{importSlot=undefined;$('#sampleInput').click()});
 $('#replaceSound').addEventListener('click',()=>{importSlot=state.selected;$('#sampleInput').click()});
 $('#sampleInput').addEventListener('change',()=>void safe(async()=>{const input=$<HTMLInputElement>('#sampleInput');if(!input.files?.length)return;setStatus('ANALYZING SOUND');const added=await engine.addSamples(input.files,importSlot);save();paintSteps();
   setStatus(`AUTO MIX: ${added.map(x=>PAD_NAMES[x.pad]).join(', ')}`);input.value='';importSlot=undefined;paintPads();}));
 $('#take').addEventListener('click',()=>void safe(async()=>{if(($('#take') as HTMLButtonElement).classList.contains('on')){engine.endTake();$('#take').classList.remove('on');$('#take').textContent='● RECORD AUDIO';window.setTimeout(paintTakes,400)}else{await engine.beginTake();$('#take').classList.add('on');$('#take').textContent='■ FINISH TAKE'}}));
 $('#export').addEventListener('click',()=>void safe(async()=>{setStatus('RENDERING WAV');const blob=await engine.exportWav();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ARTSS-LIVE-19.wav';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);setStatus('WAV EXPORTED')}));
 $('#reset').addEventListener('click',()=>{if(!confirm('Очистить записанные шаги?'))return;state.pattern=Array.from({length:8},()=>Array(16).fill(0));save();paintSteps()});
 for(const el of document.querySelectorAll('[data-pane]'))el.addEventListener('click',()=>setPane((el as HTMLElement).dataset.pane as typeof pane));
 engine.events.onStep=(step)=>{requestAnimationFrame(()=>{for(const el of document.querySelectorAll('.step'))el.classList.toggle('playhead',Number((el as HTMLElement).dataset.step)===step)})};
 engine.events.onClip=()=>{save();paintSteps()};engine.events.onSamples=paintPads;engine.events.onState=v=>{setStatus(v);if(v.startsWith('SAMPLE SAVED')||v.startsWith('SAMPLE ERROR')){renderCapture();paintPads();}};
 paintPads();paintSteps();setPane('main');updateTransport();renderCapture();
 if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
};
function updateTransport(){const play=$('#play');play.textContent=engine.state==='PLAY'?'Ⅱ  PAUSE':'▶  PLAY';play.classList.toggle('on',engine.state==='PLAY');$('#record').classList.toggle('on',engine.recording);$('#record').textContent=engine.recording?'■  REC OFF':'●  LIVE REC';$('#runState').textContent=engine.state;}
init();