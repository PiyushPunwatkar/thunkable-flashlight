"""Soundtrack for a kidvid timeline: tempo-locked ukulele/marimba score, the ABC melody
under the dance, sound effects on every timeline event, birdsong, and the voice-over
mixed with ducking. Instrument and SFX recipes follow socky/audio/synth.py.

usage: python3 synth.py <timeline.json> <vo_dir> <out.wav>
"""
import json
import sys

import numpy as np
import soundfile as sf

SR = 48000
TL = json.load(open(sys.argv[1]))
VO_DIR, OUT = sys.argv[2], sys.argv[3]
DUR = TL["duration"]
N = int(SR * (DUR + 0.5))
RNG = np.random.default_rng(7)
BEAT = 60.0 / TL["music"]["bpm"]
music, sfx, amb, vo = (np.zeros((N, 2)) for _ in range(4))


# ---------------------------------------------------------------- helpers
def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(d):
    return np.arange(int(d * SR)) / SR


def add(buf, t, sig, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= N or len(sig) == 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    s = sig[: N - i] * gain
    a = (pan + 1) * np.pi / 4
    buf[i:i + len(s), 0] += s * np.cos(a) * np.sqrt(2)
    buf[i:i + len(s), 1] += s * np.sin(a) * np.sqrt(2)


def fftfilt(x, lo=None, hi=None, order=2):
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    return np.fft.irfft(np.fft.rfft(x, n) * g, n)


def env(n, a=0.005, r=None, decay=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    if decay:
        e = e * np.exp(-t * decay)
    if r and int(r * SR) < n:
        e[-int(r * SR):] *= np.linspace(1, 0, int(r * SR))
    return e


def noise(d):
    return RNG.standard_normal(int(d * SR))


# ---------------------------------------------------------------- instruments
def pluck(m, d=1.2, bright=1.0):
    t, f = tt(d), hz(m)
    s = sum((1 / h ** 1.15) * np.sin(2 * np.pi * f * h * t + h * 0.7) * np.exp(-t * (2.2 + h * 1.5 * bright)) for h in range(1, 9) if f * h < 12000)
    return s * env(len(t), 0.002, 0.05) * 0.5


def celesta(m, d=1.6):
    t, f = tt(d), hz(m)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2) + 0.28 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 6) + 0.08 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t * 12)
    return s * env(len(t), 0.002, 0.1) * 0.45


def bell(m, d=2.5):
    t, f = tt(d), hz(m)
    s = sum(a * np.sin(2 * np.pi * f * p * t) * np.exp(-t * dc) for p, a, dc in [(1, 1, 1.4), (2.0, 0.45, 2.2), (2.76, 0.35, 2.8), (5.4, 0.18, 4.5)])
    return s * env(len(t), 0.001, 0.2) * 0.35


def marimba(m, d=0.6):
    t, f = tt(d), hz(m)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 7) + 0.25 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 20)) * env(len(t), 0.002, 0.05) * 0.6


def bass(m, d=0.45):
    t, f = tt(d), hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.1 * np.sin(6 * np.pi * f * t)) * env(len(t), 0.006, 0.08, decay=3.0) * 0.55


def shaker(d=0.07):
    x = fftfilt(noise(d), lo=5000)
    return x * env(len(x), 0.004, decay=55) * 0.12


def clap():
    x = np.zeros(int(0.15 * SR))
    for k, o in enumerate((0, 0.009, 0.018)):
        n = fftfilt(noise(0.12), lo=900, hi=3500) * env(int(0.12 * SR), 0.001, decay=40 if k == 2 else 120)
        x[int(o * SR):int(o * SR) + len(n)] += n[: len(x) - int(o * SR)]
    return x * 0.18


CH = {"C": [60, 64, 67], "G": [55, 59, 62], "Am": [57, 60, 64], "F": [53, 57, 60], "G7": [55, 59, 62, 65]}
ROOT = {"C": 36, "G": 43, "Am": 45, "F": 41, "G7": 43}


