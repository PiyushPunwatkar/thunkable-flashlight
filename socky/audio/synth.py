"""Procedural soundtrack for "Socky's Big Journey".

Builds the score, sound effects, ambience and voice-over mix from the
timeline events exported by the renderer (render.mjs events).

usage: python3 synth.py <events.json> <vo_dir> <out.wav>
"""
import json
import sys

import numpy as np
import soundfile as sf

SR = 48000
DUR = 60.0
N = int(SR * DUR)
RNG = np.random.default_rng(11)

events_path, vo_dir, out_path = sys.argv[1:4]
TL = json.load(open(events_path))
EV = TL["events"]

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
amb = np.zeros((N, 2))
vo = np.zeros((N, 2))


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
        sig = sig[-i:]
        i = 0
    s = sig[: N - i] * gain
    a = (pan + 1) * np.pi / 4
    buf[i:i + len(s), 0] += s * np.cos(a) * np.sqrt(2)
    buf[i:i + len(s), 1] += s * np.sin(a) * np.sqrt(2)


def fftfilt(x, lo=None, hi=None, order=2):
    """Zero-phase smooth band filter in the frequency domain."""
    n = len(x)
    X = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    return np.fft.irfft(X * g, n)


def env(n, a=0.005, r=None, decay=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    if decay:
        e = e * np.exp(-t * decay)
    if r:
        rs = int(r * SR)
        if rs < n:
            e[-rs:] *= np.linspace(1, 0, rs)
    return e


def noise(d):
    return RNG.standard_normal(int(d * SR))


# ---------------------------------------------------------------- instruments
def pluck(m, d=1.4, bright=1.0):
    t = tt(d)
    f = hz(m)
    s = np.zeros_like(t)
    for h in range(1, 9):
        if f * h > 12000:
            break
        s += (1 / h ** 1.15) * np.sin(2 * np.pi * f * h * t + h * 0.7) * np.exp(-t * (2.2 + h * 1.5 * bright))
    return s * env(len(t), 0.002, 0.05) * 0.5


def celesta(m, d=2.2):
    t = tt(d)
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2) + 0.28 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 6) + 0.08 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t * 12)
    return s * env(len(t), 0.002, 0.1) * 0.45


def bell(m, d=3.0):
    t = tt(d)
    f = hz(m)
    s = 0
    for p, a, dc in [(1, 1, 1.4), (2.0, 0.45, 2.2), (2.76, 0.35, 2.8), (5.4, 0.18, 4.5), (8.93, 0.08, 7)]:
        s = s + a * np.sin(2 * np.pi * f * p * t) * np.exp(-t * dc)
    return s * env(len(t), 0.001, 0.2) * 0.35


def marimba(m, d=0.6):
    t = tt(d)
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 7) + 0.25 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 20)
    return s * env(len(t), 0.002, 0.05) * 0.6


def pizz(m, d=0.35):
    return pluck(m, d, bright=2.2) * 1.2


def bass(m, d=0.45):
    t = tt(d)
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.1 * np.sin(2 * np.pi * 3 * f * t)
    return s * env(len(t), 0.006, 0.08, decay=3.0) * 0.55


def pad(ms, d, a=0.8, r=1.0, bright=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for m in ms:
        for det in (-0.07, 0.0, 0.07):
            f = hz(m + det)
            for h, amp in ((1, 1.0), (2, 0.35 * bright), (3, 0.12 * bright)):
                s += amp * np.sin(2 * np.pi * f * h * t + RNG.uniform(0, 6))
    s *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.25 * t)
    e = np.minimum(1, t / a) * np.minimum(1, (d - t) / r)
    return s * np.clip(e, 0, 1) * 0.05 / max(1, len(ms))


def shaker(d=0.07):
    x = fftfilt(noise(d), lo=5000)
    return x * env(len(x), 0.004, decay=55) * 0.12


def tick(m=84):
    t = tt(0.08)
    return np.sin(2 * np.pi * hz(m) * t) * np.exp(-t * 60) * 0.4


