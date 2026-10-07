"""Episode 3 soundtrack: same series music engine as Episode 2 + new magical SFX + narration (48 kHz stereo).
Usage: python3 audio.py <workdir>   (reads <workdir>/ep3/vo, writes <workdir>/ep3/soundtrack.wav)"""
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
    return lo * np.sin(np.pi * t / d) ** 1.5 * (1 + .3 * np.sin(2 * np.pi * 1.7 * t))
def blub(f0=500):
    d = .14; t = tt(d); f = f0 * (1 + 1.6 * t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d)
def tick(f=1800):
    d = .05; t = tt(d); return (np.sin(2 * np.pi * f * t) + .5 * noise(d) * .3) * env_ad(d, .001, 90)

# 0-10: the tiny door, the breeze, WHOOSH, landing in the tiny town
put(sfx, 0.2, gliss(67, 91, 2.0, 10), .12, .3)
put(sfx, 0.4, pad([60, 64, 67, 72], 3.4), .22)
put(sfx, 1.3, wind(3.4), .5, .2)
put(sfx, 2.6, pop(), .2, -.2); put(sfx, 2.65, bell(mtof(84), .8, 5), .06)
put(sfx, 3.5, whoosh(1.4, True), .55); put(sfx, 3.55, slide_whistle(1.0, 420, 1500), .07)
put(sfx, 4.4, twinkle(84, 7, .05, 3), .16)
put(sfx, 5.0, bell(mtof(96), 2.0, 2) + bell(mtof(100), 2.0, 2), .06)
put(sfx, 5.05, slide_whistle(1.05, 1500, 480), .06, -.2)
put(sfx, 6.1, boing(), .38); put(sfx, 6.3, boing(), .3, -.3)
put(sfx, 6.4, twinkle(79, 5, .07), .07, .4)
put(sfx, 8.45, hop(), .1); put(sfx, 8.7, hop(), .08, -.3); put(sfx, 9.45, hop(), .1)
# 10-20: the mystery of the three doors
put(sfx, 10.4, twinkle(88, 3, .06), .08); put(sfx, 10.8, hop(), .1); put(sfx, 11.0, hop(), .08, -.3)
for k, ts in enumerate((12.0, 12.32, 12.64)): put(sfx, ts, bell(mtof(91), 1.2, 4) + .5 * bell(mtof(98), 1.2, 7), .13 - k * .025, .1)
d = .32; t_ = tt(d); put(sfx, 13.25, np.sin(2 * np.pi * np.cumsum(420 * (1 + .5 * t_ / d)) / SR) * env_ad(d, .01, 6), .1)  # "huh?"
for i, ts in enumerate((15.6, 16.5, 17.4)): put(sfx, ts, bell(mtof(76 + 4 * i), 1.2, 3.5), .12, -.4 + .4 * i)
for k in range(6): put(sfx, 18.5 + k * .3, tick(1700 if k % 2 else 1300), .1, .2)            # thinking tick-tock
# 20-30: shape game
put(sfx, 24.9, twinkle(86, 6, .06), .13, .4); put(sfx, 25.0, gliss(74, 98, .8, 8), .07, .4)
for ts in (26.4, 26.95, 27.45): put(sfx, ts, hop(), .11)
for ts in (27.45, 28.0, 28.5): put(sfx, ts, hop(), .07, -.3)
put(sfx, 27.7, gliss(72, 91, .7, 7), .09, .4)
for k in range(22): put(sfx, 28.2 + k * .12 + .05 * np.sin(k), blub(380 + (k * 53) % 400), .07, -.4 + .8 * ((k * 7) % 10) / 10)
# 30-40: bubble counting
for ts in (30.6, 31.5, 32.4, 31.0, 31.9, 32.8): put(sfx, ts, hop(), .08)
for i, tc in enumerate((33.4, 34.6, 35.8, 37.0, 38.2)):
    put(sfx, tc, pop(), .34, -.3 + .15 * i); put(sfx, tc + .02, bell(mtof(72 + [0, 2, 4, 5, 7][i]), 1.0, 5), .08)
put(sfx, 39.1, twinkle(84, 5, .05), .08)
# 40-50: which one is different?
for i in range(4): put(sfx, 40.0 + .22 * i + .3, pop(), .22, -.45 + .3 * i)
put(sfx, 46.2, twinkle(88, 6, .06, 4), .13, .45)
put(sfx, 47.0, twinkle(84, 7, .05, 3.5), .12)
put(sfx, 48.3, whoosh(.75, True), .2); put(sfx, 49.0, twinkle(84, 6, .05), .1)
for i in range(3): put(sfx, 49.85 + .12 * i, pop(), .12, -.4 + .2 * i)
# 50-60: the mysterious map and the clock tower
put(sfx, 50.2, gliss(67, 96, .9, 10), .13, .4); put(sfx, 50.25, whoosh(.8, True), .1, .4)
put(sfx, 50.75, whoosh(.5, False) * .6, .12, .3)
for k in range(12): put(sfx, 52.5 + k * .2, bell(mtof(79 + [0, 2, 4, 7, 9][k % 5] + 12 * (k // 5)), .6, 7), .05, -.3 + .06 * k)
put(sfx, 55.9, bell(98, 3.5, 1.2) + .6 * bell(196, 3.5, 1.5), .35, .5)                      # distant clock "bong"
for k in range(6): put(sfx, 56.3 + .6 * k + .45, hop(), .08); put(sfx, 56.7 + .6 * k + .45, hop(), .06, -.3)
for k in range(8): put(sfx, 56.4 + k * .5, tick(1500 if k % 2 else 1100), .05, .5)
put(sfx, 58.55, gliss(72, 100, .55, 9), .12)                                                      # magical sting
for m in (84, 88, 91, 96): put(sfx, 59.0, bell(mtof(m), 2.4, 1.8), .1)

# ---------------------------------------------------------------- voice
def load(name, rate=1.0):
    x, sr = sf.read(f"{S}/ep3/vo/{name}.wav")
    if x.ndim > 1: x = x.mean(1)
    if rate != 1.0:
        idx = np.arange(0, len(x) - 1, rate); x = np.interp(idx, np.arange(len(x)), x)
    n2 = int(len(x) * SR / sr); return np.interp(np.linspace(0, len(x) - 1, n2), np.arange(len(x)), x)
VO = [('n1', 6.7), ('n2', 13.4), ('n3', 20.3), ('n4', 25.5), ('n5', 31.0), ('c1', 33.35), ('c2', 34.55), ('c3', 35.75),
      ('c4', 36.95), ('c5', 38.15), ('n6', 41.0), ('n7', 47.0), ('n8', 51.4), ('n9', 56.6)]
for name, ts in VO:
    x = load(name); put(vo, ts, x / (np.abs(x).max() + 1e-9), .62)
    print(name, ts, round(ts + len(x) / SR, 2))
put(sfx, 39.2, load('laugh', 1.32), .22, .15)

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
sf.write(f"{S}/ep3/soundtrack.wav", mixd.astype(np.float32), SR)
print('peak', np.abs(mixd).max(), 'rms dB', 20 * np.log10(np.sqrt((mixd ** 2).mean())))
