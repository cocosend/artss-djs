import test from 'node:test';import assert from 'node:assert/strict';
import {newSession,normalizeSession,recordStep,toggleStep,STEPS} from '../src/session.js';
import {PAD_COUNT,PRESETS,SCENES,makePCM,noteOffset} from '../src/sound-design.js';
test('One pad rack, exactly 16 steps, eight original banks',()=>{assert.equal(PAD_COUNT,8);assert.equal(STEPS,16);assert.equal(PRESETS.length,8);for(const scene of SCENES){const s=newSession(2);assert.equal(s.patterns[scene].length,8);for(const row of s.patterns[scene])assert.equal(row.length,16);}});
test('Existing 32-step projects trim safely without deleting first half',()=>{const old=newSession(3);old.patterns.GROOVE[0]=Array.from({length:32},(_,i)=>i===3||i===29?1:0);old.steps=32;old.sampleMode=true;const migrated=normalizeSession(old);assert.equal(migrated.patterns.GROOVE[0].length,16);assert.equal(migrated.patterns.GROOVE[0][3],1);assert.equal(migrated.sampleMode,undefined);assert.equal(migrated.patterns.GROOVE[0][15],0);});
test('Quantized overdub adds note; toggles and out-of-range are safe',()=>{const s=newSession();s.patterns.GROOVE[0].fill(0);assert.ok(recordStep(s,0,15,0.73));assert.equal(s.patterns.GROOVE[0][15],.73);assert.ok(toggleStep(s,0,15));assert.equal(s.patterns.GROOVE[0][15],0);assert.equal(recordStep(s,0,16,1),false);});
test('All 64 genre voices synthesize deterministic finite peak-bounded sound',()=>{for(let bank=0;bank<8;bank++)for(let pad=0;pad<8;pad++){const a=makePCM(pad,44100,bank,noteOffset(bank,pad,0)),b=makePCM(pad,44100,bank,noteOffset(bank,pad,0));assert.ok(a.length>200);assert.equal(a.length,b.length);let peak=0;for(let i=0;i<a.length;i++){const x=a[i];assert.ok(Number.isFinite(x));peak=Math.max(peak,Math.abs(x));if(i%587===0)assert.equal(x,b[i]);}assert.ok(peak>0.0001&&peak<1.01);}});
import {AudioEngine} from '../src/engine.js';
test('Muted and soloed tracks cannot be triggered manually',async()=>{
 const s=newSession();const engine=new AudioEngine(()=>s);const notes=[];
 engine.unlock=async()=>{engine.ctx={currentTime:0};engine.bus={input:{}};return engine.ctx};
 engine.voice=(_ctx,_dst,slot)=>{notes.push(slot)};
 s.mutes[0]=true;assert.equal(await engine.hit(0),false);assert.deepEqual(notes,[]);
 s.mutes[0]=false;s.solos[1]=true;assert.equal(await engine.hit(0),false);
 assert.equal(await engine.hit(1),true);assert.deepEqual(notes,[1]);
 await assert.rejects(()=>engine.hit(8),/Некорректный/);
});
test('Live mixer queues a scene and switches exactly on step zero',()=>{
 const s=newSession();const engine=new AudioEngine(()=>s);engine.playing=true;
 const changes=[];engine.onScene=scene=>changes.push(scene);
 engine.ctx={currentTime:0,state:'running'};engine.bus={input:{}};engine.voice=()=>{};engine.absolute=15;engine.nextTime=.02;
 s.bpm=120;engine.queueScene('DROP');assert.equal(s.scene,'GROOVE');
 engine.tick();assert.equal(s.scene,'GROOVE');assert.equal(engine.pendingScene,'DROP');
 engine.ctx.currentTime=.1;engine.tick();assert.equal(s.scene,'DROP');assert.equal(engine.pendingScene,null);assert.deepEqual(changes,['DROP','DROP']);
 engine.pause(true);assert.equal(engine.absolute,0);
});