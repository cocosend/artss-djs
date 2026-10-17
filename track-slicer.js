/** Offline, deterministic full-song slicing. No stem extraction or remote upload. */
export const SLICE_SECONDS=6;
export const MAX_SLICES=32;
export const SLICE_RATE=22050;
export const MAX_TRACK_BYTES=80*1024*1024;
export const MAX_TRACK_SECONDS=45*60;
const finite=n=>Number.isFinite(n)?n:0;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));

/** Pitch proxy on a full mix: normalized autocorrelation with brightness fallback. */
export function describeSlice(pcm,rate=SLICE_RATE){
 const size=2048,stride=Math.max(1,Math.floor(pcm.length/5));let density=0,pitch=0,count=0;
 for(let window=0;window<4;window++){
  const center=Math.min(pcm.length-size,Math.floor((window+1)*stride));if(center<0)break;
  const step=Math.max(1,Math.floor(rate/8000)),n=Math.floor(size/step),samples=new Float32Array(n);
  let mean=0;for(let j=0;j<n;j++){const v=pcm[center+j*step];samples[j]=v;mean+=v}mean/=n;
  let energy=0,cross=0;for(let j=1;j<n;j++){const a=samples[j]-mean,b=samples[j-1]-mean;energy+=a*a;if((a>=0)!==(b>=0))cross++}
  density+=cross/n;if(energy/n<.00001)continue;
  let best=0,lag=0;const scaledRate=rate/step;
  for(let l=Math.max(8,Math.floor(scaledRate/700));l<Math.min(n/2,Math.ceil(scaledRate/55));l++){
   let sum=0,den=0;for(let k=0;k<n-l;k+=2){sum+=samples[k]*samples[k+l];den+=samples[k]*samples[k]+samples[k+l]*samples[k+l]}
   const similarity=den>0?2*sum/den:0;
   if(similarity>best){best=similarity;lag=l}
  }
  if(best>.72&&lag){pitch+=scaledRate/lag;count++}
 }
 const hz=count?pitch/count:null;
 return {hz,brightness:density/4,sortValue:hz?Math.log2(hz)*.7+(density/4)*4:Math.log2(55)+density*8};
}

/** Detect change/energy in low-resolution RMS envelope; select events throughout whole song. */
export function suggestStarts(audio,count=16,seconds=SLICE_SECONDS){
 const n=count===32?32:16,rate=audio.sampleRate,duration=audio.duration;
 if(duration<1)throw Error('Track is too short');
 const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i)),read=i=>{let sum=0;for(const c of channels)sum+=c[i];return sum/channels.length};
 const hop=Math.max(256,Math.round(rate*.08)),total=Math.ceil(audio.length/hop),rms=new Float32Array(total),change=new Float32Array(total);
 for(let i=0;i<total;i++){
  let sum=0,items=0;const from=i*hop,to=Math.min(audio.length,from+hop),step=Math.max(1,Math.floor((to-from)/256));
  for(let k=from;k<to;k+=step){const v=read(k);sum+=v*v;items++}
  rms[i]=Math.sqrt(sum/(items||1));
 }
 for(let i=1;i<total;i++){change[i]=Math.max(0,rms[i]-rms[i-1]);}
 const latest=Math.max(0,duration-seconds),starts=[];
 for(let s=0;s<n;s++){
  const low=latest*s/n,high=latest*(s+1)/n,center=(low+high)/2;
  let best=low,score=-Infinity;
  const first=Math.floor(low*rate/hop),last=Math.min(total-1,Math.ceil(high*rate/hop));
  for(let k=first;k<=last;k++){
   const at=k*hop/rate;if(at>latest)continue;
   const novelty=change[k]*2.3+(rms[k]||0)*.32 - Math.abs(at-center)*.002;
   if(novelty>score){score=novelty;best=at}
  }
  starts.push(clamp(best,0,latest));
 }
 return starts;
}

/** 6-second mono clips at 22.05 kHz, with small click-free envelope. */
export async function analyzeTrack(audio,count=16,onProgress=()=>{}){
 const wanted=count===32?32:16;
 if(!audio||audio.duration>MAX_TRACK_SECONDS)throw Error('Track is too long for iPhone memory (45 min limit)');
 const starts=suggestStarts(audio,wanted),clipLength=SLICE_RATE*SLICE_SECONDS,clips=[];
 const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i)),read=i=>{let sum=0;for(const c of channels)sum+=c[i];return sum/channels.length};
 for(let i=0;i<starts.length;i++){
  const pcm=new Float32Array(clipLength),start=starts[i],fade=Math.floor(SLICE_RATE*.012);
  for(let j=0;j<clipLength;j++){
   const pos=Math.floor((start+j/SLICE_RATE)*audio.sampleRate);
   const amp=Math.min(1,j/fade,(clipLength-1-j)/fade);
   pcm[j]=pos>=audio.length?0:clamp(finite(read(pos))*Math.max(0,amp),-1,1);
  }
  const stats=describeSlice(pcm);
  clips.push({pcm,sampleRate:SLICE_RATE,start,seconds:Math.min(SLICE_SECONDS,Math.max(0,audio.duration-start)),...stats,sourceIndex:i});
  onProgress(Math.round((i+1)/wanted*100));
  if(i%2===1)await yieldFrame();
 }
 clips.sort((a,b)=>a.sortValue-b.sortValue||a.start-b.start);
 return clips.map((clip,i)=>({...clip,index:i}));
}

export function serializeClips(clips){return clips.map(c=>({start:c.start,seconds:c.seconds,hz:c.hz,brightness:c.brightness,sortValue:c.sortValue,sampleRate:c.sampleRate,pcm:Int16Array.from(c.pcm,v=>Math.round(clamp(v,-1,1)*32767))}));}
export function deserializeClips(saved){if(!Array.isArray(saved)||saved.length>MAX_SLICES)throw Error('Invalid saved slices');return saved.map((c,index)=>{if(!(c.pcm instanceof Int16Array)||!c.pcm.length||c.pcm.length>SLICE_RATE*SLICE_SECONDS+100)throw Error('Invalid slice data');return {index,start:c.start,seconds:c.seconds,hz:c.hz,brightness:c.brightness,sortValue:c.sortValue,sampleRate:SLICE_RATE,pcm:Float32Array.from(c.pcm,v=>v/32767)}})}