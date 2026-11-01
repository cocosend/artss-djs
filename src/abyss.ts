/** 32 original C++ rendered voices; IDs stay stable for the two-page sampler. */
export const ABYSS_ID='ARTSS_DRUM_MACHINE_01';
export const ABYSS_BPM=124;
export const ABYSS_FX={reverb:{dry_wet:.14,room_size:.65,damping:5000},delay:{dry_wet:.12,time:'3/8',feedback:.25},lowpass_filter:{cutoff:14000,resonance:.7,envelope_follower:true},sidechain_compressor:{threshold:-20,ratio:4,attack_ms:10,release_ms:250,source:'pad_1'}} as const;
export type AbyssPad={id:number;name:string;type:'loop'|'one_shot';group:string;quantize:'none'|'1/2'|'1/1'|'2/1';color:string;choke_group:number;file:string};
const loops:[string,string,string,string][]=[
 ['909 Foundation','909','909_foundation','#ff4c56'],
 ['909 Warehouse','909','909_warehouse','#ff4c56'],
 ['909 Shuffle','909','909_shuffle','#ff4c56'],
 ['909 Ride','909','909_ride','#ff4c56'],
 ['606 Classic','606','606_classic','#f8d855'],
 ['606 Break','606','606_break','#f8d855'],
 ['606 Hats','606','606_hats','#f8d855'],
 ['606 Toms','606','606_toms','#f8d855'],
 ['303 Acid','303','303_acid','#45e3d3'],
 ['303 Resonance','303','303_resonance','#45e3d3'],
 ['303 Subline','303','303_subline','#45e3d3'],
 ['303 Drive','303','303_drive','#45e3d3'],
 ['Hybrid Peak','HYBRID','hybrid_peak','#a994f5'],
 ['Hybrid Rolling','HYBRID','hybrid_rolling','#a994f5'],
 ['Hybrid Minimal','HYBRID','hybrid_minimal','#a994f5'],
 ['Hybrid Fill','HYBRID','hybrid_fill','#a994f5']
];
const hits:[string,string,string,string][]=[
 ['909 Kick','909','909_kick','#ff4c56'],
 ['606 Kick','606','606_kick','#f8d855'],
 ['909 Snare','909','909_snare','#ff4c56'],
 ['606 Snare','606','606_snare','#f8d855'],
 ['909 Clap','909','909_clap','#ff4c56'],
 ['606 Hat','606','606_hat','#f8d855'],
 ['909 Open Hat','909','909_open_hat','#ff4c56'],
 ['606 Rim','606','606_rim','#f8d855'],
 ['909 Tom','909','909_tom','#ff4c56'],
 ['606 Cowbell','606','606_cowbell','#f8d855'],
 ['909 Ride','909','909_ride_hit','#ff4c56'],
 ['303 Acid','303','303_acid_hit','#45e3d3'],
 ['303 Sub','303','303_sub_hit','#45e3d3'],
 ['606 Perc','606','606_perc','#f8d855'],
 ['909 Shaker','909','909_shaker','#ff4c56'],
 ['909 Crash','909','909_crash','#ff4c56']
];
export const ABYSS_PADS:readonly AbyssPad[]=[
 ...loops.map(([name,group,file,color],index)=>({id:index+1,name,group,file:file+'.wav',color,type:'loop' as const,quantize:'1/1' as const,choke_group:Math.floor(index/4)+1})),
 ...hits.map(([name,group,file,color],index)=>({id:index+17,name,group,file:file+'.wav',color,type:'one_shot' as const,quantize:'none' as const,choke_group:0}))
];
