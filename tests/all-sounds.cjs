'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8').replace(/^import\s+.*?;\r?\n/gm,''),composition=fs.readFileSync('music-composer.js','utf8').replace(/^export\s+/gm,'');
const sandbox={console,Blob,window:{},navigator:{},performance:{now:()=>0},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}};
vm.runInNewContext(composition+'\n'+app.slice(0,app.indexOf('// === app.js ==='))+'\nglobalThis.AudioTest={PRESETS,synthPCM};',sandbox);
let checked=0;
for(const p of sandbox.AudioTest.PRESETS)for(let slot=0;slot<16;slot++){
 const pcm=sandbox.AudioTest.synthPCM(slot,p.kick,p.bass,11025,p.seed+17,0);let peak=0,energy=0;
 for(const value of pcm){assert(Number.isFinite(value),p.id+' / '+slot+' invalid sample');peak=Math.max(peak,Math.abs(value));energy+=value*value;}
 assert(peak>.01&&peak<=.85,p.id+' / '+slot+' silent or clipping');
 assert(Math.sqrt(energy/pcm.length)>.001,p.id+' / '+slot+' has no useful signal');
 checked++;
}
console.log('PASS '+checked+' factory drum/synth sounds across all 40 presets: finite samples, nonzero energy and bounded peaks');
