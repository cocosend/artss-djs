import test from 'node:test';import assert from 'node:assert/strict';
import {defaultSession,sanitizeSession,note,toggle,createPattern,STEPS,STYLES} from '../app/model.js';
import {analyzeAudio,choosePad} from '../app/smart.js';
import {composeGroove} from '../app/arranger.js';
import {AUDIO_HEADROOM,crossfadeGains,voiceGain,lowpassHz,recordingExtension} from '../app/audio-quality.js';
import {pcmWav,preferPcmRecording} from '../app/sample-recorder.js';
import {knobDragValue} from '../app/touch.js';
test('8 pads, 16 steps and different style compositions',()=>{const a=defaultSession();assert.equal(a.pattern.length,8);for(const row of a.pattern)assert.equal(row.length,16);assert.ok(STYLES.length>=12);assert.notDeepEqual(createPattern(0),createPattern(5));});
test('live overdub adds notes but never clears existing events',()=>{const p=createPattern();assert.equal(note(p,5,9,.85),true);assert.ok((p[5][9]??0)>.8);assert.equal(note(p,5,9,.25),true);assert.ok((p[5][9]??0)>.8);toggle(p,5,9);assert.equal(p[5][9],0);});
test('older 32 step projects truncate safely to 16',()=>{const raw={version:16,bpm:143,bank:3,pattern:Array.from({length:16},()=>Array(32).fill(1)),levels:Array(8).fill(1.5)};const a=sanitizeSession(raw);assert.equal(a.pattern.length,8);assert.equal(a.pattern[0].length,16);assert.equal(a.tempo,143);assert.equal(a.style,3);assert.equal(a.levels[0],1.2);});
test('invalid session data never creates malformed pads',()=>{const a=sanitizeSession({pattern:[[NaN,Infinity,-20,50]],levels:[-20,Infinity]});assert.equal(a.pattern[0][0],0);assert.equal(a.pattern[0][2],0);assert.equal(a.pattern[0][3],1);assert.equal(a.pattern[7].length,STEPS);assert.equal(a.levels[0],0);});
test('transient analysis caps gain and detects audible events',()=>{const rate=44100,data=new Float32Array(44100);for(let i=120;i<12000;i++)data[i]=Math.sin(i*.02)*.21*Math.exp(-(i-120)/2000);const a=analyzeAudio([data],rate);assert.ok(a.start<800);assert.ok(a.end<=data.length);assert.ok(a.peak>.17);assert.ok(a.gain>.2&&a.gain<=2.2);assert.ok(choosePad(a)>=0&&choosePad(a)<8);});
test('silence and invalid source are safe',()=>{const z=analyzeAudio([new Float32Array(4096)],44100);assert.equal(z.peak,0);assert.equal(z.gain,1);assert.throws(()=>analyzeAudio([],44100),/аудио/);});
test('audio loading clamps to supported source metadata',()=>{const s=sanitizeSession({style:999,scene:-5,tempo:700,selected:100,quantize:false});assert.equal(s.style,STYLES.length-1);assert.equal(s.scene,0);assert.equal(s.tempo,175);assert.equal(s.selected,7);assert.equal(s.quantize,false);});

test('dual-bus controls persist and clamp invalid input',()=>{const s=sanitizeSession({crossfader:3,filter:-2,echo:Infinity});assert.equal(s.crossfader,1);assert.equal(s.filter,0);assert.equal(s.echo,.12);const d=defaultSession();assert.equal(d.crossfader,.5);assert.equal(d.filter,1);assert.equal(d.echo,.12)});
test('twelve scoped genres produce distinct, bounded live grooves',()=>{const seen=new Set();for(let i=0;i<STYLES.length;i++){const g=composeGroove(i,.8,i+1);assert.equal(g.length,8);assert.ok(g.every(row=>row.length===16&&row.every(v=>v>=0&&v<=1)));seen.add(JSON.stringify(g));}assert.ok(seen.size>=10)});

test('EQ fields are safe and backwards compatible',()=>{const a=sanitizeSession({eqLow:100,eqMid:-90,eqHigh:NaN,crossfader:.67});assert.equal(a.eqLow,12);assert.equal(a.eqMid,-12);assert.equal(a.eqHigh,0);assert.equal(a.crossfader,.67);const b=defaultSession();assert.equal(b.eqLow,0);assert.equal(b.eqMid,0);assert.equal(b.eqHigh,0)});

