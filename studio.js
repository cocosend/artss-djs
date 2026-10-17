// ARTSS STUDIO 8 — single audio runtime. No second mixer, no backend or external audio dependencies.
const $=(sel,root=document)=>root.querySelector(sel);
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const bound=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(+n)?+n:min));
const PAD_NAMES=['909 KICK','SUB BASS','909 CLAP','CLOSED HAT','BASSLINE','SNARE','RIM SHOT','OPEN HAT','ACID 303','RAVE STAB','SHAKER','COWBELL','DARK RIDE','TOM','RISER FX','IMPACT'];
const KEYS=['1','2','3','4','Q','W','E','R','A','S','D','F','Z','X','C','V'];
const COLORS=['#ff6471','#d06581','#ff7990','#eec89e','#7bd4dc','#ee818a','#b0c6d4','#f0c18c','#93c8eb','#bd9eea','#8ececa','#ffce83','#c5cbd9','#df8a80','#b8a9f2','#ea5f71'];
const PRESETS=[
 {name:'WAREHOUSE',tag:'ROLLING TECHNO',bpm:136,style:0},
 {name:'HARDGROOVE',tag:'PERCUSSION',bpm:145,style:1},
 {name:'DEEP DUB',tag:'HYPNOTIC',bpm:126,style:2},
 {name:'ACID ROOM',tag:'303 TECHNO',bpm:142,style:3},
 {name:'INDUSTRIAL',tag:'HARD TECHNO',bpm:154,style:4},
 {name:'NIGHT DRIVE',tag:'MELODIC TECHNO',bpm:130,style:5},
 {name:'RAVE SIGNAL',tag:'PEAK TIME',bpm:150,style:6},
 {name:'DARK PHONK',tag:'DRIFT',bpm:148,style:7},
];
const SCENES=['INTRO','GROOVE','BUILD','DROP','BREAK'];
const key='artss-studio-session-v8';
const createGrid=()=>Array.from({length:16},()=>Array(16).fill(0));
const noteSeq=[0,0,3,0,5,3,2,0,0,-2,3,5,7,5,3,2];
const hitSteps=(g,row,steps,volume=1)=>{for(const step of steps)g[row][step]=volume};
function presetPattern(preset,scene){
 const g=createGrid(),style=preset.style;
 hitSteps(g,0,style===7?[0,6,8,14]:[0,4,8,12],1);
 hitSteps(g,2,style===7?[4,12]:[4,12],.66);
 hitSteps(g,3,[2,6,10,14],.40);
 hitSteps(g,7,[7,15],.38);
 hitSteps(g,4,style===1?[2,5,7,10,13,15]:style===3?[3,6,9,12,15]:[2,6,10,14],.56);
 if(style===1||style===4){hitSteps(g,5,[4,12],.46);hitSteps(g,6,[3,7,11,15],.42);hitSteps(g,12,[7,15],.29)}
 if(style===2){g[3][2]=.2;g[3][6]=.22;g[3][10]=.23;g[3][14]=.25;hitSteps(g,1,[0,8],.35)}
 if(style===3){hitSteps(g,8,[1,3,6,7,9,11,14,15],.54);g[4][6]=0}
 if(style===5){hitSteps(g,9,[0,8],.42);hitSteps(g,4,[2,5,10,13],.53)}
 if(style===6){hitSteps(g,9,[0,4,8,12],.48);hitSteps(g,12,[6,14],.22)}
 if(style===7){hitSteps(g,11,[3,7,10,14],.52);hitSteps(g,5,[4,12],.28)}
 if(scene==='INTRO'){for(let r=0;r<16;r++)if(![0,3,7,12].includes(r))g[r].fill(0);g[0][8]=0}
 if(scene==='BUILD'){hitSteps(g,5,[4,12,15],.34);hitSteps(g,3,[0,2,4,6,8,10,12,14,15],.47);g[14][14]=.38}
 if(scene==='DROP'){hitSteps(g,0,[0,4,8,12],1);g[15][0]=.76;g[9][0]=.53;g[9][8]=.49;g[5][12]=.59}
 if(scene==='BREAK'){for(let r=0;r<16;r++)if(![3,4,8,9,12].includes(r))g[r].fill(0);hitSteps(g,4,[2,10],.42)}
 return g;
}
function blank(bank=0){const p=PRESETS[bank];return {bank,bpm:p.bpm,scene:'GROOVE',auto:false,swing:0,master:.75,filter:1,drive:.05,space:.09,delay:.02,mutes:Array(16).fill(false),patterns:Object.fromEntries(SCENES.map(s=>[s,presetPattern(p,s)]))}}
function restore(data){if(!data||!Number.isInteger(data.bank)||!PRESETS[data.bank]||!data.patterns)return null;
 const out=blank(data.bank);out.bpm=Math.round(bound(data.bpm,65,195));out.scene=SCENES.includes(data.scene)?data.scene:'GROOVE';out.auto=!!data.auto;
 for(const f of ['swing','master','filter','drive','space','delay'])out[f]=bound(data[f]??out[f],0,f==='swing'?.45:1);
 out.mutes=Array.from({length:16},(_,i)=>!!data.mutes?.[i]);
 for(const scene of SCENES){const g=data.patterns[scene];if(!Array.isArray(g)||g.length!==16)return null;out.patterns[scene]=g.map(row=>Array.from({length:16},(_,i)=>bound(row?.[i]??0,0,1)))}return out;}
