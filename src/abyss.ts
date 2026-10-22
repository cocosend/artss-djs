export const ABYSS_ID='PRE_MT_2026_10';
export const ABYSS_BPM=124;
export const ABYSS_FX={reverb:{dry_wet:.35,room_size:.85,damping:5000},delay:{dry_wet:.25,time:'3/8',feedback:.4},lowpass_filter:{cutoff:8000,resonance:1.2,envelope_follower:true},sidechain_compressor:{threshold:-20,ratio:4,attack_ms:10,release_ms:250,source:'pad_1'}} as const;
export type AbyssPad={id:number;name:string;type:'loop'|'one_shot';group:string;quantize:'none'|'1/2'|'1/1'|'2/1';color:string;choke_group:number;file:string};
const rows:[string,string,string,string,number,string][]=[
 ['Punchy Techno Kick','Drums','1/1','#FF3B30',0,'kick_mt_124.wav'],
 ['Dark Room Clap','Drums','1/1','#FF3B30',0,'clap_dark_124.wav'],
 ['Driving 16th Hats','Drums','1/2','#FF9500',0,'hats_drive_124.wav'],
 ['Industrial Percussion','Drums','1/2','#FF9500',0,'perc_ind_124.wav'],
 ['Deep Sub Foundation','Bass','1/1','#007AFF',1,'bass_sub_am.wav'],
 ['Rolling Bassline','Bass','1/1','#007AFF',1,'bass_rolling_am.wav'],
 ['Reese Bass Swell','Bass','2/1','#5AC8FA',1,'bass_reese_am.wav'],
 ['Moog Arp Bass','Bass','1/1','#5AC8FA',1,'bass_arp_am.wav'],
 ['Main Dark Detune Synth','Melody','1/1','#34C759',2,'synth_dark_main_am.wav'],
 ['Hypnotic Pluck','Melody','1/1','#34C759',2,'synth_pluck_hyp_am.wav'],
 ['Brass Stab Riff','Melody','1/1','#4CD964',2,'brass_stab_riff_am.wav'],
 ['Acid Arpeggio','Melody','1/2','#4CD964',2,'acid_arp_124_am.wav'],
 ['Ethereal Drone Pad','Synth','2/1','#5856D6',3,'pad_drone_am.wav'],
 ['Choir of the Abyss','Synth','2/1','#5856D6',3,'pad_choir_am.wav'],
 ['Dark Whisper Vox','Vocals','1/1','#AF52DE',0,'vox_whisper_loop.wav'],
 ['Vinyl Noise Texture','Synth','1/1','#AF52DE',0,'texture_noise.wav'],
 ['Analog Lead A3','Live Lead','none','#FF2D55',4,'lead_hit_a3.wav'],
 ['Analog Lead C4','Live Lead','none','#FF2D55',4,'lead_hit_c4.wav'],
 ['Analog Lead E4','Live Lead','none','#FF2D55',4,'lead_hit_e4.wav'],
 ['Analog Lead G4','Live Lead','none','#FF2D55',4,'lead_hit_g4.wav'],
 ['Huge Sub Drop','FX Bass','none','#5AC8FA',5,'sub_drop_am.wav'],
 ['Deep Cinematic Tom','FX Drums','none','#FF9500',0,'tom_cinematic.wav'],
 ['Dark Synth Sweep','FX Synth','none','#34C759',5,'synth_sweep.wav'],
 ['Reverb Kick Impact','FX Drums','none','#FF3B30',0,'kick_reverb_impact.wav'],
 ['Vox Breath','Live Vox','none','#E55696',6,'vox_breath.wav'],
 ["Vox 'Lost'",'Live Vox','none','#E55696',6,'vox_lost.wav'],
 ['Vox Echo Glitch','Live Vox','none','#E55696',6,'vox_glitch.wav'],
 ["Vox 'Time'",'Live Vox','none','#E55696',6,'vox_time.wav'],
 ['Abyss Impact','Transitions','none','#8E8E93',0,'fx_impact_abyss.wav'],
 ['Tension Riser 4 Bars','Transitions','1/1','#8E8E93',0,'fx_riser_4b.wav'],
 ['White Noise Wash','Transitions','none','#8E8E93',0,'fx_noise_wash.wav'],
 ['Techno Fill 1 Bar','Transitions','1/1','#666666',0,'fx_fill_techno.wav']
];
export const ABYSS_PADS:readonly AbyssPad[]=rows.map(([name,group,quantize,color,choke_group,file],index)=>({
 id:index+1,name,type:index<16?'loop':'one_shot',group,quantize:quantize as AbyssPad['quantize'],color,choke_group,file
}));
