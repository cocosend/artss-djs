import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTempoFromPulses,normalizeGain,planTransition,crossfadeCurve} from '../app/automix.js';

test('local transient tempo estimate follows 120 BPM kick pulses',()=>{
 const pulses=new Float32Array(4000);
 for(let beat=0;beat<20;beat++)for(let i=0;i<5;i++)pulses[beat*50+i]=.8*Math.exp(-i);
 const result=estimateTempoFromPulses(pulses,100);
 assert.ok(Math.abs(result.bpm-120)<=1,result);
 assert.ok(result.confidence>.17);
});

test('phrase transition matches nearby tempos but never forces a remote speed',()=>{
 const a={bpm:128,confidence:.8,firstBeat:.5,rms:.15,peak:.8,duration:180};
 const b={...a,bpm:130,duration:190};
 const plan=planTransition(a,b);
 assert.ok(plan.matchable);
 assert.ok(plan.startNext>100&&plan.startNext<a.duration);
 assert.ok(Math.abs(plan.playbackRate-128/130)<.001);
 assert.ok(plan.fadeSeconds>=.35&&plan.fadeSeconds<=12);
 const far=planTransition(a,{...b,bpm:165});
 assert.equal(far.matchable,false);assert.equal(far.playbackRate,1);
 const uncertain=planTransition(a,{...b,confidence:0});
 assert.equal(uncertain.playbackRate,1);
});

test('master-compatible gains and equal-power blend are finite and bounded',()=>{
 for(const [rms,peak] of [[0,0],[.02,.9],[.2,.7]]){
  const gain=normalizeGain({rms,peak});assert.ok(gain>=.22&&gain<=1.18);
 }
 const {incoming,outgoing}=crossfadeCurve();
 assert.equal(incoming.length,64);assert.ok(outgoing[0]>.8&&incoming[0]===0);
 for(let i=0;i<64;i++)assert.ok(Math.abs(incoming[i]**2+outgoing[i]**2-.81**2)<.00001);
});
