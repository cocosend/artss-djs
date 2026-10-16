'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {webkit}=require('playwright');

const root=path.resolve(__dirname,'../../dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(root+path.sep))throw Error('Forbidden path');
  let source=await fs.readFile(file);
  if(pathname==='/studio/engine.js')source=Buffer.from(source.toString('utf8')+"\nwindow.__studioProbe=()=>({state:engine.ctx?.state,playing:engine.playing,recording:engine.isRecording});\n");
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(source);
 }catch{res.writeHead(404).end()}
});
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
(async()=>{
 await listen();const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(origin+'/studio/',{waitUntil:'load',timeout:20000});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelectorAll('[data-pad]').length===16,{timeout:12000});
  assert.equal(await page.locator('.mobile-nav button').count(),5);
  await page.locator('[data-pad="0"]').tap();
  await page.waitForFunction(()=>window.__studioProbe?.().state==='running',null,{timeout:10000});
  await page.locator('[data-panel="seq"]').last().tap();
  const step=page.locator('[data-step="1"]');
  const initial=await step.getAttribute('aria-pressed');await step.tap();
  assert.notEqual(await step.getAttribute('aria-pressed'),initial,'step did not toggle');
  await page.locator('[data-panel="kits"]').last().tap();
  await page.locator('[data-genre="PHONK"]').tap();
  assert.equal(await page.locator('#bpmValue').innerText(),'145');
  await page.locator('[data-panel="live"]').last().tap();
  await page.locator('#playButton').tap();
  await page.waitForFunction(()=>window.__studioProbe?.().playing===true,null,{timeout:9000});
  assert.equal(await page.locator('#playText').innerText(),'PAUSE');
  await page.locator('[data-action="stop"]').first().tap();
  await page.waitForFunction(()=>window.__studioProbe?.().playing===false);
  await page.locator('[data-panel="rec"]').last().tap();
  await page.locator('#recordButton').tap();
  await page.waitForFunction(()=>window.__studioProbe?.().recording===true,null,{timeout:9000});
  await page.locator('[data-panel="live"]').last().tap();
  await page.locator('[data-pad="0"]').tap();
  await page.waitForTimeout(450);
  await page.locator('#quickRecord').tap();
  await page.locator('[data-panel="rec"]').last().tap();
  await page.waitForFunction(()=>document.querySelectorAll('#fileList a').length>0,null,{timeout:9000});
  const liveBytes=await page.evaluate(async()=>{const a=document.querySelector('#fileList a');return (await (await fetch(a.href)).arrayBuffer()).byteLength});
  assert(liveBytes>1000,'live audio was empty: '+liveBytes);
  await page.locator('#wavButton').tap();
  await page.waitForFunction(()=>document.querySelectorAll('#fileList a').length>=2,null,{timeout:25000});
  const wav=await page.evaluate(async()=>{
   const a=document.querySelector('#fileList a');
   const b=await(await fetch(a.href)).arrayBuffer();
   const view=new DataView(b);let peak=0;
   for(let i=44;i<view.byteLength;i+=2)peak=Math.max(peak,Math.abs(view.getInt16(i,true)));
   return{bytes:view.byteLength,sampleRate:view.getUint32(24,true),channels:view.getUint16(22,true),peak};
  });
  assert(wav.bytes>100000&&wav.peak>300,'silent WAV '+JSON.stringify(wav));
  assert.equal(wav.sampleRate,44100);assert.equal(wav.channels,2);
  assert.equal(errors.length,0,'WebKit errors: '+errors.join(' | '));
  console.log('PASS SOUNDLAB WebKit mobile: 16 pads, audio unlock, 16 steps, kits, transport, live recording '+liveBytes+' bytes, WAV '+wav.bytes+' bytes with '+wav.peak+' peak');
  await context.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
