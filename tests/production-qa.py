"""Real mobile WebKit/Chromium QA of live loop overdub, transport, takes and WAV."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, Error as BrowserError
import os, sys, shutil

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'dist'
ENGINE=sys.argv[1] if len(sys.argv)>1 else 'chromium'
if ENGINE not in ('chromium','webkit'): raise ValueError('Browser must be chromium or webkit')
PROBE='''
window.__qa=()=>({playing:engine.playing,armed:liveRec,context:engine.ctx?.state,level:engine.meter(),bank:state.bank,
 steps:state.steps,scene:state.scene,pattern:state.patterns[state.scene].map(row=>Array.from(row)),stepIndex:engine.stepIndex,
 pausedAt:engine.elapsed,recPhase:engine.recPhase,hasTakeFallback:!!recordReady});
window.__render=(bars)=>engine.offline(bars).then(async b=>({size:b.size,magic:Array.from(new Uint8Array(await b.arrayBuffer()).slice(0,4))}));
'''
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(TARGET),**kwargs)
 def do_GET(self):
  if self.path.split('?',1)[0]=='/studio.js':
   body=((TARGET/'studio.js').read_text()+'\n'+PROBE).encode('utf-8')
   self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Content-Length',str(len(body)))
   self.end_headers();self.wfile.write(body)
  else:super().do_GET()
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  args={}
  if ENGINE=='chromium':
   binary=os.environ.get('CHROME_BIN') or shutil.which('chromium') or shutil.which('google-chrome')
   if binary:args['executable_path']=binary
   args['args']=['--no-sandbox','--disable-dev-shm-usage']
  browser=getattr(pw,ENGINE).launch(headless=True,**args)
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,accept_downloads=True)
  page=context.new_page();errors=[];failed=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:failed.append(f'{r.status} {r.url}') if r.status>=400 and r.url.startswith(f'http://127.0.0.1:{server.server_port}') else None)
  url=f'http://127.0.0.1:{server.server_port}/'
  local_origin=True
  try:page.goto(url,wait_until='load',timeout=25000)
  except BrowserError as error:
   if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):raise
   local_origin=False
   page.close();page=context.new_page()
   page.on('pageerror',lambda e:errors.append(str(e)))
   source=(TARGET/'index.html').read_text().replace('<script type="module" src="./studio.js?v=11.0.0"></script>','')
   page.set_content(source,wait_until='load')
   page.add_style_tag(content=(TARGET/'studio.css').read_text())
   sound=(TARGET/'sound-design.js').read_text().replace('export ','')
   symbols='{PAD_COUNT,PAD_NAMES,PAD_SHORT,KEYS,COLORS,PRESETS,SCENES,createGrid,presetPattern,makePCM,noteOffset}'
   app=(TARGET/'studio.js').read_text().split('\n',1)[1]
   page.add_script_tag(content='const SOUND=(()=>{'+sound+';return '+symbols+';})();\nconst '+symbols+'=SOUND;\n'+app+'\n'+PROBE)
  page.locator('#pads .pad').first.wait_for(timeout=12000)
  assert page.title()=='ARTSS LIVE 11 · REMIX GROOVE STUDIO'
  assert page.locator('#pads .pad').count()==8
  assert page.locator('#loopStrips .loop-strip').count()==8
  assert page.locator('#presets .bank').count()==8
  assert page.locator('#navigation .tab').count()==5
  assert page.evaluate('window.__qa().steps')==16
  # Exercise touch-to-sound audio unlock without autoplay workarounds.
  page.locator('#pads .pad').first.tap()
  page.wait_for_function('window.__qa().context==="running"',timeout=12000)
  page.wait_for_function('window.__qa().level>0.001',timeout=3000)
  page.locator('[data-tab="sequence"]').tap()
  page.locator('[data-length="32"]').tap()
  assert page.evaluate('window.__qa().steps')==32
  assert page.locator('[data-row][data-step]').count()==128
  page.locator('[data-page="1"]').tap()
  assert page.locator('[data-row="0"][data-step="16"]').count()==1
  assert page.evaluate('window.__qa().pattern[7][16]')==0
  page.locator('[data-row="7"][data-step="20"]').tap()
  assert page.evaluate('window.__qa().pattern[7][20]')>0
  page.locator('#undo').tap()
  assert page.evaluate('window.__qa().pattern[7][20]')==0
  page.locator('[data-tab="pads"]').tap()
  page.locator('#liveRec').tap()
  page.wait_for_function('window.__qa().playing&&window.__qa().armed',timeout=12000)
  page.wait_for_timeout(2100) # bar 2 of a 32-step loop; exercise 17–32 event capture
  before=page.evaluate('window.__qa().pattern[7].slice(16).filter(Boolean).length')
  page.locator('#pads .pad').nth(7).tap()
  page.wait_for_function('(window.__qa().pattern[7].slice(16).filter(Boolean).length) > '+str(before),timeout=1800)
  page.locator('#liveRec').tap()
  assert page.evaluate('!window.__qa().armed && window.__qa().playing')
  previous=page.evaluate('window.__qa().pattern[7].slice()')
  page.locator('#pads .pad').nth(7).tap()
  assert page.evaluate('window.__qa().pattern[7]')==previous, 'REC OFF must not write notes' 
  saved=page.evaluate('window.__qa().pattern[7].slice()')
  page.locator('#play').tap() # pause without clearing or resetting loop
  assert page.evaluate('!window.__qa().playing')
  assert page.evaluate('window.__qa().pattern[7]')==saved
  resumed_at=page.evaluate('window.__qa().stepIndex')
  page.locator('#play').tap()
  page.wait_for_function('window.__qa().playing',timeout=12000)
  assert page.evaluate('window.__qa().stepIndex')>=resumed_at
  page.locator('#stop').tap()
  assert page.evaluate('!window.__qa().playing && !window.__qa().armed && window.__qa().stepIndex===0')
  assert page.evaluate('window.__qa().pattern[7]')==saved
  if local_origin:
   page.wait_for_timeout(240)
   assert page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v11")).steps')==32
  page.locator('[data-tab="sequence"]').tap()
  recorded_step=next(i for i in range(16,32) if saved[i]>0)
  assert page.locator(f'[data-row="7"][data-step="{recorded_step}"]').get_attribute('aria-pressed')=='true'
  page.locator('#clear').tap()
  assert page.evaluate('window.__qa().pattern[7]')==saved, 'CLEAR must require confirmation'
  page.locator('#clear').tap()
  assert page.evaluate('window.__qa().pattern.every(row=>row.every(v=>v===0))')
  page.locator('#undo').tap()
  assert page.evaluate('window.__qa().pattern[7]')==saved
  page.locator('[data-tab="mix"]').tap()
  assert page.locator('.mix-channel').count()==8
  page.locator('[data-track-volume="0"]').fill('65')
  page.locator('[data-solo="0"]').tap();page.locator('[data-solo="0"]').tap()
  page.locator('[data-tab="export"]').tap()
  result=page.evaluate('window.__render(8)')
  assert result['magic']==[82,73,70,70] and result['size']>100000, result
  # The master audio recorder writes an independent persistent take.
  media=page.evaluate('typeof MediaRecorder!=="undefined"')
  if media:
   page.locator('#record').tap()
   page.wait_for_function('window.__qa().recPhase==="recording"',timeout=10000)
   page.locator('[data-tab="pads"]').tap();page.locator('#pads .pad').nth(7).tap()
   page.wait_for_timeout(750)
   page.locator('[data-tab="export"]').tap();page.locator('#record').tap()
   page.wait_for_function('window.__qa().recPhase==="idle"',timeout=12000)
   if local_origin:
    page.locator('#takeList .take-row').first.wait_for(state='attached',timeout=15000)
    assert page.locator('#takeList .take-row').count()>=1
    page.reload(wait_until='load')
    page.locator('[data-tab="export"]').tap()
    page.locator('#takeList .take-row').first.wait_for(timeout=15000)
    assert page.locator('#takeList .take-row').count()>=1,'IndexedDB audio takes must survive reload'
    with page.expect_download(timeout=15000) as download:page.locator('[data-take-action="download"]').first.tap()
    assert download.value.suggested_filename.endswith(('.m4a','.webm'))
   else:
    page.wait_for_function('window.__qa().hasTakeFallback',timeout=12000)
    with page.expect_download(timeout=15000) as download:page.locator('#record').tap()
    assert download.value.suggested_filename.endswith(('.m4a','.webm'))
  assert not errors,errors
  assert not failed,failed
  print(f'PASS {ENGINE}: 8 pads, 16/32 steps, quantized live overdub, pause/resume, stop/save, undo, mixer, WAV, persistent audio takes={local_origin and media}')
  context.close();browser.close()
finally:
 server.shutdown();server.server_close()