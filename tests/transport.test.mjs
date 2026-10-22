import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../app/engine.js';
import {defaultSession} from '../app/model.js';

function fixture(now=1){
 const stops=[],ramps=[];
 const param=()=>({value:1,setValueAtTime(){},linearRampToValueAtTime(v,t){ramps.push([v,t])},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}});
 const node=()=>({gain:param(),frequency:param(),Q:param(),connect(target){return target},disconnect(){}});
 const ctx={currentTime:now,sampleRate:48000,createGain:node,createBiquadFilter:node,createBufferSource:()=>({...node(),start(){},stop(t){stops.push(t)}})};
 const e=new Engine(defaultSession);e.ctx=ctx;e.bank.resolve=()=>({buffer:{duration:.5},gain:1,lowCut:20,highCut:16000});
 return {e,ctx,stops,ramps,node};
}
test('STOP cancels queued notes before their scheduled start',()=>{
 const {e,ctx,stops,node}=fixture();e.voice(ctx,node(),0,1.1,1,0,1);e.stop();
 assert.ok(stops.at(-1)<=ctx.currentTime,'queued note would sound after STOP');
});
test('STOP fades an audible voice within 18 milliseconds',()=>{
 const {e,ctx,stops,node}=fixture();e.voice(ctx,node(),0,.8,1,0,1);e.stop();
 assert.ok(stops.at(-1)>ctx.currentTime&&stops.at(-1)<=ctx.currentTime+.018);
});
test('STOP during first sample decode cancels the pending pad hit',async()=>{
 const e=new Engine(defaultSession);e.ctx={state:'running',currentTime:1};e.bus={a:{},b:{}};
 let finish; e.bank.resolve=()=>undefined;e.bank.ensurePad=()=>new Promise(resolve=>{finish=resolve});
 let voices=0;e.voice=()=>voices++;
 const hit=e.hit(0);e.stop();finish();await hit;assert.equal(voices,0);
});
test('STOP during unlock cancels pending record activation',async()=>{
 const e=new Engine(defaultSession);let finish;e.unlock=()=>new Promise(resolve=>{finish=resolve});
 let starts=0;e.start=async()=>{starts++;e.running=true};
 const rec=e.toggleRecord();e.stop();finish();await rec;assert.equal(starts,0);assert.equal(e.recording,false);
});
