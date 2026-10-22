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
 page.on('crash',lambda _:errors.append('Browser renderer crashed'))
 page.goto(URL,wait_until='networkidle');assert 'NEXUS 31' in page.title(),page.title()
 try:
  page.wait_for_function("document.querySelectorAll('#pads .pad').length===8",timeout=15000)
 except Exception as exc:
  raise AssertionError(f"Startup did not render eight pads: errors={errors}, url={page.url}, ready={page.evaluate('document.readyState')}") from exc
 assert page.locator('.pad').count()==8
 assert page.locator('#musicPads .music-pad').count()==8
 for group in ['acid','piano','fx']:
  page.locator(f'[data-sound-page="{group}"]').tap()
  assert page.locator('#musicPads .music-pad').count()==8
  page.locator('#musicPads .music-pad').first.tap()
 page.locator('#musicKey').select_option('5')
 assert page.locator('#musicKey').input_value()=='5'
 assert page.locator('.pad[data-pad="4"]').is_visible()
 assert page.locator('.pad[data-pad="7"]').is_visible()
 assert page.locator('#kitBanks button').count()==4
 assert page.locator('#sampleSource option[value="mic"]').count()==0
 assert page.locator('html').get_attribute('lang')=='ru'
 # RU/EN must switch instantly without self-triggering endless MutationObserver updates.
 assert page.locator('#languageToggle').is_visible()
 page.locator('#languageToggle').tap()
 page.wait_for_function("document.documentElement.lang==='en' && document.querySelector('#play').textContent.includes('PLAY')",timeout=4000)
 assert page.locator('#languageToggle').get_attribute('aria-pressed')=='true'
 page.reload(wait_until='networkidle')
 page.wait_for_function("document.documentElement.lang==='en' && document.querySelector('#play').textContent.includes('PLAY')",timeout=4000)
 page.locator('#languageToggle').tap()
 page.wait_for_function("document.documentElement.lang==='ru' && document.querySelector('#play').textContent.includes('ПУСК')",timeout=4000)
 assert page.locator('#languageToggle').get_attribute('aria-pressed')=='false'
 assert page.locator('[data-kit="0"]').is_visible()
 assert page.locator('link[rel="stylesheet"]').count()==1
 assert page.locator('link[rel="stylesheet"]').get_attribute('href')=='/studio27.css'
 grid=page.locator('#pads').evaluate("el=>getComputedStyle(el).gridTemplateColumns.split(' ').length")
 assert grid==4,('Reference requires 4 pads per row',grid)
 positions=page.locator('.pad').evaluate_all("els=>els.map(e=>Math.round(e.getBoundingClientRect().top))")
 assert len(set(positions))==2,('Reference requires exactly 2 rows',positions)
 assert page.locator('.step').count()==8
 assert page.locator('.hero-deck').is_visible()
 assert page.locator('.control-deck').is_visible()
 assert page.locator('.creator-actions').is_visible()
 assert page.locator('.main-mixer').is_visible()
 assert page.locator('.bottomnav button').count()==5
 assert page.locator('.workspace-fan').count()==5
 assert page.locator('[data-pane="profile"]').is_visible()
 assert page.locator('#sourceForm').count()==0
 assert page.locator('#waveform').count()==1
 assert page.locator('#jogWheel').count()==1
 assert page.locator('#jogWheel').evaluate("el=>getComputedStyle(el).touchAction")=='none'
 assert page.locator('#cueOverdub').count()==1
 assert page.locator('#presetVault').count()==1
 assert '3 145 728' in page.locator('#presetCount').inner_text()
 page.locator('[data-jog-mode="filter"]').tap()
 page.locator('#jogWheel').focus()
 page.keyboard.press('ArrowDown')
 page.wait_for_function("Number(document.querySelector('#filter').value)===99")
 assert page.locator('#eqLow').evaluate("el=>getComputedStyle(el).touchAction")=='none'
 # A pad touch must retain editor step DOM nodes instead of rebuilding the sequencer.
 page.evaluate("window.__stepBefore=document.querySelector('#steps .step')")
 page.locator('.pad[data-pad="3"]').tap()
 assert page.evaluate("document.querySelector('#steps .step')===window.__stepBefore"),'Touch rebuilt step controls'
 # Hold is tested with a trusted mouse down/up, not an untrusted synthetic pointer
 # which WebKit/Chromium can immediately cancel with lostpointercapture.
 pad=page.locator('.pad[data-pad="3"]')
 pad.wait_for(state='visible',timeout=10000)
 bounds=page.evaluate("""()=>{const r=document.querySelector('.pad[data-pad="3"]')?.getBoundingClientRect();return r&&r.width?{x:r.x,y:r.y,width:r.width,height:r.height}:null}""");assert bounds
 page.mouse.move(bounds['x']+bounds['width']/2,bounds['y']+bounds['height']/2)
 page.mouse.down()
 assert pad.evaluate("el=>el.classList.contains('pressed')"),'Pad did not respond on pointerdown'
 page.wait_for_timeout(150)
 assert pad.evaluate("el=>el.classList.contains('pressed')"),'Pressed UI expired while physically held'
 page.mouse.up()
 page.wait_for_timeout(100)
 assert not pad.evaluate("el=>el.classList.contains('pressed')"),'Pointerup left pad stuck'
 # Cancellation is a separate event-flow assertion.
 page.evaluate("""()=>{
  const pad=document.querySelector('.pad[data-pad="3"]');
  pad.dispatchEvent(new PointerEvent('pointerdown',{pointerId:777,pointerType:'touch',clientY:100,bubbles:true,cancelable:true}));
  pad.dispatchEvent(new PointerEvent('pointercancel',{pointerId:777,pointerType:'touch',bubbles:true}));
 }""")
 page.wait_for_timeout(100)
 assert not pad.evaluate("el=>el.classList.contains('pressed')"),'Pointercancel left pad stuck'
 assert page.locator('.pad[data-pad="3"]').evaluate("""el=>!el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))"""),'Long press unexpectedly opens sample replacement'
 assert page.locator('#pads .pad').first.evaluate("el=>getComputedStyle(el).touchAction")=='none'
 assert page.locator('.pattern-lane').count()==4
 assert page.locator('.pattern-cell').count()==64
 assert page.locator('.channel').count()==0
 assert page.locator('#crossfade').count()==1
 assert page.locator('#autoMixToggle').count()==0
 assert page.locator('#trackAutoMix').count()==0
 page.locator('[data-cue="50"]').tap()
 assert page.locator('#trackCue').input_value()=='50'
 assert 'DROP' in page.locator('#cuePosition').inner_text()
 page.locator('[data-cue="0"]').tap()
 # Preset generator and local pocket folders survive reload without disturbing legacy session keys.
 page.locator('#presetNumber').fill('3145728')
 page.locator('#presetNumber').dispatch_event('change')
 assert page.locator('#presetGenre').input_value()=='11'
 page.locator('#presetApply').tap()
 page.locator('#folderName').fill('QA POCKET')
 page.locator('#folderCreate').tap()
 page.locator('#presetTitle').fill('QA LIVE RHYTHM')
 page.locator('#presetSave').tap()
 assert page.locator('.pocket-item').count()==1
 page.reload(wait_until='networkidle')
 assert page.locator('#presetFolder').input_value()=='QA POCKET'
 assert page.locator('.pocket-item').count()==1
 # A local recording plays through the same master bus with no second deck.
 frames=[]
 for n in range(44100*6):
  t=n/44100;beat=t%0.5
  amplitude=math.exp(-beat*28)*.4 if beat<.24 else 0
  frames.append(struct.pack('<h',int(amplitude*math.sin(2*math.pi*110*t)*32767)))
 output=io.BytesIO()
 with wave.open(output,'wb') as wav:
  wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(44100);wav.writeframes(b''.join(frames))
 page.locator('#trackInput').set_input_files({'name':'local-groove.wav','mimeType':'audio/wav','buffer':output.getvalue()})
 page.wait_for_function("document.querySelector('#startAutoMix').disabled===false",timeout=20000)
 assert 'local-groove.wav' in page.locator('#trackQueue').inner_text()
 page.locator('#mixIntro').uncheck()
 page.locator('#startAutoMix').tap()
 page.wait_for_function("document.querySelector('#mixStatus').textContent.includes('Автосводка')",timeout=15000)
 page.wait_for_function("parseFloat(document.querySelector('#outputMeter').style.width)>0",timeout=4000)
 page.wait_for_function("parseFloat(document.querySelector('#mixProgressFill').style.width)>0",timeout=4000)
 page.locator('#stopAutoMix').tap()
 assert page.locator('#startAutoMix').is_enabled()
 page.locator('#tapTempo').tap()
 page.wait_for_timeout(450)
 page.locator('#tapTempo').tap()
 assert 80<=int(page.locator('#bpm').inner_text())<=175
 page.locator('#applyPattern').tap()
 assert page.locator('#undoGroove').is_visible()
 assert sum(1 for x in page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v19")).pattern[0]') if x>0)>=4
 page.locator('#undoGroove').tap()
 assert page.locator('body').evaluate('(el)=>el.scrollWidth <= innerWidth+2')
 # First gesture unlocks AudioContext; transport must not throw, and pad will respond.
 page.locator('#record').tap();page.wait_for_timeout(400)
 assert page.locator('#record').inner_text().find('СТОП ЗАПИСИ')>=0,page.locator('#record').inner_text()
 # Native touchscreen tap targets a real screen coordinate without Playwright's
 # animation-stability wait; a user's finger does not wait for element settling.
 pad5=page.locator('.pad[data-pad="5"]').bounding_box(timeout=10000);assert pad5, 'PAD 6 not rendered'
 page.touchscreen.tap(pad5['x']+pad5['width']/2,pad5['y']+pad5['height']/2)
 page.wait_for_timeout(240)
 data=page.evaluate('JSON.parse(localStorage.getItem("artss-live-session-v19"))')
 assert sum(1 for x in data['pattern'][5] if x>0)>=1,data['pattern'][5]
 page.locator('#record').tap();assert 'ЗАПИСЬ' in page.locator('#record').inner_text()
 page.locator('#play').tap();page.locator('#play').tap();page.wait_for_timeout(100)
 page.locator('#stop').tap()
 page.locator('#advancedEditor summary').tap()
 page.locator('#pageB').tap();assert '09–16' in page.locator('#stepLabel').inner_text()
 prior_state=page.locator('.step').first.evaluate("el=>el.classList.contains('on')")
 page.locator('.step').first.tap()
 toggled_state=page.locator('.step').first.evaluate("el=>el.classList.contains('on')")
 assert toggled_state is not prior_state
 page.reload(wait_until='networkidle')
 page.locator('#advancedEditor summary').tap()
 page.locator('#pageB').tap()
 assert page.locator('.step').first.evaluate("el=>el.classList.contains('on')") == toggled_state
 page.locator('[data-kit="1"]').tap()
 assert page.locator('[data-kit="1"]').get_attribute('class').find('active')>=0
 page.locator('[data-kit="0"]').tap()
 page.locator('.pattern-cell[data-pad="0"][data-step="0"]').tap()
 page.locator('.pattern-cell[data-pad="0"][data-step="0"]').tap()
 # WebKit may not dispatch input for a synthetic range.fill; fire the same real input handler explicitly.
 page.locator('#eqLow').evaluate("(el)=>{el.value='4';el.dispatchEvent(new Event('input',{bubbles:true}))}")
 page.wait_for_function("JSON.parse(localStorage.getItem('artss-live-session-v19')).eqLow===4")
 # Drag the EQ dial vertically 35 CSS pixels: should boost exactly +5 dB.
 new_value=page.evaluate("""()=>{
  const knob=document.querySelector('#eqLow');
  knob.dispatchEvent(new PointerEvent('pointerdown',{pointerId:914,pointerType:'touch',clientY:170,bubbles:true,cancelable:true}));
  knob.dispatchEvent(new PointerEvent('pointermove',{pointerId:914,pointerType:'touch',clientY:135,bubbles:true,cancelable:true}));
  knob.dispatchEvent(new PointerEvent('pointerup',{pointerId:914,pointerType:'touch',clientY:135,bubbles:true,cancelable:true}));
  return Number(knob.value);
 }""")
 assert new_value==9,('EQ finger drag inconsistent',new_value)
 page.wait_for_function("JSON.parse(localStorage.getItem('artss-live-session-v19')).eqLow===9")
 page.locator('#crossfade').fill('66')
 page.wait_for_function("JSON.parse(localStorage.getItem('artss-live-session-v19')).crossfader===.66")
 page.locator('#quickUpload').tap()
 assert page.locator('#soundsFan').get_attribute('open') is not None
 assert page.locator('#replaceTarget option').count()==8
 assert page.locator('#restoreSound').is_disabled()
 page.locator('#menuToggle').tap()
 page.locator('#drawerPresets').tap()
 assert page.locator('.library-style').count()==12
 assert page.locator('#libraryFan').get_attribute('open') is not None
 page.locator('[data-pane="mix"]').tap()
 assert page.locator('#mixFan').get_attribute('open') is not None
 assert page.locator('.mixrow').count()==8
 page.locator('#filter').fill('50');page.wait_for_function("JSON.parse(localStorage.getItem('artss-live-session-v19')).filter===.5")
 page.locator('#echo').fill('30');page.wait_for_function("JSON.parse(localStorage.getItem('artss-live-session-v19')).echo===.3")
 assert page.locator('#crossfade').count()==1
 page.locator('.mixrow input[type="range"]').first.fill('67');page.wait_for_function("JSON.parse(localStorage.getItem('artss-live-session-v19')).levels[0]===.67")
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
 # Importing audio alone must NEVER auto-replace a drum. The user explicitly chooses REPLACE.
 page.locator('#quickUpload').tap()
 page.locator('#replaceTarget').select_option('0')
 assert page.locator('#restoreSound').is_disabled()
 page.locator('#sampleInput').set_input_files({'name':'ignored.wav','mimeType':'audio/wav','buffer':wav.getvalue()})
 page.wait_for_timeout(150)
 assert 'ОРИГИНАЛ' in page.locator('#soundInfo').inner_text()
 page.locator('#replaceSound').tap()
 page.locator('#sampleInput').set_input_files({'name':'own-drum.wav','mimeType':'audio/wav','buffer':wav.getvalue()})
 page.wait_for_timeout(1000)
 assert 'ЗАМЕНЁН' in page.locator('#status').inner_text(),page.locator('#status').inner_text()
 assert 'СВОЙ' in page.locator('#soundInfo').inner_text()
 page.locator('#bank').select_option('2')
 assert 'ОРИГИНАЛ' in page.locator('#soundInfo').inner_text()
 page.locator('#bank').select_option('0')
 assert 'СВОЙ' in page.locator('#soundInfo').inner_text()
 page.locator('#restoreSound').tap()
 page.wait_for_function("document.querySelector('#soundInfo').textContent.includes('ОРИГИНАЛ')")
 assert page.locator('.pad[data-pad="0"] .pad-own').inner_text()==''
 page.reload(wait_until='networkidle')
 page.locator('#quickUpload').tap()
 assert page.locator('#restoreSound').is_disabled()
 page.locator('[data-pane="main"]').tap()
 # No browser audio capture: REC writes pad events to the looping sequencer.
 assert page.locator('#sampleStart').count()==0
 assert page.locator('#drawerSample').count()==0
 # STOP cancels an already queued source: verify rendered PCM, not only mocks.
 result=page.evaluate("""async()=>{
  const {Engine}=await import('/app/engine.js');
  const {defaultSession}=await import('/app/model.js');
  async function render(cancel){
   const ctx=new OfflineAudioContext(2,12000,48000),engine=new Engine(defaultSession);
   const buffer=ctx.createBuffer(1,4800,48000),data=buffer.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=.3*Math.sin(2*Math.PI*220*i/48000);
   engine.ctx=ctx;engine.bank.resolve=()=>({buffer,gain:1,lowCut:20,highCut:16000});
   engine.voice(ctx,ctx.destination,0,.05,1,0,1);
   if(cancel)engine.stop();
   const rendered=await ctx.startRendering();let peak=0;
   for(const x of rendered.getChannelData(0))peak=Math.max(peak,Math.abs(x));
   return peak;
  }
  return {playing:await render(false),stopped:await render(true)};
 }""")
 assert result['playing']>.1,result
 assert result['stopped']==0,result
 # Additional responsive widths
 for width in [320,375,390,430,768,1280,1920]:
  page.set_viewport_size({'width':width,'height':844})
  assert page.locator('body').evaluate('(el)=>el.scrollWidth <= innerWidth+2'),width
 assert not errors,errors
 # Switching languages during live playback must not stall the transport.
 page.locator('[data-pane="main"]').tap()
 page.locator('#play').tap()
 for _ in range(3):
  page.locator('#languageToggle').tap(timeout=5000)
  page.locator('#languageToggle').tap(timeout=5000)
 assert page.locator('#play').inner_text().find('ПАУЗА')>=0
 page.locator('#stop').tap()
 browser.close()
srv.shutdown()
print(f'PASS browser smoke ({browser_type}) and 7 mobile/tablet/desktop viewport widths')
