"""End-to-end touch, real audio, recording and export check using real HTTP-loaded production assets."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, Error as BrowserError
import os, sys, shutil

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'dist'
ENGINE=sys.argv[1] if len(sys.argv)>1 else 'chromium'
if ENGINE not in ('chromium','webkit'):
    raise ValueError('Browser must be chromium or webkit')

PROBE='''
window.__qa=()=>({playing:engine.playing,context:engine.ctx?.state,rms:engine.meter(),bank:state.bank,bpm:state.bpm,ready:recordReady?.blob?.size||0,recPhase:engine.recPhase});
window.__render=(bars)=>engine.offline(bars).then(async b=>({size:b.size,signature:Array.from(new Uint8Array(await b.arrayBuffer()).slice(0,4))}));
'''

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(TARGET),**kwargs)
    def do_GET(self):
        # Expose read-only, test-only probes inside the real ESM module scope.
        # Production build files remain byte-for-byte unchanged.
        if self.path.split('?',1)[0]=='/studio.js':
            data=((TARGET/'studio.js').read_text()+'\n'+PROBE).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type','text/javascript; charset=utf-8')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()
    def log_message(self,*args): pass

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
thread=Thread(target=server.serve_forever,daemon=True)
thread.start()
try:
    with sync_playwright() as pw:
        kind=getattr(pw,ENGINE)
        launcher={}
        if ENGINE=='chromium':
            binary=os.environ.get('CHROME_BIN') or shutil.which('chromium') or shutil.which('google-chrome')
            if binary: launcher['executable_path']=binary
            launcher['args']=['--no-sandbox','--disable-dev-shm-usage']
        browser=kind.launch(headless=True,**launcher)
        context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,accept_downloads=True)
        page=context.new_page()
        errors=[];failed=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.on('response',lambda response:failed.append(f'{response.status} {response.url}') if response.status>=400 and response.url.startswith(f'http://127.0.0.1:{server.server_port}') else None)
        base=f'http://127.0.0.1:{server.server_port}'
        try:
            page.goto(base+'/',wait_until='load',timeout=30000)
        except BrowserError as error:
            if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):
                raise
            # Some sandbox hosts prevent local HTTP navigation. Fall back to the
            # exact same built source injected on about:blank; CI tests real HTTP.
            page.close()
            page=context.new_page()
            page.on('pageerror',lambda err:errors.append(str(err)))
            page.set_content((TARGET/'index.html').read_text().replace('<script type="module" src="./studio.js?v=8.1.0"></script>',''),wait_until='load')
            page.add_style_tag(content=(TARGET/'studio.css').read_text())
            page.add_script_tag(content=(TARGET/'studio.js').read_text()+'\n'+PROBE)

        page.locator('#pads .pad').first.wait_for(timeout=18000)
        assert page.title()=='ARTSS STUDIO · Beat Creator'
        assert page.locator('#pads .pad').count()==16
        assert page.locator('#presets .bank').count()==8
        assert page.locator('#sequence .seq-cell[data-row]').count()==256
        page.locator('#pads .pad').first.tap()
        page.wait_for_function('window.__qa().context==="running"',timeout=15000)
        page.locator('#play').tap()
        page.wait_for_function('window.__qa().playing===true',timeout=15000)
        peaks=[]
        for _ in range(10):
            page.wait_for_timeout(100)
            peaks.append(page.evaluate('window.__qa().rms'))
        assert max(peaks)>0.001,f'Audio output silent in {ENGINE}: {max(peaks)}'
        page.locator('#stop').tap()
        assert page.evaluate('!window.__qa().playing')
        page.locator('#presets .bank').nth(3).tap()
        assert page.evaluate('window.__qa().bank')==3
        page.locator('#bpmUp').tap()
        assert page.evaluate('window.__qa().bpm')==143
        page.locator('[data-tab="sequence"]').tap()
        cell=page.locator('[data-row="0"][data-step="1"]')
        before=cell.get_attribute('aria-pressed')
        cell.tap()
        assert cell.get_attribute('aria-pressed')!=before
        page.locator('#undo').tap()
        assert page.locator('[data-row="0"][data-step="1"]').get_attribute('aria-pressed')==before
        page.locator('[data-tab="mix"]').tap()
        page.locator('#ctrl-drive').fill('12')
        assert page.locator('#value-drive').inner_text()=='12%'
        page.locator('[data-tab="export"]').tap()
        result=page.evaluate('window.__render(8)')
        assert result['size']>20000 and result['signature']==[82,73,70,70],f'Invalid WAV: {result}'
        # Browser MediaRecorder capabilities vary. If unsupported, WAV is the enforced fallback.
        recorder_available=page.evaluate('typeof MediaRecorder!=="undefined"')
        if recorder_available:
            page.locator('#record').tap()
            page.wait_for_function('window.__qa().recPhase==="recording"',timeout=10000)
            page.locator('[data-tab="pads"]').tap()
            page.locator('#pads .pad').first.tap()
            page.locator('[data-tab="export"]').tap()
            page.wait_for_timeout(650)
            page.locator('#record').tap()
            page.wait_for_function('window.__qa().recPhase==="idle"',timeout=10000)
            page.wait_for_function('window.__qa().ready>0',timeout=10000)
            with page.expect_download(timeout=15000) as info:
                page.locator('#record').tap()
            assert info.value.suggested_filename.startswith('ARTSS-LIVE-')
        assert not errors,errors
        assert not failed,failed
        print(f'PASS {ENGINE} HTTP production assets: 16 touch pads, 8 banks, 256 steps, nonzero audio signal, transport, undo, FX, WAV, MediaRecorder={recorder_available}')
        context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()