import {engine,TRACKS,GENRES,presetPattern,type Genre,type Pattern} from './engine.js';

type Panel='live'|'seq'|'kits'|'mix'|'rec';
const root=document.querySelector<HTMLElement>('#app');if(!root)throw Error('UI root missing');
const KEY='artss-soundlab-v8';
const keys=['1','2','3','4','q','w','e','r','a','s','d','f','z','x','c','v'];
const palette=['#d4fa66','#ff987a','#82c9bd','#ff987a','#86d7be','#82c9bd','#e6b57c','#8dd4c2','#f7a57e','#7fbbb3','#b8abed','#d4fa66','#b8abed','#fdc28e','#85cabe','#ff987a'];
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const icon={live:'▦',seq:'≡',kits:'◉',mix:'◌',rec:'●'} as const;
let panel:Panel='live',selected=0,previous:Pattern|null=null,activeStep=-1,activeBar=0,toastTimer=0;
let recordedUrls:string[]=[];
function toast(message:string){const el=document.querySelector<HTMLElement>('#toast');if(!el)return;el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>{el.hidden=true;},3500);}
function save(){try{localStorage.setItem(KEY,JSON.stringify(engine.state));}catch{}}
function restore(){try{const obj=JSON.parse(localStorage.getItem(KEY)||'null');if(!obj)return;
 if(GENRES.includes(obj.genre)&&Array.isArray(obj.pattern)&&obj.pattern.length===16&&obj.pattern.every((r:unknown)=>Array.isArray(r)&&r.length===16&&r.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))){
  engine.state.genre=obj.genre;
  engine.state.pattern=obj.pattern;
  for(const k of ['bpm','master','filter','space','swing'] as const)if(typeof obj[k]==='number'&&Number.isFinite(obj[k]))engine.state[k]=clamp(obj[k],k==='bpm'?60:0,k==='bpm'?200:1);
 }
 }catch{}}
