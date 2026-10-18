"""Runs real HTTP-mode smoke in Chrome and WebKit. Usage: python3 tests/browser-qa.py chromium|webkit."""
from pathlib import Path
from threading import Thread
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import os,sys,time,math,struct,wave,io
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
 page.goto(URL,wait_until='networkidle');assert 'ARTSS LIVE 18' in page.title(),page.title()
 assert page.locator('.pad').count()==8
 assert page.locator('.step').count()==8
 assert page.locator('.hero').is_visible()
 assert page.locator('body').evaluate('(el)=>el.scrollWidth <= innerWidth+2')
 # First gesture unlocks AudioContext; transport must not throw, and pad will respond.
 page.locator('#record').tap();page.wait_for_timeout(400)
 assert page.locator('#record').inner_text().find('OFF')>=0,page.locator('#record').inner_text()
 page.locator('[data-pad="5"]').tap();page.wait_for_timeout(240)
 data=page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v18"))')
 assert sum(1 for x in data['pattern'][5] if x>0)>=1,data['pattern'][5]
 page.locator('#record').tap();assert 'REC' in page.locator('#record').inner_text()
 page.locator('#play').tap();page.locator('#play').tap();page.wait_for_timeout(100)
 page.locator('#stop').tap()
 page.locator('#pageB').tap();assert '09–16' in page.locator('#stepLabel').inner_text()
 page.locator('.step').first.tap();page.reload(wait_until='networkidle')
 page.locator('#pageB').tap();assert page.locator('.step').first.get_attribute('class').find('on')>=0
 page.locator('[data-pane="mix"]').tap();assert page.locator('.mixrow').count()==8
 page.locator('input[type="range"]').first.fill('67');assert page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v18")).levels[0]')==.67
 page.locator('[data-pane="takes"]').tap();with page.expect_download(timeout=60000) as event: page.locator('#export').tap()
 downloaded=event.value
 with open(downloaded.path(),'rb') as f: assert f.read(4)==b'RIFF'
 # Upload a real short WAV from memory to exercise classifier, decoding, and selected-pad routing
 wav=io.BytesIO()
 with wave.open(wav,'wb') as wf:
  wf.setnchannels(1);wf.setsampwidth(2);wf.setframerate(44100)
  wf.writeframes(b''.join(struct.pack('<h',int(13000*math.sin(i*.016)*math.exp(-i/20000))) for i in range(44100)))
 page.locator('[data-pane="main"]').tap()
 page.locator('#sampleInput').set_input_files({'name':'own-drum.wav','mimeType':'audio/wav','buffer':wav.getvalue()})
 page.wait_for_timeout(1300)
 assert 'AUTO MIX' in page.locator('#status').inner_text(),page.locator('#status').inner_text()
 # Additional responsive widths
 for width in [320,375,390,430]:
  page.set_viewport_size({'width':width,'height':844})
  assert page.locator('body').evaluate('(el)=>el.scrollWidth <= innerWidth+2'),width
 assert not errors,errors
 browser.close()
srv.shutdown()
print(f'PASS browser smoke ({browser_type}) and 4 mobile viewport widths')