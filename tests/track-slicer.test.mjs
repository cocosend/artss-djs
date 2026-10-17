import assert from 'node:assert/strict';
import {suggestStarts,analyzeTrack,SLICE_RATE,SLICE_SECONDS,describeSlice,serializeClips,deserializeClips} from '../track-slicer.js';
const sr=8000,seconds=21,ch=new Float32Array(sr*seconds);
for(let i=0;i<ch.length;i++){const t=i/sr;ch[i]=Math.sin(t*2*Math.PI*(t<10?110:440))*.32+(i%(sr*2)<200?Math.exp(-(i%(sr*2))/45)*.6:0)}
const audio={duration:seconds,length:ch.length,sampleRate:sr,numberOfChannels:1,getChannelData:()=>ch};
assert.equal(suggestStarts(audio,16).length,16);
const clips=await analyzeTrack(audio,16);
assert.equal(clips.length,16);assert(clips.every(c=>c.pcm.length===SLICE_RATE*SLICE_SECONDS));
assert(clips.every(c=>c.pcm.every(Number.isFinite)));
assert(clips.every((c,i)=>i===0||c.sortValue>=clips[i-1].sortValue));
assert(Math.abs(clips[0].pcm[0])===0);assert(Math.abs(clips[0].pcm.at(-1))===0);
const saved=serializeClips(clips);const restored=deserializeClips(saved);
assert.equal(restored.length,16);assert.equal(restored[0].pcm.length,clips[0].pcm.length);
assert.throws(()=>deserializeClips([{pcm:new Int16Array(0)}]));
console.log('PASS 16 auto slices; six-second fade, finite PCM, tone order, persistent pack format');