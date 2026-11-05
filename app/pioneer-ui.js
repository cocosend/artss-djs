/**
 * Pioneer DJ MixSound Controller UI & Waveform Renderers
 * Implements CDJ-3000 vinyl scratch physics, dual frequency waveforms,
 * rotary isolators, LED ladder VU meters, and interactive Touch+Drag XY Pad.
 */
import { pioneerDJ } from './pioneer-dj.js';
export function setupPioneerDJUI() {
    const stage = document.querySelector('#pioneerDJ');
    if (!stage)
        return;
    const tabPads = document.querySelector('#tabPads');
    const tabDecks = document.querySelector('#tabDecks');
    const tabWave = document.querySelector('#tabWave');
    const tabMix = document.querySelector('#tabMix');
    const tabFX = document.querySelector('#tabFX');
    const contentDecks = document.querySelector('#djViewDecksContent');
    const contentWave = document.querySelector('#djViewWaveContent');
    const contentMix = document.querySelector('#djViewMixContent');
    const contentFX = document.querySelector('#djViewFXContent');
    const livePadStage = document.querySelector('.live-pad-stage');
    const heroDeck = document.querySelector('.hero-deck');
    const controlDeck = document.querySelector('.control-deck');
    const creatorActions = document.querySelector('.creator-actions');
    const mainPanel = document.querySelector('#mainPanel');
    const switchView = (mode) => {
        // Tab active classes
        [tabPads, tabDecks, tabWave, tabMix, tabFX].forEach((tab) => {
            if (!tab)
                return;
            const isActive = tab.dataset.viewMode === mode;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
        });
        if (mode === 'pads') {
            stage.hidden = true;
            if (livePadStage)
                livePadStage.hidden = false;
            if (heroDeck)
                heroDeck.hidden = false;
            if (controlDeck)
                controlDeck.hidden = false;
            if (creatorActions)
                creatorActions.hidden = false;
            if (mainPanel)
                mainPanel.hidden = false;
        }
        else {
            stage.hidden = false;
            if (contentDecks)
                contentDecks.hidden = mode !== 'decks';
            if (contentWave)
                contentWave.hidden = mode !== 'wave';
            if (contentMix)
                contentMix.hidden = mode !== 'mix';
            if (contentFX)
                contentFX.hidden = mode !== 'fx';
            void pioneerDJ.initAudio();
        }
    };
    tabPads?.addEventListener('click', () => switchView('pads'));
    tabDecks?.addEventListener('click', () => switchView('decks'));
    tabWave?.addEventListener('click', () => switchView('wave'));
    tabMix?.addEventListener('click', () => switchView('mix'));
    tabFX?.addEventListener('click', () => switchView('fx'));
    document.querySelector('#djCloseBtn')?.addEventListener('click', () => switchView('pads'));
    // Deck A Play / Cue / Sync
    const playBtnA = document.querySelector('#djPlayA');
    const cueBtnA = document.querySelector('#djCueA');
    const syncBtnA = document.querySelector('#djSyncA');
    const pitchA = document.querySelector('#djPitchA');
    const pitchReadoutA = document.querySelector('#djPitchReadoutA');
    const deckTitleA = document.querySelector('#deckTitleA');
    const deckMetaA = document.querySelector('#deckMetaA');
    playBtnA?.addEventListener('click', () => pioneerDJ.togglePlay('A'));
    cueBtnA?.addEventListener('click', () => pioneerDJ.cueDeck('A'));
    syncBtnA?.addEventListener('click', () => pioneerDJ.syncDeck('A'));
    pitchA?.addEventListener('input', () => {
        const val = parseFloat(pitchA.value);
        pioneerDJ.setPitch('A', val);
        if (pitchReadoutA)
            pitchReadoutA.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
    });
    // Deck B Play / Cue / Sync
    const playBtnB = document.querySelector('#djPlayB');
    const cueBtnB = document.querySelector('#djCueB');
    const syncBtnB = document.querySelector('#djSyncB');
    const pitchB = document.querySelector('#djPitchB');
    const pitchReadoutB = document.querySelector('#djPitchReadoutB');
    const deckTitleB = document.querySelector('#deckTitleB');
    const deckMetaB = document.querySelector('#deckMetaB');
    playBtnB?.addEventListener('click', () => pioneerDJ.togglePlay('B'));
    cueBtnB?.addEventListener('click', () => pioneerDJ.cueDeck('B'));
    syncBtnB?.addEventListener('click', () => pioneerDJ.syncDeck('B'));
    pitchB?.addEventListener('input', () => {
        const val = parseFloat(pitchB.value);
        pioneerDJ.setPitch('B', val);
        if (pitchReadoutB)
            pitchReadoutB.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
    });
    // Crossfader
    const crossfaderInput = document.querySelector('#djCrossfader');
    crossfaderInput?.addEventListener('input', () => {
        pioneerDJ.setCrossfader(parseFloat(crossfaderInput.value));
    });
    // Volume Faders
    const volFaderA = document.querySelector('#djVolFaderA');
    volFaderA?.addEventListener('input', () => {
        pioneerDJ.setDeckVolume('A', parseFloat(volFaderA.value));
    });
    const volFaderB = document.querySelector('#djVolFaderB');
    volFaderB?.addEventListener('input', () => {
        pioneerDJ.setDeckVolume('B', parseFloat(volFaderB.value));
    });
    // Vinyl Jog Wheels (Interactive CDJ Scratching)
    setupJogWheel('A', '#djJogA');
    setupJogWheel('B', '#djJogB');
    // Custom Track Uploads
    const loadBtnA = document.querySelector('#deckLoadA');
    const fileInputA = document.querySelector('#djFileInputA');
    loadBtnA?.addEventListener('click', () => fileInputA?.click());
    fileInputA?.addEventListener('change', () => {
        if (fileInputA.files?.[0]) {
            void pioneerDJ.loadCustomTrack('A', fileInputA.files[0]);
        }
    });
    const loadBtnB = document.querySelector('#deckLoadB');
    const fileInputB = document.querySelector('#djFileInputB');
    loadBtnB?.addEventListener('click', () => fileInputB?.click());
    fileInputB?.addEventListener('change', () => {
        if (fileInputB.files?.[0]) {
            void pioneerDJ.loadCustomTrack('B', fileInputB.files[0]);
        }
    });
    // Wave View Controls
    document.querySelector('#djPlayAll')?.addEventListener('click', () => {
        if (pioneerDJ.state.decks.A.isPlaying || pioneerDJ.state.decks.B.isPlaying) {
            pioneerDJ.pauseDeck('A');
            pioneerDJ.pauseDeck('B');
        }
        else {
            void pioneerDJ.playDeck('A');
            void pioneerDJ.playDeck('B');
        }
    });
    document.querySelector('#djSyncAll')?.addEventListener('click', () => {
        pioneerDJ.syncDeck('B');
    });
    document.querySelector('#djCueAll')?.addEventListener('click', () => {
        pioneerDJ.cueDeck('A');
        pioneerDJ.cueDeck('B');
    });
    // FX Cards
    setupFXControls();
    // Rotary Knobs in View 3
    setupRotaryKnobs();
    // Waveform Canvas Canvases
    const canvasH = document.querySelector('#djWaveCanvasH');
    const canvasV = document.querySelector('#djWaveCanvasV');
    // Needle drop on horizontal stripe
    canvasH?.addEventListener('pointerdown', (e) => {
        const rect = canvasH.getBoundingClientRect();
        const progress = (e.clientX - rect.left) / rect.width;
        if (e.clientY - rect.top < rect.height / 2) {
            pioneerDJ.needleDrop('A', progress);
        }
        else {
            pioneerDJ.needleDrop('B', progress);
        }
    });
    // Subscribe to Pioneer DJ Engine State ticks
    pioneerDJ.subscribe((state) => {
        updateUI(state);
        if (!stage.hidden) {
            if (canvasH && !contentDecks?.hidden)
                drawHorizontalWaveforms(canvasH, state);
            if (canvasV && !contentWave?.hidden)
                drawVerticalWaveforms(canvasV, state);
        }
    });
}
function setupJogWheel(deckId, selector) {
    const jogEl = document.querySelector(selector);
    if (!jogEl)
        return;
    let isDragging = false;
    let lastAngle = 0;
    const getAngle = (e) => {
        const rect = jogEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    };
    jogEl.addEventListener('pointerdown', (e) => {
        isDragging = true;
        lastAngle = getAngle(e);
        jogEl.setPointerCapture(e.pointerId);
    });
    jogEl.addEventListener('pointermove', (e) => {
        if (!isDragging)
            return;
        const currentAngle = getAngle(e);
        let delta = currentAngle - lastAngle;
        if (delta > 180)
            delta -= 360;
        if (delta < -180)
            delta += 360;
        lastAngle = currentAngle;
        pioneerDJ.rotateJog(deckId, delta * 1.5);
    });
    const stopDrag = () => {
        isDragging = false;
    };
    jogEl.addEventListener('pointerup', stopDrag);
    jogEl.addEventListener('pointercancel', stopDrag);
}
function setupFXControls() {
    const fxRiser = document.querySelector('#fxRiser');
    const fxEcho = document.querySelector('#fxEcho');
    const fxPhaser = document.querySelector('#fxPhaser');
    const fxGate = document.querySelector('#fxGate');
    fxRiser?.addEventListener('click', () => pioneerDJ.triggerFX('riser'));
    fxEcho?.addEventListener('click', () => pioneerDJ.triggerFX('echo'));
    fxPhaser?.addEventListener('click', () => pioneerDJ.triggerFX('phaser'));
    fxGate?.addEventListener('click', () => pioneerDJ.triggerFX('gate'));
    const riserSlider = document.querySelector('#riserIntensitySlider');
    const riserVal = document.querySelector('#riserIntensityVal');
    riserSlider?.addEventListener('input', () => {
        const v = parseFloat(riserSlider.value);
        pioneerDJ.state.riserIntensity = v;
        if (riserVal)
            riserVal.textContent = `${v.toFixed(0)}%`;
    });
    // Touch and Drag XY Pad
    const xySurface = document.querySelector('#djXYPad');
    const xyPuck = document.querySelector('#djXYPuck');
    const xyCoords = document.querySelector('#xyCoords');
    if (xySurface && xyPuck) {
        let isTouching = false;
        const handleXY = (e, active) => {
            const rect = xySurface.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            pioneerDJ.setXY(x, 1 - y, active);
            xyPuck.style.left = `${x * 100}%`;
            xyPuck.style.top = `${y * 100}%`;
            if (xyCoords) {
                const freq = Math.round(120 * Math.pow(16000 / 120, x));
                const res = (1.0 + (1 - y) * 11.0).toFixed(1);
                xyCoords.textContent = `FILTER: ${freq}Hz · RES: ${res}`;
            }
        };
        xySurface.addEventListener('pointerdown', (e) => {
            isTouching = true;
            xySurface.setPointerCapture(e.pointerId);
            handleXY(e, true);
        });
        xySurface.addEventListener('pointermove', (e) => {
            if (!isTouching)
                return;
            handleXY(e, true);
        });
        const release = (e) => {
            if (!isTouching)
                return;
            isTouching = false;
            handleXY(e, false);
        };
        xySurface.addEventListener('pointerup', release);
        xySurface.addEventListener('pointercancel', release);
    }
}
function setupRotaryKnobs() {
    // Bind rotary rotary knobs for Deck A & B
    const bindKnob = (id, onChange, min = -12, max = 12, def = 0) => {
        const el = document.querySelector(id);
        if (!el)
            return;
        let startY = 0;
        let currentVal = def;
        el.addEventListener('pointerdown', (e) => {
            startY = e.clientY;
            el.setPointerCapture(e.pointerId);
        });
        el.addEventListener('pointermove', (e) => {
            if (!el.hasPointerCapture(e.pointerId))
                return;
            const dy = startY - e.clientY;
            const step = (max - min) / 80;
            const next = Math.max(min, Math.min(max, currentVal + dy * step));
            onChange(next);
            const notch = el.querySelector('.pioneer-rotary-notch');
            if (notch) {
                const deg = ((next - min) / (max - min)) * 270 - 135;
                notch.style.transform = `rotate(${deg}deg)`;
            }
        });
        el.addEventListener('pointerup', () => {
            currentVal = el._val ?? def;
        });
    };
    bindKnob('#rotaryFilterA', (v) => pioneerDJ.setDeckFilter('A', (v + 12) / 24), -12, 12, 0);
    bindKnob('#rotaryHighA', (v) => pioneerDJ.setDeckEQ('A', 'high', v));
    bindKnob('#rotaryMidA', (v) => pioneerDJ.setDeckEQ('A', 'mid', v));
    bindKnob('#rotaryLowA', (v) => pioneerDJ.setDeckEQ('A', 'low', v));
    bindKnob('#rotaryFilterB', (v) => pioneerDJ.setDeckFilter('B', (v + 12) / 24), -12, 12, 0);
    bindKnob('#rotaryHighB', (v) => pioneerDJ.setDeckEQ('B', 'high', v));
    bindKnob('#rotaryMidB', (v) => pioneerDJ.setDeckEQ('B', 'mid', v));
    bindKnob('#rotaryLowB', (v) => pioneerDJ.setDeckEQ('B', 'low', v));
}
function updateUI(state) {
    // Transport buttons state
    const playA = document.querySelector('#djPlayA');
    playA?.classList.toggle('playing', state.decks.A.isPlaying);
    const playB = document.querySelector('#djPlayB');
    playB?.classList.toggle('playing', state.decks.B.isPlaying);
    // Jog Wheel rotations & LED markers
    const markerA = document.querySelector('#djJogMarkerA');
    if (markerA) {
        const r = 58;
        const rad = (state.decks.A.jogAngle - 90) * (Math.PI / 180);
        const x = 70 + r * Math.cos(rad);
        const y = 70 + r * Math.sin(rad);
        markerA.style.left = `${x}px`;
        markerA.style.top = `${y}px`;
    }
    const markerB = document.querySelector('#djJogMarkerB');
    if (markerB) {
        const r = 58;
        const rad = (state.decks.B.jogAngle - 90) * (Math.PI / 180);
        const x = 70 + r * Math.cos(rad);
        const y = 70 + r * Math.sin(rad);
        markerB.style.left = `${x}px`;
        markerB.style.top = `${y}px`;
    }
    // Time & Metadata displays
    const metaA = document.querySelector('#deckMetaA');
    if (metaA) {
        const rem = Math.max(0, state.decks.A.duration - state.decks.A.currentTime);
        const mins = Math.floor(rem / 60);
        const secs = Math.floor(rem % 60);
        metaA.textContent = `${state.decks.A.bpm.toFixed(2)} BPM · ${state.decks.A.key} · -${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    const metaB = document.querySelector('#deckMetaB');
    if (metaB) {
        const rem = Math.max(0, state.decks.B.duration - state.decks.B.currentTime);
        const mins = Math.floor(rem / 60);
        const secs = Math.floor(rem % 60);
        metaB.textContent = `${state.decks.B.bpm.toFixed(2)} BPM · ${state.decks.B.key} · -${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    // Master VU LED Ladders
    updateLEDLadder('#djVUMasterL', state.vuMasterLeft);
    updateLEDLadder('#djVUMasterR', state.vuMasterRight);
    updateLEDLadder('#djVUDeckA', state.decks.A.vuLevel);
    updateLEDLadder('#djVUDeckB', state.decks.B.vuLevel);
    updateLEDLadder('#djPortraitVUL', (state.vuMasterLeft + state.vuMasterRight) * 0.5);
    // FX cards active state
    ['riser', 'echo', 'phaser', 'gate'].forEach((name) => {
        const el = document.querySelector(`#fx${name.charAt(0).toUpperCase() + name.slice(1)}`);
        el?.classList.toggle('active', state.activeFx === name);
    });
}
function updateLEDLadder(selector, level) {
    const container = document.querySelector(selector);
    if (!container)
        return;
    const segs = container.querySelectorAll('.led-seg');
    const count = segs.length;
    const litCount = Math.round(level * count);
    segs.forEach((seg, i) => {
        seg.classList.toggle('on', i < litCount);
    });
}
function drawHorizontalWaveforms(canvas, state) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    const w = canvas.width;
    const h = canvas.height;
    const halfH = h / 2;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);
    // Divider
    ctx.strokeStyle = '#1e2533';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, halfH);
    ctx.lineTo(w, halfH);
    ctx.stroke();
    // Waveform A (Top)
    drawTrackStripe(ctx, 0, 0, w, halfH, state.decks.A.currentTime, state.decks.A.duration, '#00e5ff', '#a855f7');
    // Waveform B (Bottom)
    drawTrackStripe(ctx, 0, halfH, w, halfH, state.decks.B.currentTime, state.decks.B.duration, '#ff7700', '#f59e0b');
}
function drawTrackStripe(ctx, x, y, w, h, currentTime, duration, colorHigh, colorLow) {
    const midY = y + h / 2;
    const progress = duration > 0 ? (currentTime / duration) % 1.0 : 0;
    const offset = progress * w;
    const barCount = 120;
    const barW = w / barCount;
    for (let i = 0; i < barCount; i++) {
        const barX = x + i * barW;
        const wavePhase = (i / barCount + progress) * 24;
        const heightFactor = Math.abs(Math.sin(wavePhase) * Math.cos(wavePhase * 0.5) * 0.8 + Math.sin(wavePhase * 2.3) * 0.2);
        const barH = heightFactor * (h * 0.76);
        const grad = ctx.createLinearGradient(0, midY - barH / 2, 0, midY + barH / 2);
        grad.addColorStop(0, colorHigh);
        grad.addColorStop(0.5, '#ffffff');
        grad.addColorStop(1, colorLow);
        ctx.fillStyle = grad;
        ctx.fillRect(barX, midY - barH / 2, barW - 1, barH);
    }
    // Playhead marker
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, y);
    ctx.lineTo(w / 2, y + h);
    ctx.stroke();
}
function drawVerticalWaveforms(canvas, state) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    const w = canvas.width;
    const h = canvas.height;
    const halfW = w / 2;
    const midY = h / 2;
    ctx.fillStyle = '#06080c';
    ctx.fillRect(0, 0, w, h);
    // Center vertical divider
    ctx.strokeStyle = '#1e2432';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, h);
    ctx.stroke();
    // Deck A (Left - Cyan)
    const secPerBeatA = 60 / state.decks.A.bpm;
    const currentBeatA = state.decks.A.currentTime / secPerBeatA;
    const sliceCount = 60;
    const sliceH = h / sliceCount;
    for (let i = 0; i < sliceCount; i++) {
        const sliceY = i * sliceH;
        const beatDist = (sliceY - midY) / 40;
        const beatIndex = Math.floor(currentBeatA + beatDist);
        const amp = Math.abs(Math.sin((beatIndex + beatDist) * 3.14) * 0.7 + Math.sin(beatDist * 8.2) * 0.3);
        const waveW = amp * (halfW * 0.65);
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(halfW - waveW - 4, sliceY, waveW, sliceH - 1);
        // Beat number markers
        if (Math.abs(beatDist % 1.0) < 0.08 && beatIndex > 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.fillText(String(beatIndex), 16, sliceY);
        }
    }
    // Deck B (Right - Orange)
    const secPerBeatB = 60 / state.decks.B.bpm;
    const currentBeatB = state.decks.B.currentTime / secPerBeatB;
    for (let i = 0; i < sliceCount; i++) {
        const sliceY = i * sliceH;
        const beatDist = (sliceY - midY) / 40;
        const beatIndex = Math.floor(currentBeatB + beatDist);
        const amp = Math.abs(Math.sin((beatIndex + beatDist) * 3.14) * 0.7 + Math.sin(beatDist * 8.2) * 0.3);
        const waveW = amp * (halfW * 0.65);
        ctx.fillStyle = '#ff7700';
        ctx.fillRect(halfW + 4, sliceY, waveW, sliceH - 1);
        if (Math.abs(beatDist % 1.0) < 0.08 && beatIndex > 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.fillText(String(beatIndex), w - 36, sliceY);
        }
    }
    // Center horizontal alignment line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
}
