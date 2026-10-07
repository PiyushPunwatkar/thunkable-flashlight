"""Narration for Episode 3 (Kokoro TTS). Usage: python3 tts.py <workdir with models/>  ->  <workdir>/ep3/vo/*.wav"""
import sys, os, soundfile as sf
from kokoro_onnx import Kokoro
S = sys.argv[1]
k = Kokoro(f"{S}/models/kokoro-v1.0.onnx", f"{S}/models/voices-v1.0.bin")
N = "af_heart"
lines = {
    "n1": ("Whoa! Socky discovered a whole tiny world!", 0.88, N),
    "n2": ("Which door should Socky explore?", 0.86, N),
    "n3": ("Can you find the door that looks like a triangle?", 0.85, N),
    "n4": ("There it is! The triangle door!", 0.9, N),
    "n5": ("Let's count the bubbles!", 0.88, N),
    "c1": ("One!", 0.8, N), "c2": ("Two!", 0.8, N), "c3": ("Three!", 0.8, N), "c4": ("Four!", 0.8, N), "c5": ("Five!", 0.8, N),
    "n6": ("Three are the same... but one is different! Can you find it?", 0.85, N),
    "n7": ("The star! Great spotting!", 0.9, N),
    "n8": ("A mysterious map! And look where it leads... the giant clock tower!", 0.88, N),
    "n9": ("What will Socky discover there?", 0.85, N),
    "laugh": ("Hee hee hee!", 1.0, "af_sky"),
}
os.makedirs(f"{S}/ep3/vo", exist_ok=True)
for key, (text, speed, voice) in lines.items():
    a, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    sf.write(f"{S}/ep3/vo/{key}.wav", a, sr)
    print(key, round(len(a) / sr, 2))
