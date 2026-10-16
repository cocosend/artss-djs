import {readFile,writeFile,mkdir,cp,rm,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=['index.html','styles.css','app.js','midi-controller.js','music-composer.js','creative-pack.js','sw.js','manifest.webmanifest'];
const pkg=JSON.parse(await readFile(root+'package.json','utf8'));
for(const file of files){
 const source=await readFile(root+file,'utf8');
 if(file.endsWith('.js')){
  const check=spawnSync(process.execPath,['--check',root+file],{encoding:'utf8'});
  if(check.status!==0)throw Error(check.stderr);
  for(const match of source.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g))await stat(root+match[1]);
 }
 if(file==='index.html'&&!source.includes('app.js?v='+pkg.version))throw Error('Entrypoint cache version mismatch');
 if(file==='sw.js'&&!source.includes('artss-djs-v'+pkg.version))throw Error('PWA cache version mismatch');
}
JSON.parse(await readFile(root+'manifest.webmanifest','utf8'));
await rm(root+'dist',{recursive:true,force:true});await mkdir(root+'dist');
for(const file of files)await cp(root+file,root+'dist/'+file);
await cp(root+'icons',root+'dist/icons',{recursive:true});
// Publish SOUNDLAB as isolated /studio preview without changing the legacy entrypoint.
await cp(root+'studio',root+'dist/studio',{recursive:true});
await writeFile(root+'dist/release.json',JSON.stringify({name:pkg.name,version:pkg.version,creativePads:32,factoryPresets:40}));
console.log('PASS production build: '+pkg.version+'; verified ESM imports, PWA versions and static assets');
