# Socky's Big Journey

A 60-second vertical (9:16, 1080×1920, 30 fps) animated children's short, produced entirely in code:

* **Picture**: a real-time 3D film rendered with [three.js](https://threejs.org) in headless Chromium.
  * Socky is a procedurally deformed sock rig with squash & stretch, googly eyes, brows, cheeks and a blended mouth.
  * Post-processing adds soft lighting, depth of field, bloom and filmic (Khronos neutral) tone mapping.
* **Voice**: an offline neural TTS narrator (Kokoro, voice `af_heart`) plus a pitched-up "Socky" voice.
* **Sound**: an original procedural score, sound effects synced to every hop and bounce, ambience, reverb, and narration ducking.

## Story beats

| Time | Scene |
|---|---|
| 0–10 s | Socky peeks out of the laundry basket, feels alone, becomes brave and boings under the bed |
| 10–20 s | Magical under-bed world: crayon forest, glowing dust bunnies, a sleeping toy dino that snores |
| 20–30 s | Socky frees its matching sock from a marble. They hug, spin, and hop into golden light |
| 30–40 s | Garden counting game: five bouncing balls ("One… two… three… four… five!") with a pause to answer |
| 40–50 s | Riddle: star, apple and teddy appear, and the red ball bounces in as the answer |
| 50–60 s | Twilight: six stars to count, then Socky smiles at the camera. Final chime |

No on-screen text, captions or numbers appear anywhere.

## Layout

```
src/index.html   page shell + import map
src/main.js      renderer, post FX, choreography, camera, transitions, event export
src/socky.js     the sock character rig
src/sets.js      bedroom, under-the-bed world, garden, props
src/util.js      easing / keyframes / procedural textures
render.mjs       headless frame renderer (stills | frames | events)
audio/tts.py     narration + Socky voice (Kokoro ONNX)
audio/synth.py   score, SFX, ambience, ducking, mix
build.sh         end-to-end build
```

## Build

```bash
./build.sh /tmp/socky-work /path/to/kokoro-models
```

Rendering uses software WebGL (SwiftShader), at about 4–5 s per frame on 4 CPU cores. A preview still:

```bash
node render.mjs stills /tmp/stills 12.5,36,59.5 0.5
```
