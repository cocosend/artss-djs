'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const s=await import(pathToFileURL(path.resolve('sound-design.js')).href);
 assert.equal(s.PAD_COUNT,8);
 assert.equal(s.PRESETS.length,8);
 assert.equal(new Set(s.PAD_NAMES).size,8);
 const profiles=new Set();
 for(const preset of s.PRESETS){
   const scenes={};
   for(const scene of s.SCENES){
     const g=s.presetPattern(preset,scene);scenes[scene]=g;
     assert.equal(g.length,8,`${preset.name} scene ${scene}: track count`);
     for(const row of g){assert.equal(row.length,16);assert(row.every(x=>x>=0&&x<=1));}
     if(scene==='GROOVE'){
       assert(g[0].some(x=>x>0.8),`${preset.name}: missing kick`);
       const tonalEvents=[1,6,7].reduce((sum,row)=>sum+g[row].filter(x=>x>0).length,0);
       assert(tonalEvents<=12,`${preset.name}: too many overlapping notes (${tonalEvents})`);
       profiles.add(g.flat().join(','));
     }
   }
   assert.notDeepEqual(scenes.GROOVE,scenes.BREAK,`Arrangement not dynamic in ${preset.name}`);
 }
 assert.equal(profiles.size,8,'Each genre has a distinct groove');
 assert.equal(s.noteOffset(3,6,5,0),3,'Acid has limited minor pitch movement');
 assert.equal(s.noteOffset(0,3,7,0),0,'Hats never pitch shift');
 assert.equal(s.noteOffset(7,7,3,0),0,'Phonk in rooted minor mode');
 // Numerical DSP: ensure usable envelope, no NaN/clipping/silence, deterministic playback & export.
 for(let bank=0;bank<8;bank++)for(let slot=0;slot<8;slot++){
  const pcm=s.makePCM(slot,44100,bank,0);
  assert(pcm.length>=6000 && pcm.length<40000,`Duration bank ${bank} voice ${slot}`);
  let peak=0,sum=0;
  for(const v of pcm){assert(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));sum+=v*v}
  assert(peak>.003&&peak<1,`Invalid peak for bank ${bank}, voice ${slot}: ${peak}`);
  assert(Math.sqrt(sum/pcm.length)>.001,`Silent voice ${bank}:${slot}`);
  assert(Math.abs(pcm[pcm.length-1])<.003,`Tail click ${bank}:${slot}`);
  assert.deepEqual(s.makePCM(slot,44100,bank,0),pcm,`Non-deterministic PCM ${bank}:${slot}`);
 }
 console.log('PASS 8 distinct genre grooves, sparse tonal material, 64 finite audio renders with deterministic WAV parity');
})().catch(e=>{console.error(e);process.exitCode=1});