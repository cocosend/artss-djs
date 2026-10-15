'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const chrome = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const mime = {'.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.html':'text/html'};
const probeHead = '<script>window.__smokeErrors=[];window.addEventListener("error",e=>window.__smokeErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__smokeErrors.push(String(e.reason)))</script>';
const probeBody = '<pre id="smokeResult">PENDING</pre><script>window.addEventListener("load",()=>{setTimeout(async()=>{try{const check=(c,m)=>{if(!c)throw Error(m)};'
 + 'check(document.body.dataset.mobileView==="live","startup did not finish");'
 + 'check(document.querySelectorAll("#mobileNavigation [data-mobile-view]").length===5,"navigation buttons missing");'
 + 'check(document.querySelectorAll("#mobileNavigation [aria-pressed=true]").length===1,"initial navigation not selected");'
 + 'const bpmBefore=document.querySelector("#bpmDisplay").textContent;document.querySelector("#bpmUp").click();'
 + 'check(document.querySelector("#bpmDisplay").textContent!==bpmBefore,"BPM button not connected");'
 + 'const cell=document.querySelector("#sequence .seq-cell");check(!!cell,"sequencer missing");'
 + 'const pressed=cell.getAttribute("aria-pressed");cell.click();'
 + 'check(cell.getAttribute("aria-pressed")!==pressed,"sequencer edit not connected");'
 + 'check(document.querySelector("#undoPattern").disabled===false,"undo not enabled");'
 + 'document.querySelector("#undoPattern").click();'
 + 'check(document.querySelector("#sequence .seq-cell").getAttribute("aria-pressed")===pressed,"undo not restoring");'
 + 'const beforeRiff=document.querySelector("#riffVariation").textContent;'
 + 'document.querySelector("#newRiff").click();'
 + 'check(document.querySelector("#riffVariation").textContent!==beforeRiff,"new riff button not connected");'
 + 'document.querySelector("#mobileNavigation [data-mobile-view=effects]").click();'
 + 'check(document.body.dataset.mobileView==="effects","tab button not connected");'
 + 'check(document.querySelectorAll("#mobileNavigation [aria-pressed=true]").length===1,"tab state invalid");'
 + 'document.querySelector("#installApp").click();'
 + 'check(document.querySelector("#installHelp").open,"install instructions not visible");'
 + 'document.querySelector("#closeInstall").click();'
 + 'document.querySelector("#mobileNavigation [data-mobile-view=live]").click();'
 + 'document.querySelector("#playBtn").click();'
 + 'await new Promise(r=>setTimeout(r,450));'
 + 'check(document.querySelector("#playBtn").getAttribute("aria-pressed")==="true","audio playback did not start");'
 + 'document.querySelector("#stopBtn").click();'
 + 'check(document.querySelector("#playBtn").getAttribute("aria-pressed")==="false","stop failed");'
 + 'check(window.__smokeErrors.length===0,"runtime errors: "+window.__smokeErrors.join(";"));'
 + 'document.querySelector("#smokeResult").textContent="PASS: bootstrap, tabs, BPM, sequencer, undo, install, audio play-stop";'
 + '}catch(e){document.querySelector("#smokeResult").textContent="FAIL: "+e.message+" / "+window.__smokeErrors.join(";")}},150)})</script>';

function serve(request,response){
  const url = new URL(request.url,'http://localhost');
  const name = url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  if(name.includes('..')||name.startsWith('/')){response.writeHead(403).end();return;}
  const file = path.join(root,name);
  try{
    let data=fs.readFileSync(file);
    if(name==='index.html'){
      let html=data.toString('utf8').replace('</head>',probeHead+'</head>').replace('</body>',probeBody+'</body>');
      data=Buffer.from(html);
    }
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    response.end(data);
  }catch{response.writeHead(404).end();}
}
function runChrome(url){
 return new Promise((resolve,reject)=>{
  const cp=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--autoplay-policy=no-user-gesture-required','--disable-background-networking','--window-size=390,844','--force-device-scale-factor=1','--virtual-time-budget=4500','--dump-dom',url],{stdio:['ignore','pipe','pipe']});
  let output='',stderr='';
  cp.stdout.on('data',d=>output+=d);
  cp.stderr.on('data',d=>{stderr+=d;if(stderr.length>15000)stderr=stderr.slice(-15000)});
  const timeout=setTimeout(()=>cp.kill('SIGKILL'),15000);
  cp.on('error',reject);
  cp.on('close',code=>{clearTimeout(timeout);if(code!==0)reject(Error('Chrome exited '+code+': '+stderr.slice(-1200)));else resolve(output)});
 });
}
(async()=>{
 const server=http.createServer(serve);
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',err=>err?reject(err):resolve()));
 try{
  const html=await runChrome('http://127.0.0.1:'+server.address().port+'/');
  const result=html.match(/<pre id="smokeResult">([^<]*)<\/pre>/);
  assert(result,'browser test did not execute');
  assert(result[1].startsWith('PASS:'),result[1]);
  console.log(result[1]);
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
