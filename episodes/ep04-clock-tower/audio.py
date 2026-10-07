"""Episode 4 soundtrack: series music engine (Episode 2) + clockwork SFX + narration (48 kHz stereo).
Usage: python3 audio.py <workdir>   (reads <workdir>/ep4/vo, writes <workdir>/ep4/soundtrack.wav)"""
import numpy as np, soundfile as sf, sys, subprocess, os
S = sys.argv[1]
SR = 48000; DUR = 60.0; N = int(SR * DUR)
rng = np.random.default_rng(3)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2)); vo = np.zeros((N, 2))

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def put(buf, t, sig, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N: return
    sig = sig[:N - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * l * 1.414; buf[i:i + len(sig), 1] += sig * r * 1.414
def tt(d): return np.arange(int(d * SR)) / SR
def env_ad(d, a=0.005, decay=4.0):
    t = tt(d); e = np.exp(-t * decay); e[: int(a * SR)] *= np.linspace(0, 1, int(a * SR)); return e
def bell(f, d=1.2, decay=3.5):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + .45 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3)
            + .2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 6)) * env_ad(d, .002, decay)
def pluck(f, d=0.9):  # Karplus-Strong ukulele-ish
    n = int(d * SR); p = max(2, int(SR / f)); buf = rng.uniform(-1, 1, p); out = np.empty(n)
    for i in range(0, n, p):
        seglen = min(p, n - i); out[i:i + seglen] = buf[:seglen]
        buf = 0.5 * (buf + np.roll(buf, -1)) * 0.996
    return out * env_ad(d, .002, 2.5)
def noise(d): return rng.uniform(-1, 1, int(d * SR))
def lp(x, a):  # one-pole low-pass (vectorised via cumulative trick is hard; use simple FIR)
    k = int(max(1, a)); return np.convolve(x, np.ones(k) / k, mode='same')

# ---------------------------------------------------------------- music
BPM = 112; B = 60 / BPM
CH = [(60, [60, 64, 67]), (55, [59, 62, 67]), (57, [60, 64, 69]), (53, [60, 65, 69])]
MEL = [[(0, 76), (1, 79), (2, 76), (3, 72)], [(0, 74), (1, 71), (2, 74), (2.5, 76), (3, 79)],
       [(0, 72), (1, 76), (2, 81), (3, 76)], [(0, 77), (1, 81), (2, 79), (3, 76)]]
end_bar = int(58.3 / (4 * B))
cache = {}
def cpluck(f):
    if f not in cache: cache[f] = pluck(f)
    return cache[f]
for bar in range(end_bar):
    t0 = 0.25 + bar * 4 * B
    root, tri = CH[bar % 4]
    # bass
    for b in (0, 2):
        t = tt(B * 1.8); f = mtof(root - 12)
        put(music, t0 + b * B, (np.sin(2 * np.pi * f * t) + .3 * np.sin(4 * np.pi * f * t)) * env_ad(B * 1.8, .01, 2.2), .32)
    # ukulele strums on off-beats
    for b in (0.5, 1.5, 2.5, 3.5, 1, 3):
        for k, m in enumerate(tri):
            put(music, t0 + b * B + k * 0.012, cpluck(mtof(m)), .085, pan=-.35)
    # glockenspiel melody (sparser in quiet sections)
    for (b, m) in MEL[bar % 4]:
        if bar % 8 >= 4 and b % 1 == 0 and b in (1, 3): continue
        put(music, t0 + b * B, bell(mtof(m), 1.0, 4.5), .11, pan=.3)
    # soft shaker + kick
    for k in range(8):
        sh = lp(noise(0.06), 2) * env_ad(0.06, .003, 60)
        put(music, t0 + k * B / 2, sh, .05 if k % 2 else .028, pan=.15)
    for b in (0, 2):
        t = tt(0.25); f = 110 * np.exp(-t * 18) + 45
        put(music, t0 + b * B, np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(0.25, .002, 14), .22)
# final resolving chord
for k, m in enumerate([48, 60, 64, 67, 72]):
    put(music, 58.45 + k * 0.03, cpluck(mtof(m)), .12)
    put(music, 58.45, bell(mtof(m + 12), 2.0, 2), .05)

# ---------------------------------------------------------------- sfx
def boing(d=0.6):
    t = tt(d); f = 170 + 330 * (1 - np.exp(-t * 9)) + 55 * np.sin(2 * np.pi * 13 * t) * np.exp(-t * 4)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) + .35 * np.sin(2 * ph)) * env_ad(d, .004, 4.5)
