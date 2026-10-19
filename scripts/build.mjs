import {mkdir,copyFile,writeFile,readFile,readdir,stat} from 'node:fs/promises';import {join,dirname} from 'node:path';
const root=process.cwd(),out=join(root,'dist');async function copy(from,to){await mkdir(dirname(to),{recursive:true});await copyFile(from,to)}
for(const file of ['index.html','studio.css','manifest.webmanifest','sw.js'])await copy(join(root,file),join(out,file));
await copy(join(root,'public/icon.svg'),join(out,'icon.svg'));
for(const f of await readdir(join(root,'app')))if(f.endsWith('.js'))await copy(join(root,'app',f),join(out,'app',f));
const release={name:'ARTSS DJ CREATOR',version:'21.1.0',engine:'Web Audio + AudioWorklet',pads:8,steps:16,styles:12,record:true,autoMix:true,autoGroove:true,nativeCoreSource:true,sampleImport:true,sampleRecord:true,styleScopedSamples:true,offline:true};await writeFile(join(out,'release.json'),JSON.stringify(release));
async function copyTree(from,to){let names=[];try{names=await readdir(from,{withFileTypes:true})}catch{return}for(const entry of names){if(entry.isDirectory())await copyTree(join(from,entry.name),join(to,entry.name));else if(entry.name.endsWith('.wav'))await copy(join(from,entry.name),join(to,entry.name))}}
await copyTree(join(root,'samples'),join(out,'samples'));
const compiledModel=await readFile(join(out,'app/model.js'),'utf8');const compiledMain=await readFile(join(out,'app/main.js'),'utf8');
if(!compiledModel.includes('INDUSTRIAL')||!compiledModel.includes('ELECTRO')||!compiledMain.includes('TAP PLAY TO RESTORE AUDIO'))throw Error('Stale TypeScript output: compile src before packaging');
const html=await readFile(join(out,'index.html'),'utf8');if(!html.includes('/app/main.js')||!html.includes('STEP SEQUENCER'))throw Error('Invalid app shell');
console.log('PASS ARTSS DJ Creator 20 build');