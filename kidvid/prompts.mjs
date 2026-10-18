// Turns a kidvid script into a prompt pack for a text-to-video model (Veo / Gemini),
// using the same character bible and shot grammar as the reference video, one prompt per <=8 s clip.
//   node prompts.mjs <script.json> [out.md]
import fs from 'node:fs';

const [scriptPath, out] = process.argv.slice(2);
const S = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const host = { name: 'Buddy', species: 'puppy', ...S.host };
const LOOK = {
  puppy: 'a real-looking eight-week-old golden retriever puppy with fluffy golden fur, a lighter muzzle and chest, soft floppy ears, big wet dark-brown eyes, a leathery black nose and a blue collar half hidden in the fur',
  kitten: 'a real-looking young tabby kitten with soft striped fur, a cream muzzle and chest, big green eyes with slit pupils, pointy ears with pink insides and long white whiskers',
};
const COLOR = { '#ec2a2f': 'red', '#1e9be8': 'blue', '#2fb54a': 'green', '#ffb81c': 'yellow', '#a259ff': 'purple', '#ff6fb5': 'pink', '#ff8a1f': 'orange', '#14c2c2': 'teal' };
const PALETTE = Object.keys(COLOR);
const say = (x) => (Array.isArray(x) ? x : x ? [x] : []).map((s) => `"${s}"`).join(' ');

const STYLE = () => `Realistic, cinematic 3D animation for young children (natural fur, physically based lighting), soft global illumination, warm sunny afternoon light with a glowing sun in the upper left, shallow depth of field with a softly blurred background, bright saturated pastel palette. Setting: a lush flower meadow with short green grass, rolling hills, leafy trees, giant pink and orange daisies framing the top corners, purple tulips, small blue flower bushes and grey pebbles. Floating soap bubbles and twinkling sparkles. Camera: single locked-off wide shot at the host's eye level, 16:9, no cuts.`;
const CHAR = `${host.name} is ${LOOK[host.species] ?? LOOK.puppy}. ${host.name} stands centre-right of frame facing the camera, speaks in a cheerful, high, childlike voice and moves like a real animal: weight shifts, ears and tail that follow through, paws that stay planted.`;
const NEG = 'Avoid: extra or misspelled letters, garbled text, scene cuts, camera moves, changes to the character design, realistic fur on letters, dark or scary imagery.';

let li = 0;
const seen = [];
const clips = S.beats.map((b, i) => {
  if (b.type === 'intro') return `${host.name} waves a paw at the camera with a big smile while sparkles twinkle around them, then says: ${say(b.say)}`;
  if (b.type === 'letter') {
    const col = COLOR[b.color] ?? COLOR[PALETTE[li % PALETTE.length]] ?? 'bright'; li++; seen.push(b.letter);
    const prop = b.prop ? (/^(cat|kitten)$/i.test(b.prop) ? 'A tiny orange kitten peeks over the top of the letter and meows.' : `A glossy cartoon ${b.prop === 'ball' ? 'beach ball' : b.prop} pops up at the base of the letter.`) : '';
    return `A big glossy ${col} 3D bubble-letter "${b.letter}" (rounded, candy-like plastic) materialises from a swirl of sparkles on the left third of the frame, standing in the grass. ${prop} ${host.name} turns to look at it, ears perked, then faces the camera and says: "${b.letter} is for ${b.word}!" ${b.ask ? `then tilts their head and asks: "${b.ask}"` : ''} ${host.name} hops happily and wags their tail.${b.bonus ? ` A colourful beach ball bounces in from the right.` : ''}`.replace(/\s+/g, ' ');
  }
  if (b.type === 'dance') {
    const ls = [...(b.letters ?? seen.join(''))].map((c) => `"${c}"`).join(', ');
    return S.letterStyle === 'cartoon'
      ? `The glossy letters ${ls} come alive with cartoon eyes, smiles, thin black arms with white gloves and little shoes. They march in from both sides and dance around ${host.name}, who sits and waves to the beat. ${host.name} says: ${say(b.say)}`
      : `The glossy toy letters ${ls} hop in from the back of the meadow and bounce to the beat around ${host.name}, who does a playful bow, then sits panting happily and watching them. ${host.name} says: ${say(b.say)}`;
  }
  if (b.type === 'outro') return `${host.name} waves goodbye to the camera with both eyes squeezed shut in a happy smile, the dancing letters waving too, and says: ${say(b.say)}`;
  return say(b.say);
});

const md = [`# ${S.title ?? 'Untitled'}: text-to-video prompt pack`, '',
  'Generate each clip separately (8 s max), always pasting the **style** and **character** blocks unchanged so the look stays consistent, then join the clips in order. Burn captions in afterwards rather than asking the model to spell words: the reference video garbled "APPLE" and invented an extra letter.', '',
  '## Style (paste into every clip)', '', STYLE(), '', '## Character (paste into every clip)', '', CHAR, '', `## Negative`, '', NEG, '',
  ...clips.flatMap((c, i) => [`## Clip ${i + 1}: ${S.beats[i].type}${S.beats[i].letter ? ` ${S.beats[i].letter}` : ''}`, '', c, '']),
].join('\n');
if (out) fs.writeFileSync(out, md); else console.log(md);
