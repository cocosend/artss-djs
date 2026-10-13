// ARTSS DJS V7 - optimized single JS request

// === music.js ===
const VERSION='7.0.0';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(+n)?+n:a));
const SLOTS=[
 ['KICK','Kick','01','kick'],['SUB','Sub Bass','02','sub'],['CLAP','Clap','03','clap'],['HAT','Closed Hat','04','hat'],
 ['BASS','Bassline','05','bass'],['RUMBLE','Rumble','06','rumble'],['SNARE','Snare','07','snare'],['OPEN','Open Hat','08','open'],
 ['ACID','Acid 303','09','acid'],['RAVE','Rave Stab','10','rave'],['RIDE','Ride','11','ride'],['COW','Cowbell','12','cow'],
 ['PERC','Percussion','13','perc'],['VOX','Vox Shot','14','vox'],['RISE','Riser','15','rise'],['IMPACT','Impact','16','impact']
];
const KICKS=[
 {id:'punch',name:'01 / Punch 909',f:53,decay:.29,click:.16,drive:.06,drop:125},
 {id:'deep',name:'02 / Sub Pressure',f:45,decay:.46,click:.09,drive:0,drop:92},
 {id:'tight',name:'03 / Tight Warehouse',f:58,decay:.21,click:.2,drive:0,drop:152},
 {id:'roll',name:'04 / Rolling Tech',f:50,decay:.32,click:.13,drive:0,drop:112},
 {id:'metal',name:'05 / Steel Kick',f:55,decay:.26,click:.3,drive:.09,drop:170},
 {id:'hard',name:'06 / Hard Punch',f:56,decay:.38,click:.18,drive:.24,drop:166},
 {id:'bounce',name:'07 / Hard Bounce',f:51,decay:.25,click:.19,drive:.11,drop:140},
 {id:'trance',name:'08 / Reverse Bass',f:52,decay:.36,click:.16,drive:.12,drop:110},
 {id:'raw',name:'09 / Raw Industrial',f:58,decay:.28,click:.29,drive:.32,drop:195},
 {id:'gabber',name:'10 / Gabber Core',f:62,decay:.29,click:.16,drive:.4,drop:203},
 {id:'funk',name:'11 / Funk House',f:54,decay:.23,click:.12,drive:0,drop:90},
 {id:'drift',name:'12 / Drift Phonk',f:48,decay:.39,click:.15,drive:.09,drop:120}
];
const FXMODES=['CLEAN','DRIVE','SPACE','DUB'];
const SCENES=['INTRO','GROOVE','BUILD','DROP','BREAK'];
// Original compositions and patches. Nothing is sampled from commercial recordings.
const raw=[
 ['dark-rolling','DARK ROLLING','ROLLING',128,'roll','smooth',.22,0],
 ['hypnotic-minimal','HYPNOTIC MINIMAL','ROLLING',126,'deep','smooth',.16,3],
 ['night-drive','NIGHT DRIVE','ROLLING',130,'roll','smooth',.24,4],
 ['micro-house','MICRO GROOVE','ROLLING',126,'funk','smooth',.18,5],
 ['berlin-underground','BERLIN UNDERGROUND','ROLLING',132,'tight','warm',.25,6],
 ['warehouse-groove','WAREHOUSE GROOVE','ROLLING',134,'punch','warm',.35,8],
 ['hardgroove-138','HARDGROOVE 138','TECHNO',138,'tight','percussive',.36,9],
 ['peak-time-142','PEAK TIME 142','TECHNO',142,'punch','acid',.55,10],
 ['acid-pressure','ACID PRESSURE','TECHNO',145,'metal','acid',.6,12],
 ['industrial-148','INDUSTRIAL 148','TECHNO',148,'raw','dark',.73,13],
 ['schranz-152','SCHRANZ 152','TECHNO',152,'hard','dark',.77,15],
 ['rave-station','RAVE STATION','TECHNO',144,'metal','rave',.6,16],
 ['hard-techno-150','HARD TECHNO 150','HARD',150,'hard','dark',.8,17],
 ['hard-bounce-154','HARD BOUNCE','HARD',154,'bounce','rave',.77,19],
 ['reverse-bass-156','REVERSE BASS','HARD',156,'trance','rave',.74,20],
 ['raw-style-158','RAW STYLE','HARD',158,'raw','dark',.85,22],
 ['gabber-176','GABBER 176','HARD',176,'gabber','dark',.94,25],
 ['uptempo-185','UPTEMPO CORE','HARD',185,'gabber','dark',1,27],
 ['drift-phonk-150','DRIFT PHONK','PHONK',150,'drift','phonk',.72,30],
 ['street-phonk-145','STREET PHONK','PHONK',145,'drift','phonk',.66,31],
 ['brazil-phonk-155','BRAZIL PHONK','PHONK',155,'bounce','phonk',.76,32],
 ['memphis-night','MEMPHIS NIGHT','PHONK',138,'deep','phonk',.55,34],
 ['hardstyle-152','HARDSTYLE MELODY','RAVE',152,'trance','rave',.73,36],
 ['trance-rush-142','TRANCE RUSH','RAVE',142,'punch','rave',.48,37],
 ['dark-dnb-174','DARK DNB','RAVE',174,'tight','percussive',.64,40],
 ['electro-club-130','ELECTRO CLUB','RAVE',130,'funk','acid',.48,41],
 ['tech-house-128','TECH HOUSE','ROLLING',128,'funk','smooth',.28,42],
 ['hard-dance-146','HARD DANCE','HARD',146,'hard','rave',.72,43],
 ['neon-pressure-146','NEON PRESSURE 146','TECHNO',146,'tight','acid',.66,44],
 ['chrome-bounce-150','CHROME BOUNCE','HARD',150,'bounce','rave',.76,45],
 ['violet-roller-132','VIOLET ROLLER','ROLLING',132,'roll','smooth',.43,46],
 ['infra-phonk-152','INFRA PHONK','PHONK',152,'drift','phonk',.78,47],
 ['heat-rave-148','HEAT RAVE 148','RAVE',148,'metal','rave',.69,48],
 ['artss-djs-144','ARTSS DJS CLUB 144','TECHNO',144,'tight','acid',.73,49],
 ['artss-night-set','ARTSS NIGHT SET','ROLLING',132,'roll','smooth',.44,50],
 ['artss-hard-peak','ARTSS HARD PEAK','HARD',154,'hard','rave',.84,51],
 ['midnight-torque','MIDNIGHT TORQUE','ROLLING',136,'deep','dark',.56,52],
 ['chrome-acid-142','CHROME ACID 142','TECHNO',142,'tight','acid',.66,53],
 ['iron-reactor-154','IRON REACTOR','HARD',154,'metal','dark',.85,54],
 ['neon-drifter','NEON DRIFTER','PHONK',144,'drift','phonk',.69,55]
];
const PRESETS=raw.map(([id,name,category,bpm,kick,bass,intensity,seed])=>({id,name,category,bpm,kick,bass,intensity,seed}));
const CATEGORIES=['ALL','ROLLING','TECHNO','HARD','PHONK','RAVE'];
const presetById=id=>PRESETS.find(p=>p.id===id)||PRESETS[0];
const kickById=id=>KICKS.find(k=>k.id===id)||KICKS[0];
const set=(grid,row,steps,value=1)=>{for(const i of steps)if(i>=0&&i<16)grid[row][i]=clamp(value,0,1)};
function makePattern(presetOrId,scene='GROOVE'){
 const p=typeof presetOrId==='string'?presetById(presetOrId):presetOrId; const g=Array.from({length:16},()=>Array(16).fill(0));const intensity=p.intensity??.5,seed=p.seed??0;
 const phonk=p.category==='PHONK',hard=p.category==='HARD',rolling=p.category==='ROLLING',rave=p.category==='RAVE';
 const drumBr= p.id==='dark-dnb-174';
 set(g,0,drumBr?[0,6,10]:[0,4,8,12],.86+intensity*.12);
 if(hard&&intensity>.8)set(g,0,[14],.49);
 if(drumBr)set(g,6,[4,12],.76);
 else set(g,2,[4,12],phonk?.62:.55);
 set(g,3,[2,6,10,14],rolling?.33:.41);
 if(intensity>.4)set(g,3,[3,7,11,15],.15+.18*intensity);
 set(g,7,[6,14],.26+.15*intensity);
 set(g,4,phonk?[3,7,10,14] : rolling?[2,5,10,13] : [2,6,10,14],.53+intensity*.2);
 if(rolling)set(g,1,[1,7,11],.2);else if(hard)set(g,5,[4,12],.18);
 if(phonk)set(g,11,[3,7,10,14],.4+.3*intensity);
 if(rave)set(g,9,[0,8,12],.36+.2*intensity);
 if(p.bass==='acid')set(g,8,[3,6,11,14],.27+.28*intensity);
 if(p.bass==='percussive')set(g,12,[3,7,11,15],.27);
 if(!phonk&&intensity>.48)set(g,10,[6,14],.22);
 if(p.id==='artss-djs-144'){
  set(g,4,[2,5,7,10,13,15],.70);set(g,8,[3,7,11,15],.39);set(g,12,[3,11],.28);
  if(scene==='DROP'){set(g,9,[0,8],.67);set(g,15,[0],.72)}
 }
 if(p.id==='artss-night-set'){set(g,4,[2,5,10,13],.58);set(g,12,[7,15],.26);set(g,3,[2,6,10,14],.35)}
 if(p.id==='artss-hard-peak'){set(g,9,[0,8,12],.60);set(g,6,[3,11,15],.42);set(g,4,[2,6,10,14],.72)}
 if(p.id==='midnight-torque'){set(g,4,[2,5,7,10,13],.72);set(g,3,[2,6,10,14],.34);set(g,12,[7,15],.23)}
 if(p.id==='chrome-acid-142'){set(g,8,[2,3,6,9,11,14],.52);set(g,4,[5,10,13],.44);set(g,12,[7,15],.3)}
 if(p.id==='iron-reactor-154'){set(g,0,[0,4,8,12],1);set(g,6,[3,11,15],.53);set(g,5,[4,12],.33);set(g,9,[0,8],.31)}
 if(p.id==='neon-drifter'){set(g,11,[3,7,10,14],.74);set(g,4,[2,6,10,14],.55);set(g,3,[3,7,11,15],.47)}
 if(p.id==='neon-pressure-146'){
  set(g,4,[2,5,7,10,13,15],.67);set(g,8,[3,7,11,14],.42);set(g,12,[7,15],.25);set(g,10,[6,14],.29);
  if(scene==='DROP'){set(g,9,[0,8],.58);set(g,6,[15],.28)}
 }
 if(p.id==='chrome-bounce-150'){set(g,4,[2,6,9,14],.78);set(g,9,[0,8],.42);set(g,3,[3,7,11,15],.43)}
 if(p.id==='violet-roller-132'){set(g,4,[2,5,10,13],.64);set(g,12,[3,11],.24);set(g,3,[2,6,10,14],.35)}
 if(seed%3===0)set(g,12,[7,15],.18+.2*intensity);
 if(seed%4===1)set(g,3,[1,9],.2);
 if(seed%3===2)set(g,6,[12],.23);
 switch(scene){
 case 'INTRO':for(let r=0;r<16;r++)if(![0,3,7,12].includes(r))g[r].fill(0);g[0][8]=0;break;
 case 'BUILD':set(g,3,[0,4,8,12],.25);set(g,6,[12,14,15],.4);set(g,14,[12],.48);set(g,12,[10,13,15],.34);break;
 case 'DROP':set(g,9,[0,8],.45+.4*intensity);set(g,15,[0],.8);set(g,11,[7,15],.25);set(g,0,[0,4,8,12],1);break;
 case 'BREAK':for(let r=0;r<16;r++)if(![3,4,7,8,9,14].includes(r))g[r].fill(0);set(g,9,[0],.3);set(g,4,[2,10],.36);break;
 }
 return g;
}
const SCENE_BARS=[4,8,4,8,4];
function sceneForBar(bar){const total=SCENE_BARS.reduce((a,b)=>a+b,0);let n=((bar%total)+total)%total;for(let i=0;i<SCENES.length;i++){if(n<SCENE_BARS[i])return SCENES[i];n-=SCENE_BARS[i];}return 'GROOVE'}
function blankState(presetId='dark-rolling'){const preset=presetById(presetId);const patterns={};for(const scene of SCENES)patterns[scene]=makePattern(preset,scene);return {version:VERSION,presetId:preset.id,bpm:preset.bpm,kick:preset.kick,scene:'GROOVE',autoScene:false,swing:0,master:.78,filter:1,space:.12,delay:0,drive:0,patterns,muted:Array(16).fill(false)};}
const formattedBpm=bpm=>`${Math.round(clamp(bpm,60,210))} BPM`;
const formatTime=seconds=>{const n=Math.floor(Math.max(0,seconds));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
function validStep(row,step){return Number.isInteger(row)&&row>=0&&row<16&&Number.isInteger(step)&&step>=0&&step<16}


// === audio.js ===

const TWO_PI=Math.PI*2;
const lengths=[.55,.36,.29,.13,.43,.48,.28,.36,.29,.35,.34,.32,.24,.34,1.2,.95];
const seedHash=s=>{let x=2166136261;for(const c of s)x=Math.imul(x^c.charCodeAt(0),16777619);return x>>>0;};
const noiseGen=(seed)=>{let x=(seed|0)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return ((x>>>0)/2147483648)-1}};
const soft=(v,drive)=>drive>0?Math.tanh(v*(1+drive*2))/(1+drive*.14):v;
const envelope=(t,d,attack=.003)=>Math.min(1,t/attack)*Math.min(1,Math.max(0,(d-t)/.018));
// Band-limited oscillator: avoids hard saw discontinuities that cause acid/lead rasp.
const polyBLEP=(phase,step)=>{if(phase<step){const x=phase/step;return x+x-x*x-1;}if(phase>1-step){const x=(phase-1)/step;return x*x+x+x+1;}return 0};
const noteRatio=semitones=>Math.pow(2,Math.max(-24,Math.min(24,semitones))/12);

