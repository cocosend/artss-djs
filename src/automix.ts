import {STEPS,type Pattern} from './model.js';
const clamp=(v:number,min:number,max:number)=>Number.isFinite(v)?Math.min(max,Math.max(min,v)):min;
export type Transition={from:number;to:number;progress:number;segment:number};
/** Beat-synchronous crossfade: 2 phrase loops hold, one phrase loop blends. */
export function autoMixPosition(baseBank:number,absoluteStep:number,bankCount:number):Transition{
 const count=Math.max(1,Math.floor(bankCount)),n=Math.max(0,Math.floor(absoluteStep)),section=STEPS*3;
 const segment=Math.floor(n/section),offset=n%section;
 const from=((Math.floor(baseBank)+segment)%count+count)%count,to=(from+1)%count;
 const linear=clamp((offset-2*STEPS)/STEPS,0,1);
 return {from,to,progress:linear*linear*(3-2*linear),segment};
}
export function blendVelocity(from:Pattern,to:Pattern,pad:number,step:number,progress:number):number{
 const a=clamp(from[pad]?.[step]??0,0,1),b=clamp(to[pad]?.[step]??0,0,1),mix=clamp(progress,0,1);
 return clamp(a+(b-a)*mix,0,1);
}
/** Reduce voice buildup in dense fills; never abruptly attenuate the master. */
export function simultaneousTrim(voices:number):number{return clamp(Math.sqrt(3/Math.max(3,voices)),.62,1);}
