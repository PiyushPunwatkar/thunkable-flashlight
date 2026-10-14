"""Voice every VO clip of a script with Kokoro (offline neural TTS).

usage: python3 tts.py <model_dir> <lines.json> <out_dir>
lines.json comes from `node plan.mjs lines`. Writes <key>.wav (48 kHz mono, trimmed,
pitch-shifted for character voices) and vo.json: {key: {dur, env, markT}} where env is a
100 Hz loudness envelope the renderer uses for lip sync, and markT is when the text after
the line's `mark` prefix starts (e.g. the word in "A is for | Apple!"), for caption timing.
"""
import json
import re
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

M, LINES, OUT = sys.argv[1:4]
k = Kokoro(f"{M}/kokoro-v1.0.onnx", f"{M}/voices-v1.0.bin")
SR = 48000


def speakable(text):
    # a bare capital letter is read as a word ("A" -> "uh"); quoting it makes Kokoro say the letter name
    return re.sub(r"(?<![\w'\"])([A-Z])(?![\w'\"])", r'"\1"', text)


def trim(a, sr, thr=0.012, pad=0.03):
    env = np.convolve(np.abs(a), np.ones(int(sr * 0.01)) / int(sr * 0.01), mode="same")
    idx = np.where(env > thr)[0]
    if len(idx) == 0:
        return a
    s0 = max(0, idx[0] - int(pad * sr)); s1 = min(len(a), idx[-1] + int(pad * sr * 2))
    out = a[s0:s1].copy()
    f = int(0.01 * sr); out[:f] *= np.linspace(0, 1, f); out[-f:] *= np.linspace(1, 0, f)
    return out


def resample(a, sr_in, sr_out):
    n = int(round(len(a) * sr_out / sr_in))
    return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a)


def voice(text, ln):
    a, sr = k.create(speakable(text), voice=ln["voice"], speed=ln["speed"], lang="en-us")
    return resample(trim(a.astype(np.float64), sr), sr * ln["pitch"], SR)  # pitch up (and shorten) by playing back faster


meta = {}
for ln in json.load(open(LINES)):
    a = voice(ln["text"], ln)
    a = a / (np.max(np.abs(a)) + 1e-9) * 0.9
    sf.write(f"{OUT}/{ln['key']}.wav", a.astype(np.float32), SR)
    hop = SR // 100
    rms = np.sqrt(np.convolve(a ** 2, np.ones(hop) / hop, mode="same"))[::hop]
    env = np.clip(rms / (np.percentile(rms, 95) + 1e-9), 0, 1)
    meta[ln["key"]] = {"dur": round(len(a) / SR, 3), "env": [round(float(x), 2) for x in env]}
    if ln.get("mark"):  # the prefix said on its own, minus its trailing release
        meta[ln["key"]]["markT"] = round(max(0.1, len(voice(ln["mark"], ln)) / SR - 0.06), 3)
    print(f"{ln['key']:>12} {meta[ln['key']]['dur']:5.2f}s  {ln['text']}")
json.dump(meta, open(f"{OUT}/vo.json", "w"))
