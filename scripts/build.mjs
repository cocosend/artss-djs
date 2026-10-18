import {readFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url),dist=new URL('../dist/',import.meta.url);
const assets=['index.html','studio.css','studio.js','sw.js','manifest.webmanifest','src/sound-design.js','src/session.js','src/engine.js','src/takes.js','icons/icon.svg','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'];
for(const file of assets){const text=await readFile(new URL(file,root));if(file.endsWith('.js')){const proc=spawnSync(process.execPath,['--check',new URL(file,root).pathname],{encoding:'utf-8'});if(proc.status)throw Error(`${file}: ${proc.stderr}`);}if(!text.length)throw Error('Missing asset '+file);}
const index=(await readFile(new URL('index.html',root))).toString(),sw=(await readFile(new URL('sw.js',root))).toString();
if(!index.includes('studio.js?v=15.0.0')||!sw.includes('artss-live-v15-clean'))throw Error('Cache / version mismatch');
if(index.includes('track-slicer')||index.includes('data-length="32"')||index.includes('id="trackFile"'))throw Error('Legacy sample UI');
JSON.parse((await readFile(new URL('manifest.webmanifest',root))).toString());
await rm(dist,{recursive:true,force:true});for(const file of assets){const dest=new URL(file,dist),parts=file.split('/');if(parts.length>1)await mkdir(new URL(parts.slice(0,-1).join('/')+'/',dist),{recursive:true});else await mkdir(dist,{recursive:true});await copyFile(new URL(file,root),dest);}
await (await import('node:fs/promises')).writeFile(new URL('release.json',dist),JSON.stringify({name:'ARTSS LIVE',version:'15.0.0',pads:8,steps:16,sampleImport:false,audioEngine:'src/engine.js',offline:true}));
console.log('PASS: ARTSS LIVE 15 static PWA build');