def clap():
    x = np.zeros(int(0.15 * SR))
    for k, o in enumerate((0, 0.009, 0.018)):
        n = fftfilt(noise(0.12), lo=900, hi=3500)
        n *= env(len(n), 0.001, decay=40 if k == 2 else 120)
        i = int(o * SR)
        x[i:i + len(n)] += n[: len(x) - i]
    return x * 0.18


CH = {
    "C": [60, 64, 67], "Am": [57, 60, 64], "F": [53, 57, 60], "G": [55, 59, 62], "G7": [55, 59, 62, 65],
    "Fmaj7": [53, 57, 60, 64], "Em7": [52, 55, 59, 62], "Dm7": [50, 53, 57, 60], "Cmaj7": [48, 52, 55, 59],
    "Gsus": [55, 60, 62], "Dm": [50, 53, 57], "Em": [52, 55, 59], "Fm": [53, 56, 60], "C/E": [52, 55, 60],
}
ROOT = {"C": 36, "Am": 45, "F": 41, "G": 43, "G7": 43, "Fmaj7": 41, "Em7": 40, "Dm7": 38, "Cmaj7": 36, "Gsus": 43, "Dm": 38, "Em": 40, "Fm": 41, "C/E": 40}


def uke(ch):
    return sorted([n if n >= 60 else n + 12 for n in CH[ch]])


def strum(t, ch, gain=0.3, up=False, pan=0.15):
    notes = uke(ch)
    if up:
        notes = notes[::-1]
    for k, m in enumerate(notes):
        add(music, t + k * 0.011, pluck(m, 1.0), gain, pan)


def arp(t0, ch, beat, n, inst=celesta, gain=0.25, octave=12, pattern=(0, 1, 2, 3, 2, 1), pan=-0.2):
    ns = [m + octave for m in CH[ch]]
    ns = ns + [ns[0] + 12]
    for i in range(n):
        m = ns[pattern[i % len(pattern)] % len(ns)]
        add(music, t0 + i * beat, inst(m), gain, pan)


# ---------------------------------------------------------------- SCORE
def section_bedroom():
    b = 0.625  # 96 bpm
    # gentle morning music box (0 - 3.3)
    for i, ch in enumerate(["C", "Am"]):
        t0 = 0.15 + i * 4 * b
        add(music, t0, pad(CH[ch], 4 * b + 0.6, a=0.6, r=0.6), 1.0)
        arp(t0, ch, b / 2, 8, celesta, 0.22, 12, (0, 1, 2, 3, 2, 1, 0, 1))
        add(music, t0, bass(ROOT[ch] + 12, 1.2), 0.25)
    # sad (3.3 - 4.9): F minor colour, sparse falling notes
    add(music, 3.3, pad(CH["F"], 0.9, a=0.3, r=0.4), 1.0)
    add(music, 4.1, pad(CH["Fm"], 1.0, a=0.3, r=0.5), 1.0)
    for i, m in enumerate([76, 74, 72, 68]):
        add(music, 3.35 + i * 0.38, celesta(m, 1.5), 0.2)
    # brave (4.9 - 6.7): rising harp-like arpeggio into C
    for i, m in enumerate([55, 59, 62, 67, 71, 74, 79, 83]):
        add(music, 4.95 + i * 0.16, pluck(m, 1.2, 0.6), 0.22, -0.3 + i * 0.08)
    add(music, 5.0, pad(CH["G7"], 1.8, a=0.8, r=0.4, bright=1.4), 1.2)
    add(music, 6.62, pad(CH["C"], 3.0, a=0.05, r=1.0, bright=1.4), 1.2)
    # bouncy hop music (6.7 - 9.4)
    bb = 0.55
    for i, ch in enumerate(["C", "F", "G", "C", "G"]):
        t0 = 6.7 + i * bb
        strum(t0, ch, 0.22)
        add(music, t0, bass(ROOT[ch] + 12, 0.3), 0.35)
        add(music, t0 + bb / 2, pizz(uke(ch)[-1] + 12), 0.12)
    # descend into the dark
    for i, m in enumerate([79, 76, 72, 67, 64, 60, 55]):
        add(music, 9.25 + i * 0.09, celesta(m, 1.0), 0.14 * (1 - i / 9))


