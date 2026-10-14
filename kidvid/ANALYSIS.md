# Reference video breakdown

Source: `gemini_generated_video.mp4` (Veo / Gemini), 10.0 s, 1280×720, 24 fps, H.264 + AAC stereo 48 kHz.

## What it is

An ABC lesson hosted by a talking puppy ("Buddy"). It is one continuous locked-off shot with no cuts (scene detection finds none). The background barely moves, and all the storytelling happens through objects appearing around the host.

## Beat sheet (picture)

| Time | What happens |
|---|---|
| 0.0–2.0 s | Buddy stands centre-right, waves a paw (pads facing the camera), blinks happily; twinkle sparkles swirl around Buddy |
| 2.0–2.5 s | A glossy **red "A"** materialises in the left third, filled with sparkles that settle into solid plastic |
| 2.5–4.0 s | An apple pops up at the letter's base; caption **APPLE** types in letter by letter under it (white, dark outline); soap bubbles start drifting; a beach ball bounces in from the right and Buddy paws at it |
| 4.0–5.5 s | A glossy **blue "B"** takes the A's place; Buddy cheers with mouth wide open |
| 5.5–7.3 s | A sparkly **green "C"** forms; a tiny kitten peeks over its top; caption **CAT** |
| 7.3–10 s | The letters **come alive** (eyes, smiles, thin arms, gloves, shoes) and dance around Buddy, who sits and waves; extra letters pop in from the right |

## Beat sheet (sound)

Transcript (Whisper): *"Hello friends, I'm Buddy! Let's learn our ABCs! A is for Apple. Can you say A? B is for Ball. Let's spell B…"* (cut off).

A childlike, high, cheerful single voice. Behind it are a light music bed and sparkle chimes. The voice runs out of step with the picture: "B is for Ball" plays over the C/kitten shot, and the line is cut off at 10 s.

## Shot grammar → template rules

| Observation | Template rule (`kidvid`) |
|---|---|
| Locked-off wide, eye level, 16:9 | Static camera with a tiny breathing drift; the host sits at x≈0.2 and the letter slot at x≈−0.8, auto-fit to any aspect |
| Pixar look: soft sun, shallow DOF, bloom, pastel saturation | PBR/sheen materials, sun + rim + hemisphere light, bokeh focused on the host, light bloom |
| One letter at a time in a fixed left slot | `letter` beat: reveal → word → cheer → optional ask/wait/praise → exit |
| Letter forms out of sparkles | Sparkle swirl (2D) + sparkle cloud (3D) + emissive flash while the letter pops in with overshoot |
| Caption typed in under the letter | Overlay caption timed to the spoken word (`markT` measured from TTS), per-character pop |
| Word props: apple at the base, kitten peeking over the top | `makeProp`: `beside` or `peek` placement; emoji-in-bubble fallback for any other word |
| Host reacts: looks at the letter, then camera, barks, hops | Performance layers driven by the timeline (gaze, ear perk, hop, happy eyes, tail wag, bark) |
| Bubbles + sparkles = constant gentle motion | Ambient bubbles after the first letter, pollen, swaying flowers and grass |
| Finale: letters come alive and dance | `dance` beat: letters grow limbs and faces, march in, and bounce on the music beat |
| AI artefacts: garbled "AP P", extra "D", VO/picture drift, cut-off line | Everything is deterministic: captions are typeset, letters come from the script, and the timeline is built from the real voice durations, so picture and sound cannot drift |