def strum(t, ch, gain=0.3, up=False):
    notes = sorted(n if n >= 60 else n + 12 for n in CH[ch])
    for k, m in enumerate(notes[::-1] if up else notes):
        add(music, t + k * 0.011, pluck(m), gain, 0.15)


# ---------------------------------------------------------------- SFX
def ball_boing(m):
    t = tt(0.45)
    f = hz(m) * (1 + 0.5 * np.exp(-t * 30)) * (1 + 0.04 * np.sin(2 * np.pi * 16 * t) * np.exp(-t * 6))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) + 0.2 * np.sin(2 * ph)) * env(len(t), 0.002, 0.05, decay=6) * 0.45 + np.sin(2 * np.pi * 90 * t) * np.exp(-t * 30) * 0.4


def pomf(k=1.0):
    t = tt(0.18)
    th = np.sin(2 * np.pi * np.cumsum(140 * np.exp(-t * 9) + 55) / SR) * np.exp(-t * 26)
    return (th * 0.9 + fftfilt(noise(0.18), lo=200, hi=1800) * np.exp(-t * 40) * 0.5) * 0.5 * k


def pop(f0=900, k=1.0):
    t = tt(0.08)
    return np.sin(2 * np.pi * np.cumsum(f0 * np.exp(-t * 35) + 180) / SR) * np.exp(-t * 45) * 0.5 * k


def sparkle(d=0.7, n=12, lo=86, hi=104, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros(int((d + 0.6) * SR))
    for _ in range(n):
        s = celesta(r.uniform(lo, hi), 0.5) * (0.6 + 0.4 * r.random())
        i = int(r.uniform(0, d) * SR)
        out[i:i + len(s)] += s[: len(out) - i]
    return out * 0.5


def shimmer(d=1.2):
    r = np.random.default_rng(int(d * 1000))
    out, n = np.zeros(int((d + 0.8) * SR)), int(d * 28)
    for k in range(n):
        u = k / max(1, n - 1)
        s = celesta(88 + 14 * u + r.uniform(-3, 3), 0.6) * np.sin(np.pi * u) ** 1.5 * r.uniform(0.4, 1.0)
        i = int((u * d + r.uniform(0, 0.03)) * SR)
        out[i:i + len(s)] += s[: len(out) - i]
    return out * 0.09


def swish(d=0.35):
    t = tt(d)
    return fftfilt(noise(d), lo=1500, hi=7000) * np.sin(np.pi * t / d) ** 2 * 0.14


def chime():
    out = np.zeros(int(3.0 * SR))
    for i, m in enumerate([84, 88, 91, 96, 100]):
        s = bell(m)
        out[int(i * 0.07 * SR):int(i * 0.07 * SR) + len(s)] += s[: len(out) - int(i * 0.07 * SR)] * 0.8
    sp = sparkle(0.6, 12, 96, 108, seed=5)
    out[: len(sp)] += sp * 0.6
    return out


def bark(f0=560):
    """Cartoon puppy yip: falling buzzy pulse through two formant bands."""
    d = 0.15
    t = tt(d)
    ph = 2 * np.pi * np.cumsum(f0 * (1.3 - 0.5 * t / d)) / SR
    src = sum(np.sin(h * ph) / h for h in range(1, 20))
    s = fftfilt(src, lo=650, hi=1150) + 0.5 * fftfilt(src, lo=1600, hi=2500) + 0.15 * fftfilt(noise(d), lo=800, hi=3000)
    return s * np.minimum(1, t / 0.008) * np.exp(-t * 16) * 0.9


def thud(k=1.0):
    """Plastic toy landing on grass: soft low thump with a little hollow knock."""
    t = tt(0.22)
    body = np.sin(2 * np.pi * np.cumsum(120 * np.exp(-t * 14) + 70) / SR) * np.exp(-t * 22)
    knock = fftfilt(noise(0.22), lo=700, hi=2600) * np.exp(-t * 60) * 0.35
    grass = fftfilt(noise(0.22), lo=2500, hi=8000) * np.exp(-t * 35) * 0.12
    return (body + knock + grass) * 0.55 * min(1.2, k)


def tick():
    t = tt(0.05)
    return np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 90) * 0.12


