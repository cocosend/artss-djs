import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Original four-bar stems are rendered at build time and served as real WAVs.
// Runtime never synthesizes a missing instrument or substitutes a new pad sound.
const rate=22050,out=join(process.cwd(),'dist','samples','hooks');
const presets=[
 ['festival',128,[[57,60,64],[53,57,60],[60,64,67],[55,59,62]],[0,2,2.75,4,6,7,8,10,10.75,12,14,15]],
 ['house',124,[[48,52,55],[53,57,60],[55,59,62],[52,55,59]],[0,1.5,2.5,3.5,4,5.5,6.5,7.5,8,9.5,10.5,11.5,12,13.5,14.5,15.5]],
 ['trance',138,[[52,55,59],[48,52,55],[55,59,62],[50,54,57]],Array.from({length:32},(_,i)=>i/2)],
 ['future',150,[[55,59,62],[50,54,57],[52,55,59],[48,52,55]],[0,.75,2.5,3.25,4,4.75,6.5,7.25,8,8.75,10.5,11.25,12,12.75,14.5,15.25]]
];
function addNote(phrase,start,midi,duration,amplitude,shape){
 const hz=440*2**((midi-69)/12),size=Math.min(Math.floor(duration*rate),phrase.length-start);
 for(let i=0;i<size;i++){
  const t=i/rate,phase=2*Math.PI*hz*t;
  const tone=Math.sin(phase)+.22*Math.sin(2*phase)+.08*Math.sin(3*phase);
  const decay=shape==='piano'?5.5:shape==='pluck'?4.3:2.4;
  const envelope=(1-Math.exp(-t*105))*Math.exp(-t*decay)*Math.max(0,Math.min(1,(duration-t)*110));
  phrase[start+i]+=tone*envelope*amplitude;
 }
}
await mkdir(out,{recursive:true});
for(const [name,bpm,chords,events] of presets){
 const beat=60/bpm,frames=Math.floor(16*beat*rate),phrase=new Float32Array(frames);
 const shape={festival:'lead',house:'piano',trance:'pluck',future:'lead'}[name];
 for(const position of events){
  const chord=chords[Math.min(3,Math.floor(position/4))],start=Math.floor(position*beat*rate);
  const voices=name==='trance'?[chord[(Math.floor(position*2)+1)%3]+12]:name==='house'?chord:name==='future'?[chord[0],chord[1]+12,chord[2]+12]:[chord[0]+12,chord[2]+12];
  for(const pitch of voices)addNote(phrase,start,pitch,Math.min(name==='house'?.31:.42,(frames-start)/rate),.11/voices.length,shape);
 }
 for(let position=0;position<16;position++){
  if(name==='future'?position%4!==0&&position%4!==3:position%2!==0)continue;
  const start=Math.floor(position*beat*rate);
  addNote(phrase,start,chords[Math.floor(position/4)][0]-12,Math.min(.3,(frames-start)/rate),.18,'pluck');
 }
 let peak=0;for(const value of phrase)peak=Math.max(peak,Math.abs(value));
 const scale=Math.min(1,.43/Math.max(peak,1e-6));
 const wav=Buffer.alloc(44+frames*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++){const fade=Math.min(1,i/160,(frames-1-i)/160);wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,phrase[i]*fade*scale))*32767),44+i*2);}
 await writeFile(join(out,`${name}.wav`),wav);
}
