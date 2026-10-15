'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {webkit}=require('playwright');

const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const decoded=decodeURIComponent(pathname==='/'?'/index.html':pathname);
  if(decoded.includes('..')||!decoded.startsWith('/')){res.writeHead(403).end();return}
  const file=path.resolve(root,'.'+decoded);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  let data=await fs.readFile(file);
  // Test-only probe appended inside the ESM lexical scope; never shipped to production.
  if(decoded==='/app.js')data=Buffer.from(data.toString('utf8')+'\nwindow.__djAudioProbe=()=>({state:engine.ctx?.state,running:engine.running,rms:engine.meter(),loops:pack.selection(),pending:[...pack.pending.keys()],ribbon:!!pack.ribbon,filter:state.filter,creative:pack.enabled});window.__djRenderTest=async()=>{const blob=await engine.renderWav(16);const view=new DataView(await blob.arrayBuffer());let peak=0;for(let i=44;i<view.byteLength;i+=2)peak=Math.max(peak,Math.abs(view.getInt16(i,true)));return {bytes:blob.size,rate:view.getUint32(24,true),channels:view.getUint16(22,true),bits:view.getUint16(34,true),peak}};\n');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404).end()}
});
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

(async()=>{
 await listen();
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await webkit.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];const failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',res=>{if(res.status()>=400&&new URL(res.url()).origin===origin)failed.push(res.status()+' '+res.url())});
  await page.goto(origin+'/',{waitUntil:'load',timeout:20000});
  await page.waitForFunction(()=>document.body.dataset.mobileView==='live',{timeout:12000});
  assert.equal(await page.locator('#pads .pad').count(),16,'16 pads should be rendered');
  assert.equal(await page.locator('#mobileNavigation button').count(),5,'5 thumb tabs should exist');
  assert.equal(await page.locator('#midiStatus').count(),1,'MIDI fallback UI missing');
  await page.locator('#mobileNavigation [data-mobile-view="sequence"]').tap();
  assert.equal(await page.locator('body').getAttribute('data-mobile-view'),'sequence');
  const cell=page.locator('#sequence .seq-cell').first();
  const previous=await cell.getAttribute('aria-pressed');
  await cell.tap();
  assert.notEqual(await cell.getAttribute('aria-pressed'),previous,'sequencer pad does not respond');
  await page.locator('#undoPattern').tap();
  assert.equal(await cell.getAttribute('aria-pressed'),previous,'undo failed');
  await page.locator('#mobileNavigation [data-mobile-view="live"]').tap();
  await page.locator('#pads .pad').first().tap();
  await page.waitForFunction(()=>document.querySelector('#audioStatus').textContent.includes('AUDIO ACTIVE'),null,{timeout:10000});
  await page.waitForFunction(()=>window.__djAudioProbe?.().state==='running',null,{timeout:10000});
  await page.locator('#playBtn').tap();
  await page.waitForFunction(()=>document.querySelector('#playBtn').getAttribute('aria-pressed')==='true',{timeout:10000});
  let peak=0;
  for(let i=0;i<16;i++){await pause(85);const m=await page.evaluate(()=>window.__djAudioProbe?.().rms||0);peak=Math.max(peak,m)}
  assert(peak>0.001,'WebKit transport is playing but audio output analyser stays silent; peak='+peak);
  await page.locator('#stopBtn').tap();
  assert.equal(await page.locator('#playBtn').getAttribute('aria-pressed'),'false','STOP failed');
  await page.locator('#installApp').tap();
  assert(await page.locator('#installHelp').evaluate(el=>el.open),'install dialog not open');
  await page.locator('#closeInstall').tap();
  await page.locator('#banks [data-bank="CREATIVE"]').tap();
  assert(await page.locator('#creativePages').isVisible(),'Creative page controls missing');
  assert.equal(await page.locator('#pads [data-creative-id]').count(),16);
  await page.locator('#playBtn').tap();
  await page.waitForFunction(()=>window.__djAudioProbe().running&&window.__djAudioProbe().rms>.001,null,{timeout:10000});
  await page.locator('#pads [data-creative-id="6"]').tap();
  await page.waitForFunction(()=>window.__djAudioProbe().loops.includes(6),null,{timeout:7000});
  assert(!(await page.evaluate(()=>window.__djAudioProbe().loops)).includes(5),'bass choke group overlaps');
  await page.locator('#stopBtn').tap();
  await page.locator('#creativePages [data-pack-page="1"]').tap();
  assert.equal(await page.locator('#pads [data-creative-id="17"]').count(),1,'Page B did not render');
  await page.locator('#pads [data-creative-id="17"]').tap();
  await page.waitForFunction(()=>window.__djAudioProbe().rms>.001,null,{timeout:5000});
  await page.locator('#touchStrip').focus();
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(()=>window.__djAudioProbe().ribbon&&window.__djAudioProbe().rms>.001,null,{timeout:5000});
  await page.keyboard.up('ArrowRight');
  assert.equal(await page.evaluate(()=>window.__djAudioProbe().ribbon),false,'ribbon did not release');
  await page.locator('#stripMode').selectOption('filter');
  await page.locator('#touchStrip').focus();await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(()=>window.__djAudioProbe().filter<.95,null,{timeout:5000});
  await page.keyboard.up('ArrowLeft');
  assert.equal(await page.evaluate(()=>window.__djAudioProbe().filter),1,'strip did not restore filter');
  const wav=await page.evaluate(()=>window.__djRenderTest());
  assert(wav.bytes>1000000&&wav.peak>100,'Creative WAV contains no usable audio');
  assert.equal(wav.rate,44100);assert.equal(wav.channels,2);assert.equal(wav.bits,16);
  // Saving must retain the active Creative arrangement across a fresh page load.
  await pause(350);await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>window.__djAudioProbe?.().creative===true,null,{timeout:10000});
  assert((await page.evaluate(()=>window.__djAudioProbe().loops)).includes(6),'Creative arrangement did not persist');
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout:15000});
  await context.setOffline(true);await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>window.__djAudioProbe?.().creative===true,null,{timeout:10000});
  assert.equal(await page.locator('#pads .pad').count(),16,'offline PWA did not restore pads');
  await context.setOffline(false);
  assert.equal(errors.length,0,'Unhandled browser errors: '+errors.join(' | '));
  assert.equal(failed.length,0,'Failed local resources: '+failed.join(' | '));
  await context.close();
  console.log('PASS WebKit mobile touch: imports, 16 pads, tab navigation, sequence, undo, audio unlock, audible signal, transport, 32-pad pack, choke groups, synth/FX ribbon, WAV PCM, arrangement restore and offline PWA');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