def section_underbed():
    b = 0.6
    prog = ["Fmaj7", "Em7", "Dm7", "Cmaj7"]
    # magical opening shimmer
    for i, m in enumerate([72, 76, 79, 84, 88, 91, 96]):
        add(music, 10.0 + i * 0.07, bell(m, 2.5), 0.12, -0.6 + i * 0.2)
    t = 10.15
    i = 0
    while t < 14.7:
        ch = prog[i % 4]
        d = min(2 * b * 2, 14.75 - t)
        add(music, t, pad(CH[ch], d + 0.4, a=0.5, r=0.4), 1.1)
        arp(t, ch, b / 2, int(d / (b / 2)), celesta, 0.16, 24, (0, 2, 1, 3, 2, 4, 3, 1))
        t += 4 * b * 0.5 * 2
        i += 1
    # hush for the snore (14.75 - 15.9): only a held tone
    add(music, 14.8, pad([53, 60], 1.3, a=0.2, r=0.6, bright=0.5), 0.6)
    # resume
    t = 16.0
    i = 0
    while t < 20.0:
        ch = ["Fmaj7", "Cmaj7", "Dm7", "G"][i % 4]
        add(music, t, pad(CH[ch], 1.4, a=0.3, r=0.4), 1.0)
        arp(t, ch, 0.3, 4, celesta, 0.15, 24, (0, 2, 1, 3))
        t += 1.2
        i += 1
    # discovery
    add(music, 20.15, pad(CH["Am"] + [71], 2.0, a=0.2, r=0.8, bright=1.2), 1.1)
    add(music, 22.0, pad(CH["F"] + [69], 1.2, a=0.4, r=0.4), 1.0)
    for i, m in enumerate([67, 69, 71]):
        add(music, 23.05 + i * 0.4, pizz(m + 12, 0.4), 0.3)
        add(music, 23.05 + i * 0.4, bass(43 + 12 + [0, 2, 4][i], 0.35), 0.2)
    add(music, 23.0, pad(CH["G7"], 1.3, a=0.6, r=0.1, bright=1.3), 1.0)
    # pop! warm resolution + friendship theme
    for k, m in enumerate([72, 76, 79, 84]):
        add(music, 24.25 + k * 0.05, bell(m, 3.0), 0.16)
    prog2 = [("C", 24.3), ("Am", 25.5), ("F", 26.7)]
    for ch, t0 in prog2:
        add(music, t0, pad(CH[ch], 1.6, a=0.15, r=0.5, bright=1.3), 1.2)
        strum(t0, ch, 0.18)
        add(music, t0, bass(ROOT[ch] + 12, 0.8), 0.3)
    mel = [(24.4, 79), (24.7, 81), (25.0, 84), (25.55, 81), (25.85, 79), (26.15, 76), (26.75, 77), (27.05, 81)]
    for t0, m in mel:
        add(music, t0, celesta(m, 1.4), 0.2, 0.2)
    # spin glissando
    for i in range(12):
        add(music, 25.95 + i * 0.06, pluck(60 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26][i], 0.6, 0.6), 0.12, -0.5 + i * 0.09)
    # upbeat build towards the light (27.4 - 29.9), 120 bpm
    bb = 0.5
    for i, ch in enumerate(["C", "F", "G", "C", "F"]):
        t0 = 27.45 + i * bb
        strum(t0, ch, 0.24)
        strum(t0 + bb / 2, ch, 0.14, up=True)
        add(music, t0, bass(ROOT[ch] + 12, 0.35), 0.4)
        add(music, t0 + bb / 2, shaker(), 1.0, 0.4)
    for i, m in enumerate(range(60, 97, 3)):
        add(music, 28.6 + i * 0.09, bell(m, 1.4), 0.07 + 0.006 * i, -0.6 + i * 0.1)


