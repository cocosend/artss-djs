import assert from 'node:assert/strict';
import {CREATIVE_PADS,CreativePackEngine,creativeEvents,synthCreativePCM} from '../creative-pack.js';
assert.equal(CREATIVE_PADS.length,32);
assert.equal(new Set(CREATIVE_PADS.map(p=>p.id)).size,32);
for(const p of CREATIVE_PADS){
 const pcm=synthCreativePCM(p,p.note,11025,120);
 let peak=0,energy=0;
 for(const value of pcm){assert(Number.isFinite(value),p.name+' has invalid PCM');peak=Math.max(peak,Math.abs(value));energy+=value*value;}
 assert(peak>.03&&peak<=.751,p.name+' is silent or clipping');
 assert(Math.sqrt(energy/pcm.length)>.005,p.name+' lacks audible energy');
 assert(Math.abs(pcm[pcm.length-1])<.01,p.name+' ends with a click');
 assert.deepEqual(pcm,synthCreativePCM(p,p.note,11025,120),p.name+' must render deterministically');
 if(p.type==='loop')assert(Array.from({length:16},(_,step)=>creativeEvents(p,step,0)).flat().length>0,p.name+' has no musical events');
}
const param=()=>({value:1,cancelScheduledValues(){},setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){}});
const ctx={currentTime:0,createGain:()=>({gain:param(),connect(){},disconnect(){}})};
const engine={ctx,graph:{bus:{}},state:{bpm:120},count:3,running:true};
const pack=new CreativePackEngine(engine);pack.enabled=true;pack.restore([5,9]);
pack.queue(6);assert.equal(pack.pending.get(6).at,16);
pack.applyPending(15,ctx,{},1);assert(pack.loops.has(5));assert(!pack.loops.has(6));
pack.applyPending(16,ctx,{},2);assert(!pack.loops.has(5));assert(pack.loops.has(6),'bass switch did not reach quantized boundary');
pack.queue(10);pack.queue(11);assert(!pack.pending.has(10),'stale same-group request survived');
pack.applyPending(16,ctx,{},2);assert(!pack.loops.has(9));assert(pack.loops.has(11));
pack.setStep(1,1);assert(pack.events(CREATIVE_PADS[0],1,0).length===1,'edited step is ignored');
pack.setStep(1,1);assert(pack.events(CREATIVE_PADS[0],1,0).length===0,'step cannot be disabled');
let stopped=0;
pack.voices.add({ctx,id:25,group:6,time:0,gain:{gain:param()},source:{stop(){stopped++}}});
pack.choke(ctx,25,6,0,false,true);assert.equal(stopped,1,'repeated vocal tap must retrigger cleanly');
const selected=pack.selection();pack.stop();assert.deepEqual(pack.selection(),selected,'stop must preserve the arrangement for WAV export');
let writes=0;const offline=new CreativePackEngine(engine);offline.restore([1,2,3,5,9]);offline.play=()=>writes++;
for(let step=0;step<16;step++)offline.schedule(ctx,{},step/8,step,0,false);
assert(writes>=16,'offline render omitted selected pack loops');
offline.requestScene('DROP');offline.applyPending(32,ctx,{},4);
const sceneSelection=new Set(offline.selection()),renderedSelection=new Set();
engine.state.autoScene=true;engine.getScene=()=> 'DROP';offline.play=(_ctx,_out,p)=>renderedSelection.add(p.id);
for(let step=0;step<16;step++)offline.schedule(ctx,{},step/8,step,0,false);
assert.deepEqual(renderedSelection,sceneSelection,'auto-scene WAV and live arrangement differ');
pack.restore([5,6,7,9,10]);assert.equal([...pack.loops].filter(id=>id>=5&&id<=8).length,1,'imported bass choices bypass choke groups');
console.log('PASS 32 Creative voices: finite PCM, audible energy, peaks, fades, deterministic rendering, quantization, choke, edits and offline arrangement');
