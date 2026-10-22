import {composeGroove} from './arranger.js';
import {STYLES,type Pattern} from './model.js';

/** 12 style families × 2^18 independently addressable rhythmic variations.
 * Presets are generated on demand; no millions of files or fabricated sample packs.
 */
export const PRESETS_PER_STYLE=1<<18;
export const PRESET_COUNT=STYLES.length*PRESETS_PER_STYLE;
const BIT_STEPS:ReadonlyArray<readonly [number,number]>=[
 [3,1],[3,3],[3,5],[3,7],[3,9],[3,11],[3,13],[3,15],
 [5,1],[5,2],[5,4],[5,5],[5,7],[5,8],[5,10],[5,13],
 [7,7],[7,14]
];
export type GeneratedPreset={id:number;style:number;pattern:Pattern};
export function generatePreset(id:number):GeneratedPreset{
 if(!Number.isSafeInteger(id)||id<0||id>=PRESET_COUNT)throw new RangeError('Preset ID out of range');
 const style=Math.floor(id/PRESETS_PER_STYLE),bits=id%PRESETS_PER_STYLE;
 const pattern=composeGroove(style,.7,0);
 BIT_STEPS.forEach(([pad,step],index)=>{
  pattern[pad]![step]=(bits&(1<<index))!==0?(pad===3?.37:pad===5?.5:.68):0;
 });
 return {id,style,pattern};
}
