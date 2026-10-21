/** Bounded, deterministic audio control math shared by realtime and offline renders. */
const clamp=(n:number,low:number,high:number)=>Number.isFinite(n)?Math.min(high,Math.max(low,n)):low;
/** Equal-power A/B blend with 1.8 dB summed-bus headroom at center. */
export function crossfadeGains(position:number):readonly [number,number] {
 const x=clamp(position,0,1),trim=.8;return [Math.cos(x*Math.PI/2)*trim,Math.sin(x*Math.PI/2)*trim];
}
/** Envelope peak limit before dynamics processing; avoids overdriving on imported samples. */
export function voiceGain(velocity:number,level:number,sampleGain:number):number {
 return Math.min(.82,clamp(velocity,0,1)*clamp(level,0,1.2)*clamp(sampleGain,0,2.2)*.78);
}
/** True logarithmic control covering audible warmth through nearly open high end. */
export function lowpassHz(open:number,sampleRate:number):number {
 const value=clamp(open,0,1),nyquist=Math.max(4000,clamp(sampleRate,8000,192000)*.45);
 return Math.min(nyquist,40*Math.pow(nyquist/40,value));
}
export const AUDIO_HEADROOM={master:.82,wet:.24,feedback:.17,echoSend:.24} as const;

/** Preserve the container announced by Safari/Chrome media capture, including PCM fallbacks. */
export function recordingExtension(mime:string):'wav'|'m4a'|'webm' {
 const format=mime.toLowerCase().split(';',1)[0]?.trim();
 if(format==='audio/wav'||format==='audio/wave'||format==='audio/x-wav'||format==='audio/vnd.wave')return 'wav';
 if(format==='audio/mp4'||format==='audio/x-m4a'||format==='audio/aac')return 'm4a';
 if(format==='audio/webm')return 'webm';
 throw Error('Формат аудиозаписи не поддерживается');
}