test('equal-power mix stays bounded and transitions smoothly',()=>{
 const left=crossfadeGains(0),center=crossfadeGains(.5),right=crossfadeGains(1);
 assert.ok(left[0]>.8&&left[1]<1e-10);assert.ok(right[1]>.8&&right[0]<1e-10);
 assert.ok(Math.abs(center[0]-center[1])<1e-9);
 for(let i=0;i<=100;i++){const g=crossfadeGains(i/100);assert.ok(g.every(n=>Number.isFinite(n)&&n>=0&&n<=.82));assert.ok(Math.abs(g[0]**2+g[1]**2-.82**2)<1e-10)}
});
test('sample voice gain is safe for imported and extreme source levels',()=>{
 for(const values of [[1,1,2.2],[1.8,1.2,3],[.1,.4,.8],[NaN,1,1],[-1,2,1]]){const gain=voiceGain(...values);assert.ok(gain>=0&&gain<=.94)}
 assert.ok(voiceGain(1,1,.85)>.6);assert.equal(voiceGain(0,1,1),0);
});
test('audio filter covers low/mid/high without crossing Nyquist',()=>{
 for(const rate of [44100,48000,96000]){let last=0;for(let i=0;i<=100;i++){const v=lowpassHz(i/100,rate);assert.ok(v>=40&&v<=rate*.45);assert.ok(v>=last);last=v;}}
 assert.ok(lowpassHz(0,48000)<100);assert.ok(lowpassHz(.5,48000)>500);assert.ok(AUDIO_HEADROOM.master<1);
});

test('sample overrides are user-controlled and never imported by an automatic classifier',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync('src/sounds.ts','utf8'),engine=readFileSync('src/engine.ts','utf8');
 assert.match(source,/overridePad===undefined/);
 assert.match(source,/const url=options\[0\]/);
 assert.match(source,/async restoreFactory\(/);
 assert.match(source,/store\.delete\(pad\)/);
 assert.match(engine,/async restoreFactorySound\(/);
 assert.match(engine,/if\(slot===undefined\)throw/);
});

test('every factory slot resolves to one fixed shipped sample, never fallback synthesized tones',async()=>{
 const {readFileSync,existsSync}=await import('node:fs');
 const source=readFileSync('src/sounds.ts','utf8');
 const engine=readFileSync('src/engine.ts','utf8');
 const sampleRows=source.match(/\['\/samples\/[^\]]+'\]/g)??[];
 assert.equal(sampleRows.length,8,'All 8 pads require authored WAV files');
 for(const row of sampleRows){
  const match=row.match(/'([^']+\.wav)'/);assert.ok(match&&existsSync('.'+match[1]),row);
 }
 assert.ok(!engine.includes('createOscillator'),'No synthetic substitute on missing pad WAV');
 assert.match(engine,/if\(!sample\)return/);
});

test('recording formats retain their actual container extensions',()=>{
 for(const [mime,ext] of [['audio/wav','wav'],['audio/x-wav','wav'],['audio/wave','wav'],['audio/MP4;codecs=mp4a.40.2','m4a'],['audio/webm;codecs=opus','webm']])assert.equal(recordingExtension(mime),ext);
 assert.throws(()=>recordingExtension('application/octet-stream'),/не поддерживается/);
});
test('WebKit WAV fallback writes valid interleaved stereo 16-bit PCM',async()=>{
 const frame=new Float32Array([.25,-.25,.5,-.5,1,-1,0,0]);
 const blob=pcmWav([frame],4,48000);
 assert.equal(blob.type,'audio/wav');assert.equal(blob.size,44+4*4);
 const view=new DataView(await blob.arrayBuffer());
 const chars=(a,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(view.getUint8(a+i))).join('');
 assert.equal(chars(0,4),'RIFF');assert.equal(chars(8,4),'WAVE');assert.equal(chars(36,4),'data');
 assert.equal(view.getUint32(24,true),48000);assert.equal(view.getUint16(22,true),2);
 assert.equal(view.getUint16(34,true),16);assert.equal(view.getUint32(40,true),16);
 assert.ok(view.getInt16(44,true)>8000);assert.ok(view.getInt16(46,true)<-8000);
 assert.equal(view.getInt16(56,true),0);
});
test('async IndexedDB sample restore must never overwrite a freshly imported pad',async()=>{
 const {readFileSync}=await import('node:fs');
 const text=readFileSync('src/sounds.ts','utf8');
 assert.match(text,/!this.deleted.has\(key\)&&!this.custom.has\(key\)/);
});

test('WebKit and all iOS browsers use reliable lossless PCM for short captures',()=>{
 const safari='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
 const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/127.0 Mobile/15E148 Safari/604.1';
 const chrome='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Mobile Safari/537.36';
 assert.equal(preferPcmRecording(safari,true),true);
 assert.equal(preferPcmRecording(iphone,true),true);
 assert.equal(preferPcmRecording(chrome,true),false);
 assert.equal(preferPcmRecording(chrome,false),true);
});

