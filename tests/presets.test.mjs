import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePreset,PRESET_COUNT,PRESETS_PER_STYLE} from '../app/presets.js';
import {STYLES} from '../app/model.js';

test('preset catalog addresses over three million deterministic rhythmic combinations',()=>{
 assert.equal(PRESETS_PER_STYLE,262144);
 assert.equal(PRESET_COUNT,3145728);
 assert.equal(PRESET_COUNT,STYLES.length*PRESETS_PER_STYLE);
 assert.deepEqual(generatePreset(17),generatePreset(17));
 assert.throws(()=>generatePreset(-1),RangeError);
 assert.throws(()=>generatePreset(PRESET_COUNT),RangeError);
 assert.throws(()=>generatePreset(1.5),RangeError);
});
test('each of 18 bits is independently audible within a style without changing kick anchors',()=>{
 const base=generatePreset(0);
 for(let bit=0;bit<18;bit++){
  const variation=generatePreset(1<<bit);
  assert.notDeepEqual(variation.pattern,base.pattern,'bit '+bit+' changes rhythm');
  assert.deepEqual(variation.pattern[0],base.pattern[0],'kick anchors preserved');
 }
});
test('style family and pattern rows remain bounded',()=>{
 for(let style=0;style<STYLES.length;style++){
  for(const offset of [0,1,3,7,255,65535,PRESETS_PER_STYLE-1]){
   const item=generatePreset(style*PRESETS_PER_STYLE+offset);
   assert.equal(item.style,style);
   assert.equal(item.pattern.length,8);
   for(const row of item.pattern){assert.equal(row.length,16);assert.ok(row.every(x=>Number.isFinite(x)&&x>=0&&x<=1));}
  }
 }
});
