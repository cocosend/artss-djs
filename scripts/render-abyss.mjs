import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const root=join(process.cwd(),'dist','samples','abyss'),rate=22050,bpm=124,bar=240/bpm;
const names=['kick_mt_124','clap_dark_124','hats_drive_124','perc_ind_124','bass_sub_am','bass_rolling_am','bass_reese_am','bass_arp_am','synth_dark_main_am','synth_pluck_hyp_am','brass_stab_riff_am','acid_arp_124_am','pad_drone_am','pad_choir_am','vox_whisper_loop','texture_noise','lead_hit_a3','lead_hit_c4','lead_hit_e4','lead_hit_g4','sub_drop_am','tom_cinematic','synth_sweep','kick_reverb_impact','vox_breath','vox_lost','vox_glitch','vox_time','fx_impact_abyss','fx_riser_4b','fx_noise_wash','fx_fill_techno'];
const midi=n=>440*2**((n-69)/12);let seed=0xA8B551;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296*2-1};
function tone(data,start,duration,pitch,amp,kind='synth'){
 const begin=Math.round(start*rate),len=Math.min(data.length-begin,Math.round(duration*rate));if(len<1)return;
 const hz=midi(pitch),phase=2*Math.PI*hz/rate;
 for(let j=0;j<len;j++){
  const t=j/rate,x=j/len,attack=Math.min(1,t*90),release=Math.min(1,(duration-t)*70);
  const env=attack*Math.max(0,release)*(kind==='pluck'?Math.exp(-t*9):kind==='bass'?Math.exp(-t*3.5):kind==='lead'?Math.exp(-t*3):1);
  const v=kind==='reese'?Math.sin(phase*j)+.42*Math.sin(phase*j*1.006)+.22*Math.sin(phase*j*2.01):kind==='brass'?Math.sin(phase*j)+.43*Math.sin(phase*j*2)+.18*Math.sin(phase*j*3):kind==='acid'?Math.sin(phase*j)+.35*Math.sin(phase*j*2)+.18*Math.sin(phase*j*4):Math.sin(phase*j)+.15*Math.sin(phase*j*2);
  data[begin+j]+=amp*env*v;
 }
}
function noise(data,start,duration,amp,decay=0,bright=true){const at=Math.round(start*rate),len=Math.min(data.length-at,Math.round(duration*rate));let filtered=0;for(let j=0;j<len;j++){const t=j/rate;filtered=filtered*.35+random()*.65;const v=bright?random()*.5+filtered*.5:filtered;const env=Math.min(1,t*75)*Math.min(1,(duration-t)*50)*Math.exp(-t*decay);data[at+j]+=amp*v*env;}}
function kick(data,start,amp=.6){const at=Math.round(start*rate);let phase=0;for(let j=0;j<Math.min(data.length-at,rate*.48);j++){const t=j/rate;phase+=2*Math.PI*(46+105*Math.exp(-t*32))/rate;data[at+j]+=amp*Math.sin(phase)*Math.exp(-t*12)+.08*random()*Math.exp(-t*95);}}
function vox(data,start,duration,pitch,amp=.2){const at=Math.round(start*rate),len=Math.min(data.length-at,Math.round(duration*rate)),hz=midi(pitch);let last=0;for(let j=0;j<len;j++){const t=j/rate,f=1+Math.sin(t*7)*.11;const carrier=Math.sin(2*Math.PI*hz*t)+.32*Math.sin(2*Math.PI*hz*t*2.02);last=last*.92+random()*.08;const formant=.45+.3*Math.sin(2*Math.PI*(680+160*Math.sin(t*3))*t)*Math.sin(2*Math.PI*(1200+190*Math.sin(t*2))*t);const env=Math.min(1,t*20)*Math.min(1,(duration-t)*12);data[at+j]+=amp*env*(carrier*formant*f+last*.3);}}
await mkdir(root,{recursive:true});
for(let i=0;i<names.length;i++){
 const bars=i===12||i===13||i===6?2:i===29?4:1,duration=i<16?bars*bar:i===29?4*bar:i===30?2.2:i>=24&&i<=27?1.2:i===20||i===22||i===28?2.2:1.1;
 const frames=Math.round(duration*rate),data=new Float32Array(frames);seed=(0xA8B551+i*0x45d9f3b)>>>0;
 if(i===0||i===1||i===2||i===3){for(let beat=0;beat<bars*4;beat++){
  const at=beat*60/bpm;if(i===0)kick(data,at,.64);if(i===1&&beat%2===1){noise(data,at,.20,.35,27);tone(data,at,.18,57,.08,'pluck')}
  if(i===2)for(let s=0;s<4;s++)noise(data,at+s*15/bpm,.065,s%2?.18:.11,48);
  if(i===3){noise(data,at+.08,.11,.20,26);tone(data,at+.08,.13,45+beat%3*3,.16,'pluck')}
 }}
 if(i>=4&&i<=7){const notes=[45,45,48,43,45,52,43,40];for(let beat=0;beat<bars*8;beat++){const at=beat*30/bpm;if(i===4&&beat%2)continue;if(i===6&&beat%4)continue;const n=i===4?33:notes[beat%notes.length]-(i===6?12:0);tone(data,at,i===6?1.1:.22,n,i===6?.18:.3,i===6?'reese':'bass');}}
 if(i>=8&&i<=11){const notes=[57,60,64,67,64,60,55,52],kind=['reese','pluck','brass','acid'][i-8];for(let n=0;n<8;n++){if(i===8&&n%2)continue;const at=n*bar/8;tone(data,at,i===8?.42:.19,notes[(n+(i-8)*2)%8]+(i===8?12:0),i===8?.14:.19,kind);}}
 if(i===12||i===13){for(const note of (i===12?[45,52,57,60]:[45,52,60,64]))tone(data,0,duration-.02,note,i===12?.07:.045,'synth');if(i===13)for(let n=0;n<bars*4;n++)vox(data,n*60/bpm,.45,57+(n%3)*3,.055);}
 if(i===14||i===15){for(let n=0;n<4;n++){if(i===14)vox(data,n*bar/4,.33,57+n%2*3,.11);else noise(data,n*bar/4,bar/4,.065,0,false);}}
 if(i>=16&&i<=19)tone(data,0,.9,[57,60,64,67][i-16],.35,'lead');
 if(i===20){tone(data,.05,1.6,33,.38,'bass');kick(data,0,.27)}
 if(i===21){for(let n=0;n<4;n++){tone(data,n*.17,.23,45-n*2,.24,'bass');noise(data,n*.17,.22,.18,20)}}
 if(i===22||i===30){const len=data.length;let filter=0;for(let j=0;j<len;j++){const t=j/rate,x=j/len;filter=filter*.9+random()*.1;data[j]+=(i===22?.23:.18)*(i===22?x:Math.sin(Math.PI*x))*filter;}if(i===22)tone(data,.2,1.6,69,.15,'reese')}
 if(i===23){kick(data,0,.66);for(let n=1;n<=8;n++)kick(data,n*.15,.17*Math.exp(-n*.36));}
 if(i>=24&&i<=27){vox(data,.07,.65,[57,60,64,62][i-24],.18);noise(data,0,.56,.08,4,false);if(i===26)for(let n=1;n<4;n++)vox(data,n*.27,.16,64,.06);}
 if(i===28){kick(data,0,.5);noise(data,0,1.3,.22,3);tone(data,.12,1.5,33,.19,'reese')}
 if(i===29){let filter=0;for(let j=0;j<frames;j++){const x=j/frames;filter=filter*.75+random()*.25;data[j]+=.18*x*x*filter;}for(let beat=0;beat<16;beat++)if(beat%4===0)tone(data,beat*60/bpm,.3,57+Math.floor(beat/4)*2,.08,'pluck');}
 if(i===31){for(let n=0;n<16;n++){const at=n*bar/16;noise(data,at,.09,.13+n*.009,18);if(n%4===0)kick(data,at,.21);}}
 let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));const gain=Math.min(1,.76/Math.max(peak,1e-8));const wav=Buffer.alloc(44+frames*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);
 for(let j=0;j<frames;j++){const fade=Math.min(1,j/128,(frames-1-j)/128);wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,data[j]*gain*fade))*32767),44+j*2);}
 await writeFile(join(root,names[i]+'.wav'),wav);
}