def garden_groove(t0, t1, prog, light=False, gain=1.0):
    bb = 0.5
    t = t0
    k = 0
    while t < t1 - 0.01:
        ch = prog[(k // 4) % len(prog)]
        beat = k % 4
        strum(t, ch, (0.2 if beat in (0, 2) else 0.14) * gain * (0.6 if light else 1))
        if not light:
            strum(t + bb * 0.5, ch, 0.1 * gain, up=True)
        if beat in (0, 2):
            add(music, t, bass(ROOT[ch] + 12, 0.4), 0.42 * gain)
        else:
            add(music, t, bass(ROOT[ch] + 19, 0.25), 0.25 * gain)
            if not light:
                add(music, t, clap(), 0.5 * gain, 0.1)
        add(music, t + bb * 0.5, shaker(), 0.8 * gain, 0.35)
        t += bb
        k += 1


def section_garden():
    # arrival + discovering the balls
    for i, m in enumerate([72, 76, 79, 84, 88]):
        add(music, 30.0 + i * 0.08, bell(m, 2.0), 0.12)
    garden_groove(30.0, 34.0, ["C", "G", "Am", "F"])
    # counting: light accompaniment so the numbers stay clear
    garden_groove(34.0, 38.0, ["C", "F"], light=True, gain=0.8)
    # pause for the child to answer: soft held chord + gentle ticks
    add(music, 38.05, pad(CH["G"], 1.45, a=0.2, r=0.4), 1.0)
    for k in range(3):
        add(music, 38.1 + k * 0.45, tick(91), 0.12)
    # celebration fanfare
    for i, m in enumerate([72, 76, 79, 84]):
        add(music, 39.45 + i * 0.09, bell(m, 2.0), 0.16)
    strum(39.45, "C", 0.3)
    strum(39.95, "C", 0.25)
    add(music, 39.45, bass(48, 0.6), 0.45)
    garden_groove(40.0, 41.0, ["F", "G"], gain=0.9)
    # riddle: playful pizzicato walk
    walk = [48, 55, 57, 55, 53, 55, 57, 59]
    t = 41.0
    k = 0
    prog = ["F", "C", "G", "C"]
    while t < 46.5:
        ch = prog[(k // 4) % 4]
        add(music, t, marimba(walk[k % 8] + 12, 0.4), 0.35, -0.1)
        if k % 2 == 0:
            add(music, t, pizz(uke(ch)[1] + 12, 0.3), 0.12, 0.3)
        if k % 4 == 0:
            add(music, t, pad(CH[ch], 2.1, a=0.3, r=0.4), 0.7)
        t += 0.5
        k += 1
    # thinking: tick-tock + suspended chord
    add(music, 46.5, pad(CH["Gsus"], 1.6, a=0.3, r=0.3), 0.9)
    for k in range(3):
        add(music, 46.6 + k * 0.5, tick(96 if k % 2 == 0 else 89), 0.16)
    # answer flourish
    for i, m in enumerate([67, 72, 76, 79, 84]):
        add(music, 48.45 + i * 0.07, bell(m, 2.0), 0.16)
    strum(48.5, "C", 0.28)
    garden_groove(49.0, 49.9, ["F", "G"], gain=0.8)


def section_stars():
    # dreamy twilight (49.85 - 60)
    prog = [("Fmaj7", 49.85), ("Em7", 51.25), ("Dm7", 52.65), ("Cmaj7", 54.05), ("Fmaj7", 55.45), ("G", 56.7), ("Am", 57.6), ("F", 58.4), ("C", 59.3)]
    for i, (ch, t0) in enumerate(prog):
        t1 = prog[i + 1][1] if i + 1 < len(prog) else 60.5
        add(music, t0, pad(CH[ch], t1 - t0 + 0.6, a=0.4, r=0.5), 1.0)
        n = int((t1 - t0) / 0.233)
        arp(t0, ch, 0.233, n, celesta, 0.09, 24, (0, 2, 1, 3, 2, 4))
        add(music, t0, bass(ROOT[ch] + 12, 1.0), 0.18)
    for i, m in enumerate([60, 64, 67, 72, 76, 79, 84]):
        add(music, 59.3 + i * 0.06, pluck(m, 1.5, 0.5), 0.1, -0.4 + i * 0.13)


# ---------------------------------------------------------------- SFX
def boing(f0=180, d=0.55):
    t = tt(d)
    f = f0 + f0 * 1.1 * (1 - np.exp(-t * 9)) + f0 * 0.35 * np.sin(2 * np.pi * 13 * t) * np.exp(-t * 4)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.3 * np.sin(2 * ph)
    return s * env(len(t), 0.003, 0.08, decay=4.5) * 0.5


def ball_boing(m):
    t = tt(0.45)
    f0 = hz(m)
    f = f0 * (1 + 0.5 * np.exp(-t * 30)) * (1 + 0.04 * np.sin(2 * np.pi * 16 * t) * np.exp(-t * 6))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.2 * np.sin(2 * ph)
    thump = np.sin(2 * np.pi * 90 * t) * np.exp(-t * 30)
    return (s * env(len(t), 0.002, 0.05, decay=6) * 0.45 + thump * 0.4)


def pomf(k=1.0, soft=False):
    d = 0.18
    t = tt(d)
    f = 140 * np.exp(-t * 9) + 55
    th = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26)
    puff = fftfilt(noise(d), lo=200, hi=1800) * np.exp(-t * 40) * 0.5
    s = th * 0.9 + puff
    if soft:
        s = np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 90) * 0.18 + th * 0.35
    return s * 0.5 * k


def fwip():
    d = 0.22
    t = tt(d)
    x = noise(d)
    x = fftfilt(x, lo=900, hi=6000) * np.sin(np.pi * t / d) ** 2
    return x * 0.18


def sparkle(d=0.7, n=10, lo=86, hi=104, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros(int((d + 0.6) * SR))
    for k in range(n):
        m = r.uniform(lo, hi)
        s = celesta(m, 0.5) * (0.6 + 0.4 * r.random())
        i = int(r.uniform(0, d) * SR)
        out[i:i + len(s)] += s[: len(out) - i]
    return out * 0.5


def shimmer(d=1.2, rising=True):
    """Soft cloud of tiny chime pings that swells and fades (tonal, no hiss)."""
    r = np.random.default_rng(int(d * 1000))
    out = np.zeros(int((d + 0.8) * SR))
    n = int(d * 28)
    for k in range(n):
        u = k / max(1, n - 1)
        m = (88 + 14 * u if rising else 100 - 10 * u) + r.uniform(-3, 3)
        s = celesta(m, 0.6) * np.sin(np.pi * u) ** 1.5 * r.uniform(0.4, 1.0)
        i = int((u * d + r.uniform(0, 0.03)) * SR)
        out[i:i + len(s)] += s[: len(out) - i]
    return out * 0.09


def whoosh(d=0.8):
    t = tt(d)
    x = noise(d)
    lo = fftfilt(x, hi=900)
    hi_ = fftfilt(x, lo=900, hi=3000)
    mix = np.linspace(0, 1, len(t))
    s = lo * (1 - mix) + hi_ * mix
    return s * np.sin(np.pi * t / d) ** 2 * 0.35


def snore(d=1.0):
    t = tt(d)
    f = 62 + 8 * np.sin(np.pi * t / d)
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = sum(np.sin(h * ph) / h for h in range(1, 14))
    buzz = saw * (0.55 + 0.45 * np.sin(2 * np.pi * 23 * t))
    breath = fftfilt(noise(d), lo=300, hi=2500) * 0.25
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    s = fftfilt(buzz, hi=900) * 0.35 + breath
    return s * e * 0.55


def inhale(d=1.4):
    t = tt(d)
    x = fftfilt(noise(d), lo=500, hi=3000)
    return x * np.sin(np.pi * t / d) ** 2 * 0.06


def pop(f0=900, d=0.08, k=1.0):
    t = tt(d)
    f = f0 * np.exp(-t * 35) + 180
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45) * 0.5 * k


def squeak(f0=700, d=0.25, up=True):
    t = tt(d)
    f = f0 * (1 + (0.6 if up else -0.3) * t / d) * (1 + 0.06 * np.sin(2 * np.pi * 28 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
    return s * np.sin(np.pi * t / d) ** 0.7 * 0.15


def wobble(d=0.9):
    t = tt(d)
    f = 320 + 60 * np.sin(2 * np.pi * 9 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) + 0.3 * np.sin(2 * ph)) * np.sin(np.pi * t / d) * 0.07


def swish(d=0.35):
    t = tt(d)
    x = fftfilt(noise(d), lo=1500, hi=7000)
    return x * np.sin(np.pi * t / d) ** 2 * 0.12


def chime():
    out = np.zeros(int(3.5 * SR))
    for i, m in enumerate([84, 88, 91, 96, 100]):
        s = bell(m, 3.0)
        j = int(i * 0.07 * SR)
        out[j:j + len(s)] += s * 0.8
    sp = sparkle(0.6, 12, 96, 108, seed=5)
    out[: len(sp)] += sp[: len(out)] * 0.6
    return out * 0.6


def chirp(seed):
    r = np.random.default_rng(seed)
    out = np.zeros(int(0.5 * SR))
    pos = 0
    for k in range(r.integers(2, 5)):
        d = r.uniform(0.04, 0.09)
        t = tt(d)
        f0 = r.uniform(2800, 4200)
        f = f0 + r.uniform(800, 1800) * np.sin(np.pi * t / d) * (1 if r.random() < 0.5 else -1)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d)
        out[pos:pos + len(s)] += s
        pos += len(s) + int(r.uniform(0.02, 0.06) * SR)
    return out * 0.05


def cricket(seed):
    r = np.random.default_rng(seed)
    t = tt(0.35)
    s = np.sin(2 * np.pi * 4300 * t) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 30 * t)))
    return s * np.sin(np.pi * t / 0.35) * 0.012