restore();
const html=`
<div class="shell">
 <header class="top"><div class="brand"><div class="brand-mark">A</div><div><div class="brand-name">ARTSS SOUNDLAB</div><div class="brand-sub">BEAT CREATOR / 08</div></div></div><div class="top-right"><span class="top-note">MADE FOR TOUCH</span><span class="status" id="audioStatus">AUDIO OFF</span></div></header>
 <section class="hero"><div><div class="eyebrow">A DIFFERENT KIND OF NOISE</div><h1>Build your sound<span style="color:var(--lime)">.</span></h1><div class="subtitle">16 инструментов. Один ритм. Запись без сложных меню.<br>Создавай треки прямо на телефоне.</div></div><div class="version">LIVE / ORIGINAL AUDIO ENGINE</div></section>
 <div class="workspace"><main class="work-area">
 <div class="transport" aria-label="Музыкальный транспорт"><div class="transport-label"><strong id="bpmValue">136</strong><span>BPM</span></div><div class="bpm-control"><button data-action="bpm-down" aria-label="Темп минус">−</button><button data-action="bpm-up" aria-label="Темп плюс">+</button></div><button class="play" id="playButton" data-action="play"><span id="playGlyph">▶</span><span id="playText">PLAY</span></button><button class="stop" data-action="stop" aria-label="Остановить">■</button><button class="mini-record" id="quickRecord" data-action="record" aria-label="Запись"><span></span></button></div>
 <nav class="tabs" aria-label="Разделы студии">${(['live','seq','kits','mix','rec'] as Panel[]).map(p=>`<button class="tab" data-panel="${p}" aria-selected="${p==='live'}">${{live:'PADS',seq:'SEQUENCER',kits:'KITS',mix:'MIX',rec:'RECORD'}[p]}</button>`).join('')}</nav>
 <section class="panel active" data-section="live"><div class="section-line"><h2 class="section-title">Drum machine</h2><span class="section-meta">16 VELOCITY PADS</span></div><div class="pad-grid" id="padGrid">${TRACKS.map((t,i)=>`<button class="pad" data-pad="${i}" style="--pad:${palette[i]}" aria-label="Сыграть ${t.name}"><span class="dot"></span><span class="pad-number">${String(i+1).padStart(2,'0')}</span><span><span class="pad-label">${t.name}</span><span class="key">KEY ${keys[i].toUpperCase()}</span></span></button>`).join('')}</div><div class="under-pad"><span class="hint">Нажимай и играй. Несколько пэдов одновременно.</span><button class="small-action" data-action="go-seq">EDIT BEAT ↗</button></div></section>
 <section class="panel" data-section="seq"><div class="section-line"><h2 class="section-title">Step sequencer</h2><span class="section-meta">1 BAR / 16 STEPS</span></div><div class="track-grid" id="trackGrid"></div><div class="seq-head"><span id="trackLabel">KICK</span><b>TAP TO PROGRAM</b></div><div class="step-grid" id="stepGrid"></div><div class="seq-actions"><button class="small-action" data-action="undo">↶ UNDO</button><button class="small-action" data-action="randomize">↝ VARIATION</button><button class="small-action" data-action="clear-track">× CLEAR TRACK</button></div></section>
 <section class="panel" data-section="kits"><div class="section-line"><h2 class="section-title">Sound collections</h2><span class="section-meta">6 ORIGINAL KITS</span></div><div class="genre-list" id="genreList"></div><div class="import-wrap"><div class="section-line"><h2 class="section-title">Your own sample</h2><span class="section-meta">MAX 7 SEC / 12 MB</span></div><div class="import-row"><select id="sampleSlot" aria-label="Выбор пэда для сэмпла">${TRACKS.map((t,i)=>`<option value="${i}">${t.name}</option>`).join('')}</select><label class="file-label">IMPORT <input class="visually-hidden" id="sampleInput" type="file" accept="audio/*,.wav,.mp3,.m4a"></label><button class="small-action" data-action="clear-sample">RESET</button></div><p class="hint">Импортированные сэмплы действуют до закрытия приложения.</p></div></section>
 <section class="panel" data-section="mix"><div class="section-line"><h2 class="section-title">Sound shaping</h2><span class="section-meta">ZERO CLUTTER FX</span></div>${[['master','MASTER',0,100],['filter','LOW PASS',0,100],['swing','SWING',0,50]].map(([id,name,min,max])=>`<div class="slider-row"><label for="fx-${id}">${name}</label><input id="fx-${id}" data-fx="${id}" aria-label="${name}" type="range" min="${min}" max="${max}" step="1"><output id="out-${id}">0%</output></div>`).join('')}<div class="save-row"><button class="pill" data-action="save-project">↓ SAVE PROJECT</button><label class="pill" style="cursor:pointer">↑ LOAD PROJECT<input type="file" id="projectInput" class="visually-hidden" accept="application/json,.json"></label></div></section>
 <section class="panel" data-section="rec"><div class="section-line"><h2 class="section-title">Capture the moment</h2><span class="section-meta">STUDIO RECORDER</span></div><div class="big-record" id="recordCard"><div class="record-circle"></div><div><strong id="recordTitle">Ready to record</strong><span id="recordSubtitle">Включи PLAY и нажми REC</span></div><button class="rec-btn" data-action="record" id="recordButton">● REC</button></div><div class="section-line" style="margin-top:27px"><h2 class="section-title">Export your beat</h2><span class="section-meta">LOSSLESS / WAV</span></div><div class="hint">Рендер текущего паттерна, можно экспортировать без живой записи.</div><div class="export-options"><select id="exportBars" aria-label="Количество тактов"><option value="4">4 BARS</option><option value="8">8 BARS</option><option value="16">16 BARS</option></select><button id="wavButton" class="primary-action" data-action="export">↓ EXPORT WAV</button></div><div class="file-list" id="fileList" aria-live="polite"></div></section>
 </main>
 <aside class="side-column"><section class="sidebar-card"><div class="sidebar-title">CURRENT SOUND</div><div class="current">ACTIVE GENRE</div><h3 id="currentGenre">RAW TECHNO</h3><p>One engine. No decks. Play, sequence, record and export. Nothing in your way.</p><div class="progress" id="progressBar">${Array.from({length:16},()=>'<i></i>').join('')}</div></section><section class="sidebar-card"><div class="sidebar-title">PLAYBACK</div><div class="side-track">BAR <span id="barValue">01</span></div><div class="side-track" style="margin-top:12px">STEP <span id="stepValue">—</span></div><div class="side-track" style="margin-top:12px">SOUND <span>16 VOICES</span></div></section><section class="sidebar-card"><div class="sidebar-title">QUICK HELP</div><p>PLAY запускает секвенсор. Пэды играют независимо. REC записывает живой микс. WAV создаёт аудиофайл даже без записи.</p></section></aside>
 </div><footer class="foot"><span>ARTSS SOUNDLAB / SINGLE ENGINE</span><span>v8.0 • iOS & ANDROID</span></footer>
</div>
<nav class="mobile-nav" aria-label="Мобильная навигация">${(['live','seq','kits','mix','rec'] as Panel[]).map(p=>`<button data-panel="${p}" aria-selected="${p==='live'}"><span>${icon[p]}</span>${{live:'PADS',seq:'SEQ',kits:'KITS',mix:'MIX',rec:'REC'}[p]}</button>`).join('')}</nav>
<div id="toast" role="status" aria-live="polite" hidden></div>`;
root.innerHTML=html;
function $(selector:string){return document.querySelector<HTMLElement>(selector);}
function switchPanel(next:Panel){panel=next;document.querySelectorAll<HTMLElement>('[data-panel]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===panel)));
 document.querySelectorAll<HTMLElement>('[data-section]').forEach(s=>s.classList.toggle('active',s.dataset.section===panel));
 if(window.innerWidth<=850)window.scrollTo({top:0,behavior:'instant'});
}
function refreshTransport(){const $b=$('#bpmValue');if($b)$b.textContent=String(Math.round(engine.state.bpm));const p=$('#playButton');p?.classList.toggle('active',engine.playing);if($('#playText'))$('#playText')!.textContent=engine.playing?'PAUSE':'PLAY';if($('#playGlyph'))$('#playGlyph')!.textContent=engine.playing?'Ⅱ':'▶';
 $('#audioStatus')?.classList.toggle('on',engine.playing);if($('#audioStatus'))$('#audioStatus')!.textContent=engine.playing?'AUDIO LIVE':'AUDIO READY';}
function refreshTrack(){const grid=$('#trackGrid');if(!grid)return;
 grid.innerHTML=TRACKS.map((t,i)=>`<button class="track-button ${selected===i?'active':''}" data-track="${i}" title="${t.name}">${t.name}</button>`).join('');
 if($('#trackLabel'))$('#trackLabel')!.textContent=TRACKS[selected].name;
 const steps=$('#stepGrid');if(!steps)return;steps.innerHTML=engine.state.pattern[selected].map((v,i)=>`<button class="step ${v>0?'active':''} ${i===activeStep?'now':''}" data-step="${i}" aria-label="Шаг ${i+1}" aria-pressed="${v>0}">${String(i+1).padStart(2,'0')}</button>`).join('');
}
function refreshGenre(){if($('#currentGenre'))$('#currentGenre')!.textContent=engine.state.genre;
 const list=$('#genreList');if(!list)return;
 list.innerHTML=GENRES.map((g,i)=>`<button class="genre-card ${engine.state.genre===g?'active':''}" data-genre="${g}" aria-pressed="${engine.state.genre===g}"><span class="genre-meta">${String(i+1).padStart(2,'0')} / ORIGINAL BEATS</span><strong>${g}</strong></button>`).join('');
}
function refreshFx(){for(const key of ['master','filter','swing'] as const){const e=document.querySelector<HTMLInputElement>(`#fx-${key}`);const v=Math.round(engine.state[key]*100);if(e)e.value=String(v);if($(`#out-${key}`))$(`#out-${key}`)!.textContent=`${v}%`;}}
function refreshStep(step:number,bar:number){activeStep=step;activeBar=bar;const values=document.querySelectorAll<HTMLElement>('#progressBar i');values.forEach((node,i)=>node.classList.toggle('active',i===step));
 document.querySelectorAll<HTMLElement>('#stepGrid .step').forEach((node,i)=>node.classList.toggle('now',i===step));
 if($('#barValue'))$('#barValue')!.textContent=String(bar+1).padStart(2,'0');if($('#stepValue'))$('#stepValue')!.textContent=step<0?'—':String(step+1).padStart(2,'0');}
function flashPad(slot:number){const p=document.querySelector<HTMLElement>(`[data-pad="${slot}"]`);if(!p)return;p.classList.add('hit');window.setTimeout(()=>p.classList.remove('hit'),115);}
async function playPad(slot:number){flashPad(slot);try{await engine.pad(slot);$('#audioStatus')?.classList.add('on');if($('#audioStatus'))$('#audioStatus')!.textContent='AUDIO READY';}catch(e){toast(e instanceof Error?e.message:'Sound unavailable');}}
function snapshot(){previous=engine.state.pattern.map(r=>r.slice());}
function updatePattern(){save();refreshTrack();}
function addFile(blob:Blob,extension:string,prefix='ARTSS-SOUNDLAB'){const url=URL.createObjectURL(blob);recordedUrls.push(url);
 const list=$('#fileList');if(!list)return;const div=document.createElement('div');div.className='file-entry';
 const label=document.createElement('span');label.textContent=`${prefix} • ${(blob.size/1024/1024).toFixed(1)} MB`;
 const anchor=document.createElement('a');anchor.href=url;anchor.download=`${prefix}-${new Date().toISOString().slice(0,19).replaceAll(':','-')}.${extension}`;anchor.textContent='DOWNLOAD ↗';
 div.append(label,anchor);list.prepend(div);
}
async function action(name:string){switch(name){
 case 'play':try{if(engine.playing)engine.stop();else await engine.play();}catch(e){toast(e instanceof Error?e.message:'PLAY failed');}break;
 case 'stop':engine.stop();break;
 case 'bpm-up':engine.state.bpm=clamp(engine.state.bpm+1,60,200);save();refreshTransport();break;
 case 'bpm-down':engine.state.bpm=clamp(engine.state.bpm-1,60,200);save();refreshTransport();break;
 case 'go-seq':switchPanel('seq');break;
 case 'record':try{if(engine.isRecording)engine.stopRecording();else await engine.startRecording();}catch(e){toast(e instanceof Error?e.message:'REC failed');}break;
 case 'export':{const button=document.querySelector<HTMLButtonElement>('#wavButton');if(!button)return;button.disabled=true;button.textContent='RENDERING…';try{const bars=Number(document.querySelector<HTMLSelectElement>('#exportBars')?.value)||4;const wav=await engine.renderWav(bars);addFile(wav,'wav','ARTSS-BEAT');toast('WAV готов. Нажми DOWNLOAD.');}catch(e){toast(e instanceof Error?e.message:'Export failed');}finally{button.disabled=false;button.textContent='↓ EXPORT WAV';}break;}
 case 'undo':if(previous){engine.state.pattern=previous;previous=null;updatePattern();toast('Последнее изменение отменено');}break;
 case 'clear-track':snapshot();engine.state.pattern[selected].fill(0);updatePattern();break;
 case 'randomize':snapshot();{const row=engine.state.pattern[selected];const shift=selected===0?4:1+Math.floor(Math.random()*3);engine.state.pattern[selected]=row.map((_,i)=>row[(i+shift)%16]);updatePattern();toast('Ритм смещён');}break;
 case 'clear-sample':{const slot=Number(document.querySelector<HTMLSelectElement>('#sampleSlot')?.value)||0;engine.clearImported(slot);toast('Заводской звук восстановлен');break;}
 case 'save-project':{const file=new Blob([JSON.stringify({format:'artss-soundlab',version:8,...engine.state})],{type:'application/json'});addFile(file,'json','ARTSS-PROJECT');toast('Проект сохранён');break;}
 }}
engine.onStep=refreshStep;
engine.onTransport=refreshTransport;
engine.onRecording=(recording,blob)=>{const card=$('#recordCard');card?.classList.toggle('recording',recording);$('#quickRecord')?.classList.toggle('active',recording);
 if($('#recordTitle'))$('#recordTitle')!.textContent=recording?'Recording live…':'Ready to record';
 if($('#recordSubtitle'))$('#recordSubtitle')!.textContent=recording?'Захватываем звук с мастер-шины':'Включи PLAY и нажми REC';
 if($('#recordButton'))$('#recordButton')!.textContent=recording?'■ STOP REC':'● REC';
 if(blob&&blob.size>0){addFile(blob,blob.type.includes('wav')?'wav':blob.type.includes('mp4')?'m4a':'webm','ARTSS-LIVE');switchPanel('rec');toast('Запись готова к скачиванию');}
 else if(!recording&&!blob)toast('Запись завершена без аудиоданных');
};
document.addEventListener('pointerdown',event=>{
 const target=event.target as HTMLElement;const btn=target.closest<HTMLButtonElement>('[data-pad]');if(!btn||btn.disabled)return;
 // Immediate audio gesture on iOS: PointerEvent fires before synthetic click.
 event.preventDefault();void playPad(Number(btn.dataset.pad));
});
document.addEventListener('click',event=>{const target=event.target as HTMLElement;
 const btn=target.closest<HTMLButtonElement>('button');if(!btn)return;
 if(btn.dataset.pad!==undefined){if((event as MouseEvent).detail===0)void playPad(Number(btn.dataset.pad));return;}
 if(btn.dataset.panel){switchPanel(btn.dataset.panel as Panel);return;}
 if(btn.dataset.action){void action(btn.dataset.action);return;}
 if(btn.dataset.track!==undefined){selected=Number(btn.dataset.track);refreshTrack();return;}
 if(btn.dataset.step!==undefined){const i=Number(btn.dataset.step);snapshot();engine.state.pattern[selected][i]=engine.state.pattern[selected][i]>0?0:.72;updatePattern();return;}
 if(btn.dataset.genre){const g=btn.dataset.genre as Genre;snapshot();engine.state.genre=g;engine.state.pattern=presetPattern(g);engine.state.bpm=({ 'RAW TECHNO':136, 'HARDGROOVE':139,'DEEP MINIMAL':126,'WAREHOUSE':148,'PHONK':145,'RAVE':150} as Record<Genre,number>)[g];engine.setFx();save();refreshGenre();refreshTrack();refreshTransport();toast(g+' — загружен');}
});
document.querySelectorAll<HTMLInputElement>('input[data-fx]').forEach(el=>el.addEventListener('input',()=>{const key=el.dataset.fx as 'master'|'filter'|'swing';engine.state[key]=Number(el.value)/100;engine.setFx();save();refreshFx();}));
document.querySelector<HTMLInputElement>('#sampleInput')?.addEventListener('change',async e=>{const input=e.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;const slot=Number(document.querySelector<HTMLSelectElement>('#sampleSlot')?.value)||0;try{await engine.setImportedSample(slot,file);toast(TRACKS[slot].name+': импортировано');}catch(err){toast(err instanceof Error?err.message:'Import failed');}finally{input.value='';}});
document.querySelector<HTMLInputElement>('#projectInput')?.addEventListener('change',async e=>{const input=e.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;
 try{if(file.size>200_000)throw Error('Слишком большой проект');const obj=JSON.parse(await file.text());if(obj.format!=='artss-soundlab'||!GENRES.includes(obj.genre)||!Array.isArray(obj.pattern)||obj.pattern.length!==16||!obj.pattern.every((r:unknown)=>Array.isArray(r)&&r.length===16&&r.every((v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Неверный файл проекта');
 engine.state.genre=obj.genre;engine.state.pattern=obj.pattern;engine.state.bpm=clamp(Number(obj.bpm)||136,60,200);for(const k of ['master','filter','swing'] as const)engine.state[k]=clamp(Number(obj[k])||0,0,1);engine.setFx();save();refreshTrack();refreshGenre();refreshTransport();refreshFx();toast('Проект загружен');
 }catch(err){toast(err instanceof Error?err.message:'Ошибка файла');}finally{input.value='';}});
document.addEventListener('keydown',event=>{if(event.repeat||event.altKey||event.metaKey||event.ctrlKey)return;const target=event.target as HTMLElement;if(target.matches('input,textarea,select')||target.isContentEditable)return;
 const index=keys.indexOf(event.key.toLowerCase());if(index>=0){event.preventDefault();void playPad(index);}else if(event.code==='Space'){event.preventDefault();void action('play');}});
window.addEventListener('pagehide',()=>{engine.stop();for(const url of recordedUrls)URL.revokeObjectURL(url);recordedUrls=[];});
refreshGenre();refreshTrack();refreshTransport();refreshFx();
if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>{void navigator.serviceWorker.register('./sw.js').catch(()=>{});});