# kidvid: script-to-video template for 3D kids' learning shorts

`kidvid` rebuilds the format of the Gemini/Veo reference clip deterministically, in code: a puppy (or kitten) host in a sunny flower meadow teaches letters. Each letter gathers out of sparkles, drops into the grass, and its word is spoken and typed as a caption. A matching prop lands beside it, the host reacts, and at the end the letters hop out to dance.

The look aims for realism rather than cartoon:
- **Characters:** sculpted from signed-distance shapes into single organic meshes, under shell-texture fur.
- **Faces:** wet glossy eyes with real lids and lid blinks, and a leathery nose.
- **Motion:** legs use two-bone IK so paws stay planted, and gaze, ears and tail are springs with follow-through. Letters and props obey gravity and bounce like plastic toys.
- **Picture:** a physically based sky lights the scene, with ACES tone mapping, sun bloom, depth of field with focus pulls, handheld camera drift, lens fringing and grain. See [ANALYSIS.md](ANALYSIS.md) for the shot-by-shot breakdown of the reference and how each observation maps to a rule here.

You write a small JSON **script**. The pipeline voices it, times everything from the real voice lengths, scores it, renders it and encodes an MP4. Picture and sound can't drift apart, captions are always spelled right, and only the letters you asked for appear.

```
script.json ─► plan.mjs lines ─► audio/tts.py (Kokoro) ─► vo/*.wav + vo.json (durations, lip-sync envelopes, word marks)
            └────────────────► plan.mjs timeline ◄────────┘
                                   │ timeline.json (single source of truth)
                 ┌─────────────────┴──────────────────┐
         render.mjs + src/ (three.js)          audio/synth.py
          frames/f_00000.jpg …                  mix.wav (score, SFX, birds, VO, ducking)
                 └────────────► ffmpeg (loudnorm -16 LUFS, x264) ◄┘ ─► <title>.mp4
```

## Build a video

```bash
./build.sh scripts/buddy_abc.json /tmp/work /path/to/kokoro-models [render_workers]
```

