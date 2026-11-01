import {mkdir,copyFile,writeFile,readFile,readdir,mkdtemp,rm} from 'node:fs/promises';import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=join(root,'dist');async function copy(from,to){await mkdir(dirname(to),{recursive:true});await copyFile(from,to)}
// The output is disposable; never ship old Abyss synth files from a previous build.
await rm(out,{recursive:true,force:true});
for(const file of ['index.html','studio27.css','manifest.webmanifest','sw.js'])await copy(join(root,file),join(out,file));
await copy(join(root,'public/icon.svg'),join(out,'icon.svg'));
for(const f of await readdir(join(root,'app')))if(f.endsWith('.js'))await copy(join(root,'app',f),join(out,'app',f));
const release={name:'ARTSS DJ CREATOR',version:'33.0.0',engine:'Web Audio + AudioWorklet; offline drum assets from native C++',pads:8,visiblePads:8,steps:16,styles:16,melodicStyles:4,drumMachine:{id:'ARTSS_DRUM_MACHINE_01',bpm:124,pages:2,grooves:16,hits:16},record:true,autoMix:true,autoGroove:true,nativeCoreSource:true,sampleImport:true,sampleRecord:true,styleScopedSamples:true,offline:true};await writeFile(join(out,'release.json'),JSON.stringify(release));
async function copyTree(from,to){let names=[];try{names=await readdir(from,{withFileTypes:true})}catch{return}for(const entry of names){if(entry.isDirectory())await copyTree(join(from,entry.name),join(to,entry.name));else if(entry.name.endsWith('.wav'))await copy(join(from,entry.name),join(to,entry.name))}}
await copyTree(join(root,'samples'),join(out,'samples'));await import('./render-hooks.mjs');
const buildDir=await mkdtemp(join(tmpdir(),'artss-kits-'));
try{
 const binary=join(buildDir,'render-kits');
 execFileSync(process.env.CXX||'c++',['-std=c++20','-O2','-Wall','-Wextra','-pedantic',join(root,'native/core/DrumSynth.cpp'),join(root,'native/core/render_kits.cpp'),'-o',binary],{stdio:'inherit'});
 execFileSync(binary,[join(out,'samples/abyss')],{stdio:'inherit'});
}finally{await rm(buildDir,{recursive:true,force:true})}
const compiledModel=await readFile(join(out,'app/model.js'),'utf8');const compiledMain=await readFile(join(out,'app/main.js'),'utf8');
if(!compiledModel.includes('INDUSTRIAL')||!compiledModel.includes('FESTIVAL EDM')||!compiledMain.includes('НАЖМИ ПУСК ДЛЯ ВОЗОБНОВЛЕНИЯ ЗВУКА')||!compiledMain.includes('patternOverview')||!compiledMain.includes('melodyToggle')||!compiledMain.includes('restoreFactorySound')||!compiledMain.includes('knobDragValue')||!compiledMain.includes('AutoMixPlayer')||!compiledMain.includes('AbyssPlayer'))throw Error('Stale TypeScript output: compile src before packaging');
const html=await readFile(join(out,'index.html'),'utf8');if(!html.includes('/app/main.js')||!html.includes('/studio27.css')||html.includes('/chroma-rift.css')||html.includes('/aurora.css')||html.includes('/minimal.css')||html.includes('/fidelity.css')||html.includes('/reference.css')||html.includes('/nexus.css')||!html.includes('ШАГОВЫЙ СЕКВЕНСОР')||!html.includes('trackAutoMix')||!html.includes('autoMixPadSync')||!html.includes('languageToggle'))throw Error('Invalid app shell');
console.log('PASS ARTSS 33 two-page drum machine with native C++ rendered kits');