def hop():
    d = .12; t = tt(d); f = 320 + 500 * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(d, .003, 30)
def twinkle(base=84, n=5, step=0.055, dec=5):
    out = np.zeros(int((n * step + 1.2) * SR))
    for k, m in enumerate([0, 4, 7, 12, 16, 19, 24][:n]):
        b = bell(mtof(base + m), 1.0, dec); i = int(k * step * SR); out[i:i + len(b)] += b
    return out
def whoosh(d=1.2, up=True):
    n = noise(d); t = tt(d)
    e = np.sin(np.pi * t / d) ** 2
    lo = lp(n, 30); hi = n - lp(n, 6)
    mixk = t / d if up else 1 - t / d
    return (lo * (1 - mixk) + hi * mixk * .5) * e
def gliss(m0, m1, d=1.4, n=12):
    out = np.zeros(int((d + 1.2) * SR))
    scale = [0, 2, 4, 7, 9]
    notes = [m0 + 12 * (k // 5) + scale[k % 5] for k in range(n)]
    if m1 < m0: notes = notes[::-1]
    for k, m in enumerate(notes):
        b = pluck(mtof(m), 1.0) * .7 + bell(mtof(m), 1.0, 5) * .3
        i = int(k * d / n * SR); out[i:i + len(b)] += b
    return out
def pop():
    d = .18; t = tt(d); f = 700 * np.exp(-t * 25) + 180
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(d, .001, 22)
def slide_whistle(d, f0, f1):
    t = tt(d); f = f0 * (f1 / f0) ** (t / d) * (1 + .012 * np.sin(2 * np.pi * 6 * t))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) + .1 * noise(d)) * np.sin(np.pi * t / d) ** .5
def pad(ms, d):
    t = tt(d); out = np.zeros(len(t))
    for m in ms:
        for det in (-0.12, 0, 0.12):
            f = mtof(m + det); out += np.sin(2 * np.pi * f * t) + .2 * np.sin(4 * np.pi * f * t)
    e = np.minimum(1, t / (d * .45)) * np.minimum(1, (d - t) / (d * .3))
    return out * e / (len(ms) * 3)

def wind(d):
    n = noise(d); t = tt(d); lo = lp(n, 60) * 3
    return lo * np.sin(np.pi * t / d) ** 1.5
def tick(f=1800, d=.06):
    t = tt(d); return (np.sin(2 * np.pi * f * t) + .4 * noise(d)) * env_ad(d, .001, 70)
def tock(f=900, d=.09):
    t = tt(d); return (np.sin(2 * np.pi * f * t) + .3 * noise(d)) * env_ad(d, .001, 45)
def clink(f=2400):
    d = .5; t = tt(d)
    return (np.sin(2 * np.pi * f * t) + .6 * np.sin(2 * np.pi * f * 1.51 * t) + .3 * np.sin(2 * np.pi * f * 2.3 * t)) * env_ad(d, .001, 9)
def hum(d, f0, f1):
    t = tt(d); f = f0 + (f1 - f0) * t / d
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) + .5 * np.sin(2 * ph) + .25 * np.sin(3 * ph)) * np.minimum(1, t / .2) * np.minimum(1, (d - t) / .3)
def ratchet(d, n):  # accelerating-then-slowing clicks (hands spinning backwards)
    out = np.zeros(int(d * SR)); u = np.linspace(0, 1, n)
    times = d * (u - 0.5 * np.sin(2 * np.pi * u) / (2 * np.pi))
    for k, tk in enumerate(times):
        c = tick(2600 - 600 * (k % 2), .03); i = int(tk * SR); out[i:i + len(c)] += c[:len(out) - i]
    return out

# 0-11: arriving at the clock tower
for i in range(6): put(sfx, 0.15 + .55 * i + .48, hop(), .12, -.1); put(sfx, 0.3 + .55 * i + .48, hop(), .09, -.3)
put(sfx, 3.5, twinkle(84, 6, .06, 4), .1, .3)
put(sfx, 3.8, ratchet(1.8, 40), .5, .1); put(sfx, 3.8, whoosh(1.8, True), .12)
put(sfx, 4.0, boing(), .3, -.2)
for k in range(4):                                                  # "Tick... tock... tick... tock..."
    put(sfx, 5.6 + k * .75, tick(1900, .08) if k % 2 == 0 else tock(950, .11), .55, .15)
