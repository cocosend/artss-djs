import {readFile,writeFile,mkdir,cp,rm,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const pkg=JSON.parse(await readFile(root+'package.json','utf8'));
const files=['index.html','studio.css','studio.js','sound-design.js','track-slicer.js','sw.js','manifest.webmanifest'];
const html=await readFile(root+'index.html','utf8');
const sw=await readFile(root+'sw.js','utf8');
if(!html.includes('studio.js?v='+pkg.version)||!html.includes('studio.css?v='+pkg.version)) throw Error('HTML entrypoint version mismatch');
if(!sw.includes('artss-studio-v'+pkg.version))throw Error('PWA cache version mismatch');
if(!sw.includes('studio.js?v='+pkg.version)||!sw.includes('studio.css?v='+pkg.version))throw Error('Offline PWA assets version mismatch');
for(const file of files){
 await stat(root+file);
 if(file.endsWith('.js')){
  const result=spawnSync(process.execPath,['--check',root+file],{encoding:'utf8'});
  if(result.status!==0)throw Error('Invalid JS in '+file+': '+result.stderr);
 }
}
const manifest=JSON.parse(await readFile(root+'manifest.webmanifest','utf8'));
if(manifest.id!=='/'||manifest.start_url!=='./'||manifest.display!=='standalone')throw Error('PWA manifest not root installable');
await rm(root+'dist',{recursive:true,force:true});await mkdir(root+'dist');
for(const file of files)await cp(root+file,root+'dist/'+file);
await cp(root+'icons',root+'dist/icons',{recursive:true});
await writeFile(root+'dist/release.json',JSON.stringify({name:'ARTSS STUDIO',version:pkg.version,entrypoint:'/',audioEngine:'studio.js',pads:8,tracks:8,stepModes:[16,32],loopRecording:true,audioTakes:true,trackSlicer:{maxClips:16,roles:true,eventAligned:true,autoArrange:true},offline:true})+'\n');
console.log('PASS canonical ARTSS STUDIO v'+pkg.version+' (one audio runtime)');