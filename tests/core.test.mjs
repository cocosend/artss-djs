import test from 'node:test';import assert from 'node:assert/strict';
import {defaultSession,sanitizeSession,note,toggle,createPattern,STEPS,STYLES} from '../app/model.js';
import {analyzeAudio,choosePad} from '../app/smart.js';
import {composeGroove} from '../app/arranger.js';
import {AUDIO_HEADROOM,crossfadeGains,voiceGain,lowpassHz} from '../app/audio-quality.js';
import {resolveMusicSource} from '../app/music-sources.js';
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

test('music sources validate exact domains, trusted embed origins and paths',()=>{
 const sc=resolveMusicSource('https://soundcloud.com/artist/track');assert.equal(sc.platform,'SoundCloud');assert.match(sc.embedUrl,/w.soundcloud.com/);
 const yt=resolveMusicSource('https://music.youtube.com/watch?v=dQw4w9WgXcQ');assert.equal(yt.platform,'YouTube Music');assert.match(yt.embedUrl,/youtube-nocookie.com\/embed/);
 const apple=resolveMusicSource('https://music.apple.com/us/album/example/123456789?i=987654321');assert.equal(apple.platform,'Apple Music');assert.match(apple.embedUrl,/embed.music.apple.com/);
 for(const link of ['javascript:alert(1)','https://fake.soundcloud.com/user/track','https://soundcloud.com.bad.test/user/track','http://127.0.0.1/audio','https://youtube.com/watch?v=%3Cscript%3E','https://music.apple.com/us/browse','https://youtube.com/watch?v=dQw4w9WgXcQ&list=o'])assert.throws(()=>resolveMusicSource(link));
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
