# kidvid: script-to-video template for 3D kids' learning shorts

`kidvid` rebuilds the format of the Gemini/Veo reference clip deterministically, in code: a cute 3D host in a sunny flower meadow teaches letters. Each letter materialises from sparkles, its word is spoken and typed as a caption, a matching prop pops up, the host reacts, and at the end the letters come alive and dance. See [ANALYSIS.md](ANALYSIS.md) for the shot-by-shot breakdown of the reference and how each observation maps to a rule here.

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

`kokoro-models` needs `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the [kokoro-onnx model release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0). Rendering uses software WebGL in headless Chromium, at about 4.5 s per 1280×720 frame on 4 CPU cores (a 25 s video takes about 45 minutes). Frame rendering can be resumed: re-running skips frames that already exist.

Preview stills before committing to a full render (durations are estimated when `vo.json` is omitted):

```bash
node plan.mjs timeline scripts/buddy_abc.json /tmp/tl.json
node render.mjs stills /tmp/tl.json /tmp/stills 1,6.5,20 0.5     # times in seconds, half resolution
```

## Script format

```json
{
  "title": "Buddy's ABCs",
  "format": { "width": 1280, "height": 720, "fps": 24 },
  "host":   { "name": "Buddy", "species": "puppy", "fur": "#e2a955", "accent": "#2f8fe0",
              "voice": "am_puck", "pitch": 1.12, "speed": 0.85 },
  "music":  { "bpm": 112 },
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
| `host.voice/pitch/speed` | Any Kokoro voice. `pitch` > 1 raises the voice for a cartoon character |
| `music.bpm` | Tempo of the score; the dance beat is snapped to it so the letters bounce in time |

**Beat types**

| `type` | Fields | What happens |
|---|---|---|
| `intro` | `say` (line or list), `min` | Host waves, eyes squeeze happy, sparkles swirl; lines play back to back |
| `letter` | `letter`, `word`, `prop`, `emoji`, `color`, `lead`, `caption`, `ask`, `wait`, `praise`, `bonus`, `bark` | Letter pops in from a sparkle swirl → "`lead` `word`!" (default lead "X is for"). The caption types in on the word and the prop pops. The host hops (puppies bark). `ask` adds a question plus a `wait`-second pause (default 1.3) for the child to answer, with a head tilt. `praise` adds a chime and line. `bonus: "ball"` bounces a beach ball in that stays until the dance |
| `dance` | `say`, `letters` (string, default: the letters taught), `min` | Letters grow eyes, arms and shoes, march in from both sides and dance on the beat around the sitting, waving host; confetti |
| `outro` | `say`, `min` | Big wave, slow push-in, chime, fade to white |

**Props** (`src/props.js`): `apple`, `ball` (beach ball), `cat`/`kitten` (peeks over the letter and meows), `dog`/`puppy`, `egg`, `fish`, `star`. Any other word works too: give it an `emoji` and it floats inside a glossy bubble. To add a real 3D prop, add an entry to the `table` in `makeProp`.

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
src/critter.js     puppy / kitten rig (wave, sit, hop, blink, happy eyes, lip sync, tail, ears)
src/props.js       3D letters (with alive mode), word props, bubbles
src/meadow.js      the set; static decor is merged into a few draw calls
audio/tts.py       Kokoro TTS, letter-name fix, lip-sync envelopes, word marks
audio/synth.py     score (ABC melody under the dance), SFX per event, birdsong, mix
fonts/             Fredoka Bold (OFL) + converter to three.js typeface JSON
```

Materials, particles, the apple and the easing helpers are shared with `../socky/src`.