put(sfx, 8.7, gliss(67, 86, 1.0, 8), .1, .2); put(sfx, 8.75, pad([60, 64, 67, 72], 2.2), .18)
put(sfx, 10.5, hop(), .1); put(sfx, 10.75, hop(), .08, -.3)
put(sfx, 10.5, whoosh(.6, True), .3); put(sfx, 10.8, twinkle(84, 7, .05, 3), .14)
# 11-20: the clockwork world, then the tower goes quiet
put(sfx, 11.1, gliss(72, 96, 1.0, 10), .1)
put(sfx, 11.0, hum(5.0, 70, 70), .05)                               # gears whirring
for k in range(7): put(sfx, 11.0 + k * .75, tick(1700) if k % 2 == 0 else tock(1000), .12, .3)
for k in range(5):                                                  # bouncing springs
    put(sfx, 11.5 + k * .98, boing(.35), .06, -.6); put(sfx, 11.85 + k * .98, boing(.35), .05, .6)
put(sfx, 11.6, hop(), .1); put(sfx, 12.15, hop(), .1); put(sfx, 13.75, hop(), .07); put(sfx, 15.85, hop(), .08)
put(sfx, 15.4, boing(.5), .3, .4); put(sfx, 15.42, clink(1900), .16, .4)
for k, ts in enumerate((15.75, 15.95, 16.1)): put(sfx, ts, clink(1500 - 200 * k), .12 - .03 * k, .7)
put(sfx, 15.9, hum(1.1, 70, 30), .22); put(sfx, 15.9, hum(1.1, 140, 55), .08)         # grinding slow-down
put(sfx, 16.95, tock(300, .2), .4); put(sfx, 16.95, tock(180, .3), .3)               # clunk... then silence
put(sfx, 17.2, wind(2.6), .06)
d = .5; t_ = tt(d)
put(sfx, 17.4, np.sin(2 * np.pi * np.cumsum(np.where(t_ < .25, 330, 262)) / SR) * env_ad(d, .02, 3), .09)      # "uh-oh"
# 20-30: find the missing shape
for i in range(3): put(sfx, 20.0 + .25 * i + .2, pop(), .2, -.4 + .4 * i); put(sfx, 20.25 + .25 * i, bell(mtof(79 + 4 * i), .8, 5), .05)
put(sfx, 26.8, twinkle(86, 6, .06), .13, -.3); put(sfx, 26.85, gliss(74, 98, .8, 8), .07, -.3)
put(sfx, 27.55, hop(), .1); put(sfx, 27.58, clink(2600), .1)
put(sfx, 28.35, hop(), .1); put(sfx, 28.9, hop(), .1); put(sfx, 28.65, hop(), .07, -.3); put(sfx, 29.2, hop(), .07, -.3)
put(sfx, 29.15, whoosh(.35, True), .15, .4)
put(sfx, 29.45, clink(3000) + .7 * clink(2000), .3, .4); put(sfx, 29.45, tock(600, .1), .4, .4)  # CLICK! it fits
put(sfx, 29.5, hum(1.0, 30, 70), .14); put(sfx, 29.5, twinkle(84, 7, .05, 3), .13)
for k in range(28):                                                 # the tower ticks again
    ts = 29.75 + k * .75
    if any(abs(ts - c) < .4 for c in (33.0, 34.3, 35.6, 36.9, 38.2)): continue
    put(sfx, ts, tick(1700) if k % 2 == 0 else tock(1000), .07, .3)
# 30-40: count the ticks
for i in range(5): put(sfx, 30.3 + .15 * i + .25, bell(mtof(84 + 2 * i), .6, 7), .05, -.5 + .25 * i)
for i, tc in enumerate((33.0, 34.3, 35.6, 36.9, 38.2)):
    put(sfx, tc - .08, tick(1900, .08) if i % 2 == 0 else tock(950, .11), .45, .2)
    put(sfx, tc, bell(mtof(72 + [0, 2, 4, 5, 7][i]), 1.0, 5), .1, -.5 + .25 * i)
    put(sfx, tc + .4, hop(), .1)