`kokoro-models` needs `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the [kokoro-onnx model release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0). Rendering uses software WebGL in headless Chromium, at about 7.5 s per 1280×720 frame on 4 CPU cores (a 25 s video takes about 80 minutes; the fur is half of that). Frame rendering can be resumed: re-running skips frames that already exist.

Preview stills before committing to a full render (durations are estimated when `vo.json` is omitted):

```bash
node plan.mjs timeline scripts/buddy_abc.json /tmp/tl.json
node render.mjs stills /tmp/tl.json /tmp/stills 1,6.5,20 0.5     # times in seconds, half resolution
node tools/lookdev.mjs /tmp/pup.jpg puppy '{"sit":1}'          # character turnaround (front, 3/4, side, face)
```

Look-dev knobs for stills: `CAM=close` frames the host's face, and `Q2='exp=0.8&bloom=0.1&tm=AgXToneMapping&envI=0.4&fur=0'` overrides exposure, bloom, tone mapping, sky light and fur.

## Script format

```json
{
  "title": "Buddy's ABCs",
  "format": { "width": 1280, "height": 720, "fps": 24 },
  "host":   { "name": "Buddy", "species": "puppy", "fur": "#e2a955", "accent": "#2f8fe0",
              "voice": "af_heart", "pitch": 1.12, "speed": 0.85 },
  "music":  { "bpm": 112 },
  "letterStyle": "toy",
  "beats": [
    { "type": "intro",  "say": ["Hello friends, I'm Buddy!", "Let's learn our ABCs!"] },
    { "type": "letter", "letter": "A", "word": "Apple", "prop": "apple", "color": "#ec2a2f",
      "ask": "Can you say A?", "bonus": "ball" },
    { "type": "letter", "letter": "C", "word": "Cat", "prop": "cat" },
    { "type": "dance",  "say": ["A, B, C!", "Let's dance together!"], "letters": "ABDC" },
    { "type": "outro",  "say": ["Bye bye, friends!"] }
  ]
}
```

| Field | Meaning |
|---|---|
| `format` | Output size and frame rate. The camera auto-fits the stage to any aspect ratio (16:9 is the tuned layout) |
| `host.species` | `puppy` or `kitten` (procedural rig in `src/critter.js`); `fur` and `accent` (collar) recolour it |
| `host.voice/pitch/speed` | Any Kokoro voice. `pitch` > 1 raises the voice for a cartoon character. The default `af_heart` was checked with Whisper on "X is for …" for all 26 letters: 25 come through clean, and E can be misheard. If a letter sounds off in another voice, give that beat a `lead` such as `"The letter E is for"` |
| `music.bpm` | Tempo of the score; the dance beat is snapped to it so the letters bounce in time |
| `letterStyle` | `toy` (default): letters behave like real plastic toys. `cartoon`: in the dance they also grow eyes, arms and shoes, like the reference |

**Beat types**

| `type` | Fields | What happens |
|---|---|---|
| `intro` | `say` (line or list), `min` | Host lifts a paw to say hi, eyes squeeze happy, sparkles swirl; lines play back to back |
| `letter` | `letter`, `word`, `prop`, `emoji`, `color`, `lead`, `caption`, `ask`, `wait`, `praise`, `bonus`, `bark` | Letter gathers out of a sparkle swirl, drops into the grass and rocks to a stop; the host flinches at the thud and turns to look → "`lead` `word`!" (default lead "X is for"). The caption types in on the word and the prop drops beside the letter. The host crouches and hops (puppies bark). When the beat ends the letter hops back to a row at the rear of the meadow. `ask` adds a question plus a `wait`-second pause (default 1.3) for the child to answer, with a head tilt. `praise` adds a chime and line. `bonus: "ball"` bounces a beach ball in that stays until the dance |
| `dance` | `say`, `letters` (string, default: the letters taught), `min` | The host play-bows, then sits panting and watching; letters hop from the back row into a formation (new ones drop in) and bounce on the beat |
| `outro` | `say`, `min` | Paw wave goodbye, slow push-in, chime, fade to white |

**Props** (`src/props.js`): `apple`, `ball` (beach ball), `cat`/`kitten` and `dog`/`puppy` (leap out from behind the letter, sit and look at you; the kitten meows), `egg`, `fish`, `star`. Any other word works too: give it an `emoji` and it floats inside a glossy bubble (the one deliberately non-realistic element). To add a real 3D prop, add an entry to the `table` in `makeProp`.

## Other outputs

* `node prompts.mjs <script.json> [out.md]` writes a **text-to-video prompt pack** (Veo/Gemini) from the same script. It contains the style bible, character sheet, negative prompt and one prompt per ≤8 s clip, so the AI route keeps the look consistent too.
* `scripts/buddy_abc.json` recreates the reference. `scripts/mimi_defg.json` shows a kitten host, praise lines, other props and the emoji fallback.

## Layout

```
plan.mjs           script -> VO line list / timeline (all timing decisions live here)
render.mjs         headless frame renderer (stills | frames), injects the timeline
build.sh           end-to-end build
prompts.mjs        script -> Veo/Gemini prompt pack
src/main.js        renderer, post FX, per-beat performance, camera, captions overlay
src/critter.js     puppy / kitten: sculpted body + fur, IK legs, spring gaze/ears/tail, lids, jaw
src/sculpt.js      SDF primitives + marching cubes -> smooth organic meshes
src/fur.js         shell-texture fur (strand noise, droop, comb, root shading)
src/physics.js     drops, bounces, wobble and the ball simulation (shared with plan.mjs)
src/props.js       toy 3D letters (optional cartoon limbs), word props, bubbles
tools/lookdev.*    character turnaround renderer
src/meadow.js      the set: physical sky + image lighting, foliage, grass; static decor merged into few draw calls
audio/tts.py       Kokoro TTS, letter-name fix, lip-sync envelopes, word marks
audio/synth.py     score (ABC melody under the dance), SFX per event, birdsong, mix
fonts/             Fredoka Bold (OFL) + converter to three.js typeface JSON
```

Materials, particles, the apple and the easing helpers are shared with `../socky/src`.
