'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8').replace(/^import\s+.*?;\r?\n/gm,'');
const composer=fs.readFileSync('music-composer.js','utf8').replace(/^export\s+/gm,'');
const prefix=app.slice(0,app.indexOf('// === app.js ==='));
const sandbox={console,Blob,window:{},navigator:{},setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{}};
vm.runInNewContext(composer+'\n'+prefix+'\nglobalThis.exports={PRESETS,makePattern,composeDrumGroove};',sandbox,{timeout:10000});
const {PRESETS,makePattern}=sandbox.exports;
const patterns=new Set();
for(const preset of PRESETS){
 const groove=makePattern(preset,'GROOVE');
 const intro=makePattern(preset,'INTRO');
 const build=makePattern(preset,'BUILD');
 const drop=makePattern(preset,'DROP');
 const quiet=makePattern(preset,'BREAK');
 for(const grid of [intro,groove,build,drop,quiet]){
  assert.equal(grid.length,16);
  assert(grid.every(row=>row.length===16&&row.every(v=>Number.isFinite(v)&&v>=0&&v<=1)));
 }
 assert.equal(intro[0].filter(Boolean).length,2,'intro should have 2 kick pulses');
 assert.equal(intro[2].filter(Boolean).length,0,'intro should not have claps');
 assert(build[5].filter(Boolean).length>=3,'build must have snare roll');
 assert(quiet[0].filter(Boolean).length===2,'break should have sparse kick');
 assert(drop[0].some(v=>v===1),'drop should punch at full kick velocity');
 const drums=[0,2,3,5,6,7,10,12,13];
 patterns.add(drums.map(row=>groove[row].map(v=>Math.round(v*100)).join(',')).join('|'));
}
assert(patterns.size>=30,'factory drum grooves must be meaningfully distinct, only '+patterns.size);
const first=PRESETS[0];
const a=makePattern(first,'GROOVE');
const b=makePattern(first,'GROOVE');
assert.equal(JSON.stringify(a),JSON.stringify(b),'music must be deterministic');
console.log('PASS genre drum arrangement: '+patterns.size+' unique grooves / 40, intro/build/drop/break dynamics');
