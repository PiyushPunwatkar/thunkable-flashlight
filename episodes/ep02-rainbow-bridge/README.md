# Socky and the Rainbow Bridge (Episode 2)

60-second vertical (1080×1920, 30 fps, H.264 + AAC) children's short for ages 2–6.

**Video:** `Socky_and_the_Rainbow_Bridge_EP2.mp4`

| Time | Beat |
|---|---|
| 0–10s | Socky and his friend hop through the magical garden, reach the sparkling stream, and a rainbow appears in the distance |
| 10–20s | Three glowing stepping stones (BOING ×3), which turn into a rainbow bridge |
| 20–30s | Five butterflies, counted one by one; Socky hops with each count, then spins |
| 30–40s | Red, yellow and blue flowers: "Can you find the yellow flower?" (pause), the yellow one wiggles and sparkles |
| 40–50s | Butterfly riddle (pauses before and after the question), then Socky laughs |
| 50–60s | They slide down the rainbow, a giant flower opens to show a tiny golden door, golden light, closing chime (cliffhanger) |

No on-screen text or numbers.

## How it was made (fully procedural)

- `tts.py`: narrator lines from [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) neural TTS (voice `af_heart`, slowed for young kids).
- `render.py`: soft-3D look drawn with skia-python (gradient shading, rim highlights, glow, parallax camera, squash-and-stretch hops, googly-eye jiggle).
- `audio.py`: original music made in code (ukulele strums, glockenspiel, bass, shaker), magical SFX, narration placement, music ducking under the voice, and reverb.

Rebuild:
```bash
pip install skia-python kokoro-onnx soundfile numpy   # skia also needs libegl1
# kokoro-v1.0.onnx + voices-v1.0.bin from the kokoro-onnx GitHub release -> $S/models/
python3 tts.py $S                                  # -> $S/vo/*.wav
python3 render.py range 0 1800 video.mp4           # or split into ranges and run them in parallel
python3 audio.py $S                                # -> $S/soundtrack.wav
ffmpeg -i video.mp4 -i $S/soundtrack.wav -map 0:v -map 1:a -c:v copy -af loudnorm=I=-16:TP=-1.5 -c:a aac out.mp4
```

Character design (keep the same in every episode): red-and-yellow striped sock with a ribbed red cuff, red toe and heel
caps, two big googly eyes (front one bigger), pink blush, tiny smile. Socky and his friend use the identical model.
