import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DRUM_SAMPLES,SAMPLE_PATHS,sampleName} from '../src/sample-library.js';
test('Exactly sixteen licensed real samples, available for every genre',async()=>{
 assert.equal(SAMPLE_PATHS.length,16);assert.equal(new Set(SAMPLE_PATHS).size,16);
 for(const p of SAMPLE_PATHS){const data=await readFile(new URL('../'+p,import.meta.url));
  assert.ok(data.length>=4000,p);assert.equal(data.subarray(0,4).toString(),'RIFF',p);
  assert.equal(data.subarray(8,12).toString(),'WAVE',p);
  assert.ok([1,2].includes(data.readUInt16LE(22)),p);
  assert.ok([22050,44100,48000].includes(data.readUInt32LE(24)),p);
 }
 for(let bank=0;bank<8;bank++){for(const pad of [0,2,3,4,5,7])assert.ok(Object.values(DRUM_SAMPLES).includes(sampleName(bank,pad)));}
});