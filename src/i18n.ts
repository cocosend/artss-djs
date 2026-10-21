export type Language='ru'|'en';
const KEY='artss-nexus-language-v1';
let current:Language='ru';
try{current=localStorage.getItem(KEY)==='en'?'en':'ru'}catch{}
export const language=()=>current;
export const t=(ru:string,en:string)=>current==='en'?en:ru;
export function setLanguage(value:Language):void{
 current=value;
 try{localStorage.setItem(KEY,value)}catch{}
 document.documentElement.lang=value;
}
const lexicon=new Map<string,string>([
 ["Один движок · одна студия","One engine · one creative workspace"],
 ["+ УПРАВЛЕНИЕ ЗВУКАМИ","+ MANAGE PAD SOUNDS"],
 ["● ЗАПИСЬ","● RECORDING"],
 ["◉ ЗАПИСАТЬ СЭМПЛ","◉ RECORD A SAMPLE"],
 ["⚙ НАСТРОЙКИ","⚙ SETTINGS"],
 ["≋ МИКШЕР И FX","≋ MIX & FX"],
 ["♫ СТИЛИ","♫ STYLES"],
 ["ПУСК","PLAY"],
 ["ПАУЗА","PAUSE"],
 ["СТОП","STOP"],
 ["ЗАПИСЬ","RECORD"],
 ["СИГНАЛ","SIGNAL"],
 ["СТЕРЕО · АУДИО","STEREO · AUDIO"],
 ["ГОТОВО","READY"],
 ["СТИЛЬ","STYLE"],
 ["СЦЕНА","SCENE"],
 ["ЗАДАТЬ ТЕМП","TAP TEMPO"],
 ["СЛУЧАЙНЫЙ","RANDOM"],
 ["РИТМ","GROOVE"],
 ["СОЗДАТЬ РИТМ","CREATE GROOVE"],
 ["АВТОРИТМ","AUTO GENERATE"],
 ["ИЗМЕНИТЬ","EDIT"],
 ["ПЛОТНОСТЬ","DENSITY"],
 ["↶ ОТМЕНИТЬ","↶ UNDO"],
 ["ДРАМ-ПЭДЫ","DRUM PADS"],
 ["ШАГОВЫЙ СЕКВЕНСОР","STEP SEQUENCER"],
 ["Все восемь звуковых пэдов","All eight playable pads"],
 ["DRUMS","DRUMS"],
 ["РЕДАКТОР ПЭДА","PAD EDITOR"],
 ["НИЗ","LOW"],
 ["СЕР","MID"],
 ["ВЕРХ","HIGH"],
 ["МИКС","MIX"],
 ["ИСТОЧНИК","SOURCE"],
 ["ЗВУК ПЭДОВ","PAD MIX"],
 ["НАЧАТЬ","START"],
 ["ДОБАВИТЬ СЭМПЛ","ADD SAMPLE"],
 ["Импорт WAV · MP3 · AAC","Import WAV · MP3 · AAC"],
 ["+ ЗАПИСЬ / ИМПОРТ СЭМПЛА","+ RECORD / IMPORT SAMPLE"],
 ["ЦЕЛЬ · ПЭД 01","TARGET · PAD 01"],
 ["8 ПЭДОВ · ЗАМЕНА / ВОССТАНОВЛЕНИЕ","8 PADS · REPLACE / RESTORE"],
 ["ЗВУКИ","SOUNDS"],
 ["ЗВУКИ ПЭДОВ","PAD SOUNDS"],
 ["ТОЛЬКО РУЧНАЯ ЗАМЕНА","MANUAL REPLACEMENT ONLY"],
 ["Оригинальные звуки сохраняются при смене стиля. Замена только вручную.","Factory pad sounds never change with styles. Replace only when you choose to."],
 ["ВЫБРАТЬ ПЭД","SELECT PAD"],
 ["ОРИГИНАЛ · БОЧКА","ORIGINAL · KICK"],
 ["＋ ЗАМЕНИТЬ ЗВУКОМ","＋ REPLACE SAMPLE"],
 ["↶ ВОССТАНОВИТЬ ОРИГИНАЛ","↶ RESTORE ORIGINAL"],
 ["Свои звуки сохраняются для выбранного стиля. Восстановление удаляет замену.","Your samples are stored per style. Restore Original removes only that pad replacement."],
 ["МИКС И FX","MIX & FX"],
 ["ЭКВАЛАЙЗЕР · ФИЛЬТР · ЭХО · 8 КАНАЛОВ","EQ · FILTER · ECHO · 8 CHANNELS"],
 ["МИКШЕР И ЭФФЕКТЫ","MIXER & EFFECTS"],
 ["ОБРАБОТКА В РЕАЛЬНОМ ВРЕМЕНИ","REAL-TIME DSP"],
 ["МАСТЕР-ФИЛЬТР","MASTER FILTER"],
 ["ОТКРЫТ","OPEN"],
 ["ЭХО","ECHO"],
 ["ДУБЛИ · WAV · ВЫСТУПЛЕНИЕ","TAKES · WAV · PERFORMANCE"],
 ["ЗАПИСЬ ВЫСТУПЛЕНИЯ","PERFORMANCE RECORDING"],
 ["ЛОКАЛЬНЫЙ ПРОЕКТ","LOCAL PROJECT"],
 ["● ЗАПИСАТЬ АУДИО","● RECORD AUDIO"],
 ["↓ ЭКСПОРТ WAV · 4 ТАКТА","↓ EXPORT WAV · 4 BARS"],
 ["ОЧИСТИТЬ ТЕКУЩИЙ РИТМ","CLEAR CURRENT PATTERN"],
 ["ПРЕСЕТЫ","PRESETS"],
 ["12 МУЗЫКАЛЬНЫХ СТИЛЕЙ","12 MUSIC STYLES"],
 ["БИБЛИОТЕКА ЗВУКОВ","SOUND LIBRARY"],
 ["12 СТИЛЕЙ · ЛОКАЛЬНЫЕ СЭМПЛЫ","12 STYLES · LOCAL SAMPLES"],
 ["+ ИМПОРТ СЭМПЛА","+ IMPORT SAMPLE"],
 ["ПРОЕКТ","PROJECT"],
 ["ЛИЧНЫЕ НАСТРОЙКИ","LOCAL SETTINGS"],
 ["ЛИЧНАЯ СТУДИЯ НА УСТРОЙСТВЕ","PRIVATE ON-DEVICE STUDIO"],
 ["Все ритмы, сэмплы и записи остаются на устройстве. Регистрация не нужна.","All grooves, samples and takes stay on your device. No account required."],
 ["ОТКРЫТЬ ЗАПИСЬ","OPEN RECORDER"],
 ["СОЗДАТЬ","CREATE"],
 ["ИГРАТЬ","PERFORM"],
 ["ПЭДЫ","PADS"],
 ["ОТКР. ХЭТ","OPEN HAT"],
 ["БОЧКА","KICK"],
 ["САБ","SUB"],
 ["ХЛОПОК","CLAP"],
 ["ХЭТ","HAT"],
 ["ПЕРК","PERC"],
 ["ЭЙСИД","ACID"],
 ["УДАР","HIT"],
 ["РУ","RU"],
 ["АВТОМИКС","AUTO MIX"],
 ["БАНКИ ПЭДОВ · ПЛАВНЫЙ ПЕРЕХОД","PAD BANKS · SMOOTH TRANSITION"],
 ["ФРАЗЫ · БЕЗ СМЕНЫ ЗВУКОВ","PHRASES · SAME PAD SOUNDS"],
 ["Открыть меню","Open menu"],
 ["Импортировать сэмпл","Import sample"],
 ["Настройки","Settings"],
 ["Запустить или приостановить","Start or pause playback"],
 ["Запись исполнения в луп","Record pad hits to a loop"],
 ["Стоп","Stop"],
 ["Низкие частоты, децибелы","Low frequencies, dB"],
 ["Средние частоты, децибелы","Mid frequencies, dB"],
 ["Высокие частоты, децибелы","High frequencies, dB"],
 ["Банки паттернов","Pattern banks"],
 ["Стиль музыки","Music style"],
 ["Темп BPM","Tempo BPM"],
 ["Сцена","Scene"],
 ["Мастер фильтр","Master filter"],
 ["Плотность ритма","Groove density"],
 ["Источник записи сэмпла","Sample recording source"],
 ["Редактируемый 16-шаговый ритм","Editable 16-step pattern"],
 ["Навигация","Navigation"],
 ["Инструменты студии","Studio tools"],
 ["Пэд для замены","Pad to replace"],
 ["Запись собственного сэмпла","Record your own pad sample"],
 ["Панель воспроизведения и записи","Playback and recording"],
 ["Стиль темп и сцена","Style, tempo and scene"],
 ["Создание ритма","Groove creation"],
 ["Эквалайзер и кроссфейдер","EQ and crossfader"],
 ["Предыдущий стиль","Previous style"],
 ["Следующий стиль","Next style"],
 ["Предыдущая сцена","Previous scene"],
 ["Следующая сцена","Next scene"],
 ["Увеличить BPM","Increase BPM"],
 ["Уменьшить BPM","Decrease BPM"],
 ["Живая осциллограмма стереовыхода","Live stereo output waveform"],
 ["Шаги с 1 по 8","Steps 1 through 8"],
 ["Шаги с 9 по 16","Steps 9 through 16"],
 ["Редактирование всех пэдов","Edit all pads"]
]);
const sourceNodes=new WeakMap<Text,string>();
const attributeValues=new WeakMap<Element,Map<string,string>>();
/** Preserve original Russian authored text; update only leaf text nodes, never HTML or handlers. */
export function translateStatic(root:Element):void{
 document.documentElement.lang=current;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let item:Node|null;
 while((item=walker.nextNode())){
  const node=item as Text,parent=node.parentElement;
  if(!parent||parent.closest('#pads,#steps,#patternOverview,#mixRows,#libraryStyles,#takesList,#trackName,#status,#bpm,#selectedPad,#sampleRecordHint,#soundInfo,#transportTime,#runState,#filterValue,#echoValue,#deviceStatus,#autoMixCaption,#autoMix,#take,#sampleStart,#sampleStop,#play .deck-label,#record .deck-label'))continue;
  if(parent.closest('script,style'))continue;
  const original=sourceNodes.get(node)??node.nodeValue??'';
  if(!sourceNodes.has(node))sourceNodes.set(node,original);
  const label=original.trim(),translated=lexicon.get(label)??label;
  if(translated!==label){
   const before=original.match(/^\s*/)?.[0]??'',after=original.match(/\s*$/)?.[0]??'';
   node.nodeValue=before+(current==='en'?translated:label)+after;
  }
 }
 for(const element of root.querySelectorAll('[aria-label],[title],[placeholder]')){
  let saved=attributeValues.get(element);
  if(!saved){saved=new Map();attributeValues.set(element,saved);}
  for(const attr of ['aria-label','title','placeholder']){
   const value=element.getAttribute(attr);if(value===null)continue;
   if(!saved.has(attr))saved.set(attr,value);
   const origin=saved.get(attr)??value;
   element.setAttribute(attr,current==='en'?lexicon.get(origin)??origin:origin);
  }
 }
}
