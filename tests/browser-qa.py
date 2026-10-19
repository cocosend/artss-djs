"""Runs real HTTP-mode smoke in Chrome and WebKit. Usage: python3 tests/browser-qa.py chromium|webkit."""
from pathlib import Path
from threading import Thread
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import os,sys,time,math,struct,wave,io,mimetypes
from urllib.parse import urlparse,unquote
ROOT=Path(__file__).resolve().parents[1] / 'dist'
class QuietHandler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
 def log_message(self,format,*args): pass
srv=ThreadingHTTPServer(('127.0.0.1',0),QuietHandler)
Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{srv.server_port}/'
browser_type=(sys.argv[1] if len(sys.argv)>1 else 'chromium')
with sync_playwright() as playwright:
 bt=getattr(playwright,browser_type)
 browser=bt.launch(headless=True,**({'executable_path':os.getenv('CHROME_BIN')} if browser_type=='chromium' and os.getenv('CHROME_BIN') else {}))
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True,accept_downloads=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve_static(route):
  raw=unquote(urlparse(route.request.url).path).lstrip('/') or 'index.html'
  f=(ROOT/raw).resolve()
  if not f.is_relative_to(ROOT.resolve()) or not f.is_file():return route.fulfill(status=404,body='not found')
  return route.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
 if os.getenv('ARTSS_LOCAL_PREVIEW')=='1':
  context.route('https://artss.test/**',serve_static)
  URL='https://artss.test/'
 page.goto(URL,wait_until='networkidle');assert 'DJ CREATOR 21' in page.title(),page.title()
 assert page.locator('.pad').count()==8
 assert page.locator('.step').count()==8
 assert page.locator('.console').is_visible()
 assert page.locator('.channel').count()==0
 assert not page.locator('#crossfade').count()
 page.locator('#autoGroove').tap()
 assert page.locator('#undoGroove').is_visible()
 assert sum(1 for x in page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v19")).pattern[0]') if x>0)>=4
 page.locator('#undoGroove').tap()
 assert page.locator('body').evaluate('(el)=>el.scrollWidth <= innerWidth+2')
 # First gesture unlocks AudioContext; transport must not throw, and pad will respond.
 page.locator('#record').tap();page.wait_for_timeout(400)
 assert page.locator('#record').inner_text().find('OFF')>=0,page.locator('#record').inner_text()
 page.locator('[data-pad="5"]').tap();page.wait_for_timeout(240)
 data=page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v19"))')
 assert sum(1 for x in data['pattern'][5] if x>0)>=1,data['pattern'][5]
 page.locator('#record').tap();assert 'REC' in page.locator('#record').inner_text()
 page.locator('#play').tap();page.locator('#play').tap();page.wait_for_timeout(100)
 page.locator('#stop').tap()
 page.locator('#pageB').tap();assert '09–16' in page.locator('#stepLabel').inner_text()
 page.locator('.step').first.tap();page.reload(wait_until='networkidle')
 page.locator('#pageB').tap();assert page.locator('.step').first.get_attribute('class').find('on')>=0
 page.locator('[data-pane="mix"]').tap();assert page.locator('.mixrow').count()==8
 page.locator('#filter').fill('50');assert page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v19")).filter')==.5
 page.locator('#echo').fill('30');assert page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v19")).echo')==.3
 assert not page.locator('#crossfade').count()
 page.locator('.mixrow input[type="range"]').first.fill('67');assert page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v19")).levels[0]')==.67
 page.locator('[data-pane="takes"]').tap()
 with page.expect_download(timeout=60000) as event: page.locator('#export').tap()
 downloaded=event.value
 with wave.open(str(downloaded.path()),'rb') as w:
  assert w.getnchannels()==2 and w.getframerate()==44100
  frames=w.readframes(w.getnframes())
  samples=struct.unpack('<'+'h'*(len(frames)//2),frames)
  peak=max(abs(v) for v in samples)
  assert peak>150,('Exported WAV was silent',peak)
  assert sum(1 for v in samples if abs(v)>=32760)/len(samples)<.01,'Master output clips excessively'
 # Upload a real short WAV from memory to exercise classifier, decoding, and selected-pad routing
 wav=io.BytesIO()
 with wave.open(wav,'wb') as wf:
  wf.setnchannels(1);wf.setsampwidth(2);wf.setframerate(44100)
  wf.writeframes(b''.join(struct.pack('<h',int(13000*math.sin(i*.016)*math.exp(-i/20000))) for i in range(44100)))
 page.locator('[data-pane="main"]').tap()
 page.locator('#sampleInput').set_input_files({'name':'own-drum.wav','mimeType':'audio/wav','buffer':wav.getvalue()})
 page.wait_for_timeout(1300)
 assert 'AUTO MIX' in page.locator('#status').inner_text(),page.locator('#status').inner_text()
 # Capture 500 ms of the live mixer as an independent pad sample, save under current style.
 page.locator('.sample-rec-head').tap()
 assert page.locator('#sampleSource').is_visible()
 page.locator('#sampleSource').select_option('live')
 page.locator('[data-pad="1"]').tap()
 page.locator('#sampleStart').tap()
 page.wait_for_timeout(2500)
 assert not page.locator('#sampleStop').is_disabled(), page.evaluate('''({status:document.querySelector('#status').textContent,mediaRecorder:typeof MediaRecorder,mp4:typeof MediaRecorder==='undefined'?null:MediaRecorder.isTypeSupported('audio/mp4'),webm:typeof MediaRecorder==='undefined'?null:MediaRecorder.isTypeSupported('audio/webm'),startDisabled:document.querySelector('#sampleStart').disabled,stopDisabled:document.querySelector('#sampleStop').disabled})''')
 page.locator('[data-pad="1"]').tap()
 page.wait_for_timeout(650)
 page.locator('#sampleStop').tap()
 page.wait_for_function("document.querySelector('#sampleStart').disabled === false",timeout=15000)
 assert 'SAMPLE SAVED' in page.locator('#status').inner_text(),page.locator('#status').inner_text()
 assert page.locator('[data-pad="1"] .pad-own').inner_text()=='OWN'
 stored=page.evaluate("""() => new Promise((resolve,reject)=>{
  const open=indexedDB.open('artss-live-user-samples',1);
  open.onerror=()=>reject('Could not open user samples');
  open.onsuccess=()=>{const db=open.result;const request=db.transaction('pads','readonly').objectStore('pads').get('0:1');
   request.onerror=()=>reject('Could not fetch sample');
   request.onsuccess=()=>{const data=request.result;resolve({name:data?.name,bytes:data?.data?.byteLength??0})};};
 })""")
 assert stored['bytes']>2048,stored
 page.reload(wait_until='networkidle')
 page.locator('[data-pad="1"]').tap()
 page.wait_for_function("document.querySelector('[data-pad=\"1\"] .pad-own').textContent === 'OWN'",timeout=10000)
 page.locator('#bank').select_option('2')
 assert page.locator('[data-pad="1"] .pad-own').inner_text()!='OWN', 'Style 2 unexpectedly shares custom sample'
 page.locator('#bank').select_option('0')
 assert page.locator('[data-pad="1"] .pad-own').inner_text()=='OWN', 'Preset sample missing when returning to style 0'
 # Additional responsive widths
 for width in [320,375,390,430]:
  page.set_viewport_size({'width':width,'height':844})
  assert page.locator('body').evaluate('(el)=>el.scrollWidth <= innerWidth+2'),width
 assert not errors,errors
 browser.close()
srv.shutdown()
print(f'PASS browser smoke ({browser_type}) and 4 mobile viewport widths')