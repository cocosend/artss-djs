/** Local role-aware sampling of a mixed recording. No network and no stem-separation claims. */
export const SLICE_RATE=22050;
export const SLICE_SECONDS=6; // maximum phrase length, never a fixed slice duration
export const MAX_SLICES=16;
export const MAX_TRACK_BYTES=80*1024*1024;
export const MAX_TRACK_SECONDS=45*60;
export const ROLES=Object.freeze([
 {id:'KICK',kind:'low',length:.58,position:.23},
 {id:'CLAP',kind:'mid-hit',length:.48,position:.30},
 {id:'HAT',kind:'high',length:.23,position:.31},
 {id:'OPEN HAT',kind:'high',length:.80,position:.37},
 {id:'PERC',kind:'mid-hit',length:.47,position:.42},
 {id:'BASS',kind:'low',length:1.75,position:.42},
 {id:'ACID',kind:'mid',length:1.70,position:.49},
 {id:'HIT',kind:'mid-hit',length:1.15,position:.54},
 {id:'KICK ALT',kind:'low',length:.68,position:.67},
 {id:'SNARE',kind:'mid-hit',length:.50,position:.63},
 {id:'RIDE',kind:'high',length:1.20,position:.67},
 {id:'STAB',kind:'mid',length:1.35,position:.72},
 {id:'GROOVE',kind:'full',length:3.60,position:.32},
 {id:'BUILD',kind:'full',length:4.00,position:.51},
 {id:'DROP',kind:'full',length:4.00,position:.66},
 {id:'BREAK',kind:'full',length:4.00,position:.82}
]);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(v)?v:0));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

/** Scan approximately 25 ms frames across the entire uploaded track. */
export function scanTrack(audio){
 if(!audio||!Number.isFinite(audio.duration)||audio.duration<.5||audio.duration>MAX_TRACK_SECONDS||audio.numberOfChannels<1)throw Error('Cannot analyze this track');
 const sr=audio.sampleRate,hop=Math.max(128,Math.round(sr*.025)),stride=Math.max(1,Math.floor(hop/256));
 const channels=Array.from({length:Math.min(2,audio.numberOfChannels)},(_,i)=>audio.getChannelData(i));
 const frames=[];let lp=0,midLP=0,prior=0,priorLow=0,priorHigh=0;
 const effectiveRate=sr/stride,lowFactor=1-Math.exp(-2*Math.PI*180/effectiveRate),midFactor=1-Math.exp(-2*Math.PI*2100/effectiveRate);
 for(let start=0;start<audio.length;start+=hop){
  const end=Math.min(audio.length,start+hop);let sum=0,low=0,high=0,zcr=0,n=0,previous=0;
  for(let k=start;k<end;k+=stride){let x=0;for(const c of channels)x+=c[k]||0;x/=channels.length;
   lp+=lowFactor*(x-lp);midLP+=midFactor*(x-midLP);
   sum+=x*x;low+=lp*lp;const hi=x-midLP;high+=hi*hi;
   if(n&&((x>=0)!==(previous>=0)))zcr++;
   previous=x;n++;
  }
  const rms=Math.sqrt(sum/(n||1)),lo=Math.sqrt(low/(n||1)),hi=Math.sqrt(high/(n||1));
  const attack=Math.max(0,rms-prior),lowAttack=Math.max(0,lo-priorLow),highAttack=Math.max(0,hi-priorHigh);
  frames.push({time:start/sr,rms,low:lo,high:hi,attack,lowAttack,highAttack,brightness:hi/(rms+1e-5),lowRatio:lo/(rms+1e-5),zcr:zcr/(n||1),novelty:attack+lowAttack*.8+highAttack*.42});
  prior=rms;priorLow=lo;priorHigh=hi;
 }
 return frames;
}

