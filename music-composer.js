/**
 * Deterministic techno composer. Every factory preset has a keyed, scale-constrained
 * riff and distinct scene dynamics; the same note data drives live and offline WAV.
 * No randomness on the audio scheduling path.
 */
export const TONAL_ROWS=[1,4,8,9,11];
const HOOKS=[
 [0,-1,2,-1,4,-1,2,5,4,-1,2,-1,1,2,-1,0],
 [0,-1,-1,3,4,-1,3,-1,2,-1,4,-1,3,1,-1,-1],
 [0,2,-1,-1,4,-1,3,2,-1,5,-1,4,2,-1,1,-1],
 [0,-1,0,-1,3,5,-1,4,-1,2,3,-1,1,-1,0,-1],
 [0,-1,4,3,-1,2,-1,0,2,-1,3,-1,5,4,-1,2],
 [0,3,-1,-1,2,4,-1,-1,5,-1,4,2,-1,1,0,-1],
 [0,-1,2,3,-1,5,-1,4,2,-1,-1,1,3,-1,0,-1],
 [0,-1,-1,4,2,-1,0,3,-1,4,-1,2,5,-1,3,-1],
 [0,4,-1,2,-1,5,-1,3,1,-1,4,-1,0,2,-1,-1],
 [0,-1,3,-1,5,3,-1,2,-1,4,2,-1,1,-1,0,2],
 [0,2,-1,5,-1,4,3,-1,0,-1,2,4,-1,3,-1,1],
 [0,-1,5,4,-1,2,-1,0,-1,3,5,-1,4,-1,1,-1],
 [0,-1,2,-1,3,4,-1,1,0,3,-1,5,-1,4,2,-1],
 [0,3,-1,1,-1,4,2,-1,5,-1,3,-1,1,2,-1,0]
];
const SCALES={
 minor:[0,2,3,5,7,8,10],
 dorian:[0,2,3,5,7,9,10],
 phrygian:[0,1,3,5,7,8,10],
 harmonic:[0,2,3,5,7,8,11],
 blues:[0,3,5,6,7,10],
 pentatonic:[0,3,5,7,10]
};
const ROOTS=[-9,-7,-5,-4,-2,0,2,3,5];

export function musicIdentity(p,variation=0){
 const seed=(p.seed??0)+variation*17;
 const scaleName=p.bass==='phonk'?'blues':p.bass==='acid'?'phrygian':
  p.bass==='rave'?'harmonic':p.bass==='percussive'?'pentatonic':
  p.bass==='dark'?'minor':seed%2?'dorian':'minor';
 return {hook:HOOKS[(seed*9+Math.floor(seed/7))%HOOKS.length],
  scale:SCALES[scaleName],scaleName,root:ROOTS[(seed*5+Math.floor(seed/9))%ROOTS.length],
  rotate:(seed%4)*4,phase:seed%3};
}
const degreeAt=(c,step)=>c.hook[(step+c.rotate)&15];

export function melodyPitch(p,slot,step,bar=0,scene='GROOVE',variation=0){
 if(!TONAL_ROWS.includes(slot))return 0;
 const c=musicIdentity(p,variation);
 const progression=p.bass==='rave'?[0,3,5,4]:p.bass==='acid'?[0,0,4,3]:
  p.bass==='phonk'?[0,3,0,4]:p.category==='ROLLING'?[0,0,3,0]:[0,3,4,3];
 const chord=progression[Math.floor((((bar%8)+8)%8)/2)];
 const degree=degreeAt(c,step);
 const fallback=Math.floor(step/4)+c.phase;
 const index=slot===1?chord:slot===4?(degree<0?fallback:degree)+chord:
  slot===8?(degree<0?fallback:degree+2)+chord:
  slot===9?(degree<0?fallback:degree+3)+chord:
  (degree<0?fallback:degree+1)+chord;
 const semitones=c.scale[index%c.scale.length]+12*Math.floor(index/c.scale.length);
 const octave=slot===1?-5:slot===4?-3:slot===8?-1:slot===9?1:2;
 const lift=scene==='DROP'&&slot===9?2:scene==='BUILD'&&slot===9?3:0;
 return Math.max(-19,Math.min(22,c.root+semitones+octave+lift));
}

