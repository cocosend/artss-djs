"""Deterministic, bounded PCM masters for the performance sound pages."""
from pathlib import Path
import wave
import numpy as np

RATE = 22050
OUT = Path('samples/performance')
OUT.mkdir(parents=True, exist_ok=True)
SEMITONES = [0, 2, 3, 5, 7, 8, 10, 12]
rng = np.random.default_rng(2424)

def save(name, data):
    data = np.asarray(data, dtype=np.float64)
    data = np.tanh(data * 1.3) * .67
    fade = min(220, len(data)//8)
    data[:fade] *= np.linspace(0, 1, fade)
    data[-fade:] *= np.linspace(1, 0, fade)
    assert np.isfinite(data).all() and np.max(np.abs(data)) < .8
    with wave.open(str(OUT / name), 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(RATE)
        wav.writeframes((data * 32767).astype('<i2').tobytes())

def time(seconds): return np.arange(int(seconds * RATE))/RATE

for i, step in enumerate(SEMITONES):
    f = 130.813 * 2 ** (step/12)
    t = time(.64)
    phase = 2*np.pi*f*(t + .005*(1-np.exp(-t*22)))
    saw = sum(np.sin(phase*n)/n for n in range(1, 11))
    envelope = (1-np.exp(-t*130))*np.exp(-t*(3.5+i*.12))
    acid = saw * (.64 + .36*np.sin(2*np.pi*(8+i)*t)*np.exp(-t*4))*envelope
    save(f'acid-{i+1:02}.wav', acid)

for i, step in enumerate(SEMITONES):
    f = 261.626 * 2 ** (step/12)
    t = time(1.65)
    partials = sum((np.sin(2*np.pi*f*n*t + .14*n) / n**1.32)*np.exp(-t*(1.0+.36*n)) for n in range(1, 9))
    hammer = rng.normal(0, .07, len(t))*np.exp(-t*90)
    envelope = (1-np.exp(-t*180))*np.exp(-t*1.7)
    save(f'piano-{i+1:02}.wav', (partials + hammer)*envelope)

for i in range(8):
    seconds = (1.55 if i in (2, 6) else .72)
    t = time(seconds)
    noise = rng.normal(0, 1, len(t))
    if i in (2, 6):  # riser, fall
        freq = (420+1500*t/seconds) if i == 2 else (1700-1200*t/seconds)
        phase = 2*np.pi*np.cumsum(freq)/RATE
        env = ((t/seconds)**1.8 if i == 2 else np.exp(-t*3))
        sound = (.32*np.sin(phase)+.16*noise)*env
    elif i in (0, 4):  # metallic impact, clap splash
        sound = (.55*np.sin(2*np.pi*(420+i*55)*t)*np.exp(-t*13)+.19*noise*np.exp(-t*20))
    elif i in (1, 5):  # tonal minor chord stabs
        root = 174.614 * (2**((i-1)*.5/12))
        sound = sum(np.sin(2*np.pi*root*2**(s/12)*t)*np.exp(-t*(4+.4*j)) for j,s in enumerate((0,3,7)))*.25
    else:  # sub drop, airy noise
        phase = 2*np.pi*np.cumsum(55+140*np.exp(-t*8))/RATE
        sound = .52*np.sin(phase)*np.exp(-t*6)+.08*noise*np.exp(-t*15)
    save(f'fx-{i+1:02}.wav', sound)
