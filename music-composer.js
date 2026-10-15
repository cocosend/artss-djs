/**
 * ARTSS composition engine v7.5.
 * Deterministic eight-bar phrases; genre-specific rhythm, melodic counterpoint and
 * harmonic movements. Shared by transport, live pads and offline WAV rendering.
 * No timers, random calls, network or audio allocations on the scheduling path.
 */
export const TONAL_ROWS=[1,4,8,9,11];

const SCALES={
 minor:[0,2,3,5,7,8,10],
 dorian:[0,2,3,5,7,9,10],
 phrygian:[0,1,3,5,7,8,10],
 harmonic:[0,2,3,5,7,8,11],
 blues:[0,3,5,6,7,10],
 pentatonic:[0,3,5,7,10]
};
const ROOTS=[-10,-8,-7,-5,-3,-2,0,2,3,5];
const MOTIFS=[
 [0,2,3,5,3,2,0,4],[0,3,2,1,4,2,5,1],
 [0,1,4,3,2,5,3,1],[0,4,2,5,3,1,2,0],
 [0,2,5,4,1,3,2,4],[0,3,5,2,4,1,3,0],
 [0,5,3,2,1,4,2,3],[0,2,1,5,4,3,5,1],
 [0,4,3,1,5,2,1,4],[0,1,3,2,5,4,2,0],
 [0,5,4,3,1,2,4,1],[0,2,4,1,3,5,1,2]
];
const GROOVES={
 ROLLING:[[2,5,10,13],[2,5,7,10,14],[1,6,9,13,15],[3,6,11,14],[2,7,10,15]],
 TECHNO:[[2,6,10,14],[1,3,7,10,14],[0,3,6,10,13],[2,5,8,11,15],[3,7,9,13,15]],
 HARD:[[0,3,6,8,11,14],[2,6,10,14],[0,2,7,8,12,15],[1,4,6,9,12,14],[3,6,8,11,15]],
 PHONK:[[2,5,8,11,14],[0,3,7,10,14],[1,4,7,11,15],[2,6,9,12,15]],
 RAVE:[[0,4,8,12],[2,5,10,13],[0,3,6,9,12,15],[1,5,8,11,14],[2,6,10,14]]
};
const PROGRESSIONS={
 ROLLING:[[0,0,3,4],[0,4,3,0],[0,3,5,1],[0,5,3,4]],
 TECHNO:[[0,3,4,3],[0,5,3,4],[0,4,1,3],[0,3,1,4]],
 HARD:[[0,5,4,3],[0,3,5,4],[0,4,3,5]],
 PHONK:[[0,3,0,4],[0,4,3,0],[0,5,3,4]],
 RAVE:[[0,5,3,4],[0,3,4,5],[0,4,5,3],[0,3,5,1]]
};
const cache=new Map();
function hash32(s){
 let h=2166136261;
 for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}
 h^=h>>>16;h=Math.imul(h,2246822507);h^=h>>>13;h=Math.imul(h,3266489909);
 return (h^(h>>>16))>>>0;
}
function pick(key,salt,size){return hash32(key+'|'+salt)%size;}
function positions(values,shift=0){return new Set(values.map(v=>(v+shift)&15));}
function degreeToSemitone(scale,index){
 const n=scale.length;
 return scale[((index%n)+n)%n]+12*Math.floor(index/n);
}
const styleFor=p=>p.category==='ROLLING'?'ROLLING':p.category==='PHONK'?'PHONK':p.category==='HARD'?'HARD':p.category==='RAVE'?'RAVE':'TECHNO';
function buildIdentity(p,variation){
 const style=styleFor(p),key=String(p.id||p.seed||'default')+'|'+Math.floor(variation);
 const scaleName=style==='PHONK'?(pick(key,'mode',2)?'blues':'pentatonic'):
  p.bass==='acid'?(pick(key,'mode',3)===0?'minor':'phrygian'):
  style==='RAVE'?(pick(key,'mode',3)?'harmonic':'minor'):
  style==='ROLLING'?(pick(key,'mode',3)?'dorian':'minor'):
  style==='HARD'?(pick(key,'mode',2)?'phrygian':'harmonic'):
  ['minor','dorian','phrygian'][pick(key,'mode',3)];
 const shape=MOTIFS[pick(key,'motif',MOTIFS.length)];
 const bounce=pick(key,'jump',4),answer=pick(key,'answer',5);
 const hook=Array.from({length:16},(_,i)=>{
  const base=shape[(i+(pick(key,'rotate',4)*2))%8];
  return i<8?base:(base+answer+(i%3===0?bounce:0))%7;
 });
 const base=GROOVES[style][pick(key,'groove',GROOVES[style].length)];
 const extra=pick(key,'extra',8);
 const bass=positions([...base,extra],pick(key,'sync',3));
 // Guarantee a characteristic first-beat note and a strong bass pulse in every riff.
 bass.add(style==='ROLLING'?2:style==='PHONK'?3:0);
 const leadBase=style==='RAVE'?[0,3,6,8,12,14]:style==='PHONK'?[3,7,10,14]:
  style==='HARD'?[0,6,8,14]:style==='ROLLING'?[0,7,11]:[0,4,9,12];
 const lead=positions(leadBase,pick(key,'leadshift',3));
 const acidBase=style==='TECHNO'?[1,3,6,9,11,14]:
  style==='RAVE'?[3,7,11,15]:[2,6,10,14];
 const acid=positions(acidBase,pick(key,'acidshift',3));
 const sub=positions([0,8,12],pick(key,'subshift',2));
 const cow=positions(style==='PHONK'?[2,5,8,11,14]:[4,12],pick(key,'cowshift',2));
 const progression=PROGRESSIONS[style][pick(key,'progression',PROGRESSIONS[style].length)];
 return {
  seed:hash32(key),style,scale:SCALES[scaleName],scaleName,
  root:ROOTS[pick(key,'root',ROOTS.length)],
  hook,progression,bass,lead,acid,sub,cow,
  accent:pick(key,'accent',4),answer,interval:pick(key,'counterpoint',4),
  phraseTurn:pick(key,'phrase-turn',3),timbre:pick(key,'timbre',8),
  mode:pick(key,'bass-mode',4)
 };
}
export function musicIdentity(p,variation=0){
 const key=String(p.id||p.seed||'default')+'|'+Math.floor(variation);
 if(cache.has(key))return cache.get(key);
 const value=buildIdentity(p,variation);
 if(cache.size>=64)cache.delete(cache.keys().next().value);
 cache.set(key,value);
 return value;
}
export function melodyPitch(p,slot,step,bar=0,scene='GROOVE',variation=0){
 if(!TONAL_ROWS.includes(slot))return 0;
 const c=musicIdentity(p,variation),phrase=((bar%8)+8)%8,beat=((step%16)+16)%16;
 const chord=c.progression[Math.floor(phrase/2)];
 // Answer bars change the contour, not merely the tonic.
 const answer=(phrase&1)?(c.answer%3)-1:0;
 const turnaround=phrase>=6&&beat>=8?c.phraseTurn:0;
 const motif=c.hook[(beat+(phrase%4===3?2:0))&15];
 const degree=slot===1?chord:
  slot===4?motif+chord+answer+turnaround:
  slot===8?c.hook[(beat+3)&15]+chord+c.interval:
  slot===9?c.hook[(beat+7)&15]+chord+2+answer:
  c.hook[(beat+5)&15]+chord+3;
 const semitone=degreeToSemitone(c.scale,degree);
 const register=slot===1?0:slot===4?-3:slot===8?0:slot===9?3:2;
 const sceneShift=scene==='DROP'&&slot===9?2:scene==='BUILD'&&slot===8?1:0;
 const pitch=c.root+semitone+register+sceneShift;
 // Keep sub and bass fundamentals audible on phone speakers while preserving notes.
 const limits=slot===1?[-11,10]:slot===4?[-15,14]:slot===8?[-9,20]:slot===9?[-7,22]:[-8,22];
 return Math.max(limits[0],Math.min(limits[1],pitch));
}
export function composeMelodicGrid(grid,p,scene='GROOVE',variation=0){
 for(const row of TONAL_ROWS)grid[row].fill(0);
 if(scene==='INTRO')return grid;
 const c=musicIdentity(p,variation),energy=Math.max(.1,Math.min(1,p.intensity||.5));
 const isBreak=scene==='BREAK';
 const leadScale=c.style==='RAVE'||c.style==='HARD'?1:c.style==='PHONK'?.8:.65;
 for(let step=0;step<16;step++){
  const emphasis=step%4===0?.13:step%4===2?.07:0;
  if(c.bass.has(step)&&(!isBreak||step%8===0))
   grid[4][step]=Math.min(.94,.49+energy*.2+emphasis+((step+c.accent)%5===0?.07:0));
  if(c.sub.has(step)&&!isBreak)grid[1][step]=.14+energy*.13;
  if(c.style==='PHONK'&&c.cow.has(step)&&(!isBreak||step%8===0))
   grid[11][step]=.29+energy*.29+emphasis;
  if((c.style==='TECHNO'||p.bass==='acid'||c.style==='RAVE')&&c.acid.has(step)&&!isBreak)
   grid[8][step]=.26+energy*.29+emphasis;
  if(c.lead.has(step)&&(c.style!=='ROLLING'||step%4!==2)&&(!isBreak||step%8===0))
   grid[9][step]=Math.min(.8,(.2+energy*.31+emphasis)*leadScale);
 }
 if(scene==='BUILD'){
  grid[4][14]=.48+energy*.2;
  if(c.style==='RAVE'||c.style==='HARD')grid[9][15]=.45;
  else grid[8][15]=.35;
 }
 if(scene==='DROP'){
  grid[4][0]=.9;grid[4][12]=.7;
  if(c.style!=='ROLLING')grid[9][0]=.6+energy*.18;
  if(c.style==='TECHNO')grid[8][8]=.54;
 }
 if(isBreak){
  grid[4][0]=.38;grid[9][8]=c.style==='RAVE'?.39:.22;
  grid[1].fill(0);grid[8].fill(0);
 }
 return grid;
}
/** Add style-specific percussion detail without altering the four-on-the-floor foundation. */
export function arrangeDrums(grid,p,scene='GROOVE',variation=0){
 if(scene==='INTRO')return grid;
 const c=musicIdentity(p,variation);
 const seed=c.seed;
 const v=Math.max(.1,Math.min(1,p.intensity||.5));
 for(let step=0;step<16;step++){
  if(scene==='BREAK'&&step%4!==0)continue;
  const accent=(step+c.accent)%4===0;
  if(c.style==='ROLLING'){
   if((step+c.accent)%4===2)grid[3][step]=.28+v*.16;
   if(step===7||step===15)grid[12][step]=.18+v*.12;
  }else if(c.style==='PHONK'){
   if((step+c.accent)%4===3)grid[3][step]=.2+v*.2;
   if((step+(seed%3))%6===0)grid[6][step]=.19+v*.18;
  }else if(c.style==='HARD'){
   if(accent)grid[6][step]=Math.max(grid[6][step],.2+v*.28);
   if(step===7||step===15)grid[12][step]=.24+v*.12;
  }else if(c.style==='RAVE'){
   if((step+c.accent)%4===3)grid[7][step]=.23+v*.17;
   if(step===15)grid[6][step]=.22+v*.18;
  }else{
   if((step+c.accent)%4===3)grid[12][step]=.22+v*.13;
   if((step+seed%5)%7===0)grid[3][step]=.2+v*.13;
  }
 }
 if(scene==='BUILD'){grid[6][13]=.33;grid[6][15]=.5;}
 if(scene==='DROP'){grid[15][0]=.68+v*.18;}
 return grid;
}
