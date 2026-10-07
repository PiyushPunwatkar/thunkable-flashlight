"""Narration for Episode 4 (Kokoro TTS). Usage: python3 tts.py <workdir with models/>  ->  <workdir>/ep4/vo/*.wav"""
import sys, os, soundfile as sf
from kokoro_onnx import Kokoro
S = sys.argv[1]
k = Kokoro(f"{S}/models/kokoro-v1.0.onnx", f"{S}/models/voices-v1.0.bin")
N = "af_heart"
lines = {
    "n1": ("Socky had reached the mysterious clock tower!", 0.88, N),
    "n3": ("Oh no! The clock needs a special gear. Can you find the round one?", 0.86, N),
    "n5": ("Let's count the stars with Socky!", 0.88, N),
    "c1": ("One!", 0.8, N), "c2": ("Two!", 0.8, N), "c3": ("Three!", 0.8, N), "c4": ("Four!", 0.8, N), "c5": ("Five!", 0.8, N),
    "n6": ("I have hands, but I cannot clap. I have a face, but I cannot smile. What am I?", 0.86, N),
    "n7": ("A clock! Great job!", 0.92, N),
    "n8": ("The clock showed Socky the way to a brand-new adventure!", 0.9, N),
    "socky": ("Hop, hop, let's go!", 1.0, "af_sky"),   # Socky's own little voice (pitched up in audio.py)
    "laugh": ("Hee hee hee!", 1.0, "af_sky"),
}
os.makedirs(f"{S}/ep4/vo", exist_ok=True)
for key, (text, speed, voice) in lines.items():
    a, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    sf.write(f"{S}/ep4/vo/{key}.wav", a, sr)
    print(key, round(len(a) / sr, 2))