def chirp(seed):
    r = np.random.default_rng(seed)
    out = []
    for _ in range(r.integers(2, 5)):
        d = r.uniform(0.05, 0.11)
        t = tt(d)
        f0 = r.uniform(2800, 4200)
        f = f0 * (1 + r.uniform(-0.35, 0.35) * t / d) * (1 + 0.04 * np.sin(2 * np.pi * 45 * t))
        out += [np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d), np.zeros(int(r.uniform(0.03, 0.08) * SR))]
    return np.concatenate(out) * 0.05


# ---------------------------------------------------------------- score
beats = {b["type"]: b for b in TL["beats"]}
dance = beats.get("dance")
first_letter = next((b["t0"] for b in TL["beats"] if b["type"] == "letter"), 0)
LOOP = ["C", "G", "Am", "F"]
# ABC / Twinkle melody (public domain), one note per beat, with matching half-bar chords
ABC = [60, 60, 67, 67, 69, 69, 67, None, 65, 65, 64, 64, 62, 62, 60, None, 67, 67, 65, 65, 64, 64, 62, None, 67, 67, 65, 65, 64, 64, 62, None]
ABC_CH = ["C", "F", "C", "C", "F", "C", "G", "C", "C", "F", "C", "G", "C", "F", "C", "G"]
nbars = int(np.ceil((DUR + 1) / (4 * BEAT)))
for bar in range(nbars):
    t0 = bar * 4 * BEAT
    if t0 > DUR:
        break
    in_dance = dance and dance["t0"] - 0.05 <= t0 < dance["t1"]
    groove = t0 >= first_letter - 0.05
    if in_dance:
        k = int(round((t0 - dance["t0"]) / BEAT))
        for q in range(4):
            tq = t0 + q * BEAT
            ch = ABC_CH[((k + q) // 2) % len(ABC_CH)]
            strum(tq, ch, 0.26, up=q % 2 == 1)
            add(music, tq, bass(ROOT[ch] + (7 if q % 2 else 0)), 0.5, 0)
            m = ABC[(k + q) % len(ABC)]
            if m:
                add(music, tq, celesta(m + 12), 0.42, -0.2)
                add(music, tq, marimba(m), 0.22, 0.25)
            if q % 2:
                add(music, tq, clap(), 0.9, 0.1)
            for e in (0, 0.5):
                add(music, tq + e * BEAT, shaker(), 1.0, 0.35)
    else:
        ch = LOOP[bar % 4]
        for q, up in ((0, False), (1.5, True), (2, False), (3, False)) if groove else ((0, False), (2, False)):
            strum(t0 + q * BEAT, ch, 0.24 if groove else 0.18, up)
        add(music, t0, bass(ROOT[ch]), 0.45 if groove else 0.3, 0)
        add(music, t0 + 2 * BEAT, bass(ROOT[ch] + 7), 0.4 if groove else 0.25, 0)
        if groove:
            for e in range(8):
                add(music, t0 + e * BEAT / 2, shaker(), 0.7, 0.35)
            for q, iv in enumerate((0, 2, 1, 2)):
                add(music, t0 + (q + 0.5) * BEAT, marimba(CH[ch][iv] + 12), 0.14, -0.3)
# final chord
add(music, DUR - 1.1, bell(72), 0.4, 0)
strum(DUR - 1.1, "C", 0.3)

# ---------------------------------------------------------------- SFX from timeline events
for i, e in enumerate(TL["events"]):
    t, k = e["t"], e.get("k", 1.0)
    typ = e["type"]
    if typ == "sparkle":
        add(sfx, t, sparkle(0.8, 14, seed=i), 0.9, -0.4)
    elif typ == "shimmer":
        add(sfx, t, shimmer(1.4), 1.0, 0)
    elif typ == "pop":
        add(sfx, t, pop(700 * k + 300), 0.8, -0.3)
    elif typ == "type":
        add(sfx, t, tick(), 1.0, -0.4)
    elif typ == "boing":
        add(sfx, t, ball_boing(74), 0.6 * k, 0.5)
    elif typ == "thud":
        add(sfx, t, thud(k), 0.9, -0.2)
    elif typ == "pomf":
        add(sfx, t, pomf(), 0.8, 0.1)
    elif typ == "step":
        add(sfx, t, pomf(0.5), 0.6, -0.5 if e.get("k", 0) % 2 else 0.5)
    elif typ == "whoosh":
        add(sfx, t, swish(), 0.9, -0.3)
    elif typ == "chime":
        add(sfx, t, chime(), 0.55, 0)
    elif typ == "bark":
        add(sfx, t, bark(560), 1.0, 0.1)
        add(sfx, t + 0.2, bark(640), 0.9, 0.1)
    elif typ == "tada":
        for j, m in enumerate((72, 76, 79, 84)):
            add(sfx, t + j * 0.07, bell(m), 0.35, 0)

# ---------------------------------------------------------------- birdsong
for j, t in enumerate(np.arange(0.6, DUR, 1.7)):
    add(amb, t + RNG.uniform(0, 0.8), chirp(j), 1.0, RNG.uniform(-0.8, 0.8))

# ---------------------------------------------------------------- voice
for v in TL["vo"]:
    a, sr = sf.read(f"{VO_DIR}/{v['key']}.wav")
    add(vo, v["t"], a, 1.0, 0.25 if v["who"] == "cat" else 0.0)


# ---------------------------------------------------------------- mix
def reverb(x, rt=1.6, wet=0.22):
    n = int(rt * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for c in range(2):
        ir[:, c] = fftfilt(np.random.default_rng(50 + c).standard_normal(n) * np.exp(-t * 6.9 / rt), hi=6000)
    ir[: int(0.015 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2, axis=0))
    nfft = 1 << (len(x) + n - 1).bit_length()
    out = np.stack([np.fft.irfft(np.fft.rfft(x[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[: len(x)] for c in range(2)], axis=1)
    return x * (1 - wet) + out * wet * 3.0


def follower(x, att=0.03, rel=0.35, hop=240):
    m = np.abs(x).max(axis=1)
    frames = m[: len(m) // hop * hop].reshape(-1, hop).max(axis=1)
    e, v = np.zeros_like(frames), 0.0
    a_att, a_rel = np.exp(-hop / (att * SR)), np.exp(-hop / (rel * SR))
    for i, f in enumerate(frames):
        v = a_att * v + (1 - a_att) * f if f > v else a_rel * v + (1 - a_rel) * f
        e[i] = v
    e = np.repeat(e, hop)
    return np.pad(e, (0, len(x) - len(e)), mode="edge")


music, sfx, amb, vo = reverb(music, 2.0, 0.25), reverb(sfx, 1.2, 0.15), reverb(amb, 1.5, 0.3), reverb(vo, 0.6, 0.06)
voe = follower(vo)
duck = (1 - 0.65 * np.clip(voe / 0.15, 0, 1))[:, None]
mix = music * 0.42 * duck + sfx * 0.55 * (0.6 + 0.4 * duck) + amb * 0.5 + vo * 1.0
mix = mix[: int(DUR * SR)]
fo = int(0.5 * SR)
mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
mix[: int(0.2 * SR)] *= np.linspace(0, 1, int(0.2 * SR))[:, None]
peak = np.max(np.abs(mix))
sf.write(OUT, (mix / peak * 0.89).astype(np.float32), SR, subtype="PCM_24")
print(f"mix {DUR:.2f}s peak {peak:.2f} -> {OUT}")
