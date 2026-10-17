import assert from 'node:assert/strict';
import {analyzeTrack,scanTrack,chooseEvents,estimateBpm,ROLES,SLICE_RATE,serializeClips,deserializeClips} from '../track-slicer.js';
const sr=8000,seconds=24,ch=new Float32Array(sr*seconds);
// Synthetic four-on-the-floor with hats and a bass line; four phrase intensities.
for(let i=0;i<ch.length;i++){
 const t=i/sr,beat=t*2.2,phase=beat%1;
 const kick=Math.exp(-phase*18)*Math.sin(2*Math.PI*90*t)*.58;
 const hat=((i*13%101)/50-1)*Math.exp(-((beat*2)%1)*34)*.09;
 const bass=Math.sin(2*Math.PI*110*t)*(.05+.1*(Math.floor(beat)%4===0));
 const section=t<6?.33:t<12?.6:t<18?1:.18;
 ch[i]=(kick+hat+bass)*section;
}
const audio={duration:seconds,length:ch.length,sampleRate:sr,numberOfChannels:1,getChannelData:()=>ch};
const frames=scanTrack(audio);
assert(frames.length>500);
const bpm=estimateBpm(frames);assert(bpm>=90&&bpm<=175);
const events=chooseEvents(audio,frames);
assert.equal(events.length,16);
assert.deepEqual(events.map(x=>x.role),ROLES.map(x=>x.id));
const clips=await analyzeTrack(audio,16);
assert.equal(clips.length,16);
assert.deepEqual(clips.map(x=>x.role),ROLES.map(x=>x.id));
assert(clips.every(c=>c.pcm.length<=SLICE_RATE*6&&c.pcm.length>=64));
assert(clips.every(c=>c.pcm.every(Number.isFinite)));
assert(clips[0].pcm.length<clips[5].pcm.length&&clips[5].pcm.length<clips[12].pcm.length,'One-shots shorter than musical phrases');
assert(Math.abs(clips[0].pcm[0])===0);assert(Math.abs(clips[0].pcm.at(-1))<1e-5);
assert(clips.some(c=>c.pcm.some(v=>Math.abs(v)>.015)));
await assert.rejects(()=>analyzeTrack(audio,32),/16/);
const saved=serializeClips(clips);const restored=deserializeClips(saved);
assert.deepEqual(restored.map(c=>c.role),ROLES.map(x=>x.id));
assert.equal(restored[0].pcm.length,clips[0].pcm.length);
assert.throws(()=>deserializeClips([{pcm:new Int16Array(0)}]));
console.log('PASS: 16 role-labelled event samples, unequal musical lengths, source attack detection, stable PCM and persistence');