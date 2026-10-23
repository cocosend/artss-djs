import test from 'node:test';import assert from 'node:assert/strict';
import {loopedStep,loopAnchor} from '../app/performance-loop.js';
import {KIT_VARIANTS} from '../app/sounds.js';
import {readFileSync,existsSync} from 'node:fs';
test('one two and four-beat loops are beat-aligned and bounded',()=>{
 assert.equal(loopAnchor(7,4),4);assert.equal(loopAnchor(13,8),8);
 assert.deepEqual([4,5,6,7,8,9].map(v=>loopedStep(v,4,4)),[4,5,6,7,4,5]);
 assert.deepEqual([8,15,16,23,24].map(v=>loopedStep(v,8,8)),[8,15,8,15,8]);
 assert.equal(loopedStep(-4,0,0),0);assert.equal(loopedStep(Number.NaN,4,0),0);
});
test('four selectable real sound kits cover all eight pads',()=>{
 assert.equal(KIT_VARIANTS.length,4);
 for(const kit of KIT_VARIANTS){assert.equal(kit.length,8);for(const path of kit){assert.ok(/^\/samples\/.+\.wav$/.test(path));assert.ok(existsSync('.'+path),path)}}
 for(let pad=0;pad<8;pad++)assert.ok(new Set(KIT_VARIANTS.map(kit=>kit[pad])).size>=2);
});
test('Safari-compatible full takes are limited to 90 seconds',()=>{
 const engine=readFileSync('src/engine.ts','utf8'),recorder=readFileSync('src/sample-recorder.ts','utf8');
 assert.match(engine,/private takeRecorder=new SampleRecorder/);
 assert.match(engine,/await this.takeRecorder.start/);
 assert.match(engine,/direct\?this.bus.master:null,90000/);
 assert.match(recorder,/maxDurationMs = 12000/);
 assert.doesNotMatch(engine,/if\(typeof MediaRecorder==='undefined'\)throw/);
});
test('UI preserves minimal layout, loops and WAV take export',()=>{
 const main=readFileSync('src/main.ts','utf8'),html=readFileSync('index.html','utf8'),sw=readFileSync('sw.js','utf8');
 assert.match(main,/blob.type.includes\('wav'\)\?'wav'/);
 assert.match(main,/engine.setLoop\(size\)/);
 assert.equal((html.match(/data-loop="/g)??[]).length,4);
 assert.match(sw,/app\/performance-loop.js/);
});

test('AEP37 eight pad assignments and shipped WAV assets',()=>{
 const names=['kick.wav','sub_bass.wav','clap.wav','hat.wav','brass_D_sharp.wav','brass_F.wav','brass_F_sharp.wav','brass_G_sharp.wav'];
 for(let i=0;i<8;i++){assert.equal(KIT_VARIANTS[3][i],'/samples/'+names[i]);assert.ok(existsSync('./samples/'+names[i]));}
 const main=readFileSync('src/main.ts','utf8'),html=readFileSync('index.html','utf8');
 assert.match(main,/window.addEventListener\('keydown',event/);
 assert.match(main,/engine.hit\(pad,1\)/);
 assert.match(html,/aep37-icon.webp/);
});