// Offline, deterministic original patches. One-time buffer synthesis avoids JS per-sample work during playback.
function synthPCM(slot,kit='roll',bass='smooth',sampleRate=44100,seed=1,semitones=0){
 const k=kickById(kit);const duration=lengths[slot]||.3,n=Math.ceil(duration*sampleRate);
 const pcm=new Float32Array(n);const random=noiseGen((seedHash(String(kit)+bass+slot)+seed)|0);
 let phase=0,phase2=0,lp=0,hpPrev=0,lp2=0,lp3=0,peak=0,acidPhase=0;
 const baseNote=bass==='phonk'?110:bass==='rave'?146:bass==='acid'?105:bass==='dark'?62:72;
 const tunedNote=baseNote*noteRatio(semitones); // pitch is stable throughout each note; never sweep pitch downward.
 for(let i=0;i<n;i++){
  const t=i/sampleRate,nd=random(),fade=envelope(t,duration,slot===0?.0015:(slot===4||slot===8||slot===9)?.007:.003);
  const melodicRelease=slot===4||slot===8||slot===9?Math.min(1,Math.max(0,(duration-t)/.048)):1;
  let v=0;
  switch(slot){
  case 0:{ // Clean, tuned kick with a fast transient and a controlled fundamental.
   const freq=k.f+k.drop*Math.exp(-t*46)+24*Math.exp(-t*170);
   phase+=TWO_PI*freq/sampleRate;
   const body=Math.sin(phase)*Math.exp(-t*(8.0/(k.decay/.3)));
   lp+=.17*(nd-lp);const click=(nd-lp)*Math.exp(-t*120)*k.click;
   v=soft(body*.86,k.drive)+click*.35;break;
  }
  case 1:{phase+=TWO_PI*(bass==='dark'?51:58)/sampleRate;phase2+=TWO_PI*116/sampleRate;v=(Math.sin(phase)*.72+Math.sin(phase2)*.14)*Math.exp(-t*10.5);break;}
  case 2:{lp+=.065*(nd-lp);const nHigh=nd-lp;const burst=(Math.exp(-t*52)+.67*Math.exp(-Math.max(0,t-.015)*110)*(t>.015?1:0)+.44*Math.exp(-Math.max(0,t-.03)*135)*(t>.03?1:0));v=nHigh*burst*.45;break;}
  case 3:{lp+=.16*(nd-lp);v=(nd-lp)*Math.exp(-t*44)*.40;break;}
  case 4:{ // Tuned bassline: stable oscillator pitch, gentle filter motion instead of descending notes.
   const freq=tunedNote,cycle=freq/sampleRate;
   acidPhase=(acidPhase+cycle)%1;phase+=TWO_PI*cycle;phase2+=TWO_PI*cycle*2;
   const saw=2*acidPhase-1-polyBLEP(acidPhase,cycle);
   const cutoff=650+(bass==='acid'?1850:950)*Math.exp(-t*5);
   const coeff=1-Math.exp(-TWO_PI*Math.min(cutoff,sampleRate*.21)/sampleRate);
   lp+=coeff*(saw-lp);lp2+=coeff*(lp-lp2);
   const tri=(2/Math.PI)*Math.asin(Math.sin(phase2));
   v=(Math.sin(phase)*.63+lp2*.29+tri*.08)*Math.exp(-t*(bass==='smooth'?8.5:7.2))*melodicRelease*.74;
   break;
  }
  case 5:{phase+=TWO_PI*44/sampleRate;lp+=.012*(nd-lp);v=(Math.sin(phase)*.57+lp*.26)*Math.exp(-t*9.5)*.47;break;}
  case 6:{lp+=.11*(nd-lp);phase+=TWO_PI*185/sampleRate;v=((nd-lp)*.39+Math.sin(phase)*.14)*Math.exp(-t*23);break;}
  case 7:{lp+=.18*(nd-lp);v=(nd-lp)*Math.exp(-t*13)*.3;break;}
  case 8:{ // Smooth 303: band-limited saw, fixed note, soft resonance, musically useful filter sweep.
   const freq=tunedNote*(bass==='acid'?1.55:1.37),cycle=freq/sampleRate;
   acidPhase=(acidPhase+cycle)%1;phase+=TWO_PI*cycle;
   const saw=2*acidPhase-1-polyBLEP(acidPhase,cycle);
   const cutoff=580+(bass==='acid'?1250:900)*Math.exp(-t*4.0);
   const coeff=1-Math.exp(-TWO_PI*Math.min(cutoff,sampleRate*.21)/sampleRate);
   lp+=coeff*(saw-lp);lp2+=coeff*(lp-lp2);
   v=(lp2*.58+Math.sin(phase)*.42)*Math.exp(-t*5.7)*melodicRelease*.67;
   break;
  }
  case 9:{const freq=(bass==='rave'?174:160)*noteRatio(semitones);phase+=TWO_PI*freq/sampleRate;phase2+=TWO_PI*freq*1.26/sampleRate;const osc=(Math.sin(phase)+.62*Math.sin(phase*1.5)+.56*Math.sin(phase2))*.28;lp+=.13*(osc-lp);v=lp*Math.exp(-t*9)*.65*melodicRelease;break;}
  case 10:{const freq=5300;phase+=TWO_PI*freq/sampleRate;lp+=.06*(nd-lp);v=((nd-lp)*.7+Math.sin(phase)*.1)*Math.exp(-t*10)*.24;break;}
  case 11:{phase+=TWO_PI*535/sampleRate;phase2+=TWO_PI*807/sampleRate;const square=Math.tanh(7*Math.sin(phase))*.5+Math.tanh(7*Math.sin(phase2))*.5;v=square*Math.exp(-t*16)*.29;break;}
  case 12:{phase+=TWO_PI*(250+220*Math.exp(-t*13))/sampleRate;lp+=.14*(nd-lp);v=(Math.sin(phase)*.4+(nd-lp)*.22)*Math.exp(-t*30)*.37;break;}
  case 13:{phase+=TWO_PI*(290+140*Math.exp(-t*20))/sampleRate;phase2+=TWO_PI*1.3*300/sampleRate;const a=Math.sin(phase)*Math.sin(phase2);v=a*Math.exp(-t*13)*.4;break;}
  case 14:{lp+=(.01+t*.15)*(nd-lp);const rise=Math.pow(t/duration,1.2);v=(nd-lp)*rise*.31;break;}
  case 15:{phase+=TWO_PI*(42+130*Math.exp(-t*10))/sampleRate;lp+=.07*(nd-lp);v=(Math.sin(phase)*.7+(nd-lp)*.3)*Math.exp(-t*8)*.66;break;}
  }
  pcm[i]=v*fade;if(Math.abs(pcm[i])>peak)peak=Math.abs(pcm[i]);
 }
 const norm=peak>0?Math.min(1.12,.81/peak):1;
 for(let i=0;i<n;i++)pcm[i]=clamp(pcm[i]*norm,-.84,.84);
 return pcm;
}
const pcmPeak=pcm=>pcm.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
function pcmToAudioBuffer(ctx,pcm){const b=ctx.createBuffer(1,pcm.length,ctx.sampleRate);b.copyToChannel(pcm,0);return b}
function createReverb(ctx){const len=Math.ceil(ctx.sampleRate*.48);const imp=ctx.createBuffer(2,len,ctx.sampleRate);for(let ch=0;ch<2;ch++){const dat=imp.getChannelData(ch),rnd=noiseGen(54269+ch);for(let i=0;i<len;i++){const t=i/ctx.sampleRate;dat[i]=rnd()*Math.exp(-t*12)*.37;}}const c=ctx.createConvolver();c.buffer=imp;return c;}
function chain(ctx,output,initial){
 const bus=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.Q.value=.59;
 const dist=ctx.createWaveShaper(),driveDry=ctx.createGain(),driveWet=ctx.createGain(),effects=ctx.createGain();
 const table=new Float32Array(1024);for(let i=0;i<table.length;i++){const x=i/(table.length-1)*2-1;table[i]=Math.tanh(x*2.3)/Math.tanh(2.3)}dist.curve=table;dist.oversample='2x';
 const delay=ctx.createDelay(1),feedback=ctx.createGain(),delaySend=ctx.createGain(),delayWet=ctx.createGain();
 const verb=createReverb(ctx),reverbSend=ctx.createGain(),reverbWet=ctx.createGain();
 const comp=ctx.createDynamicsCompressor();comp.threshold.value=-15;comp.knee.value=12;comp.ratio.value=3;comp.attack.value=.004;comp.release.value=.13;
 const main=ctx.createGain(),analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.66;
 bus.connect(filter);filter.connect(driveDry).connect(effects);filter.connect(dist).connect(driveWet).connect(effects);
 effects.connect(comp);effects.connect(delaySend).connect(delay);delay.connect(feedback).connect(delay);delay.connect(delayWet).connect(comp);
 effects.connect(reverbSend).connect(verb).connect(reverbWet).connect(comp);
 comp.connect(main).connect(analyser).connect(output);
 function set(state){const t=ctx.currentTime;const v=clamp(state.filter,0,1),master=clamp(state.master,0,1),drv=clamp(state.drive,0,1);
  filter.frequency.setTargetAtTime(160+19500*v*v*v,t,.016);
  driveDry.gain.setTargetAtTime(1-drv*.44,t,.013);driveWet.gain.setTargetAtTime(drv*.22,t,.013);
  delay.delayTime.setTargetAtTime(Math.min(.6,60/clamp(state.bpm,60,210)*.75),t,.03);
  feedback.gain.value=.24;delaySend.gain.setTargetAtTime(clamp(state.delay,0,.75)*.32,t,.02);delayWet.gain.value=.55;
  reverbSend.gain.setTargetAtTime(clamp(state.space,0,.75)*.33,t,.02);reverbWet.gain.value=.42;
  main.gain.setTargetAtTime(master*.72,t,.018);
 }
 set(initial);return {bus,main,analyser,set,filter};
}
function encodeWav(buffer){const n=buffer.length,ch=2,bytes=44+n*ch*2,out=new ArrayBuffer(bytes),v=new DataView(out);let p=0;
 const str=s=>{for(const c of s)v.setUint8(p++,c.charCodeAt(0))};const u16=x=>{v.setUint16(p,x,true);p+=2};const u32=x=>{v.setUint32(p,x,true);p+=4};
 str('RIFF');u32(bytes-8);str('WAVE');str('fmt ');u32(16);u16(1);u16(ch);u32(buffer.sampleRate);u32(buffer.sampleRate*ch*2);u16(ch*2);u16(16);str('data');u32(n*ch*2);
 const l=buffer.getChannelData(0),r=buffer.numberOfChannels>1?buffer.getChannelData(1):l;
 let peak=0;for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));
 const makeup=peak>0.01?Math.min(2.8,.91/peak):1;
 for(let i=0;i<n;i++){for(const x of [l[i],r[i]]){const s=clamp(x*makeup,-.95,.95);v.setInt16(p,s<0?s*32768:s*32767,true);p+=2}}return new Blob([out],{type:'audio/wav'});
}
class SoundEngine{
 constructor(state=blankState()){this.state=state;this.ctx=null;this.graph=null;this.buffers=new Map();this.custom=new Map();this.active=new Set();this.running=false;this.timer=null;this.next=0;this.count=0;this.onStep=()=>{};this.onTransport=()=>{};this.recorder=null;this.recordChunks=[];this.recording=false;this.recordedMime='';}
 async unlock(){if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Web Audio не поддерживается');this.ctx=new C({latencyHint:'interactive'});this.out=this.ctx.createMediaStreamDestination();this.graph=chain(this.ctx,this.ctx.destination,this.state);this.graph.main.connect(this.out);}
 if(this.ctx.state!=='running')await this.ctx.resume();return this.ctx;}
 setState(state){this.state=state;if(this.graph)this.graph.set(state);}
 getBuffer(ctx,slot,semitones=0){const own=this.custom.get(slot);if(own)return own;const key=`${ctx.sampleRate}:${slot}:${semitones}:${this.state.kick}:${this.state.presetId}`;let b=this.buffers.get(key);if(!b){const p=this.state.presetId;const bass=({ 'neon-pressure-146':'acid', 'chrome-bounce-150':'rave', 'infra-phonk-152':'phonk', 'heat-rave-148':'rave' }[p])||(p.includes('phonk')?'phonk':p.includes('rave')||p.includes('trance')?'rave':p.includes('acid')?'acid':p.includes('industrial')||p.includes('raw')?'dark':'smooth');b=pcmToAudioBuffer(ctx,synthPCM(slot,this.state.kick,bass,ctx.sampleRate,17,semitones));this.buffers.set(key,b);if(this.buffers.size>180){const oldest=this.buffers.keys().next().value;this.buffers.delete(oldest)}}return b;}
 playBuffer(ctx,out,slot,when,velocity=1,step=0,trackVoices=true){
 const note=slot===4||slot===8||slot===9?([0,0,3,0,5,3,-2,0][Math.floor(step/2)%8]):0;
 const buff=this.getBuffer(ctx,slot,note);if(!buff)return;
 const src=ctx.createBufferSource();src.buffer=buff;const vol=ctx.createGain(),pan=ctx.createStereoPanner?ctx.createStereoPanner():null;
 const base=.44;vol.gain.value=clamp(velocity,0,1)*base*(slot===0?1.17:slot===4?.85:1);
 // Factory notes are baked at the requested pitch: their envelopes never speed up or slow down.
 // Only imported samples require conventional playback-rate transposition.
 src.playbackRate.value=this.custom.has(slot)?noteRatio(note):1;
 src.connect(vol);if(pan){pan.pan.value=slot===3?-.09:slot===7?.09:slot===12?.15:0;vol.connect(pan).connect(out)}else vol.connect(out);
 const t=Math.max(when,ctx.currentTime);src.start(t);if(trackVoices)this.active.add(src);src.onended=()=>{if(trackVoices)this.active.delete(src);try{src.disconnect();vol.disconnect();pan?.disconnect()}catch{}}
 }
 async hit(slot,velocity=1){await this.unlock();this.playBuffer(this.ctx,this.graph.bus,slot,this.ctx.currentTime+.003,velocity);}
 getScene(bar){return this.state.autoScene?sceneForBar(bar):this.state.scene}
 schedule(){if(!this.running||!this.ctx)return;const limit=this.ctx.currentTime+.11;let safety=0;
 while(this.next<limit&&safety++<48){const step=this.count%16,bar=Math.floor(this.count/16),scene=this.getScene(bar),grid=this.state.patterns[scene]||this.state.patterns.GROOVE;
 const swing=(step%2===1?clamp(this.state.swing,0,.5)*60/this.state.bpm/4:0);
 for(let row=0;row<16;row++){const v=grid[row]?.[step]||0;if(v>.01&&!this.state.muted[row])this.playBuffer(this.ctx,this.graph.bus,row,this.next+swing,v,step);}
 this.onStep(step,scene,bar);this.count++;this.next+=60/clamp(this.state.bpm,60,210)/4;
 }
 }
 async start(){await this.unlock();if(this.running)return;this.running=true;this.next=this.ctx.currentTime+.052;this.count=0;this.graph.set(this.state);this.schedule();this.timer=setInterval(()=>this.schedule(),25);this.onTransport(true);}
 stop(){this.running=false;clearInterval(this.timer);this.timer=null;this.count=0;this.onStep(-1,this.state.scene,0);if(this.graph&&this.ctx){const t=this.ctx.currentTime;this.graph.main.gain.cancelScheduledValues(t);this.graph.main.gain.setTargetAtTime(0,t,.025);setTimeout(()=>{if(!this.running&&this.graph){this.graph.set(this.state)}},140);}this.onTransport(false);}
 async toggle(){if(this.running){this.stop();return false}await this.start();return true}
 async importSample(slot,file){if(!file||file.size>25*1024*1024)throw Error('Максимальный размер сэмпла 25 МБ');await this.unlock();const copy=await file.arrayBuffer();let buf;try{buf=await this.ctx.decodeAudioData(copy)}catch{throw Error('Не удалось декодировать файл. Выбери WAV, MP3 или M4A.')}if(buf.duration>8)throw Error('Сэмпл должен быть не длиннее 8 секунд');this.custom.set(slot,buf);return buf.duration;}
 resetSample(slot){this.custom.delete(slot)}
 async toggleRecording(){await this.unlock();if(this.recording){this.recorder.stop();this.recording=false;return false}
 if(typeof MediaRecorder==='undefined')throw Error('Запись недоступна в этом браузере');const options=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'].find(s=>MediaRecorder.isTypeSupported(s));
 try{this.recorder=new MediaRecorder(this.out.stream,options?{mimeType:options}:undefined)}catch{this.recorder=new MediaRecorder(this.out.stream)}
 this.recordChunks=[];this.recorder.ondataavailable=e=>{if(e.data?.size)this.recordChunks.push(e.data)};
 this.recorder.onstop=()=>{const type=this.recorder.mimeType||options||'audio/webm',ext=type.includes('mp4')?'m4a':'webm';if(this.recordChunks.length){const blob=new Blob(this.recordChunks,{type});this.onRecordingReady?.(blob,ext)}this.recording=false;this.onRecordingChange?.(false)};
 this.recorder.start(300);this.recording=true;this.onRecordingChange?.(true);return true;}
 async renderWav(bars=16){if(this.running)throw Error('Останови воспроизведение перед WAV-экспортом');const barCount=bars===32?32:16;
 const sampleRate=44100,lenSec=(60/clamp(this.state.bpm,60,210))*4*barCount+1.2;
 const O=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!O)throw Error('WAV-экспорт недоступен в браузере');
 const ctx=new O(2,Math.ceil(lenSec*sampleRate),sampleRate);const tmp=chain(ctx,ctx.destination,{...this.state,master:Math.min(this.state.master,.88)});
 for(let bar=0;bar<barCount;bar++){const scene=this.getScene(bar);const grid=this.state.patterns[scene]||this.state.patterns.GROOVE;for(let step=0;step<16;step++){
 const when=(bar*16+step)*60/this.state.bpm/4+(step%2?this.state.swing*60/this.state.bpm/4:0)+.02;
 for(let slot=0;slot<16;slot++){const v=grid[slot]?.[step]||0;if(v>.01&&!this.state.muted[slot])this.playBuffer(ctx,tmp.bus,slot,when,v,step,false);}
 }}
 const rendered=await ctx.startRendering();return encodeWav(rendered);
 }
 meter(){if(!this.graph)return 0;const len=this.graph.analyser.fftSize;this.meterData??=new Uint8Array(len);this.graph.analyser.getByteTimeDomainData(this.meterData);let sum=0;for(let i=0;i<len;i++){const n=(this.meterData[i]-128)/128;sum+=n*n}return clamp(Math.sqrt(sum/len)*2,0,1)}
 async dispose(){this.stop();if(this.recorder?.state==='recording')this.recorder.stop();await this.ctx?.close();this.ctx=null;this.buffers.clear();this.custom.clear();}
}