test('EQ drag has stable pixel sensitivity, no jumps on touch and safe bounds',()=>{
 assert.equal(knobDragValue(0,0),0);
 assert.equal(knobDragValue(0,-35),5);
 assert.equal(knobDragValue(0,35),-5);
 assert.equal(knobDragValue(4,-35),9);
 assert.equal(knobDragValue(0,-900),12);
 assert.equal(knobDragValue(0,900),-12);
 assert.equal(knobDragValue(NaN,0),0);
 assert.equal(knobDragValue(3,NaN),3);
});

test('Safari live sample capture bypasses MediaStream roundtrip and outputs worklet PCM',async()=>{
 const {readFileSync}=await import('node:fs');
 const engine=readFileSync('src/engine.ts','utf8');
 const recorder=readFileSync('src/sample-recorder.ts','utf8');
 const worklet=readFileSync('src/pcm-capture.ts','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert.match(engine,/directPcm\?this.bus!\.master:null/);
 assert.match(engine,/source==='live'&&!directPcm\?this.ensureCapture\(\):null/);
 assert.match(recorder,/audioWorklet\.addModule\('\/app\/pcm-capture\.js'\)/);
 assert.match(recorder,/this\.workletInput\.disconnect\(this\.worklet\)/);
 assert.match(worklet,/registerProcessor\('artss-pcm-capture',PcmCapture\)/);
 assert.match(sw,/app\/pcm-capture\.js/);
});

test('pad-only recording never requests microphone permission',async()=>{
 const {readFileSync}=await import('node:fs');
 const sample=readFileSync('src/sample-recorder.ts','utf8');
 const engine=readFileSync('src/engine.ts','utf8');
 const html=readFileSync('index.html','utf8');
 assert.ok(!sample.includes('getUserMedia')&&!sample.includes('ownedStream'));
 assert.ok(!html.includes('value="mic"'));
 assert.ok(engine.includes('this.recordArmed=!this.recordArmed'));
 assert.ok(engine.includes('if(this.recordArmed&&this.running)'));
});

test('auto mix positions are smooth and bounded across 8-bar phrase',async()=>{const {autoMixPosition}=await import('../app/audio-quality.js');assert.equal(autoMixPosition(0),0);assert.equal(autoMixPosition(16),1);assert.equal(autoMixPosition(32),0);for(let beat=0;beat<32;beat+=.02){const a=autoMixPosition(beat),b=autoMixPosition(beat+.02);assert.ok(a>=0&&a<=1&&Math.abs(a-b)<.03)}});

test('BPM estimator recognizes 120 BPM percussion onsets without forced resampling',async()=>{
 const {estimateTempoFromPulses,normalizeGain,crossfadeCurve,planTransition}=await import('../app/automix.js');
 const envelopes=new Float32Array(2400);
 for(let beat=0;beat<46;beat++){const onset=10+beat*50;envelopes[onset]=1;envelopes[onset+1]=.4;}
 const detected=estimateTempoFromPulses(envelopes,100);
 assert.ok(Math.abs(detected.bpm-120)<=2,detected);
 assert.ok(detected.confidence>0);
 const normal=normalizeGain({rms:.24,peak:.9});
 assert.ok(normal>.15&&normal<=.92,normal);
 const fade=crossfadeCurve();
 assert.ok(fade.incoming[0]<.001&&fade.outgoing[0]>.8);
 assert.ok(fade.incoming.at(-1)>.8&&fade.outgoing.at(-1)<.001);
 for(const x of fade.incoming)assert.ok(Number.isFinite(x)&&x<=1&&x>=0);
 const a={bpm:120,confidence:.8,firstBeat:.1,rms:.15,peak:.8,duration:145};
 const b={bpm:125,confidence:.7,firstBeat:.25,rms:.1,peak:.9,duration:145};
 const plan=planTransition(a,b);
 assert.ok(plan.matchable&&Math.abs(plan.playbackRate-.96)<.01,plan);
 assert.ok(plan.startNext>0&&plan.fadeSeconds>0&&plan.offsetNext>=0,plan);
});
test('local track mixing goes through existing limiter with no separate deck',async()=>{
 const {readFileSync}=await import('node:fs');
 const player=readFileSync('src/automix-player.ts','utf8');
 const engine=readFileSync('src/engine.ts','utf8');
 const html=readFileSync('index.html','utf8');
 assert.match(player,/connectMusicSource\(mix\)/);
 assert.match(player,/setValueCurveAtTime/);
 assert.match(player,/planTransition/);
 assert.match(engine,/const target=this.bus.input;node.connect\(target\)/);
 assert.match(html,/id="trackAutoMix"/);
 assert.ok(!html.includes('id="deckB"'));
});
