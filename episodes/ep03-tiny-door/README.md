# Socky and the Tiny Door (Episode 3)

60-second vertical (1080×1920, 30 fps, H.264 + AAC) children's short for ages 2–6. It picks up right where Episode 2 ends,
at the golden door in the giant flower.

**Video:** `Socky_and_the_Tiny_Door_EP3.mp4`

| Time | Beat |
|---|---|
| 0–10s | The golden door opens, a magical breeze stretches Socky's stripes, his friend grabs on, WHOOSH, they tumble into a tiny town (houses, toy shops, lanterns). "Whoa! Socky discovered a whole tiny world!" |
| 10–20s | Round, square and triangle doors, a tiny bell rings, Socky looks confused. "Which door should Socky explore?" The doors glow one after another and Socky thinks hard |
| 20–30s | "Can you find the door that looks like a triangle?" (2.5s pause), the triangle sparkles, Socky hops over and opens it, and bubbles stream out |
| 30–40s | Five bubbles, counted slowly; each pops as a sock hops up to it. Socky giggles |
| 40–50s | Apple, apple, apple, star. "Three are the same… but one is different!" (2.4s pause), the star wiggles, Socky spins |
| 50–60s | The star turns into a glowing golden map, a dotted path lights up to the giant clock tower, Socky hops toward it, then "What will Socky discover there?" and a magical sting |

No on-screen text, letters or numbers. The clock face uses dots only.

## Build
`render.py` imports the shared character and flower-world code from `../ep02-rainbow-bridge/render.py`, so both
episodes use the same sock model.
```bash
python3 tts.py $S                                       # -> $S/ep3/vo/*.wav   (needs $S/models/ Kokoro files)
python3 render.py range 0 1800 video.mp4                # or 4 ranges of 450 frames in parallel
python3 audio.py $S                                     # -> $S/ep3/soundtrack.wav
ffmpeg -i video.mp4 -i $S/ep3/soundtrack.wav -map 0:v -map 1:a -c:v copy -af loudnorm=I=-16:TP=-1.5 -c:a aac out.mp4
```