// === app.js ===


const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const STORAGE='artss-djs-v7',LEGACY='artssmix-redline-v6';
const MAPS={
'TECHNO':[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
'ACID':[0,8,3,5,4,8,2,7,8,9,10,11,1,12,14,15],
'GROOVE':[0,4,2,3,12,3,7,1,4,11,6,13,5,9,10,15],
'MELODIC':[0,9,2,3,4,8,7,1,9,10,4,13,14,6,12,15],
'INDUSTRIAL':[0,5,6,3,8,12,2,7,15,11,6,13,10,14,5,15],
'RAVE':[0,9,2,3,8,4,7,1,9,10,11,13,14,6,12,15],
'SCHRANZ':[0,5,6,3,8,5,2,7,12,11,15,13,6,9,10,15]
};
const COLORS=['#ff576e','#7bd2ca','#ffc67e','#b0b9c6','#bb9afe','#e97788','#b0b8c6','#86a9fa','#5ad8ce','#ff7e85','#e1b37c','#b9c6d7','#b9a7ff','#f2bd78','#a7abb9','#ff5d6c'];
const PAD_KEYS=['1','2','3','4','q','w','e','r','a','s','d','f','z','x','c','v'];
let bank='TECHNO',category='ALL',search='',fullTracks=false,selectedSlot=0,stepNow=-1,playing=false,startStamp=0,meterRaf=0,lastUi=0,tapTimes=[],pendingSave=0,toastTimer=0,echoReset=0,echoPrev=null;
let state=loadState(),engine=new SoundEngine(state);
function sanitize(raw){if(!raw||!raw.patterns)return null;const b=blankState(typeof raw.presetId==='string'?raw.presetId:undefined);for(const k of ['bpm','scene','swing','master','filter','space','delay','drive'])if(raw[k]!==undefined)b[k]=raw[k];if(KICKS.some(k=>k.id===raw.kick))b.kick=raw.kick;b.bpm=clamp(b.bpm,60,200);for(const k of ['master','filter','space','delay','drive'])b[k]=clamp(b[k],0,1);b.swing=clamp(b.swing,0,.48);b.scene=SCENES.includes(b.scene)?b.scene:'GROOVE';b.autoScene=!!raw.autoScene;b.muted=Array.from({length:16},(_,i)=>!!raw.muted?.[i]);for(const sc of SCENES){const p=raw.patterns?.[sc];if(!Array.isArray(p)||p.length!==16)return null;b.patterns[sc]=p.map(row=>Array.from({length:16},(_,j)=>clamp(row?.[j]??0,0,1)))}return b}
function loadState(){try{for(const key of [STORAGE,LEGACY]){const s=localStorage.getItem(key);if(!s)continue;const v=sanitize(JSON.parse(s));if(v)return v}}catch{}return blankState()}
function persist(){clearTimeout(pendingSave);pendingSave=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{}},220)}
function update(save=true){engine.setState(state);if(save)persist()}
function notify(msg,error=false){const el=$('#toast');el.textContent=msg;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},3100)}
const error=e=>notify(e?.message||String(e),true);
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),25000)}
function changePreset(id){const p=presetById(id),old=state;state=blankState(p.id);for(const k of ['master','filter','delay','space','drive'])state[k]=old[k];engine.buffers.clear();engine.setState(state);persist();renderAll();notify(p.name+' / '+p.bpm+' BPM')}
function renderCategories(){const root=$('#categories');root.replaceChildren();for(const c of CATEGORIES){const b=document.createElement('button');b.type='button';b.className='genre-button'+(c===category?' active':'');b.dataset.category=c;b.textContent=c;root.append(b)}}
function renderPresets(){const root=$('#presetList');root.replaceChildren();let matched=0;for(const [i,p] of PRESETS.entries()){
 if((category!=='ALL'&&p.category!==category)||(!(`${p.name} ${p.category}`.toLowerCase().includes(search))))continue;matched++;
 const b=document.createElement('button');b.type='button';b.dataset.preset=p.id;b.className='preset-item'+(p.id===state.presetId?' active':'');
 const n=document.createElement('span');n.className='preset-number';n.textContent=String(i+1).padStart(2,'0');
 const info=document.createElement('span');info.className='preset-label';const title=document.createElement('b');title.textContent=p.name;const sub=document.createElement('small');sub.textContent=p.category+' / '+kickById(p.kick).name.split('/ ').at(-1);info.append(title,sub);
 const bpm=document.createElement('span');bpm.className='preset-bpm';bpm.textContent=String(p.bpm);b.append(n,info,bpm);root.append(b)}
 $('#presetCount').textContent=matched;$('#sessionName').textContent=presetById(state.presetId).name;
}
function renderBanks(){const root=$('#banks');root.replaceChildren();for(const key of Object.keys(MAPS)){const b=document.createElement('button');b.type='button';b.className='bank-tab'+(bank===key?' active':'');b.dataset.bank=key;b.setAttribute('aria-pressed',String(bank===key));b.textContent=key;root.append(b)}}
function renderPads(){const root=$('#pads');root.replaceChildren();MAPS[bank].forEach((slot,i)=>{const b=document.createElement('button');b.type='button';b.className='pad';b.dataset.pad=i;b.setAttribute('aria-label',`Pad ${i+1}: ${SLOTS[slot][1]}`);b.style.setProperty('--pad-color',COLORS[slot]);const n=document.createElement('span');n.className='pad-index';n.textContent=String(i+1).padStart(2,'0');const title=document.createElement('strong');title.className='pad-title';title.textContent=SLOTS[slot][1].toUpperCase();const foot=document.createElement('span');foot.className='pad-foot';foot.textContent=PAD_KEYS[i].toUpperCase()+' / '+SLOTS[slot][0];b.append(n,title,foot);root.append(b)})}
function renderScenes(){const root=$('#sceneTabs');root.replaceChildren();for(const sc of SCENES){const b=document.createElement('button');b.type='button';b.className='scene-tab'+(sc===state.scene?' active':'');b.dataset.scene=sc;b.textContent=sc;root.append(b)}$('#sceneLabel').textContent=state.autoScene?'AUTO / '+state.scene:state.scene}
function renderSequence(){const root=$('#sequence');root.replaceChildren();const header=document.createElement('div');header.className='seq-row heading';header.append(document.createElement('span'));for(let j=0;j<16;j++){const s=document.createElement('span');s.className='beat-index';s.textContent=String(j+1).padStart(2,'0');s.dataset.beat=j;header.append(s)}root.append(header);
 for(let i=0;i<(fullTracks?16:8);i++){
 const row=document.createElement('div');row.className='seq-row';const name=document.createElement('button');name.className='trackname'+(state.muted[i]?' muted':'');name.type='button';name.dataset.mute=i;name.textContent=SLOTS[i][0];name.title='Mute / unmute';row.append(name);
 for(let j=0;j<16;j++){const b=document.createElement('button');b.type='button';b.dataset.row=i;b.dataset.step=j;b.className='seq-cell'+(state.patterns[state.scene][i][j]>0?' on':'')+(j%4===0?' quarter':'');b.setAttribute('aria-label',`${SLOTS[i][1]} step ${j+1}`);b.setAttribute('aria-pressed',String(state.patterns[state.scene][i][j]>0));row.append(b)}root.append(row)}
 $('#toggleTracks').textContent=fullTracks?'SHOW 8 TRACKS ↘':'ALL 16 TRACKS ↗';
}
function renderTempo(){const p=presetById(state.presetId);$('#bpmDisplay').innerHTML=Math.round(state.bpm)+'<span>.0</span>';$('#tempoRange').value=state.bpm;$('#genreLabel').textContent=p.category+' TECHNO';$('#presetTitle').textContent=p.name;$('#transportLabel').textContent=playing?'PLAYING':'STANDBY';$('#transportDot').parentElement.classList.toggle('active',playing);$('#playBtn').classList.toggle('on',playing);$('#playBtn').setAttribute('aria-pressed',String(playing));$('#playLabel').textContent=playing?'PAUSE':'PLAY';$('#playIcon').textContent=playing?'Ⅱ':'▶';$('#clock').textContent=playing?$('#clock').textContent:'00:00'}
function renderRack(){for(const key of ['filter','drive','space','delay','master','swing']){const s=$('#'+key);if(!s)continue;const v=key==='swing'?state.swing:state[key];s.value=Math.round(v*100);$('#'+key+'Value').textContent=key==='filter'&&v>=.98?'OPEN':Math.round(v*100)+'%'}$('#kickKit').value=state.kick;$('#autoArrange').checked=state.autoScene}
function renderAll(){renderTempo();renderRack();renderCategories();renderPresets();renderBanks();renderPads();renderScenes();renderSequence()}
function firePad(i){const slot=MAPS[bank]?.[i];if(slot===undefined)return;selectedSlot=slot;const b=$(`[data-pad="${i}"]`);if(b){b.classList.add('fired');clearTimeout(b._flash);b._flash=setTimeout(()=>b.classList.remove('fired'),105)}engine.hit(slot,1).then(()=>{$('#audioStatus').textContent='AUDIO ACTIVE'}).catch(error)}
function seqStep(row,step){if(!validStep(row,step))return;const cells=state.patterns[state.scene][row];cells[step]=cells[step]>0?0:.86;const el=$(`[data-row="${row}"][data-step="${step}"]`);if(el){el.classList.toggle('on',cells[step]>0);el.setAttribute('aria-pressed',String(cells[step]>0))}update()}
function waveform(){const root=$('#waveTrack');root.replaceChildren();for(let i=0;i<64;i++){const bar=document.createElement('i');bar.style.height=Math.round(10+32*Math.abs(Math.sin(i*.83)*Math.cos(i*.167))+(i%8===0?8:0))+'px';root.append(bar)}const meter=$('#meter');meter.replaceChildren();for(let i=0;i<16;i++)meter.append(document.createElement('i'))}
function updateStep(step){if(step===stepNow)return;stepNow=step;$$('[data-beat]').forEach((el,i)=>el.classList.toggle('current',i===step));$$('.seq-cell.current').forEach(el=>el.classList.remove('current'));if(step>=0)$$(`[data-step="${step}"].seq-cell`).forEach(el=>el.classList.add('current'));$$('#waveTrack i').forEach((b,i)=>{b.classList.toggle('past',step>=0&&i<step*4);b.classList.toggle('current',step>=0&&Math.floor(i/4)===step)});}
function meterStart(){if(meterRaf)return;lastUi=0;meterRaf=requestAnimationFrame(drawMeter)}
function drawMeter(now){meterRaf=0;if(!playing||document.hidden)return;meterRaf=requestAnimationFrame(drawMeter);if(now-lastUi<75)return;lastUi=now;const level=engine.meter();let lit=Math.min(16,Math.floor(level*20));$$('#meter i').forEach((el,i)=>{el.classList.toggle('on',i<lit);el.classList.toggle('hot',i<lit&&i>12)});$('#level').textContent=level>.001?Math.round(20*Math.log10(level))+' dB':'−∞ dB';$('#clock').textContent=formatTime((now-startStamp)/1000)}
function meterStop(){if(meterRaf)cancelAnimationFrame(meterRaf);meterRaf=0;$$('#meter i').forEach(x=>x.className='');$('#level').textContent='−∞ dB'}
async function playToggle(){try{playing=await engine.toggle();if(playing){startStamp=performance.now();meterStart();$('#audioStatus').textContent='AUDIO ACTIVE'}else meterStop();renderTempo()}catch(e){error(e)}}
function stop(){engine.stop();playing=false;meterStop();updateStep(-1);renderTempo()}
function djFill(){const btn=$('#fillBtn');btn.classList.add('active');setTimeout(()=>btn.classList.remove('active'),170);engine.unlock().then(()=>{const t=engine.ctx.currentTime+.007,step=60/state.bpm/4;for(let i=0;i<6;i++){engine.playBuffer(engine.ctx,engine.graph.bus,i===5?6:3,t+step*.5*i,.44,i,false);if(i%2===0)engine.playBuffer(engine.ctx,engine.graph.bus,12,t+step*.5*i,.27,i,false)}}).catch(error)}
function echoOut(){clearTimeout(echoReset);if(echoPrev===null)echoPrev=state.delay;state.delay=.75;update(false);$('#echoBtn').classList.add('active');echoReset=setTimeout(()=>{state.delay=echoPrev??0;echoPrev=null;update(false);$('#echoBtn').classList.remove('active');renderRack()},1200);renderRack()}
function setup(){const kit=$('#kickKit');for(const k of KICKS){const opt=document.createElement('option');opt.value=k.id;opt.textContent=k.name;kit.append(opt)}waveform();renderAll();
 $('#pads').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-pad]');if(!b||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();firePad(Number(b.dataset.pad))});
 $('#pads').addEventListener('click',e=>{if(e.detail!==0)return;const b=e.target.closest('[data-pad]');if(b)firePad(+b.dataset.pad)});
 document.addEventListener('keydown',e=>{if(e.repeat||e.altKey||e.metaKey||e.ctrlKey||['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;const key=e.key.toLowerCase(),idx=PAD_KEYS.indexOf(key);if(idx>=0){e.preventDefault();firePad(idx)}else if(e.code==='Space'){e.preventDefault();playToggle()}});
 $('#banks').addEventListener('click',e=>{const b=e.target.closest('[data-bank]');if(!b)return;bank=b.dataset.bank;renderBanks();renderPads()});
 $('#categories').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;category=b.dataset.category;renderCategories();renderPresets()});
 $('#presetSearch').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();renderPresets()});
 $('#presetList').addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(b)changePreset(b.dataset.preset)});
 $('#sceneTabs').addEventListener('click',e=>{const b=e.target.closest('[data-scene]');if(!b)return;state.scene=b.dataset.scene;state.autoScene=false;update();renderScenes();renderRack();renderSequence()});
 $('#sequence').addEventListener('click',e=>{const b=e.target.closest('[data-row][data-step]');if(b){seqStep(+b.dataset.row,+b.dataset.step);return}const n=e.target.closest('[data-mute]');if(n){const i=+n.dataset.mute;state.muted[i]=!state.muted[i];update();renderSequence()}});
 $('#toggleTracks').addEventListener('click',()=>{fullTracks=!fullTracks;renderSequence()});
 $('#autoArrange').addEventListener('change',e=>{state.autoScene=e.target.checked;update();renderScenes()});
 $('#clearPattern').addEventListener('click',()=>{for(const row of state.patterns[state.scene])row.fill(0);update();renderSequence();notify('PATTERN CLEARED')});
 $('#randomFill').addEventListener('click',()=>{const rng=(Math.floor(Math.random()*65535)||1);let x=rng;for(let i=0;i<16;i++){if(i===0)continue;for(let step=0;step<16;step++){x=(Math.imul(x,1664525)+1013904223)>>>0;const chance= i===3?.3:i===6?.19:i===12?.2:.05;if((x/4294967296)<chance)state.patterns[state.scene][i][step]=.25+(x%30)/100}}update();renderSequence();notify('FILL GENERATED')});
 $('#playBtn').addEventListener('click',playToggle);$('#stopBtn').addEventListener('click',stop);
 function bpm(v,save=true){state.bpm=Math.round(clamp(v,60,200));update(save);renderTempo()}
 $('#bpmDown').addEventListener('click',()=>bpm(state.bpm-1));$('#bpmUp').addEventListener('click',()=>bpm(state.bpm+1));
 $('#tempoRange').addEventListener('input',e=>bpm(+e.target.value,false));$('#tempoRange').addEventListener('change',persist);
 $('#tapTempo').addEventListener('click',()=>{const now=performance.now();tapTimes=tapTimes.filter(t=>now-t<2300);tapTimes.push(now);if(tapTimes.length>=3){const diffs=tapTimes.slice(1).map((t,i)=>t-tapTimes[i]);bpm(60000/(diffs.reduce((a,b)=>a+b,0)/diffs.length))}notify('TAP / '+state.bpm+' BPM')});
 for(const key of ['filter','drive','space','delay','master','swing']){const el=$('#'+key);el.addEventListener('input',e=>{const v=clamp(+e.target.value/100,0,1);state[key]=v;$('#'+key+'Value').textContent=key==='filter'&&v>=.98?'OPEN':Math.round(v*100)+'%';update(false)});el.addEventListener('change',persist)}
 $('#kickKit').addEventListener('change',e=>{state.kick=e.target.value;engine.buffers.clear();update();notify(kickById(state.kick).name)});
 $('#fillBtn').addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button===0){e.preventDefault();djFill()}});$('#fillBtn').addEventListener('click',e=>{if(e.detail===0)djFill()});
 $('#echoBtn').addEventListener('click',echoOut);
 $('#kickNext').addEventListener('click',()=>{const i=KICKS.findIndex(x=>x.id===state.kick);state.kick=KICKS[(i+1)%KICKS.length].id;engine.buffers.clear();update();renderRack();notify(kickById(state.kick).name)});
 $('#dropBtn').addEventListener('click',()=>{state.scene='DROP';state.autoScene=false;update();renderScenes();renderRack();renderSequence();notify('DROP / PEAK SCENE')});
 $('#recordBtn').addEventListener('click',async()=>{try{await engine.toggleRecording()}catch(e){error(e)}});
 engine.onRecordingChange=val=>{$('#recordBtn').classList.toggle('recording',val);$('#recordText').textContent=val?'STOP REC':'RECORD'};
 engine.onRecordingReady=(blob,ext)=>{download(blob,`ARTSS-DJS-REC-${Date.now()}.${ext}`);notify('LIVE RECORDING SAVED')};
 $('#renderWav').addEventListener('click',async()=>{const b=$('#renderWav');b.disabled=true;b.textContent='RENDERING…';try{const wav=await engine.renderWav(+$(`#exportLength`).value);download(wav,`ARTSS-DJS-${state.presetId}-${state.bpm}BPM.wav`);notify('WAV MASTER EXPORTED')}catch(e){error(e)}finally{b.disabled=false;b.textContent='EXPORT WAV ↗'}});
 $('#saveProject').addEventListener('click',()=>{download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`ARTSS-DJS-${state.presetId}.json`);notify('PROJECT SAVED')});
 $('#importProject').addEventListener('click',()=>$('#projectFile').click());$('#projectFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const imported=sanitize(JSON.parse(await f.text()));if(!imported)throw Error('Некорректный проект');stop();state=imported;engine.buffers.clear();update();renderAll();notify('PROJECT IMPORTED')}catch(err){error(err)}finally{e.target.value=''}});
 $('#importSample').addEventListener('click',()=>{notify('IMPORT SAMPLE / '+SLOTS[selectedSlot][1]);$('#sampleFile').click()});
 $('#sampleFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{await engine.importSample(selectedSlot,f);notify('SAMPLE INSTALLED / '+SLOTS[selectedSlot][1])}catch(err){error(err)}finally{e.target.value=''}});
 engine.onStep=(step,scene)=>{if(playing){updateStep(step);if(state.autoScene)$('#sceneLabel').textContent='AUTO / '+scene}};
 engine.onTransport=value=>{playing=value;if(!value){meterStop();updateStep(-1)}renderTempo()};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(meterRaf)cancelAnimationFrame(meterRaf);meterRaf=0}else if(playing)meterStart()});
 window.addEventListener('beforeunload',()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state))}catch{}clearTimeout(pendingSave);clearInterval(engine.timer)});
}
setup();if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