SCALE = [72, 74, 76, 77, 79, 81]
BALLN = [60, 64, 67, 72, 76]
for e in EV:
    t, ty = e["t"], e["type"]
    who = e.get("who")
    pan = -0.15 if who == "socky" else 0.15
    if ty == "land":
        if t > 56.0 and who == "friend":
            continue
        add(sfx, t, pomf(e.get("k", 1), e.get("soft", False)), 0.8 if who == "socky" else 0.5, pan)
    elif ty == "takeoff":
        if e.get("big"):
            add(sfx, t - 0.02, boing(170 if who == "socky" else 210), 0.9 if who == "socky" else 0.5, pan)
        elif e.get("k", 1) >= 0.8:
            add(sfx, t, fwip(), 0.35, pan)
    elif ty == "ballBoing":
        m = BALLN[e["i"]] if not e.get("answer") else 67
        if e.get("soft"):
            add(sfx, t, ball_boing(m), 0.35, -0.3)
        else:
            add(sfx, t, ball_boing(m), 0.5, [-0.5, -0.25, 0, 0.25, 0.5][e["i"]] if not e.get("answer") else 0)
            add(sfx, t, sparkle(0.25, 4, 92, 100, seed=int(t * 10)), 0.35)
    elif ty == "ballsHappy":
        for i, m in enumerate(BALLN):
            add(sfx, t + i * 0.03, ball_boing(m + 12), 0.25, -0.5 + i * 0.25)
    elif ty == "starDing":
        add(sfx, t, bell(SCALE[e["i"]] + 12, 2.5), 0.4, -0.5 + e["i"] * 0.2)
        add(sfx, t, sparkle(0.3, 5, 96, 106, seed=40 + e["i"]), 0.3, -0.5 + e["i"] * 0.2)
    elif ty == "rustle":
        d = 0.5
        x = fftfilt(noise(d), lo=800, hi=5000) * np.abs(np.sin(np.pi * tt(d) / d)) * (0.6 + 0.4 * np.sin(2 * np.pi * 17 * tt(d)))
        add(sfx, t, x, 0.12, 0.1)
    elif ty == "sad":
        add(sfx, t, squeak(520, 0.45, up=False), 0.35)
    elif ty == "brave":
        add(sfx, t, shimmer(1.0), 1.0)
    elif ty == "whoosh":
        add(sfx, t, whoosh(0.9), 1.0)
    elif ty == "magic":
        big = e.get("big")
        for i, m in enumerate(range(72, 103, 3)):
            add(sfx, t + i * 0.05, celesta(m, 1.2), 0.2, -0.6 + i * 0.12)
        add(sfx, t, shimmer(1.4 if big else 1.0), 1.4)
        add(sfx, t, sparkle(1.0, 14, 90, 106, seed=int(t)), 0.5)
    elif ty == "snoreIn":
        add(sfx, t, inhale(1.6), 1.0, 0.3)
    elif ty == "snore":
        add(sfx, t - 0.6, inhale(0.7), 1.0, 0.3)
        add(sfx, t, snore(1.0), 1.0, 0.3)
    elif ty == "pop":
        add(sfx, t, pop(900 if e.get("soft") else 600, 0.09, 0.6 if e.get("soft") else 1.1), 1.0, 0.25)
        if not e.get("soft"):
            add(sfx, t, sparkle(0.4, 8, 90, 102, seed=3), 0.5)
    elif ty == "wiggle":
        add(sfx, t, wobble(0.8), 1.0, 0.3)
    elif ty == "glint":
        add(sfx, t, sparkle(0.5, 7, 96, 108, seed=9), 0.8, 0.4)
        add(sfx, t, bell(96, 1.5), 0.25, 0.4)
    elif ty == "gasp":
        add(sfx, t, squeak(660, 0.22, up=True), 0.3)
    elif ty == "tug":
        add(sfx, t, squeak(420 + 60 * (t - 23.0), 0.32, up=True), 0.55, 0.1)
    elif ty == "blink":
        add(sfx, t, celesta(98, 0.4), 0.2, 0.2)
    elif ty == "hug":
        add(sfx, t, sparkle(0.6, 6, 88, 96, seed=21), 0.4)
    elif ty == "spin":
        add(sfx, t, swish(0.6), 1.0)
        add(sfx, t + 0.5, swish(0.6), 0.8)
    elif ty == "shimmerUp":
        add(sfx, t, shimmer(2.6), 1.6)
    elif ty == "confetti":
        add(sfx, t, sparkle(0.9, 16, 88, 106, seed=int(t * 3)), 0.6)
        add(sfx, t, pop(1200, 0.06, 0.6), 0.6, -0.3)
        add(sfx, t + 0.05, pop(1500, 0.06, 0.6), 0.6, 0.3)
    elif ty == "appear":
        add(sfx, t, pop(1100, 0.07, 0.8), 0.9)
        add(sfx, t, celesta(88 + int((t - 40.8) * 20), 0.8), 0.3)
    elif ty == "poof":
        x = fftfilt(noise(0.35), lo=300, hi=3000) * np.exp(-tt(0.35) * 9)
        add(sfx, t, x, 0.12)
        add(sfx, t, sparkle(0.5, 8, 92, 104, seed=13), 0.4)
    elif ty == "twinkle":
        add(sfx, t, sparkle(1.2, 9, 94, 108, seed=17), 0.5)
    elif ty == "turn":
        add(sfx, t, swish(0.3), 0.7)
    elif ty == "chime":
        add(sfx, t, chime(), 1.0)