put(sfx, 38.9, twinkle(84, 7, .05, 3), .16); put(sfx, 39.0, pad([72, 76, 79, 84], 1.6), .14)
# 40-50: the clock's riddle
put(sfx, 40.05, gliss(67, 84, .5, 6), .07)
put(sfx, 40.6, ratchet(1.6, 16), .12)
put(sfx, 45.9, pad([57, 60, 64], 2.2), .1)
put(sfx, 48.0, twinkle(84, 7, .05, 3.5), .14)
put(sfx, 48.8, hop(), .1); put(sfx, 49.25, hop(), .1); put(sfx, 49.35, hop(), .07, -.3)
put(sfx, 49.3, pop() * .5, .15); put(sfx, 49.5, twinkle(91, 4, .1, 5), .06)
# 50-60: the secret window and the bigger journey
put(sfx, 50.2, gliss(60, 96, 1.4, 16), .16); put(sfx, 50.2, whoosh(1.4, True), .14)
put(sfx, 50.3, wind(5.0), .05); put(sfx, 51.4, pad([65, 69, 72, 76], 4.0), .26)
put(sfx, 50.45, hop(), .08); put(sfx, 50.55, hop(), .07, -.3)
put(sfx, 57.1, hop(), .1); put(sfx, 57.25, hop(), .08, -.3)
put(sfx, 56.9, whoosh(1.4, True), .3)
put(sfx, 58.2, twinkle(84, 7, .05, 3), .12)
for k in range(5): put(sfx, 58.25 + k * .42, hop(), .05)
put(sfx, 58.75, gliss(72, 103, .7, 12), .14)                         # magical flourish
for m in (84, 88, 91, 96, 100): put(sfx, 59.15, bell(mtof(m), 2.0, 1.8), .09)

# ---------------------------------------------------------------- voice
def load(name, rate=1.0):
    x, sr = sf.read(f"{S}/ep4/vo/{name}.wav")
    if x.ndim > 1: x = x.mean(1)
    if rate != 1.0:
        idx = np.arange(0, len(x) - 1, rate); x = np.interp(idx, np.arange(len(x)), x)
    n2 = int(len(x) * SR / sr); return np.interp(np.linspace(0, len(x) - 1, n2), np.arange(len(x)), x)
VO = [('n1', 5.9), ('n3', 20.5), ('n5', 30.4), ('c1', 32.95), ('c2', 34.25), ('c3', 35.55), ('c4', 36.85), ('c5', 38.15),
      ('n6', 40.3), ('n7', 48.1), ('n8', 52.0)]
for name, ts in VO:
    x = load(name); put(vo, ts, x / (np.abs(x).max() + 1e-9), .62)
    print(name, ts, round(ts + len(x) / SR, 2))
x = load('socky', 1.25); put(vo, 55.6, x / np.abs(x).max(), .5, .1); print('socky', 55.6, round(55.6 + len(x) / SR, 2))
put(sfx, 49.4, load('laugh', 1.32), .22, .15)
# the tower goes quiet: music drops out while the gear is missing
gate = np.ones(N); tg = np.arange(N) / SR
gate = np.clip(1 - (tg - 16.2) / 0.8, 0, 1) * (tg < 29.4) + np.clip((tg - 29.4) / 0.5, 0, 1) * (tg >= 29.4)
music *= gate[:, None]

# ---------------------------------------------------------------- mix
def reverb(x, d=1.4, wet=.18):
    n = int(d * SR); t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 4.5); ir[0] = 0; ir /= np.sqrt((ir ** 2).sum())
    L = len(x) + n; F = 1 << (L - 1).bit_length()
    out = np.empty_like(x)
    for c in range(2):
        y = np.fft.irfft(np.fft.rfft(x[:, c], F) * np.fft.rfft(np.roll(ir, c * 37), F), F)[:len(x)]
        out[:, c] = x[:, c] + wet * y
    return out
music = reverb(music, 1.6, .22); sfx = reverb(sfx, 1.2, .16); vo = reverb(vo, 0.6, .05)
# duck music under narration
lev = np.convolve(np.abs(vo[:, 0]), np.ones(int(.25 * SR)) / int(.25 * SR), mode='same')
duck = 1 - 0.55 * np.clip(lev * 25, 0, 1)
duck = np.convolve(duck, np.ones(int(.15 * SR)) / int(.15 * SR), mode='same')
fade = np.ones(N); fi = int(0.4 * SR); fade[:fi] = np.linspace(0, 1, fi)
fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mixd = (music * duck[:, None] * .9 + sfx + vo * 1.0) * fade[:, None]
mixd = np.tanh(mixd * 1.1) / np.tanh(1.1)
mixd *= 0.89 / np.abs(mixd).max()
sf.write(f"{S}/ep4/soundtrack.wav", mixd.astype(np.float32), SR)
print('peak', np.abs(mixd).max(), 'rms dB', 20 * np.log10(np.sqrt((mixd ** 2).mean())))
