# Socky and the Clock Tower (Episode 4)

60-second vertical (1080×1920, 30 fps, H.264 + AAC) children's short for ages 2–6. It picks up where Episode 3 ends:
the socks follow the golden map up the glowing path to the clock tower.

**Video:** `Socky_and_the_Clock_Tower_EP4.mp4`

| Time | Beat |
|---|---|
| 0–11s | Arrival at the giant tower (its clock dwarfs the socks); the map turns to sparkles, the hands spin backward, then tick… tock… "Socky had reached the mysterious clock tower!" The tiny door opens and they hop inside |
| 11–20s | Clockwork world: spinning gears, bouncing springs, tiny clocks. The blue gear pops out, the big gear grinds to a stop, the music and ticking go silent, and Socky looks worried (frown + brows) |
| 20–30s | Round, star and triangle gears. "Can you find the round one?" (2.2s pause), the round gear glows and lands on Socky's head, he hops it over and it clicks into place, and everything ticks again |
| 30–40s | Five stars around the clock; each tick lights one ("One… two… three… four… five!"), and Socky hops once per star. Then all five sparkle |
| 40–50s | The clock's riddle (its hands wave, its face glows). Pause, with the camera pushing in on the clock, then "A clock! Great job!" Socky laughs and hugs the clock (hearts) |
| 50–60s | The clock face swings open into a secret window: mountains, clouds, and a glowing path to a floating crystal castle. Narrator line, then Socky to camera: "Hop, hop, let's go!" They hop through, the camera flies out after them, and the castle shoots a beam of light (hook for Episode 5) |

No on-screen text or numbers (the clock uses dots).

## Build
`render.py` reuses the sock model from `../ep02-rainbow-bridge/render.py` (which gained optional `frown` and
`brow` expressions; Episodes 2–3 are unaffected) and the town/map helpers from `../ep03-tiny-door/render.py`.
```bash
python3 tts.py $S                                       # -> $S/ep4/vo/*.wav   (needs $S/models/ Kokoro files)
python3 render.py range 0 1800 video.mp4                # or 4 ranges of 450 frames in parallel
python3 audio.py $S                                     # -> $S/ep4/soundtrack.wav
ffmpeg -i video.mp4 -i $S/ep4/soundtrack.wav -map 0:v -map 1:a -c:v copy -af loudnorm=I=-16:TP=-1.5 -c:a aac out.mp4
```