function readSession(){try{return restore(JSON.parse(localStorage.getItem(key)||'null'))||blank()}catch{return blank()}}
let state=readSession(),engine,activeTab='pads',selectedPad=0,activeStep=-1,lastBeat=0,clockBase=0,tapTimes=[],undoStack=[],toastTimer=0,saveTimer=0,rendering=false,recordReady=null;
function store(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(key,JSON.stringify(state))}catch{}},180)}
function announce(message,isError=false){const target=$('#toast');target.textContent=message;target.hidden=false;target.style.borderColor=isError?'#ff4b5d':'#8edbda';clearTimeout(toastTimer);toastTimer=setTimeout(()=>target.hidden=true,3000)}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),40000)}
function ramp(t,atk,rel,dur){return Math.min(1,t/atk)*Math.min(1,Math.max(0,(dur-t)/rel))}
function xorshift(seed){let s=seed|0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967295*2-1}}
function makePCM(slot,sr,bank){
 const times=[.50,.44,.30,.16,.54,.26,.13,.50,.50,.62,.20,.28,.60,.45,1.05,.86];
 const duration=times[slot],n=Math.ceil(sr*duration),data=new Float32Array(n),rnd=xorshift(1703+slot*3877+bank*993),two=Math.PI*2;
 let phase=0,phaseB=0,lp=0,lp2=0,lp3=0,prev=0;const style=bank===4?1.17:bank===2?.82:1;
 for(let i=0;i<n;i++){
   const t=i/sr,noise=rnd(),attack=t<.002?t/.002:1;let value=0;
   switch(slot){
    case 0:{const f=47*style+175*Math.exp(-t*47);phase+=two*f/sr;lp+=.05*(noise-lp);const click=(noise-lp)*Math.exp(-t*180)*.12;value=Math.sin(phase)*Math.exp(-t*10.5)*.92+click;break}
    case 1:{phase+=two*(42+35*Math.exp(-t*30))/sr;value=Math.sin(phase)*Math.exp(-t*8.4)*.7+Math.sin(phase*.5)*.06*Math.exp(-t*10);break}
    case 2:{lp+=.1*(noise-lp);const crack=noise-lp;const burst=(Math.exp(-t*42)+(t>.017?.65*Math.exp(-(t-.017)*90):0)+(t>.034?.4*Math.exp(-(t-.034)*110):0));value=crack*burst*.47;break}
    case 3:{lp+=.06*(noise-lp);lp2+=.34*((noise-lp)-lp2);value=lp2*Math.exp(-t*62)*.55;break}
    case 4:{phase+=two*(56+bank*1.1)/sr;phaseB+=two*112/sr;value=(.74*Math.sin(phase)+.19*Math.sin(phaseB))*Math.exp(-t*8.8)*ramp(t,.004,.06,duration);break}
    case 5:{lp+=.06*(noise-lp);phase+=two*185/sr;value=((noise-lp)*.55+Math.sin(phase)*.25)*Math.exp(-t*20);break}
    case 6:{phase+=two*525/sr;phaseB+=two*768/sr;value=(Math.sin(phase)*.55+Math.sin(phaseB)*.28+noise*.09)*Math.exp(-t*42);break}
    case 7:{lp+=.08*(noise-lp);lp2+=.24*((noise-lp)-lp2);value=lp2*Math.exp(-t*13.8)*.44;break}
    case 8:{const f=98+bank;phase+=two*f/sr;phaseB+=two*f*2/sr;const saw=Math.sin(phase)*.69+Math.sin(phaseB)*.14;const freq=230+950*Math.exp(-t*5);const coef=Math.min(.4,two*freq/sr);lp+=coef*(saw-lp);lp2+=coef*(lp-lp2);value=lp2*Math.exp(-t*6)*ramp(t,.005,.055,duration)*.70;break}
    case 9:{phase+=two*174/sr;phaseB+=two*260.8/sr;const chord=Math.sin(phase)*.50+Math.sin(phaseB)*.32+Math.sin(phase*2)*.1;lp+=.12*(chord-lp);value=lp*Math.exp(-t*5.6)*ramp(t,.008,.065,duration)*.65;break}
    case 10:{lp+=.1*(noise-lp);lp2+=.28*((noise-lp)-lp2);value=lp2*Math.exp(-t*22)*(.78+.22*Math.sin(two*t*75))*.4;break}
    case 11:{phase+=two*533/sr;phaseB+=two*800/sr;value=(.44*Math.sin(phase)+.37*Math.sin(phaseB))*Math.exp(-t*17.2);break}
    case 12:{lp+=.028*(noise-lp);lp2+=.26*((noise-lp)-lp2);value=lp2*Math.exp(-t*7)*.29;break}
    case 13:{const f=93+87*Math.exp(-t*17);phase+=two*f/sr;value=(Math.sin(phase)*.68+noise*.08)*Math.exp(-t*11);break}
    case 14:{lp+=.09*(noise-lp);lp2+=.18*((noise-lp)-lp2);value=lp2*Math.pow(t/duration,1.1)*.42;break}
    case 15:{phase+=two*(45+108*Math.exp(-t*17))/sr;lp+=.05*(noise-lp);value=(Math.sin(phase)*.77+lp*.19)*Math.exp(-t*6)*.72;break}
   }
   const fade=Math.min(1,Math.max(0,(duration-t)/.018));data[i]=Math.tanh(value*1.15)*fade*attack*.85;
 }
 return data;
}
function createBuffer(ctx,pcm){const b=ctx.createBuffer(1,pcm.length,ctx.sampleRate);b.copyToChannel(pcm,0);return b}
function impulse(ctx){const n=Math.round(ctx.sampleRate*.45),b=ctx.createBuffer(2,n,ctx.sampleRate);for(let ch=0;ch<2;ch++){let rnd=xorshift(317+ch);const a=b.getChannelData(ch);for(let i=0;i<n;i++)a[i]=rnd()*Math.exp(-i/n*8)*.35;}const c=ctx.createConvolver();c.buffer=b;return c}
function graph(ctx,destination,current){
 const bus=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.65;
 const dry=ctx.createGain(),wet=ctx.createGain(),shape=ctx.createWaveShaper();const table=new Float32Array(2048);
 for(let i=0;i<table.length;i++){const v=2*i/(table.length-1)-1;table[i]=Math.tanh(v*1.6)/Math.tanh(1.6)}shape.curve=table;shape.oversample='2x';
 const mix=ctx.createGain(),delay=ctx.createDelay(1),feedback=ctx.createGain(),delaySend=ctx.createGain(),delayReturn=ctx.createGain(),reverb=impulse(ctx),roomSend=ctx.createGain(),roomReturn=ctx.createGain();
 const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-11;compressor.knee.value=9;compressor.ratio.value=5;compressor.attack.value=.002;compressor.release.value=.16;
 const master=ctx.createGain(),analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.67;
 bus.connect(filter);filter.connect(dry).connect(mix);filter.connect(shape).connect(wet).connect(mix);
 mix.connect(compressor);mix.connect(delaySend).connect(delay);delay.connect(feedback).connect(delay);delay.connect(delayReturn).connect(compressor);
 mix.connect(roomSend).connect(reverb).connect(roomReturn).connect(compressor);
 compressor.connect(master).connect(analyser).connect(destination);
 function set(s){const t=ctx.currentTime;
  filter.frequency.setTargetAtTime(130+18500*Math.pow(bound(s.filter,0,1),2.7),t,.018);
  dry.gain.setTargetAtTime(1-bound(s.drive,0,1)*.35,t,.018);wet.gain.setTargetAtTime(bound(s.drive,0,1)*.3,t,.018);
  delay.delayTime.setTargetAtTime(60/bound(s.bpm,65,195)*.75,t,.03);feedback.gain.value=.21;
  delaySend.gain.setTargetAtTime(bound(s.delay,0,.8)*.32,t,.018);delayReturn.gain.value=.39;
  roomSend.gain.setTargetAtTime(bound(s.space,0,.8)*.32,t,.018);roomReturn.gain.value=.34;
  master.gain.setTargetAtTime(bound(s.master,0,1)*.85,t,.016);
 }
 set(current);return {bus,master,analyser,set};
}
class AudioStudio {
 constructor(){this.ctx=null;this.nodes=null;this.stream=null;this.cache=new Map();this.custom=new Map();this.sources=new Set();this.playing=false;this.startPending=false;this.epoch=0;this.tickId=null;this.nextTime=0;this.stepIndex=0;this.onStep=()=>{};this.onTransport=()=>{};this.recorder=null;this.recChunks=[];this.recPhase='idle';this.onRecord=()=>{};this.onRecordingReady=()=>{};}
 async unlock(){if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Web Audio API is unavailable');this.ctx=new C({latencyHint:'interactive'});this.stream=this.ctx.createMediaStreamDestination();this.nodes=graph(this.ctx,this.ctx.destination,state);this.nodes.master.connect(this.stream);}
 if(this.ctx.state!=='running')await this.ctx.resume();if(this.ctx.state!=='running')throw Error('Audio suspended: touch a pad again');return this.ctx;}
 set(){if(this.nodes)this.nodes.set(state)}
 buffer(ctx,slot){const user=this.custom.get(slot);if(user)return user;const k=`${ctx.sampleRate}-${state.bank}-${slot}`;if(!this.cache.has(k)){this.cache.set(k,createBuffer(ctx,makePCM(slot,ctx.sampleRate,state.bank)));if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value)}return this.cache.get(k)}
 note(ctx,out,slot,when,velocity,step,track=true){const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=this.buffer(ctx,slot);const pitch=[0,0,3,0,5,3,2,0,0,-2,3,5,7,5,3,2][step%16];src.playbackRate.value=[1,4,8,9,11].includes(slot)?Math.pow(2,pitch/12):1;gain.gain.value=bound(velocity,0,1)*.50*(slot===0?1.15:slot===4?.85:1);src.connect(gain).connect(out);src.start(Math.max(when,ctx.currentTime));if(track){this.sources.add(src);src.onended=()=>{this.sources.delete(src);try{src.disconnect();gain.disconnect()}catch{}}}}
 async hit(slot,velocity=1){await this.unlock();this.note(this.ctx,this.nodes.bus,slot,this.ctx.currentTime+.003,velocity,Math.floor(Math.random()*16));}
 scene(bar){return state.auto?SCENES[[0,0,1,1,1,2,2,3,3,3,3,4][bar%12]]:state.scene}
 scheduler(){if(!this.playing||!this.ctx||this.ctx.state!=='running')return;const beat=60/state.bpm/4,now=this.ctx.currentTime;if(this.nextTime<now-.1){const missed=Math.floor((now-this.nextTime)/beat)+1;this.stepIndex+=missed;this.nextTime+=missed*beat;}
  let guard=0;while(this.nextTime<now+.11&&guard++<20){const step=this.stepIndex%16,bar=Math.floor(this.stepIndex/16),scene=this.scene(bar),g=state.patterns[scene]||state.patterns.GROOVE;
  const swing=step%2===1?state.swing*beat*.56:0;for(let slot=0;slot<16;slot++){const v=g[slot][step];if(v>.01&&!state.mutes[slot])this.note(this.ctx,this.nodes.bus,slot,this.nextTime+swing,v,step)}this.onStep(step,bar,scene);this.stepIndex++;this.nextTime+=beat;}}
 async start(){if(this.playing||this.startPending)return false;this.startPending=true;const epoch=this.epoch;try{await this.unlock();if(epoch!==this.epoch||this.playing)return false;this.playing=true;this.nextTime=this.ctx.currentTime+.055;this.stepIndex=0;this.nodes.set(state);this.scheduler();this.tickId=setInterval(()=>this.scheduler(),25);this.onTransport(true);return true}finally{this.startPending=false}}
 stop(){this.epoch++;this.playing=false;clearInterval(this.tickId);this.tickId=null;this.stepIndex=0;const sources=[...this.sources];this.sources.clear();if(this.ctx){const when=this.ctx.currentTime+.007;for(const src of sources){try{src.stop(when)}catch{}}}this.onTransport(false);this.onStep(-1,0,state.scene);}
 async importSample(slot,file){if(file.size>12*1024*1024)throw Error('Limit 12 MB');await this.unlock();const arr=await file.arrayBuffer(),audio=await this.ctx.decodeAudioData(arr);if(audio.duration>6)throw Error('Sample must be 6 seconds or shorter');this.custom.set(slot,audio);}
 async record(){if(this.recPhase==='stopping')return;if(this.recPhase==='recording'){this.recPhase='stopping';this.onRecord('stopping');this.recorder.stop();return}await this.unlock();if(typeof MediaRecorder==='undefined')throw Error('Live recording is unavailable; use EXPORT WAV');const types=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'];const type=types.find(t=>MediaRecorder.isTypeSupported(t));const recorder=new MediaRecorder(this.stream.stream,type?{mimeType:type}:undefined),chunks=[];this.recChunks=chunks;this.recorder=recorder;
 recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.onerror=()=>{this.recPhase='idle';this.onRecord('error')};recorder.onstop=()=>{this.recPhase='idle';const mime=recorder.mimeType||type||'audio/webm';const ext=mime.includes('mp4')?'m4a':'webm';this.onRecord('ready');if(chunks.length)this.onRecordingReady(new Blob(chunks,{type:mime}),ext);else this.onRecord('empty')};recorder.start(300);this.recPhase='recording';this.onRecord('recording')}
 async offline(bars){if(this.playing)throw Error('Stop PLAY before exporting');const count=bound(bars,8,32),sr=44100,O=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!O)throw Error('Offline render is unavailable');const seconds=count*4*60/state.bpm+1.3,ctx=new O(2,Math.ceil(seconds*sr),sr),nodes=graph(ctx,ctx.destination,state);for(let bar=0;bar<count;bar++){const scene=this.scene(bar),g=state.patterns[scene];for(let step=0;step<16;step++){const t=bar*4*60/state.bpm+step*60/state.bpm/4+.04+(step%2?state.swing*60/state.bpm/4*.56:0);for(let slot=0;slot<16;slot++){const v=g[slot][step];if(v>.01&&!state.mutes[slot])this.note(ctx,nodes.bus,slot,t,v,step,false)}}}return wav(await ctx.startRendering());}
 meter(){if(!this.nodes)return 0;this.meterData??=new Uint8Array(this.nodes.analyser.fftSize);this.nodes.analyser.getByteTimeDomainData(this.meterData);let s=0;for(const k of this.meterData){const v=(k-128)/128;s+=v*v}return Math.min(1,Math.sqrt(s/this.meterData.length)*2.2)}
}
function wav(buffer){const count=buffer.length,channels=2,out=new ArrayBuffer(44+count*4),view=new DataView(out);let ptr=0;const put=s=>{for(const c of s)view.setUint8(ptr++,c.charCodeAt(0))};const u16=n=>{view.setUint16(ptr,n,true);ptr+=2};const u32=n=>{view.setUint32(ptr,n,true);ptr+=4};put('RIFF');u32(out.byteLength-8);put('WAVE');put('fmt ');u32(16);u16(1);u16(2);u32(buffer.sampleRate);u32(buffer.sampleRate*4);u16(4);u16(16);put('data');u32(count*4);const l=buffer.getChannelData(0),r=buffer.numberOfChannels===2?buffer.getChannelData(1):l;for(let i=0;i<count;i++){for(const v of [l[i],r[i]]){const x=bound(v,-.96,.96);view.setInt16(ptr,x<0?x*32768:x*32767,true);ptr+=2}}return new Blob([out],{type:'audio/wav'})}
engine=new AudioStudio();
function showTab(view){if(!['pads','sequence','sounds','mix','export'].includes(view))return;activeTab=view;$$('[data-panel]').forEach(p=>p.classList.toggle('hide',p.dataset.panel!==view));$$('[data-tab]').forEach(b=>{const on=b.dataset.tab===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});window.scrollTo({top:0,behavior:'instant'})}
function renderPads(){$('#pads').replaceChildren(...PAD_NAMES.map((name,i)=>{const b=document.createElement('button');b.type='button';b.className='pad'+(engine.custom.has(i)?' imported':'');b.dataset.pad=String(i);b.style.setProperty('--pad-color',COLORS[i]);b.setAttribute('aria-label',name);b.innerHTML=`<span class="pad-index">${String(i+1).padStart(2,'0')}</span><strong class="pad-label">${name}</strong><span class="pad-key">${KEYS[i]} / PLAY</span>`;return b}))}
function renderPresets(){$('#presets').replaceChildren(...PRESETS.map((p,i)=>{const b=document.createElement('button');b.type='button';b.className='bank'+(i===state.bank?' selected':'');b.dataset.bank=String(i);b.innerHTML=`<small>${p.tag} · ${p.bpm} BPM</small><b>${p.name}</b>`;return b}));$('#presetLabel').textContent=PRESETS[state.bank].name}
function renderScenes(){$('#scenes').replaceChildren(...SCENES.map(s=>{const b=document.createElement('button');b.type='button';b.dataset.scene=s;b.className='scene'+(s===state.scene?' selected':'');b.textContent=s;return b}));$('#autoScene').checked=state.auto}
function renderSequence(){const root=$('#sequence'),header=document.createElement('div');header.className='seq-row seq-header';const blank=document.createElement('span');blank.className='seq-name';header.append(blank);for(let j=0;j<16;j++){const h=document.createElement('span');h.className='seq-cell';h.textContent=String(j+1).padStart(2,'0');header.append(h)}root.replaceChildren(header);for(let i=0;i<16;i++){const row=document.createElement('div'),name=document.createElement('button');row.className='seq-row';name.type='button';name.className='seq-name'+(state.mutes[i]?' muted':'');name.dataset.mute=String(i);name.textContent=PAD_NAMES[i].replace('909 ','');row.append(name);for(let j=0;j<16;j++){const b=document.createElement('button');b.type='button';b.dataset.row=String(i);b.dataset.step=String(j);b.className='seq-cell'+(j%4===0?' quarter':'')+(state.patterns[state.scene][i][j]?' on':'');b.setAttribute('aria-label',`${PAD_NAMES[i]} шаг ${j+1}`);b.setAttribute('aria-pressed',String(state.patterns[state.scene][i][j]>0));row.append(b)}root.append(row)}}
function renderSounds(){$('#soundList').replaceChildren(...PAD_NAMES.map((s,i)=>{const b=document.createElement('button');b.type='button';b.dataset.sound=String(i);b.className='sound-item'+(i===selectedPad?' selected':'');b.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span><b>${s}${engine.custom.has(i)?' / CUSTOM':''}</b>`;return b}));$('#selectedSound').textContent=PAD_NAMES[selectedPad]}
const controls=[['master','MASTER VOLUME'],['filter','LOW PASS'],['drive','SATURATION'],['space','ROOM REVERB'],['delay','ECHO DELAY'],['swing','SWING']];
function renderFx(){$('#fxList').replaceChildren(...controls.map(([name,label])=>{const wrap=document.createElement('div');wrap.className='fx-row';const n=Math.round(state[name]*100);wrap.innerHTML=`<label for="ctrl-${name}">${label}</label><span id="value-${name}">${n}%</span><input id="ctrl-${name}" type="range" data-fx="${name}" min="0" max="${name==='swing'?45:100}" value="${n}" aria-label="${label}" />`;return wrap}))}
function renderBpm(){$('#bpm').textContent=state.bpm}
function updateState(){engine.set();store()}
function setBank(i){if(!PRESETS[i])return;state=blank(i);engine.cache.clear();undoStack.length=0;updateState();renderBpm();renderPresets();renderScenes();renderSequence();renderFx();announce(`${PRESETS[i].name} · ${state.bpm} BPM`)}
function remember(){undoStack.push({scene:state.scene,pattern:state.patterns[state.scene].map(r=>r.slice())});if(undoStack.length>24)undoStack.shift()}
function updateStep(step,bar=0,scene='GROOVE'){if(activeStep===step)return;activeStep=step;$$('#progressBars i').forEach((b,i)=>b.classList.toggle('now',i===step));$$('.seq-cell.current').forEach(c=>c.classList.remove('current'));if(step>=0)$$(`.seq-cell[data-step="${step}"]`).forEach(b=>b.classList.add('current'));$('#position').textContent=step<0?'BAR 01 · STEP 01':`BAR ${String(bar+1).padStart(2,'0')} · STEP ${String(step+1).padStart(2,'0')}`}
function renderTransport(on){$('#play').classList.toggle('is-playing',on);$('#playGlyph').textContent=on?'Ⅱ':'▶';$('#playText').textContent=on?'PAUSE':'PLAY';$('#play').setAttribute('aria-pressed',String(on));$('#audioState').classList.toggle('on',on||engine.ctx?.state==='running');$('#audioState').innerHTML=`<i></i> ${engine.ctx?.state==='running'?'AUDIO ON':'AUDIO OFF'}`}
function highlightPad(i){const b=$(`[data-pad="${i}"]`);if(!b)return;b.classList.add('hot');clearTimeout(b.hotTimer);b.hotTimer=setTimeout(()=>b.classList.remove('hot'),120);$('#lastPad').textContent=PAD_NAMES[i]}
function triggerPad(i,v=1){selectedPad=i;highlightPad(i);engine.hit(i,v).then(()=>renderTransport(engine.playing)).catch(e=>announce(e.message,true))}
let clockFrame=0,lastMeter=0;
function meterLoop(timestamp){clockFrame=requestAnimationFrame(meterLoop);if(timestamp-lastMeter<90)return;lastMeter=timestamp;const peak=engine.meter();$('#levelFill').style.width=`${Math.round(peak*100)}%`;$('#meterValue').textContent=peak>.0008?`${Math.round(20*Math.log10(peak))} dB`:'−∞ dB';if(engine.playing){const seconds=(performance.now()-clockBase)/1000;$('#time').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`}}
function setup(){for(let i=0;i<16;i++){const b=document.createElement('i');$('#progressBars').append(b)}renderPads();renderPresets();renderScenes();renderSequence();renderSounds();renderFx();renderBpm();showTab('pads');
 $('#navigation').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});
 $('#pads').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-pad]');if(!b||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();triggerPad(Number(b.dataset.pad))});
 $('#pads').addEventListener('click',e=>{if(e.detail!==0)return;const b=e.target.closest('[data-pad]');if(b)triggerPad(Number(b.dataset.pad))});
 $('#presets').addEventListener('click',e=>{const b=e.target.closest('[data-bank]');if(b)setBank(Number(b.dataset.bank))});
 $('#scenes').addEventListener('click',e=>{const b=e.target.closest('[data-scene]');if(!b)return;state.scene=b.dataset.scene;state.auto=false;updateState();renderScenes();renderSequence()});
 $('#sequence').addEventListener('click',e=>{const b=e.target.closest('[data-row][data-step]');if(b){const row=+b.dataset.row,col=+b.dataset.step;remember();const cells=state.patterns[state.scene][row];cells[col]=cells[col]?0:.8;b.classList.toggle('on',cells[col]>0);b.setAttribute('aria-pressed',String(cells[col]>0));updateState();return}const mute=e.target.closest('[data-mute]');if(mute){const i=+mute.dataset.mute;state.mutes[i]=!state.mutes[i];updateState();renderSequence()}});
 $('#undo').addEventListener('click',()=>{const prev=undoStack.pop();if(!prev)return;state.scene=prev.scene;state.patterns[prev.scene]=prev.pattern;updateState();renderScenes();renderSequence()});
 $('#fill').addEventListener('click',()=>{remember();let s=Date.now()|0;for(const row of [3,5,6,10,12]){for(let j=0;j<16;j++){s=Math.imul(s,1664525)+1013904223|0;if((s>>>0)%100<14)state.patterns[state.scene][row][j]=.25+(s>>>8&63)/100}}updateState();renderSequence();announce('FILL GENERATED')});
 $('#clear').addEventListener('click',()=>{remember();state.patterns[state.scene].forEach(r=>r.fill(0));updateState();renderSequence()});
 $('#autoScene').addEventListener('change',e=>{state.auto=e.target.checked;updateState()});
 $('#bpmUp').addEventListener('click',()=>{state.bpm=Math.min(195,state.bpm+1);renderBpm();updateState()});$('#bpmDown').addEventListener('click',()=>{state.bpm=Math.max(65,state.bpm-1);renderBpm();updateState()});
 $('#tap').addEventListener('click',()=>{const now=performance.now();tapTimes=tapTimes.filter(t=>now-t<2200);tapTimes.push(now);if(tapTimes.length>=3){const intervals=tapTimes.slice(1).map((t,i)=>t-tapTimes[i]);state.bpm=Math.round(bound(60000/(intervals.reduce((a,b)=>a+b)/intervals.length),65,195));renderBpm();updateState()}});
 let pending=false;$('#play').addEventListener('click',async()=>{if(pending)return;pending=true;try{if(engine.playing){engine.stop()}else if(await engine.start()){clockBase=performance.now();$('#audioState').textContent='AUDIO ON'}renderTransport(engine.playing)}catch(e){announce(e.message,true)}finally{pending=false}});
 $('#stop').addEventListener('click',()=>{engine.stop();renderTransport(false);$('#time').textContent='00:00'});
 engine.onStep=(step,bar,scene)=>updateStep(step,bar,scene);engine.onTransport=on=>renderTransport(on);
 $('#soundList').addEventListener('click',e=>{const b=e.target.closest('[data-sound]');if(!b)return;selectedPad=+b.dataset.sound;renderSounds();triggerPad(selectedPad)});
 $('#importSample').addEventListener('click',()=>$('#sampleFile').click());$('#sampleFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{await engine.importSample(selectedPad,file);renderPads();renderSounds();announce('CUSTOM SAMPLE LOADED: '+PAD_NAMES[selectedPad])}catch(err){announce(err.message,true)}finally{e.target.value=''}});
 $('#resetSample').addEventListener('click',()=>{engine.custom.delete(selectedPad);renderPads();renderSounds();announce('ORIGINAL SOUND RESTORED')});
 $('#fxList').addEventListener('input',e=>{const f=e.target.dataset.fx;if(!f)return;state[f]=bound(+e.target.value/100,0,f==='swing'?.45:1);$(`#value-${f}`).textContent=`${Math.round(state[f]*100)}%`;engine.set();store()});
 engine.onRecord=phase=>{$('#recordDot').classList.toggle('live',phase==='recording');$('#recordStatus').textContent=({recording:'Запись идёт…',stopping:'Сохранение звукового файла…',ready:'Запись готова для скачивания',empty:'Запись получилась пустой',error:'Ошибка аудиозаписи'})[phase]||'Готово к записи';$('#record').textContent=phase==='recording'?'■ STOP RECORDING':phase==='ready'?'↓ SAVE RECORDING':'● START RECORDING';$('#record').classList.toggle('live',phase==='recording')};
 engine.onRecordingReady=(blob,ext)=>{recordReady={blob,ext};$('#record').textContent='↓ SAVE RECORDING';announce('RECORDING READY')};
 $('#record').addEventListener('click',async()=>{if(recordReady){saveBlob(recordReady.blob,`ARTSS-LIVE-${Date.now()}.${recordReady.ext}`);recordReady=null;engine.onRecord('idle');return}try{await engine.record()}catch(e){announce(e.message,true)}});
 $('#render').addEventListener('click',async()=>{if(rendering)return;rendering=true;const b=$('#render');b.disabled=true;b.textContent='RENDERING WAV…';try{const blob=await engine.offline(+$('#bars').value);saveBlob(blob,`ARTSS-STUDIO-${PRESETS[state.bank].name}-${state.bpm}BPM.wav`);announce('WAV EXPORTED')}catch(e){announce(e.message,true)}finally{rendering=false;b.disabled=false;b.textContent='↗ EXPORT WAV'}});
 $('#save').addEventListener('click',()=>saveBlob(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`ARTSS-PROJECT-${Date.now()}.json`));$('#load').addEventListener('click',()=>$('#projectFile').click());$('#projectFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>250000)throw Error('Project file too large');const loaded=restore(JSON.parse(await file.text()));if(!loaded)throw Error('Invalid project file');engine.stop();state=loaded;engine.cache.clear();undoStack=[];updateState();renderBpm();renderPresets();renderScenes();renderSequence();renderFx();renderTransport(false);announce('PROJECT LOADED')}catch(err){announce(err.message,true)}finally{e.target.value=''}});
 let installPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});$('#install').addEventListener('click',async()=>{if(installPrompt){try{installPrompt.prompt();await installPrompt.userChoice}catch{}installPrompt=null;return}$('#installDialog').showModal()});$('#closeInstall').addEventListener('click',()=>$('#installDialog').close());if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)$('#install').hidden=true;
 document.addEventListener('keydown',e=>{if(e.repeat||e.altKey||e.metaKey||e.ctrlKey||['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;const idx=KEYS.indexOf(e.key.toUpperCase());if(idx>=0){e.preventDefault();triggerPad(idx)}else if(e.code==='Space'){e.preventDefault();$('#play').click()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&engine.playing){engine.stop();renderTransport(false);announce('PLAYBACK PAUSED IN BACKGROUND')}});
 clockFrame=requestAnimationFrame(meterLoop);
}
setup();if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));