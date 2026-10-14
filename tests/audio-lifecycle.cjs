'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('app.js','utf8');
const marker='// === app.js ===';
assert(code.includes(marker),'audio runtime boundary missing');
new vm.Script(code,{filename:'app.js'});
const prefix=code.slice(0,code.indexOf(marker));
const ctx={
 console,Blob,performance:{now:()=>0},window:{},navigator:{},
 setInterval:()=>31,clearInterval:()=>{},
 setTimeout:(fn)=>{fn();return 32},clearTimeout:()=>{},
};
vm.runInNewContext(prefix+'\n globalThis.EngineTest=SoundEngine;globalThis.StateTest=blankState;',ctx,{filename:'audio-runtime.js'});
const Engine=ctx.EngineTest;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const engine=new Engine();
 let release;const gate=new Promise(resolve=>{release=resolve});
 engine.unlock=()=>gate;
 engine.ctx={currentTime:12};
 engine.graph={set(){},main:{gain:{cancelScheduledValues(){},setTargetAtTime(){}}}};
 engine.schedule=()=>{throw Error('cancelled startup must not schedule')};
 const pending=engine.start();
 assert.equal(engine.running,false);
 engine.stop();release(engine.ctx);
 assert.equal(await pending,false,'stop cancels pending AudioContext unlock');
 assert.equal(engine.running,false);
 const second=new Engine();
 second.unlock=async()=>({currentTime:10});
 second.ctx={currentTime:10};
 second.graph={set(){},main:{gain:{cancelScheduledValues(){},setTargetAtTime(){}}}};
 let scheduled=0;second.schedule=()=>scheduled++;
 const starts=await Promise.all([second.start(),second.start()]);
 assert.equal(starts.filter(Boolean).length,1,'double tap cannot schedule two clocks');
 assert.equal(scheduled,1);
 second.stop();
 assert.equal(second.timer,null);
 const late=new Engine();
 late.ctx={currentTime:25};
 late.running=true;late.next=10;late.count=0;
 let hits=0;late.graph={bus:{}};late.playBuffer=()=>{hits++};
 late.onStep=()=>{};
 late.schedule();
 assert(late.next>24.8,'mobile background resume skips stale steps');
 assert(late.count>100,'clock advances past missed background beats');
 assert(hits<=32,'background resync must not flood output with stale notes');
 const recorded=[];
 class Recorder{
  static isTypeSupported(){return true}
  constructor(stream,options){this.mimeType=options?.mimeType||'audio/mp4';this.state='inactive'}
  start(){this.state='recording'}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['last-frame'],{type:'audio/mp4'})});this.onstop()})}
 }
 ctx.MediaRecorder=Recorder;
 const rec=new Engine();
 rec.unlock=async()=>({});
 rec.out={stream:{}};
 rec.onRecordingReady=(blob,ext)=>recorded.push({blob,ext});
 assert.equal(await rec.toggleRecording(),true);
 assert.equal(await rec.toggleRecording(),false);
 assert.equal(await rec.toggleRecording(),false,'ignore stop/start race until dataavailable');
 await tick();
 assert.equal(recorded.length,1);
 assert.equal(await recorded[0].blob.text(),'last-frame','last chunk must be retained');
 assert.equal(recorded[0].ext,'m4a');
 assert.equal(rec.recording,false);
 assert.equal(rec.recordingStopping,false);
 console.log('PASS DJ audio transport cancellation, duplicate start, background resync, recorder final chunk');
}
main().catch(error=>{console.error(error);process.exitCode=1});
