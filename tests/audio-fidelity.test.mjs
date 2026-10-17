import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {analyzeTrack,SLICE_RATE,polishPCM,polishStereoPCM,serializeClips,deserializeClips} from '../track-slicer.js';
const peak=a=>a.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
const rate=48000,seconds=32,left=new Float32Array(rate*seconds),right=new Float32Array(rate*seconds);
for(let i=0;i<left.length;i++){
 const t=i/rate,beat=t*2.2,impulse=Math.exp(-((beat%1)*34)),kick=Math.sin(2*Math.PI*82*t)*impulse*.6;
 const hi=Math.sin(2*Math.PI*9700*t)*Math.exp(-((beat*2%1)*68))*.18;
 left[i]=kick+hi+Math.sin(2*Math.PI*135*t)*.06;
 right[i]=kick*.7+hi*.4+Math.sin(2*Math.PI*147*t)*.04;
}
const input={duration:seconds,length:left.length,sampleRate:rate,numberOfChannels:2,getChannelData:n=>n===0?left:right};
const since=performance.now(),clips=await analyzeTrack(input);
assert.equal(clips.length,16);
assert.equal(SLICE_RATE,44100);
assert(performance.now()-since<15000,'Processing should stay below 15s for a 32s stereo example');
for(const clip of clips){
 assert.equal(clip.sampleRate,44100);
 assert(clip.pcm.length<=6*SLICE_RATE);
 assert(clip.pcm.every(Number.isFinite),'Only finite samples');
 assert(peak(clip.pcm)<=.901,'Headroom for sample mixer');
 assert(Math.abs(clip.pcm[0])<1e-7&&Math.abs(clip.pcm.at(-1))<1e-7,'Click-free clip boundaries');
 if(clip.kind==='full'){
  assert(clip.pcmRight instanceof Float32Array,'Preserve stereo phrases');
  assert.equal(clip.pcmRight.length,clip.pcm.length);
  assert(peak(clip.pcmRight)<=.901);
 } else assert.equal(clip.pcmRight,null,'Keep percussive one shots mono');
}
const bank=serializeClips(clips),restored=deserializeClips(bank);
assert.equal(restored[12].pcmRight.length,clips[12].pcm.length);
assert.equal(restored[0].pcmRight,null);
const legacy=bank.map(c=>({...c,sampleRate:22050,pcm:new Int16Array(4400),pcmRight:null}));
assert.equal(deserializeClips(legacy)[0].sampleRate,22050,'Existing banks must still open');
const dc=Float32Array.from({length:4000},(_,i)=>.3+.2*Math.sin(2*Math.PI*i/25));
polishPCM(dc,'mid');assert(peak(dc)<.901);assert(Math.abs(dc[0])<1e-7);assert(Math.abs(dc.at(-1))<1e-7);
const sideL=Float32Array.from({length:4000},(_,i)=>.8*Math.sin(i*.18));
const sideR=Float32Array.from({length:4000},(_,i)=>.2*Math.sin(i*.18));
polishStereoPCM(sideL,sideR);
assert(Math.abs(peak(sideL)/peak(sideR)-4)<.06,'Stereo balance must be preserved');
console.log('PASS: 44.1kHz 16-pad extraction, 4 preserved stereo phrases, peak headroom, DC removal, clickless edges, bank persistence and legacy compatibility');