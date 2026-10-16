import test from 'node:test';
import assert from 'node:assert/strict';
import { GENRES,TRACKS,presetPattern,synthVoice } from '../engine.js';

test('studio has 16 real instruments and six distinct genre patterns',()=>{
 assert.equal(TRACKS.length,16);
 assert.equal(GENRES.length,6);
 const patterns=GENRES.map(presetPattern);
 const signatures=new Set();
 for(const p of patterns){
  assert.equal(p.length,16);
  assert(p.every(row=>row.length===16&&row.every(v=>Number.isFinite(v)&&v>=0&&v<=1)));
  assert(p[0].some(v=>v>=.6),'missing audible kick');
  assert(p.flat().some(v=>v>.1),'silent preset');
  signatures.add(p.flat().join(','));
 }
 assert.equal(signatures.size,6);
});
test('audio patches have real energy but never clip or contain NaNs',()=>{
 for(const t of TRACKS){
  const data=synthVoice(t.id,22050);
  let peak=0,power=0;
  assert(data.length>1000,`${t.id} should not be empty`);
  for(let i=0;i<data.length;i++){let x=data[i];assert(Number.isFinite(x),`bad PCM ${t.id}`);peak=Math.max(peak,Math.abs(x));power+=x*x;}
  const rms=Math.sqrt(power/data.length);
  assert(peak>.025&&peak<.81,`invalid peak ${t.id}: ${peak}`);
  assert(rms>.003,`inaudible sample ${t.id}: ${rms}`);
 }
});
test('sample generation is deterministic',()=>{
 for(const name of ['kick','hat','bass','clap']){
  assert.deepEqual(synthVoice(name,11025),synthVoice(name,11025));
 }
});