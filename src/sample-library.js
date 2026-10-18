/** CC0-1.0 drum one-shots from octalmusic/octal-samples, with provenance in
 * THIRD_PARTY_SAMPLES.md. Fixed assets are part of the offline PWA shell.
 * No uploads, external audio hosts, microphone access or per-hit fetches. */
export const DRUM_SAMPLES=Object.freeze({
 'kick-punch':'kicks/punch-01.wav',
 'kick-hard':'kicks/punch-03.wav',
 'kick-deep':'kicks/deep-01.wav',
 'kick-tight':'kicks/tight-02.wav',
 'clap':'claps/classic-01.wav',
 'clap-hard':'claps/classic-03.wav',
 'snare':'snares/snap-01.wav',
 'hat-closed':'hats/closed-01.wav',
 'hat-closed-hard':'hats/closed-05.wav',
 'hat-open':'hats/open-01.wav',
 'hat-open-hard':'hats/open-03.wav',
 'perc-tom':'percs/tom-01.wav',
 'perc-shaker':'percs/shaker-01.wav',
 'perc-tick':'percs/tick-02.wav',
 'hit-blip':'percs/blip-01.wav',
 'hit-ride':'cymbals/ride-01.wav'
});
export const SAMPLE_PATHS=Object.freeze(Object.values(DRUM_SAMPLES).map(p=>'samples/'+p));
const BANKS=Object.freeze([
 ['kick-punch',null,'clap','hat-closed','hat-open','perc-tom',null,'hit-blip'],
 ['kick-hard',null,'clap-hard','hat-closed-hard','hat-open-hard','perc-shaker',null,'hit-ride'],
 ['kick-deep',null,'clap','hat-closed','hat-open','hat-open','perc-tick',null,'hit-blip'],
 ['kick-punch',null,'snare','hat-closed-hard','hat-open','perc-tom',null,'hit-blip'],
 ['kick-hard',null,'clap-hard','hat-closed-hard','hat-open-hard','perc-tom',null,'hit-ride'],
 ['kick-deep',null,'snare','hat-closed','hat-open','perc-tick',null,'hit-blip'],
 ['kick-hard',null,'clap','hat-closed-hard','hat-open-hard','perc-shaker',null,'hit-ride'],
 ['kick-tight',null,'clap-hard','hat-closed','hat-open','perc-tick',null,'hit-blip']
]);
const decoded=new Map(),pending=new Map();
export function sampleName(bank,slot){const key=BANKS[bank]?.[slot];return key?DRUM_SAMPLES[key]:null;}
export function getDrumSample(bank,slot){const key=sampleName(bank,slot);return key?decoded.get(key)||null:null;}
async function fetchOne(ctx,path){if(decoded.has(path))return decoded.get(path);if(pending.has(path))return pending.get(path);
 const task=(async()=>{const r=await fetch('./samples/'+path,{cache:'force-cache'});if(!r.ok)throw Error('Sample HTTP '+r.status);
  const data=await r.arrayBuffer();if(data.byteLength<48)throw Error('Empty sample '+path);
  const buffer=await ctx.decodeAudioData(data);if(!buffer.length||!buffer.numberOfChannels)throw Error('Invalid sample '+path);
  decoded.set(path,buffer);return buffer;})().finally(()=>pending.delete(path));pending.set(path,task);return task;
}
export async function warmDrums(ctx,bank){const samples=[...new Set((BANKS[bank]||[]).map(key=>DRUM_SAMPLES[key]).filter(Boolean))];
 const results=await Promise.allSettled(samples.map(path=>fetchOne(ctx,path)));
 return {loaded:results.filter(x=>x.status==='fulfilled').length,total:samples.length};
}