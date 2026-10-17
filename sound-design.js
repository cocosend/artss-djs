/** Genre-tuned, sample-free drum and bass sound design.
 * Pure DSP and pattern construction, shared by live playback and offline WAV.
 * No random note choices and no automatic chord progressions.
 */
export const PAD_NAMES = Object.freeze(['CLUB KICK','DEEP SUB','CLAP / SNARE','CLOSED HAT','OPEN HAT','RIM / PERC','303 ACID','GENRE HIT']);
export const PAD_SHORT = Object.freeze(['KICK','SUB','CLAP','CH','OH','PERC','ACID','HIT']);
export const KEYS = Object.freeze(['1','2','3','4','Q','W','E','R']);
export const COLORS = Object.freeze(['#ff8a36','#c5ff50','#ffad4e','#a8ee48','#d9ff77','#ff9e55','#b2f763','#ffbf56']);
export const PRESETS = Object.freeze([
 {name:'WAREHOUSE',tag:'HYPNOTIC TECHNO',bpm:136,style:0,root:0},
 {name:'HARDGROOVE',tag:'DRIVING PERCUSSION',bpm:142,style:1,root:2},
 {name:'DUB PRESSURE',tag:'DEEP / MINIMAL',bpm:128,style:2,root:-2},
 {name:'ACID ROOM',tag:'303 / WAREHOUSE',bpm:140,style:3,root:0},
 {name:'INDUSTRIAL',tag:'DARK HARD TECHNO',bpm:152,style:4,root:-2},
 {name:'DARK HYPNO',tag:'NOCTURNAL TECHNO',bpm:134,style:5,root:-5},
 {name:'RAVE SIGNAL',tag:'PEAK / STABS',bpm:148,style:6,root:2},
 {name:'DRIFT PHONK',tag:'COWBELL / 808',bpm:142,style:7,root:-3}
]);
export const SCENES=Object.freeze(['INTRO','GROOVE','BUILD','DROP','BREAK']);
export const PAD_COUNT=PAD_NAMES.length;
export const STEPS=16;
export const createGrid=()=>Array.from({length:PAD_COUNT},()=>Array(STEPS).fill(0));
const steps=(grid,row,positions,level)=>{for(const position of positions)grid[row][position]=level};

/** Deliberate genre-specific groove templates: one rhythm section, at most two tonal lanes. */
export function presetPattern(preset,scene='GROOVE'){
 if(!PRESETS.includes(preset))throw new TypeError('Unknown preset');
 const style=preset.style,g=createGrid();
 const straight=[0,4,8,12], backbeat=[4,12],offHats=[2,6,10,14];
 steps(g,0,style===7?[0,6,8,14]:straight,style===4?.92:1);
 steps(g,2,style===7?[4,11]:backbeat,style===2?.38:.69);
 steps(g,3,style===7?[2,5,10,13]:offHats,style===2?.23:.39);
 steps(g,4,style===7?[7,15]:[6,14],style===2?.17:.31);
 if(style===0){steps(g,5,[3,11],.28);steps(g,1,[2,10],.48)}
 if(style===1){steps(g,5,[1,3,7,9,11,15],.37);steps(g,3,[2,5,6,10,13,14],.35);steps(g,1,[2,10],.48)}
 if(style===2){g[0][12]=0;steps(g,5,[11],.25);steps(g,1,[0,9],.38);g[4][14]=0}
 if(style===3){steps(g,6,[2,7,10,15],.53);steps(g,1,[0,8],.45);g[4][14]=0}
 if(style===4){steps(g,5,[3,6,11,14],.55);steps(g,1,[2,10],.43);g[3][15]=.34}
 if(style===5){steps(g,1,[2,10],.51);steps(g,5,[7,15],.23);g[2][12]=.52}
 if(style===6){steps(g,7,[0,12],.42);steps(g,1,[2,10],.39);steps(g,5,[15],.31)}
 if(style===7){steps(g,7,[3,7,11,15],.44);steps(g,1,[0,6,8,14],.67);g[3][2]=.28}
 if(scene==='INTRO'){
  for(const row of [1,2,5,6,7])g[row].fill(0);
  g[0][4]=0;g[0][12]=0;g[4][6]=0;
 }else if(scene==='BUILD'){
  steps(g,3,[0,2,4,6,8,10,12,14,15],.40);
  g[5][14]=.36;
  if(style===3)g[6][14]=.49;
 }else if(scene==='DROP'){
  steps(g,0,straight,1);
  g[2][12]=.84;g[4][14]=.37;
  if(style===3)g[6][15]=.58;
  if(style===6)g[7][12]=.54;
 }else if(scene==='BREAK'){
  for(const row of [0,1,2,4,5,7])g[row].fill(0);
  g[3].fill(0);g[3][6]=.20;g[3][14]=.25;
  if(style===3){g[6].fill(0);g[6][10]=.38}else g[6].fill(0);
 }
 return g;
}

/** Tonal material is sparse and rooted, never a 16-note melody.
 * Kick and percussion are strictly unpitched; bass and acid are minor-scale fragments.
 */
export function noteOffset(style,slot,step,bar=0){
 if(![1,6,7].includes(slot))return 0;
 if(slot===1)return style===7 && (step===6||step===14)?-2:0;
 if(slot===6){
  if(style!==3 && style!==5)return 0;
  const sequence=style===3?[0,0,3,0,0,5,3,0]:[0,0,0,-2,0,3,0,0];
  return sequence[(Math.floor(step/2)+Math.floor(bar/2)%2)%8];
 }
 if(style===7)return [0,0,3,0,0,5,3,0][(Math.floor(step/2)+(Math.floor(bar/2)%2)*2)%8];
 return style===6 && step===12?-2:0;
}

