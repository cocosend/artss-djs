import {STYLES,sanitizeSession,type Pattern} from './model.js';
import {generatePreset,PRESET_COUNT,PRESETS_PER_STYLE} from './presets.js';

type Snapshot={style:number;tempo:number;pattern:Pattern};
type Pocket=Snapshot&{id:string;title:string};
type Vault={active:string;folders:Record<string,Pocket[]>};
const KEY='artss-nexus-preset-vault-v31';
const BASE=['ИЗБРАННОЕ','LIVE SETS','ИДЕИ','АРХИВ'];
const copy=(p:Pattern)=>p.map(row=>row.slice());
function readVault():Vault{
 const vault:Vault={active:BASE[0]!,folders:Object.fromEntries(BASE.map(name=>[name,[]]))};
 try{
  const raw=JSON.parse(localStorage.getItem(KEY)??'null') as {active?:unknown;folders?:unknown}|null;
  if(!raw||!raw.folders||typeof raw.folders!=='object')return vault;
  for(const [name,value] of Object.entries(raw.folders)){
   if(typeof name!=='string'||name.length>24||!Array.isArray(value)||Object.keys(vault.folders).length>=20)continue;
   vault.folders[name]=value.slice(0,128).flatMap((item:unknown):Pocket[]=>{
    if(!item||typeof item!=='object')return [];
    const p=item as Record<string,unknown>;
    if(typeof p.id!=='string'||typeof p.title!=='string'||!Array.isArray(p.pattern))return [];
    const session=sanitizeSession({pattern:p.pattern,style:p.style,tempo:p.tempo});
    return [{id:p.id.slice(0,100),title:p.title.slice(0,50),style:session.style,tempo:session.tempo,pattern:session.pattern}];
   });
  }
  if(typeof raw.active==='string'&&Object.hasOwn(vault.folders,raw.active))vault.active=raw.active;
 }catch{}
 return vault;
}
export function mountPresetVault({apply,capture}:{apply:(snapshot:Snapshot)=>void;capture:()=>Snapshot}):void{
 const node=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
 const number=node<HTMLInputElement>('presetNumber'),genre=node<HTMLSelectElement>('presetGenre');
 const folder=node<HTMLSelectElement>('presetFolder'),list=node<HTMLElement>('presetItems');
 const status=node<HTMLElement>('presetStatus'),name=node<HTMLInputElement>('folderName'),title=node<HTMLInputElement>('presetTitle');
 const vault=readVault();let current=0;
 const notify=(message:string)=>{status.textContent=message};
 const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(vault))}catch{notify('Нет места для сохранения. Экспортируй записи.')}};
 const renderFolders=()=>{
  folder.replaceChildren(...Object.keys(vault.folders).map(label=>{const option=document.createElement('option');option.value=label;option.textContent=label;return option}));
  folder.value=vault.active;
 };
 const renderItems=()=>{
  const entries=vault.folders[vault.active]??[];
  list.replaceChildren();
  for(const item of entries){
   const row=document.createElement('div');row.className='pocket-item';
   const label=document.createElement('span');label.textContent=item.title+' · '+(STYLES[item.style]?.name??'LIVE')+' · '+item.tempo+' BPM';
   const load=document.createElement('button');load.type='button';load.textContent='▶';load.setAttribute('aria-label','Загрузить '+item.title);
   load.addEventListener('click',()=>{apply({style:item.style,tempo:item.tempo,pattern:copy(item.pattern)});notify('Загружено из папки '+vault.active)});
   const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Удалить '+item.title);
   remove.addEventListener('click',()=>{vault.folders[vault.active]=entries.filter(saved=>saved.id!==item.id);persist();renderItems()});
   row.append(label,load,remove);list.append(row);
  }
  if(!entries.length){const empty=document.createElement('p');empty.className='dim';empty.textContent='Папка пуста · сохрани сюда свой ритм';list.append(empty)}
 };
 const setCurrent=(id:number)=>{
  current=Math.max(0,Math.min(PRESET_COUNT-1,Math.trunc(Number.isFinite(id)?id:0)));
  number.value=String(current+1);genre.value=String(Math.floor(current/PRESETS_PER_STYLE));
  notify('№ '+String(current+1).padStart(7,'0')+' · '+STYLES[Math.floor(current/PRESETS_PER_STYLE)]!.name);
 };
 genre.replaceChildren(...STYLES.map((style,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=style.name;return option}));
 number.max=String(PRESET_COUNT);number.min='1';number.step='1';
 node<HTMLElement>('presetCount').textContent=PRESET_COUNT.toLocaleString('ru-RU');
 node<HTMLButtonElement>('presetApply').addEventListener('click',()=>{
  const generated=generatePreset(current);
  apply({style:generated.style,tempo:STYLES[generated.style]!.bpm,pattern:generated.pattern});
  notify('Генеративный пресет № '+(current+1)+' загружен');
 });
 node<HTMLButtonElement>('presetRandom').addEventListener('click',()=>{
  const random=new Uint32Array(1);
  const seed=typeof crypto!=='undefined'&&crypto.getRandomValues?crypto.getRandomValues(random)[0]!:Math.floor(Math.random()*0xffffffff);
  setCurrent(Number(genre.value)*PRESETS_PER_STYLE+(seed%PRESETS_PER_STYLE));
 });
 number.addEventListener('change',()=>{const value=Number(number.value);setCurrent(Number.isSafeInteger(value)?value-1:current)});
 genre.addEventListener('change',()=>setCurrent(Number(genre.value)*PRESETS_PER_STYLE+(current%PRESETS_PER_STYLE)));
 folder.addEventListener('change',()=>{vault.active=folder.value;persist();renderItems()});
 node<HTMLButtonElement>('folderCreate').addEventListener('click',()=>{
  const label=name.value.trim().replace(/[<>]/g,'').slice(0,24);
  if(!label){notify('Укажи название папки');return}
  if(!Object.hasOwn(vault.folders,label)&&Object.keys(vault.folders).length>=20){notify('Максимум 20 папок');return}
  vault.folders[label]??=[];vault.active=label;name.value='';persist();renderFolders();renderItems();notify('Папка '+label+' создана');
 });
 node<HTMLButtonElement>('presetSave').addEventListener('click',()=>{
  const entries=vault.folders[vault.active]??[];
  if(entries.length>=128){notify('Папка заполнена: 128 пресетов');return}
  const snapshot=capture(),safe=sanitizeSession(snapshot);
  const label=title.value.trim().slice(0,50)||'LIVE '+new Date().toLocaleString('ru-RU');
  const id=typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():String(Date.now())+'-'+Math.random();
  entries.unshift({id,title:label,style:safe.style,tempo:safe.tempo,pattern:copy(safe.pattern)});
  vault.folders[vault.active]=entries;title.value='';persist();renderItems();notify('Сохранено в '+vault.active);
 });
 renderFolders();renderItems();setCurrent(0);
}
