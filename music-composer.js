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