const xorshift=(seed)=>{let s=seed|0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967295*2-1}};
const soft=(x)=>Math.tanh(x*1.26)/Math.tanh(1.26);
const two=Math.PI*2;
/** Generate a one-shot audio sample with sub-20Hz removed, clickless tail and bounded headroom. */
export function makePCM(slot,sr,bank,note=0){
 if(!Number.isInteger(slot)||slot<0||slot>=PAD_COUNT||!PRESETS[bank])throw new RangeError('Invalid sound');
 if(!Number.isFinite(sr)||sr<22050||sr>192000)throw new RangeError('Invalid sample rate');
 const profile=PRESETS[bank],style=profile.style,ratio=Math.pow(2,(profile.root+note)/12);
 const lengths=[.66,.73,.29,.15,.49,.26,.52,.54],dur=lengths[slot];
 const n=Math.ceil(sr*dur),pcm=new Float32Array(n),noise=xorshift(8837+slot*131+bank*507+note*7);
 let phase=0,phase2=0,high=0,lp=0,lp2=0;
 const subHz=(style===7?48:style===2?44:46)*ratio;
 for(let i=0;i<n;i++){
  const t=i/sr,raw=noise(),attack=Math.min(1,t/.0015),tail=Math.min(1,(dur-t)/.014);
  let sample=0;
  const envelope=(decay)=>Math.exp(-t*decay);
  switch(slot){
   case 0:{
    const bass=style===4?50:style===7?52:style===2?46:49;
    const f=bass+(style===4?210:165)*Math.exp(-t*46);
    phase+=two*f/sr;
    lp+=.07*(raw-lp);
    const click=(raw-lp)*Math.exp(-t*125)*.17;
    sample=(Math.sin(phase)*.98+.10*Math.sin(phase*2))*Math.exp(-t*(style===4?8.8:7.6))+click;
    break;
   }
   case 1:{
    phase+=two*(subHz+18*Math.exp(-t*34))/sr;
    phase2+=two*subHz*2/sr;
    sample=(Math.sin(phase)*.74+Math.sin(phase2)*.10)*envelope(style===7?4.5:5.5);
    break;
   }
   case 2:{
    lp+=.045*(raw-lp);
    high=raw-lp;
    const bursts=Math.exp(-t*80)+(t>.012?.62*Math.exp(-(t-.012)*92):0)+(t>.023?.43*Math.exp(-(t-.023)*110):0);
    phase+=two*178/sr;
    sample=(high*.58*bursts+Math.sin(phase)*.14*Math.exp(-t*25))*(style===4?1.12:1);
    break;
   }
   case 3:
   case 4:{
    // Sequential high-pass + short coloured plate resonance: metallic, not a random whistle.
    lp+=.10*(raw-lp);
    const hp=raw-lp;
    lp2+=.22*(hp-lp2);
    const tone=hp-lp2;
    sample=(tone*.53+lp2*.13)*envelope(slot===3?48:11);
    break;
   }
   case 5:{
    const f=(style===1?258:style===4?139:style===7?192:302)+110*Math.exp(-t*24);
    phase+=two*f/sr;phase2+=two*f*1.51/sr;
    lp+=.13*(raw-lp);
    sample=(Math.sin(phase)*.47+Math.sin(phase2)*.16+(raw-lp)*.20)*envelope(style===4?18:24);
    break;
   }
   case 6:{
    // Low, filtered resonant 303 one-shot, no arbitrary chromatic lead arpeggios.
    const hz=67*ratio;
    phase+=hz/sr;phase%=1;
    const saw=2*phase-1;
    const cutoff=(style===3?290:195)+(style===3?1250:610)*Math.exp(-t*(style===3?9:12));
    const a=Math.min(.48,two*cutoff/sr);
    lp+=a*(saw-lp);lp2+=a*(lp-lp2);
    sample=(lp2*1.1-lp*.18)*envelope(6.8)*.77;
    break;
   }
   case 7:{
    if(style===7){
     // Dirty phonk cowbell pair, tuned to the bank root rather than a major melody.
     const hz=285*ratio;phase+=two*hz/sr;phase2+=two*hz*1.50/sr;
     sample=(Math.sin(phase)*.52+Math.sin(phase2)*.31)*envelope(10.6);
    }else if(style===6){
     const hz=109*ratio;
     phase+=hz/sr;phase%=1;phase2+=(hz*1.498)/sr;phase2%=1;
     const osc=(2*phase-1)*.43+(2*phase2-1)*.23;
     lp+=.12*(osc-lp);lp2+=.12*(lp-lp2);
     sample=lp2*envelope(6.8);
    }else{
     // Noise stab as a transient accent, not an unsolicited pitched melody.
     lp+=.13*(raw-lp);lp2+=.26*((raw-lp)-lp2);
     sample=lp2*envelope(21)*.45;
    }
    break;
   }
  }
  // Soft clipping in sample render leaves enough gain staging margin for 8 stacked pads.
  pcm[i]=soft(sample*.75)*Math.max(0,attack)*Math.max(0,tail)*.84;
 }
 return pcm;
}