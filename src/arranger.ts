import {PAD_COUNT,STEPS,STYLES,type Pattern} from './model.js';
export type GrooveStyle = number;
const validStyle=(style:number):number=>Number.isInteger(style)&&style>=0&&style<STYLES.length?style:0;
/** Deterministic role-based 16-step patterns, style aware and locally generated. */
export function composeGroove(style:number,density=.65,variation=0):Pattern{
 const s=validStyle(style),g=STYLES[s]!,d=Number.isFinite(density)?Math.max(0,Math.min(1,density)):0;
 const p=Array.from({length:PAD_COUNT},()=>Array<number>(STEPS).fill(0));
 const place=(pad:number,steps:readonly number[],velocity:number)=>{for(const step of steps)if(step>=0&&step<STEPS)p[pad]![step]=velocity;};
 place(0,g.kick,1);
 place(2,g.snare,.77+(s===5?.08:0));
 place(3,g.hat,.43+d*.27);
 if(d>.40){place(4,[6,14],.26+d*.14);place(5,[3,11],.26+d*.18);}
 if(d>.50){place(1,g.bass,.62+d*.1);place(6,g.acid,Math.min(.8,.26+d*.44));}
 if(d>.73){for(const x of [1,5,9,13])p[3]![x]=Math.max(p[3]![x]??0,.24);p[5]![15]=.45;p[7]![15]=.55;}
 if(variation>0){const offsets=[5,13,7,15],k=offsets[(variation-1)%offsets.length]??7;p[5]![k]=.42;if(d>.6)p[6]![(k+2)%STEPS]=.42;}
 return p;
}
const ROLE_STEPS:Record<number,readonly number[]>={0:[0,4,8,12],1:[0,8],2:[4,12],3:[2,6,10,14],4:[6,14],5:[3,11],6:[3,7,11,15],7:[15]};
/** Insert imported sample lane while preserving existing recorded layers. */
export function placeSample(pattern:Pattern,pad:number,style:number):number{
 if(!Number.isInteger(pad)||pad<0||pad>=PAD_COUNT)return 0;
 const row=pattern[pad];if(!row||row.length!==STEPS)return 0;
 const steps=pad===6&&validStyle(style)===2?[3,6,11,14]:(ROLE_STEPS[pad]??[0]);
 for(const step of steps)row[step]=Math.max(row[step]??0,pad===0?1:.7);
 return steps.length;
}
