// Script -> timeline compiler. The timeline is the single source of truth shared by
// the renderer (src/main.js) and the soundtrack (audio/synth.py).
//
//   node plan.mjs lines    <script.json> <lines.json>                  # VO clips for tts.py
//   node plan.mjs timeline <script.json> <timeline.json> [vo.json]     # vo.json from tts.py (else durations are estimated)
import fs from 'node:fs';

const [mode, scriptPath, out, voPath] = process.argv.slice(2);
const S = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
const host = { name: 'Buddy', species: 'puppy', voice: 'am_puck', pitch: 1.12, speed: 0.85, ...S.host };
const fmt = { width: 1280, height: 720, fps: 24, ...S.format };
const PALETTE = ['#ec2a2f', '#1e9be8', '#2fb54a', '#ffb81c', '#a259ff', '#ff6fb5', '#ff8a1f', '#14c2c2'];

// ---------------------------------------------------------------- VO clips
const lines = [];
const clip = (key, text, who = 'host', o = {}) => {
  const v = who === 'cat' ? { voice: 'af_sky', pitch: 1.45, speed: 1.0 } : host;
  lines.push({ key, text, who, voice: v.voice, pitch: v.pitch, speed: v.speed, ...o });
  return key;
};
const asList = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
S.beats.forEach((b, i) => {
  asList(b.say).forEach((s, j) => clip(`b${i}_say${j}`, s));
  if (b.type === 'letter') {
    const lead = b.lead ?? `${b.letter} is for`;
    clip(`b${i}_line`, `${lead} ${b.word}!`, 'host', { mark: lead });
    if (b.ask) clip(`b${i}_ask`, b.ask);
    if (b.praise) clip(`b${i}_praise`, b.praise);
    if (/^(cat|kitten)$/i.test(b.prop || '')) clip(`b${i}_meow`, 'Meow!', 'cat');
  }
});

if (mode === 'lines') {
  fs.writeFileSync(out, JSON.stringify(lines, null, 1));
  process.exit(0);
}

// ---------------------------------------------------------------- timeline
const VO = voPath ? JSON.parse(fs.readFileSync(voPath, 'utf8')) : {};
const dur = (k) => VO[k]?.dur ?? 0.25 + lines.find((l) => l.key === k).text.length * 0.068;
const vo = [], events = [], beats = [];
const say = (key, t, who) => { vo.push({ key, t: +t.toFixed(3), dur: dur(key), who: who ?? lines.find((l) => l.key === key).who, env: VO[key]?.env ?? null }); return t + dur(key); };
const ev = (t, type, o = {}) => events.push({ t: +t.toFixed(3), type, ...o });
const sayAll = (b, i, t, gap = 0.28) => { asList(b.say).forEach((_, j) => { t = say(`b${i}_say${j}`, t) + gap; }); return t; };

const BEAT = 60 / (S.music?.bpm ?? 112);
let t = 0, li = 0;
const seen = [];
S.beats.forEach((b, i) => {
  // the dance starts on a beat of the score so the letters bounce in time
  const t0 = b.type === 'dance' ? Math.ceil(t / BEAT - 1e-6) * BEAT : t, B = { type: b.type, t0 };
  if (b.type === 'intro') {
    ev(t0 + 0.2, 'shimmer');
    t = sayAll(b, i, t0 + 0.55);
    B.waveT = [t0 + 0.35, Math.min(t, t0 + 0.55 + dur(`b${i}_say0`) + 0.3)];
    t = Math.max(t + 0.15, t0 + (b.min ?? 0));
  } else if (b.type === 'letter') {
    const color = b.color || PALETTE[li % PALETTE.length];
    Object.assign(B, { letter: b.letter, word: b.word, color, prop: b.prop ?? null, emoji: b.emoji ?? null, caption: b.caption ?? true, idx: li++ });
    seen.push({ ch: b.letter, color });
    B.reveal = t0; ev(t0, 'sparkle'); ev(t0 + 0.2, 'pop', { k: 0.8 });
    const lineT = t0 + 0.6, markT = VO[`b${i}_line`]?.markT ?? 0.25 + (b.lead ?? `${b.letter} is for`).length * 0.068;
    let u = say(`b${i}_line`, lineT);
    B.wordT = lineT + markT; B.wordDur = Math.max(0.3, u - B.wordT);
    if (B.prop) ev(B.wordT, 'pop', { k: 1.2 });
    if (B.caption) [...b.word].forEach((_, k) => ev(B.wordT + (k / b.word.length) * B.wordDur * 0.75, 'type'));
    if (/^(cat|kitten)$/i.test(b.prop || '')) { B.meowT = u + 0.05; say(`b${i}_meow`, B.meowT); u = B.meowT + dur(`b${i}_meow`); }
    B.cheerT = u + 0.12; ev(B.cheerT + 0.32, 'pomf');
    if (host.species === 'puppy' && b.bark !== false) { B.barkT = B.cheerT + 0.05; ev(B.barkT, 'bark'); }
    u = B.cheerT + 0.75;
    if (b.ask) { B.askT = u; u = say(`b${i}_ask`, u); B.waitT = [u, u + (b.wait ?? 1.3)]; u = B.waitT[1]; }
    if (b.praise) { B.praiseT = u; u = say(`b${i}_praise`, u) + 0.1; ev(B.praiseT, 'chime'); }
    if (b.bonus) {
      B.bonus = { name: b.bonus, t: (B.askT ?? B.cheerT) + 0.1 };
      const bt = B.bonus.t;
      [0.55, 0.95, 1.25, 1.45].forEach((d, k) => ev(bt + d, 'boing', { k: 1 - k * 0.22 }));
    }
    B.exitT = u + 0.25; ev(B.exitT, 'whoosh');
    t = B.exitT + 0.4;
  } else if (b.type === 'dance') {
    const letters = [...(b.letters ?? seen.map((s) => s.ch).join(''))];
    B.letters = letters.map((ch, k) => ({ ch, color: seen.find((s) => s.ch === ch)?.color ?? PALETTE[(li + k) % PALETTE.length] }));
    ev(t0, 'shimmer'); ev(t0 + 0.1, 'tada');
    for (let k = 0; k < 6; k++) ev(t0 + 0.15 + k * 0.2, 'step', { k });
    t = sayAll(b, i, t0 + 0.9);
    t = Math.max(t + 0.3, t0 + (b.min ?? 4.5));
  } else if (b.type === 'outro') {
    t = sayAll(b, i, t0 + 0.2);
    B.waveT = [t0 + 0.1, t + 0.4];
    t = Math.max(t + 0.9, t0 + (b.min ?? 2.2));
    ev(t - 0.9, 'chime');
  } else {
    t = Math.max(sayAll(b, i, t0 + 0.2), t0 + (b.min ?? 1));
  }
  B.t1 = t;
  beats.push(B);
});

const timeline = {
  title: S.title ?? 'Untitled', ...fmt, duration: +t.toFixed(3),
  host, music: { bpm: 112, ...S.music }, beats, vo: vo.sort((a, b) => a.t - b.t), events: events.sort((a, b) => a.t - b.t),
};
fs.writeFileSync(out, JSON.stringify(timeline));
console.log(`${timeline.title}: ${timeline.duration.toFixed(2)} s, ${beats.length} beats, ${vo.length} VO clips, ${Math.ceil(timeline.duration * fmt.fps)} frames`);