# ---------------------------------------------------------------- ambience
for k in range(9):
    add(amb, 0.4 + k * 1.05 + RNG.uniform(0, 0.4), chirp(100 + k), 1.0, RNG.uniform(-0.7, 0.7))
hum_t = tt(19.9)
hum = (np.sin(2 * np.pi * hz(41) * hum_t) + 0.5 * np.sin(2 * np.pi * hz(48) * hum_t) + 0.25 * np.sin(2 * np.pi * hz(53) * hum_t)) * 0.012 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * hum_t))
add(amb, 10.05, hum * np.minimum(1, hum_t / 0.5) * np.minimum(1, (19.9 - hum_t) / 0.5), 1.0)
for k in range(24):
    add(amb, 10.3 + k * 0.8 + RNG.uniform(0, 0.4), celesta(RNG.integers(96, 106), 0.6), 0.04, RNG.uniform(-0.8, 0.8))
br_t = tt(30.0)
breeze = fftfilt(noise(30.0), lo=150, hi=900) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * br_t)) * 0.03
add(amb, 30.0, breeze * np.minimum(1, br_t / 1.0) * np.minimum(1, (30.0 - br_t) / 0.3), 1.0)
for k in range(12):
    add(amb, 30.5 + k * 1.6 + RNG.uniform(0, 0.6), chirp(200 + k), 0.8, RNG.uniform(-0.8, 0.8))
