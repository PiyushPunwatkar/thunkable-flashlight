"""Generate narration + Socky's voice with Kokoro (offline neural TTS).

usage: python3 tts.py <model_dir> <out_dir>
Writes trimmed 48 kHz mono WAVs and prints their durations.
"""
import sys, json
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

M, OUT = sys.argv[1], sys.argv[2]
k = Kokoro(f"{M}/kokoro-v1.0.onnx", f"{M}/voices-v1.0.bin")
NARR = "af_heart"
SOCKY = "af_sky"
LINES = {
    "n01": (NARR, "Socky was all alone... but Socky knew there was a big adventure waiting!", 1.0, 1.0),
    "n02": (NARR, "Under the bed was a magical world, full of surprises!", 1.0, 1.0),
    "n03": (NARR, "And then, Socky found a very special friend!", 1.0, 1.0),
    "n04": (NARR, "Socky found some bouncing balls! Can you help Socky count them?", 1.05, 1.0),
    "c1": (NARR, "One!", 0.9, 1.0), "c2": (NARR, "Two!", 0.9, 1.0), "c3": (NARR, "Three!", 0.9, 1.0),
    "c4": (NARR, "Four!", 0.9, 1.0), "c5": (NARR, "Five!", 0.9, 1.0), "c6": (NARR, "Six!", 0.9, 1.0),
    "n05": (NARR, "Uh-oh! Socky has a little riddle!", 1.05, 1.0),
    "n06": (NARR, "I am round, I can bounce, and you can play with me. What am I?", 1.05, 1.0),
    "n07": (NARR, "A ball! Great thinking!", 1.05, 1.0),
    "n08": (NARR, "Look! Six stars! Can you count them before Socky?", 1.1, 1.0),
    "n09": (NARR, "Great job, little explorer! Where will Socky go next?", 1.08, 1.0),
    # Socky's own tiny voice: pitched up by resampling
    "s01": (SOCKY, "Five! We did it!", 0.95, 1.28),
    "giggle": (SOCKY, "Hee hee hee!", 1.0, 1.35),
}

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

dur = {}
for key, (voice, text, speed, pitch) in LINES.items():
    a, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    a = trim(a.astype(np.float64), sr)
    # pitch shift (and shorten) by playing back faster, then convert to 48k
    a = resample(a, sr * pitch, 48000)
    a = a / (np.max(np.abs(a)) + 1e-9) * 0.9
    sf.write(f"{OUT}/{key}.wav", a.astype(np.float32), 48000)
    dur[key] = round(len(a) / 48000, 3)
print(json.dumps(dur))