/** Recover tempo when there is a periodic pulse; do not pretend it is certain. */
export function estimateBpm(frames){
 if(frames.length<100)return 132;
 const hop=frames[1].time-frames[0].time;
 const signal=frames.map(f=>f.lowAttack*2+f.attack),mean=signal.reduce((a,b)=>a+b,0)/signal.length;
 let best=-1,bpm=132;
 for(let beat=90;beat<=175;beat++){
  const lag=Math.round(60/beat/hop);let numerator=0,denom=0;
  for(let i=lag;i<signal.length;i+=2){const a=Math.max(0,signal[i]-mean),b=Math.max(0,signal[i-lag]-mean);numerator+=a*b;denom+=a*a+b*b;}
  const score=denom>0?2*numerator/denom:0;
  if(score>best){best=score;bpm=beat}
 }
 return best<.06?132:bpm;
}

function makeCandidates(frames){
 const out=[],n=frames.length;
 let max=0;for(const f of frames)max=Math.max(max,f.novelty);
 for(let i=2;i<n-2;i++){
  const f=frames[i];if((f.novelty<max*.045&&f.rms<.015)||f.novelty<frames[i-1].novelty||f.novelty<frames[i+1].novelty)continue;
  const pre=frames[Math.max(0,i-60)]?.rms||0,post=frames[Math.min(n-1,i+55)]?.rms||0;
  out.push({...f,growth:post-pre,atIndex:i});
 }
 if(!out.length){for(let i=0;i<n;i+=Math.max(1,Math.round(n/64))){out.push({...frames[i],growth:0,atIndex:i});}}
 return out;
}
function suitability(role,c,maxRms,duration){
 const activity=c.rms/(maxRms+1e-5),low=c.lowRatio,high=c.brightness;
 const position=c.time/Math.max(.5,duration),proximity=1-Math.abs(position-role.position);
 let tonal=0;
 switch(role.kind){
 case 'low':tonal=low*2.5-high*.7+Math.min(1,c.lowAttack/(maxRms+.001))*2;break;
 case 'high':tonal=high*2.5-low*.45+Math.min(1,c.highAttack/(maxRms+.001))*2;break;
 case 'mid':tonal=(1-Math.abs(low-.37))*1.7+(1-Math.abs(high-.45))*1.2;break;
 case 'mid-hit':tonal=(1-Math.abs(low-.27))*1.2+high*.8+Math.min(1,c.attack/(maxRms+.001))*1.3;break;
 default:tonal=1.0;
 }
 if(role.id==='BREAK')return proximity*2.2+(1-activity)*2.2-Math.max(0,c.growth)*3;
 if(role.id==='DROP')return proximity*1.6+activity*2.3+Math.max(0,c.growth)*3;
 if(role.id==='BUILD')return proximity*1.9+Math.max(0,c.growth)*4+activity*.5;
 if(role.id==='GROOVE')return proximity*2+activity*2;
 return proximity*.70+tonal+activity*.55;
}
export function chooseEvents(audio,frames=scanTrack(audio)){
 const candidates=makeCandidates(frames),duration=audio.duration;let maxRms=.01;for(const f of frames)maxRms=Math.max(maxRms,f.rms);
 const selected=[];
 for(const role of ROLES){
  let winner=null,best=-Infinity;
  for(const c of candidates){
   const near=selected.some(e=>Math.abs(e.start-c.time)<Math.min(.6,duration/32));
   const score=suitability(role,c,maxRms,duration)-(near?2.6:0);
   if(score>best){best=score;winner=c;}
  }
  const start=Math.max(0,Math.min(duration-.05,(winner?.time??duration*role.position)-.018));
  selected.push({role:role.id,kind:role.kind,start,length:Math.min(role.length,Math.max(.05,duration-start)),score:best});
 }
 return selected;
}
function biquad(kind,rate,cutoff,Q=.707){
 const frequency=clamp(cutoff,35,rate*.44),w=2*Math.PI*frequency/rate,sin=Math.sin(w),cos=Math.cos(w),alpha=sin/(2*Q);
 const a0=1+alpha;let b0,b1,b2;
 if(kind==='low'){b0=(1-cos)/2;b1=1-cos;b2=b0;}
 else if(kind==='high'){b0=(1+cos)/2;b1=-(1+cos);b2=b0;}
 else{b0=alpha;b1=0;b2=-alpha;}
 let x1=0,x2=0,y1=0,y2=0;
 const B0=b0/a0,B1=b1/a0,B2=b2/a0,A1=-2*cos/a0,A2=(1-alpha)/a0;
 return input=>{const y=B0*input+B1*x1+B2*x2-A1*y1-A2*y2;x2=x1;x1=input;y2=y1;y1=y;return y};
}
function processRole(pcm,kind){
 if(kind==='full')return pcm;
 let apply;
 if(kind==='low')apply=biquad('low',SLICE_RATE,260);
 else if(kind==='high')apply=biquad('high',SLICE_RATE,1700);
 else if(kind==='mid')apply=biquad('band',SLICE_RATE,940,.9);
 else apply=biquad('band',SLICE_RATE,1500,.8);
 for(let i=0;i<pcm.length;i++)pcm[i]=clamp(apply(pcm[i]),-1,1);
 return pcm;
}
function extract(audio,entry){
 const count=Math.max(64,Math.min(SLICE_RATE*SLICE_SECONDS,Math.ceil(entry.length*SLICE_RATE))),pcm=new Float32Array(count);
 const channels=Array.from({length:Math.min(2,audio.numberOfChannels)},(_,i)=>audio.getChannelData(i));
 for(let i=0;i<count;i++){
  const pos=(entry.start+i/SLICE_RATE)*audio.sampleRate,base=Math.floor(pos),t=pos-base;
  let v=0;for(const c of channels)v+=((c[base]||0)*(1-t)+(c[base+1]||0)*t)/channels.length;
  pcm[i]=clamp(v,-1,1);
 }
 processRole(pcm,entry.kind);
 // Tiny attack and release prevent ticks, while leaving the original performance's transient intact.
 const fadeIn=Math.max(1,Math.floor(.003*SLICE_RATE)),fadeOut=Math.max(1,Math.floor(Math.min(.024,entry.length*.20)*SLICE_RATE));
 for(let i=0;i<count;i++)pcm[i]*=Math.min(1,i/fadeIn,(count-1-i)/fadeOut);
 return pcm;
}
export async function analyzeTrack(audio,count=16,onProgress=()=>{}){
 if(count!==16)throw Error('This sampler uses 16 instrument/arrangement slots');
 const frames=scanTrack(audio),events=chooseEvents(audio,frames),bpm=estimateBpm(frames),clips=[];
 for(let i=0;i<events.length;i++){
  const event=events[i],pcm=extract(audio,event);
  clips.push({index:i,role:event.role,kind:event.kind,pcm,sampleRate:SLICE_RATE,start:event.start,seconds:pcm.length/SLICE_RATE,bpm});
  onProgress(Math.round((i+1)/events.length*100));if(i%2===1)await tick();
 }
 return clips;
}
export function serializeClips(clips){
 return clips.map(c=>({role:c.role,kind:c.kind,seconds:c.seconds,bpm:c.bpm,sampleRate:SLICE_RATE,
  pcm:Int16Array.from(c.pcm,v=>Math.round(clamp(v,-1,1)*32767))}));
}
export function deserializeClips(saved){
 if(!Array.isArray(saved)||saved.length!==16)throw Error('Invalid sample pack');
 return saved.map((c,index)=>{
  if(!(c.pcm instanceof Int16Array)||c.pcm.length<64||c.pcm.length>SLICE_RATE*SLICE_SECONDS+100)throw Error('Invalid audio clip');
  return {index,role:ROLES[index].id,kind:ROLES[index].kind,pcm:Float32Array.from(c.pcm,v=>v/32767),sampleRate:SLICE_RATE,
   seconds:c.pcm.length/SLICE_RATE,bpm:clamp(c.bpm,90,175)||132};
 });
}