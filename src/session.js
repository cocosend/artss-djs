import {PRESETS,SCENES,PAD_COUNT,presetPattern} from './sound-design.js';

export const STEPS=16;
export const STORAGE_KEY='artss-live-session-v16';
const LEGACY_KEYS=['artss-live-session-v15','artss-live-session-v14','artss-live-session-v13','artss-live-session-v12','artss-live-session-v11','artss-studio-session-v10'];
export const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(n))?Number(n):min));
const rowFrom=value=>Array.from({length:STEPS},(_,i)=>clamp(value?.[i]??0,0,1));

export function newSession(bank=0){
 const p=PRESETS[bank]??PRESETS[0];
 return {version:16,bank:PRESETS.indexOf(p),scene:'GROOVE',bpm:p.bpm,swing:0,master:.8,filter:1,drive:.12,space:.08,delay:.06,
  mutes:Array(PAD_COUNT).fill(false),solos:Array(PAD_COUNT).fill(false),trackVolumes:Array(PAD_COUNT).fill(.8),trackPitch:Array(PAD_COUNT).fill(0),
  patterns:Object.fromEntries(SCENES.map(scene=>[scene,presetPattern(p,scene).map(rowFrom)]))};
}
export function normalizeSession(value){
 if(!value||!Number.isInteger(value.bank)||!PRESETS[value.bank])return null;
 const out=newSession(value.bank);
 out.scene=SCENES.includes(value.scene)?value.scene:'GROOVE';out.bpm=Math.round(clamp(value.bpm,65,195));
 for(const k of ['master','filter','drive','space','delay','swing'])out[k]=clamp(value[k]??out[k],0,k==='swing'?.45:1);
 for(const k of ['mutes','solos'])out[k]=Array.from({length:PAD_COUNT},(_,i)=>!!value[k]?.[i]);
 out.trackVolumes=Array.from({length:PAD_COUNT},(_,i)=>clamp(value.trackVolumes?.[i]??.8,0,1));
 out.trackPitch=Array.from({length:PAD_COUNT},(_,i)=>Math.round(clamp(value.trackPitch?.[i]??0,-12,12)));
 for(const scene of SCENES){const grid=value.patterns?.[scene];if(!Array.isArray(grid))continue;
  // Legacy 16-track sessions mapped to eight canonical voices; 32-step sessions keep first 16.
  const legacyMap=[0,1,2,3,7,6,8,value.bank===7?11:9];
  out.patterns[scene]=Array.from({length:PAD_COUNT},(_,i)=>rowFrom(grid[grid.length===16?legacyMap[i]:i]));
 }
 return out;
}
export function loadSession(storage){
 try{storage??=localStorage;}catch{return newSession();}
 for(const k of [STORAGE_KEY,...LEGACY_KEYS])try{const s=storage.getItem(k);if(s){const v=normalizeSession(JSON.parse(s));if(v)return v;}}catch{}
 return newSession();
}
export function saveSession(state,storage){try{storage??=localStorage;storage.setItem(STORAGE_KEY,JSON.stringify(state));return true;}catch{return false;}}
export function toggleStep(state,slot,step){
 if(slot<0||slot>=PAD_COUNT||step<0||step>=STEPS)return false;
 const row=state.patterns[state.scene][slot];row[step]=row[step]>.01?0:.82;return true;
}
export function recordStep(state,slot,step,velocity=1){
 if(slot<0||slot>=PAD_COUNT||step<0||step>=STEPS)return false;
 const row=state.patterns[state.scene][slot];row[step]=Math.max(row[step],clamp(velocity,0,1));return true;
}