for k in range(16):
    add(amb, 51.0 + k * 0.55, cricket(300 + k), 1.0, RNG.uniform(-0.8, 0.8))

# ---------------------------------------------------------------- music
section_bedroom()
section_underbed()
section_garden()
section_stars()

# ---------------------------------------------------------------- voice
for name, t in TL["vo"]:
    a, sr = sf.read(f"{vo_dir}/{name}.wav")
    assert sr == SR
    g = 1.0 if name.startswith(("n", "c")) else 0.85
    add(vo, t, a, g * 0.5, 0.0)


# ---------------------------------------------------------------- mix
def reverb(x, rt=1.8, wet=0.25):
    n = int(rt * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for c in range(2):
        r = np.random.default_rng(50 + c).standard_normal(n) * np.exp(-t * 6.9 / rt)
        ir[:, c] = fftfilt(r, hi=6000)
    ir[: int(0.015 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2, axis=0))
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    out = np.zeros_like(x)
    for c in range(2):
        y = np.fft.irfft(np.fft.rfft(x[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[: len(x)]
        out[:, c] = y
    return x * (1 - wet) + out * wet * 3.0


def follower(x, att=0.03, rel=0.35, hop=240):
    m = np.abs(x).max(axis=1)
    frames = m[: len(m) // hop * hop].reshape(-1, hop).max(axis=1)
    e = np.zeros_like(frames)
    a_att = np.exp(-hop / (att * SR))
    a_rel = np.exp(-hop / (rel * SR))
    v = 0.0
    for i, f in enumerate(frames):
        v = a_att * v + (1 - a_att) * f if f > v else a_rel * v + (1 - a_rel) * f
        e[i] = v
    e = np.repeat(e, hop)
    return np.pad(e, (0, len(x) - len(e)), mode="edge")


music = reverb(music, 2.2, 0.3)
sfx = reverb(sfx, 1.4, 0.18)
amb = reverb(amb, 1.6, 0.25)
voe = follower(vo)
duck = 1 - 0.75 * np.clip(voe / 0.1, 0, 1)
sduck = (1 - 0.45 * np.clip(voe / 0.1, 0, 1))[:, None]
mix = music * 0.45 * duck[:, None] + sfx * 0.6 * sduck + amb * 0.7 + vo * 1.0
# fade-in / fade-out edges
fi = int(0.3 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(0.25 * SR)
mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
peak = np.max(np.abs(mix))
mix = mix / peak * 0.89
sf.write(out_path, mix.astype(np.float32), SR, subtype="PCM_24")
print("peak", peak, "written", out_path)

if len(sys.argv) > 4:  # optional stem export for level checks
    for name, x in (("music", music * 0.45 * duck[:, None]), ("sfx", sfx * 0.6 * sduck), ("amb", amb * 0.7), ("vo", vo)):
        sf.write(f"{sys.argv[4]}/{name}.wav", (x / peak * 0.89).astype(np.float32), SR)
