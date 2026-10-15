'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8').replace(/^import\s+.*?;\r?\n/gm,'');
const composer=fs.readFileSync('music-composer.js','utf8').replace(/^export\s+/gm,'');
const prefix=app.slice(0,app.indexOf('// === app.js ==='));
assert(prefix.length>12000,'music or audio code missing');
const sandbox={ console,Blob,window:{},navigator:{},performance:{now:()=>0},setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{} };
vm.runInNewContext(composer+'\n'+prefix+'\n globalThis.T={PRESETS,SCENES,TONAL_ROWS,makePattern,melodyPitch,musicIdentity,synthPCM,blankState,SoundEngine,pcmPeak};',sandbox,{timeout:10000});
const {PRESETS,SCENES,TONAL_ROWS,makePattern,melodyPitch,musicIdentity,synthPCM,blankState,SoundEngine,pcmPeak}=sandbox.T;
assert.equal(PRESETS.length,40);
const signatures=new Set();
let progressionCount=0;
for(const p of PRESETS){
 const score=[];
 for(const scene of SCENES){
  const grid=makePattern(p,scene);
  assert.equal(grid.length,16);
  for(const row of grid){
   assert.equal(row.length,16);
   assert(row.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'invalid step velocity');
  }
  if(scene==='INTRO')assert(TONAL_ROWS.every(row=>grid[row].every(x=>x===0)),'intro leaked melodic voice');
  if(scene==='GROOVE'){
   assert(grid[4].filter(x=>x>0).length>=4,'bass groove has too few notes');
   for(let bar=0;bar<8;bar++){
    for(const row of TONAL_ROWS)for(let step=0;step<16;step++){
     if(!grid[row][step])continue;
     const note=melodyPitch(p,row,step,bar,scene);
     assert(Number.isInteger(note)&&note>=-19&&note<=22,'out-of-range pitch');
     score.push([row,step,bar,note,grid[row][step]].join('/'));
    }
   }
  }
 }
 assert(musicIdentity(p).scale.length>=5,'missing scale');
 const base=melodyPitch(p,4,0,0),later=melodyPitch(p,4,0,4);
 if(base!==later)progressionCount++;
 const original=JSON.stringify(Array.from(makePattern(p,'GROOVE')[4]))+melodyPitch(p,4,3);
 const alternate=JSON.stringify(Array.from(makePattern(p,'GROOVE',1)[4]))+melodyPitch(p,4,3,0,'GROOVE',1);
 assert.notEqual(original,alternate,'NEW RIFF must change the music');
 signatures.add(score.join('|'));
}
assert(signatures.size>=38,'factory presets are still musically repetitive: '+signatures.size);
assert(progressionCount>=20,'8-bar harmonic movement missing: '+progressionCount);
for(const preset of PRESETS.slice(0,8)){
 for(const slot of [1,4,8,9,11]){
  const note=melodyPitch(preset,slot,3,1);
  const pcm=synthPCM(slot,preset.kick,preset.bass,11025,preset.seed+17,note);
  assert(pcm.length>1000,'empty sound');
  assert(Number.isFinite(pcmPeak(pcm))&&pcmPeak(pcm)>.03&&pcmPeak(pcm)<=.85,'invalid synthesized PCM');
 }
}
const engine=new SoundEngine(blankState('acid-pressure'));
const pitches=[];
engine.getBuffer=(_ctx,slot,note)=>{pitches.push({slot,note});return {};};
const ctx={currentTime:0,createBufferSource:()=>({playbackRate:{value:1},connect(){},start(){}}),
 createGain:()=>({gain:{value:0},connect(){}})};
engine.playBuffer(ctx,{},4,0,.8,2,false,0,'GROOVE');
engine.playBuffer(ctx,{},4,0,.8,2,false,4,'GROOVE');
assert.equal(pitches.length,2);
assert.notEqual(pitches[0].note,pitches[1].note,'audio playback must use progression');
assert(app.includes('step,true,bar,scene')&&app.includes('step,false,bar,scene'),'live and WAV must both use bar/scene');
console.log('PASS factory presets: '+signatures.size+' unique scores; '+progressionCount+' progressions; PCM and playback pitch');