/** Factory drum programming independent from pitched riffs; no scheduling randomness. */
export function composeDrumGroove(grid,p,scene='GROOVE',variation=0){
 const seed=(p.seed??0)+variation*7;
 const turn=((seed%5)+5)%5;
 const genre=p.category;
 const energy=Math.max(0,Math.min(1,p.intensity??.5));
 const set=(row,steps,level)=>{for(const step of steps)grid[row][((step%16)+16)%16]=Math.max(0,Math.min(1,level))};
 const drums=[0,2,3,5,6,7,10,12,13];
 for(const row of drums)grid[row].fill(0);
 const dnb=p.id==='dark-dnb-174';
 const phonk=genre==='PHONK';
 const hard=genre==='HARD';
 const rave=genre==='RAVE';
 const roll=genre==='ROLLING';
 const kick=dnb?[0,6,10]:phonk?[0,6,10]:[0,4,8,12];
 const advance=scene==='DROP'?0:turn;
 set(0,kick,Math.min(1,.84+energy*.13));
 if(scene==='BREAK'){
  grid[0].fill(0);set(0,[0,10],.46);
  set(3,[3,7,11,15],.2);
  set(7,[14],.23);
  return grid;
 }
 if(scene==='INTRO'){
  grid[0].fill(0);set(0,[0,8],.7);
  set(3,[6,14],.23);
  return grid;
 }
 const clap=phonk?[8]:dnb?[4,12]:[4,12];
 set(2,clap,phonk?.63:.54+energy*.2);
 if((hard||rave)&&turn%2===0)set(5,[12],.22+energy*.2);
 if(hard||genre==='TECHNO'){
  set(3,[1,3,5,7,9,11,13,15],.27+energy*.14);
  set(7,[(6+advance)%16,(14+advance)%16],.34+energy*.18);
  if(hard&&energy>.65)set(0,[(14+turn%2)%16],.28+energy*.12);
 }else if(roll){
  set(3,[2,6,10,14],.27+energy*.12);
  set(7,[7,15],.25+energy*.13);
  set(10,[(3+turn)%16,(11+turn)%16],.16+energy*.16);
 }else if(phonk){
  set(3,[2,6,10,14],.27+energy*.14);
  set(7,[7,15],.27);
  set(5,[8],.16);
 }else{
  set(3,[2,4,6,10,12,14],.31+energy*.18);
  set(7,[6,14],.36);
  set(12,[3,11],.2+energy*.13);
 }
 if(dnb){grid[2].fill(0);set(2,[4,12],.66);set(6,[4,12],.23)}
 if(turn===0)set(6,[7,15],.19+energy*.16);
 if(turn===1)set(13,[5,13],.17+energy*.14);
 if(turn===2)set(10,[1,5,9,13],.13+energy*.11);
 if(turn===3)set(12,[3,7,11,15],.17+energy*.11);
 if(turn===4)set(6,[3,11],.19+energy*.16);
 if(seed%3===0)set(10,[15],.16+energy*.14);
 if(seed%3===1)set(13,[15],.17+energy*.12);
 if(seed%3===2)set(3,[0,8],.14);
 if(scene==='BUILD'){
  set(5,[12,14,15],.26+energy*.25);
  set(6,[13,15],.22+energy*.2);
  set(3,[12,13,14,15],.3+energy*.16);
 }
 if(scene==='DROP'){
  set(0,kick,1);
  set(5,[15],.45);
  set(12,[7,15],.25+energy*.2);
 }
 return grid;
}

export function composeMelodicGrid(grid,p,scene='GROOVE',variation=0){
 for(const row of TONAL_ROWS)grid[row].fill(0);
 if(scene==='INTRO')return grid;
 const c=musicIdentity(p,variation);
 const acid=p.bass==='acid'||(p.category==='TECHNO'&&p.seed%4===0);
 const lead=p.bass==='rave'||p.category==='RAVE'||(p.category==='HARD'&&p.seed%3===0);
 const cow=p.bass==='phonk';
 for(let step=0;step<16;step++){
  if(degreeAt(c,step)<0)continue;
  if(scene==='BREAK'&&step%4!==0)continue;
  const accent=step%4===0?.12:step%4===2?.05:0;
  grid[4][step]=Math.min(.95,.48+p.intensity*.22+accent);
  if(cow&&step%3!==c.phase)grid[11][step]=.36+p.intensity*.22;
  if(acid&&(step+c.phase)%3!==0&&scene!=='BREAK')grid[8][step]=.32+p.intensity*.26;
  if(lead&&(step+c.phase)%4===0&&scene!=='BREAK')grid[9][step]=.32+p.intensity*.23;
  if(p.category==='ROLLING'&&step%4===c.phase)grid[1][step]=.15+p.intensity*.08;
 }
 if(scene==='BUILD'){
  grid[4][15]=.64;
  if(acid)grid[8][14]=.48;
  if(lead)grid[9][12]=.5;
 }
 if(scene==='DROP'){
  if(lead){grid[9][0]=.62;grid[9][8]=.55;}
  if(acid)grid[8][0]=.57;
 }
 if(scene==='BREAK'){grid[4][0]=.38;if(lead)grid[9][8]=.27;}
 return grid;
}
