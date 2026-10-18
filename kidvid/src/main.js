// Timeline-driven renderer. window.__TL (from plan.mjs) describes every beat; renderAt(t) draws one frame.
// Motion is physical: letters and props fall and bounce (physics.js), the host is a spring/IK rig
// (critter.js) driven by per-beat performance targets, and the camera breathes like a handheld.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import * as U from '../../socky/src/util.js';
import { Critter } from './critter.js';
import { Letter, makeProp, beachBall, bubble } from './props.js';
import { buildMeadow } from './meadow.js';
import { drop, wobble, bonusBall, LETTER_DROP, PROP_DROP } from './physics.js';

const { clamp, lerp, ss, win, easeIO } = U;
const TL = window.__TL;
const qs = new URLSearchParams(location.search);
const W = +qs.get('w') || TL.width, H = +qs.get('h') || TL.height;

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE[qs.get('tm') || 'ACESFilmicToneMapping']; renderer.toneMappingExposure = +(qs.get('exp') ?? 0.75);
document.body.appendChild(renderer.domElement);
const overlay = document.createElement('canvas'); overlay.width = W; overlay.height = H; document.body.appendChild(overlay);
const og = overlay.getContext('2d');

const camera = new THREE.PerspectiveCamera(36, W / H, 0.05, 400);
const set = buildMeadow(renderer);
const scene = set.scene;
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: +(qs.get('msaa') ?? 4) }));
const bokeh = new BokehPass(scene, camera, { focus: 2.7, aperture: 0.0022, maxblur: 0.008 });
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), +(qs.get('bloom') ?? 0.1), 0.4, +(qs.get('bt') ?? 4)); // only the sun blooms
if (qs.get('envI')) scene.environmentIntensity = +qs.get('envI');
// film finish: slight lens fringing, vignette and grain, applied after tone mapping
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(W, H) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 17.0) * 43758.5453); }
    void main(){ vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * r2 * 0.012).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * r2 * 0.012).b);
      c *= mix(1.0, 0.74, smoothstep(0.08, 0.55, r2));
      c += (hash(vUv * res) - 0.5) * 0.028;
      gl_FragColor = vec4(c, 1.0); }`,
});
composer.addPass(new RenderPass(scene, camera)); if (qs.get('bokeh') !== '0') composer.addPass(bokeh);
composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(film);
const bokehRender = bokeh.render.bind(bokeh);
bokeh.render = (...a) => {
  const hidden = [];
  scene.traverse((o) => { if (o.userData.noDepth && o.visible) { o.visible = false; hidden.push(o); } });
  bokehRender(...a);
  hidden.forEach((o) => (o.visible = true));
};

// ------------------------------------------------------------------ cast
const font = new FontLoader().parse(await (await fetch('../fonts/Fredoka-Bold.typeface.json')).json());
document.fonts.add(await new FontFace('Fredoka', 'url(../fonts/Fredoka-Bold.ttf)').load());

const HOST = [0.2, 0, 0.05], SLOT = [-0.82, 0, -0.02];
const shelfOf = (i) => [-1.55 + i * 0.5, 0, -1.35];
const cartoon = TL.letterStyle === 'cartoon';
const host = new Critter(TL.host.species, { ...(TL.host.fur && { fur: TL.host.fur }), ...(TL.host.accent && { collar: TL.host.accent }) });
scene.add(host.group);
if (qs.get('fur') === '0') scene.traverse((o) => { if (o.isInstancedMesh && o.geometry.attributes.layer) o.visible = false; });
const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: U.glowTex(), color: '#000000', transparent: true, opacity: 0.45, depthWrite: false }));
contact.material.blending = THREE.MultiplyBlending; contact.material.premultipliedAlpha = true;
contact.scale.set(0.55, 1, 0.75); contact.position.y = 0.003; scene.add(contact);

const LET = {};
const letterFor = (ch, color) => (LET[ch] ||= (() => { const l = new Letter(font, ch, color); scene.add(l.root); return l; })());
const beats = TL.beats.map((b) => {
  const B = { ...b };
  if (b.type === 'letter') {
    B.L = letterFor(b.letter, b.color);
    B.shelf = shelfOf(b.idx);
    B.tDrop = b.reveal + LETTER_DROP.delay; B.y0 = LETTER_DROP.y0;
    if (b.prop) { B.P = makeProp(b.prop, { emoji: b.emoji }); scene.add(B.P.obj); B.P.obj.visible = false; }
  }
  if (b.type === 'dance') B.letters.forEach((l) => letterFor(l.ch, l.color));
  return B;
});
const letterBeats = beats.filter((b) => b.type === 'letter');
const dance = beats.find((b) => b.type === 'dance'), outro = beats.find((b) => b.type === 'outro');
const firstLetter = letterBeats[0]?.t0 ?? 0;
const BEAT = 60 / TL.music.bpm;

// bonus ball: rolls in, is pawed at, and gets kicked out of frame when the dance starts
const bonusBeat = letterBeats.find((b) => b.bonus);
const ball = bonusBeat && beachBall(0.15);
const ballSim = bonusBeat && bonusBall(bonusBeat.bonus.t, dance?.t0, TL.duration + 1);
if (ball) scene.add(ball);

const R = U.rng(3);
const BUB = Array.from({ length: 10 }, () => ({ m: bubble(0.03 + R() * 0.04), x: (R() - 0.5) * 3.4, z: -1.0 + R() * 1.2, p: R() * 7, T: 6 + R() * 3 }));
BUB.forEach((b) => scene.add(b.m));

// ------------------------------------------------------------------ helpers
const bump = (t, a, d) => (t > a && t < a + d ? Math.sin((Math.PI * (t - a)) / d) : 0);
const voAt = (t, who) => TL.vo.find((v) => v.who === who && t >= v.t && t < v.t + v.dur);
function mouthOf(t, who) {
  const v = voAt(t, who);
  if (!v) return 0;
  const u = t - v.t;
  if (v.env) return clamp(v.env[Math.min(v.env.length - 1, Math.floor(u * 100))] * 1.1, 0, 1);
  return 0.5 + 0.5 * Math.sin(u * 24) * Math.sin(u * 8.7);
}
const BLINKS = []; for (let x = 1.1; x < TL.duration; x += 2.2 + R() * 2.2) BLINKS.push(x);
for (const b of letterBeats) BLINKS.push(b.tDrop + 0.17); // flinch at the thud
const blinkAt = (t) => BLINKS.reduce((m, b) => Math.max(m, win(b, b + 0.04, b + 0.08, b + 0.15, t)), 0);
const beatOf = (t) => beats.find((b) => t >= b.t0 && t < b.t1) ?? beats[beats.length - 1];
const proj = (p) => { const v = new THREE.Vector3(...p).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
const hopArc = (u, h) => h * 4 * u * (1 - u);
const aspect = W / H, fov = 36, dist = Math.max(1.45 / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect), 2.4);
const CAM = [0.02, 0.66, dist];
// idle gaze: small saccades around the camera every second or so
const SAC = Array.from({ length: Math.ceil(TL.duration) + 2 }, () => [(R() - 0.5) * 0.25, (R() - 0.5) * 0.12]);

// dance formation: alternate letters left / right of the host, outer ones further back
function slotOf(k, n) {
  const left = k < Math.ceil(n / 2), i = left ? Math.ceil(n / 2) - 1 - k : k - Math.ceil(n / 2);
  return [left ? -0.72 - i * 0.62 : 1.05 + i * 0.58, 0, -0.6 - i * 0.35];
}

// ------------------------------------------------------------------ letters (toy physics)
function letterState(b, t) {
  // materialise above the slot, drop, bounce and rock; at the end hop back to the shelf
  if (t < b.reveal + 0.1) return null;
  const s = { pos: [...SLOT], rot: [0, 0.06 * Math.sin(b.idx * 2.1), 0], opacity: ss(b.reveal + 0.1, b.reveal + 0.42, t), glow: win(b.reveal + 0.1, b.reveal + 0.3, b.tDrop, b.tDrop + 0.4, t) };
  const d = drop(Math.max(0, t - b.tDrop), b.y0, LETTER_DROP.e);
  s.pos[1] = t < b.tDrop ? b.y0 + 0.015 * Math.sin((t - b.reveal) * 9) : d.y;
  s.squash = d.squash;
  const land = b.tDrop + Math.sqrt((2 * b.y0) / 24.5);
  s.rot[0] = wobble(t - land, 0.06);
  if (t > b.exitT) {
    const u = clamp((t - b.exitT) / 0.75, 0, 1), e = easeIO(u);
    s.pos = [lerp(SLOT[0], b.shelf[0], e), hopArc(u, 0.16), lerp(SLOT[2], b.shelf[2], e)];
    s.rot = [wobble(t - b.exitT - 0.75, 0.05) - 0.15 * Math.sin(Math.PI * u), s.rot[1], 0];
    s.squash = bump(t, b.exitT + 0.75, 0.1) * 0.5;
  }
  return s;
}
function danceState(ch, k, n, t) {
  const target = slotOf(k, n), lb = letterBeats.find((b) => b.letter === ch);
  const beat = ((t - dance.t0) * TL.music.bpm) / 60;
  const arrive = dance.t0 + 0.2 + k * 0.12, arrived = arrive + 0.9;
  const s = { pos: [...target], rot: [0, 0, 0], opacity: 1, squash: 0, alive: cartoon ? ss(arrived, arrived + 0.4, t) : 0, beat };
  if (t < arrived) {
    if (lb) { // two hops from the shelf into the formation
      const u = clamp((t - arrive) / 0.9, 0, 1), hop = u < 0.5 ? u * 2 : u * 2 - 1;
      const from = lb.shelf;
      s.pos = [lerp(from[0], target[0], easeIO(u)), hopArc(hop, 0.2), lerp(from[2], target[2], easeIO(u))];
      s.rot[2] = 0.1 * Math.sin(u * Math.PI * 2);
    } else { // a new letter materialises and drops in place
      const d = drop(Math.max(0, t - (arrive + 0.35)), 0.35, 0.28);
      s.opacity = ss(arrive, arrive + 0.3, t); s.pos[1] = t < arrive + 0.35 ? 0.35 : d.y; s.squash = d.squash; s.glow = win(arrive, arrive + 0.2, arrive + 0.4, arrive + 0.7, t);
    }
    return s;
  }
  // rhythmic hops on the beat, alternating tilt, squash on each landing
  const ph = beat + (k % 2) * 0.5, u = ph - Math.floor(ph);
  s.pos[1] = hopArc(u, 0.075) + (cartoon ? 0.21 * s.alive : 0);
  s.rot = [0, 0, (Math.floor(ph) % 2 ? 1 : -1) * 0.1 * Math.sin(Math.PI * u)];
  s.squash = u < 0.12 ? Math.sin((Math.PI * u) / 0.12) * 0.6 : 0;
  return s;
}

// ------------------------------------------------------------------ host performance
function hostT(t) {
  const sac = SAC[Math.floor(t * 0.8)] ?? [0, 0];
  const T = { pos: HOST, yaw: -0.08, sit: 0, bow: 0, lift: 0, liftWave: 0, hop: 0, crouch: 0, tilt: 0, nod: 0, pant: 0.3, squint: 0, perk: 0, excite: 0.35, blink: blinkAt(t),
    look: [CAM[0] + sac[0], CAM[1] + sac[1], CAM[2]] };
  const talk = mouthOf(t, 'host');
  T.mouth = talk * 0.9;
  if (voAt(t, 'host')) T.pant = 0;
  const lookAt = (p, w) => { if (w > 0.001) T.look = T.look.map((v, i) => lerp(v, p[i], w)); };
  for (const b of beats) {
    if (b.type === 'intro') {
      T.lift = Math.max(T.lift, win(b.waveT[0], b.waveT[0] + 0.3, b.waveT[1] - 0.3, b.waveT[1], t)); T.liftWave = 1;
      T.squint = Math.max(T.squint, win(b.t0 + 0.7, b.t0 + 0.9, b.t0 + 1.6, b.t0 + 1.9, t));
      T.excite = Math.max(T.excite, win(b.t0, b.t0 + 0.3, b.t1 - 0.5, b.t1, t) * 0.75);
    } else if (b.type === 'letter') {
      if (t < b.reveal - 0.5 || t > b.t1 + 0.5) continue;
      const curious = win(b.reveal + 0.1, b.reveal + 0.35, b.wordT + b.wordDur, b.wordT + b.wordDur + 0.35, t);
      lookAt([SLOT[0], 0.42, SLOT[2]], curious); T.perk = Math.max(T.perk, curious);
      T.crouch += 0.6 * bump(t, b.tDrop + 0.17, 0.25);                       // startle at the thud
      T.crouch += 0.9 * win(b.cheerT - 0.18, b.cheerT - 0.06, b.cheerT - 0.02, b.cheerT + 0.02, t); // anticipation
      T.hop = Math.max(T.hop, hopArc(clamp((t - b.cheerT) / 0.32, 0, 1), 0.07) * (t > b.cheerT && t < b.cheerT + 0.32 ? 1 : 0));
      T.crouch += 0.7 * bump(t, b.cheerT + 0.32, 0.16);                     // landing
      const cheer = win(b.cheerT - 0.1, b.cheerT + 0.05, b.cheerT + 0.7, b.cheerT + 1.0, t);
      T.squint = Math.max(T.squint, cheer); T.excite = Math.max(T.excite, cheer);
      if (b.barkT) T.mouth = Math.max(T.mouth, bump(t, b.barkT, 0.13), bump(t, b.barkT + 0.2, 0.13));
      if (b.askT) {
        const ask = win(b.askT - 0.1, b.askT + 0.35, b.waitT[1] - 0.2, b.waitT[1] + 0.2, t);
        T.tilt += 0.32 * ask; T.perk = Math.max(T.perk, ask); T.pant = Math.max(T.pant, 0.5 * win(b.waitT[0], b.waitT[0] + 0.2, b.waitT[1] - 0.2, b.waitT[1], t));
      }
      if (b.praiseT) T.squint = Math.max(T.squint, win(b.praiseT, b.praiseT + 0.15, b.praiseT + 0.8, b.praiseT + 1.0, t));
      if (b.P?.critter) lookAt(propPos(b, t), win(b.wordT + 0.3, b.wordT + 0.6, b.wordT + 1.4, b.wordT + 1.8, t) * 0.8);
      if (b.bonus && ballSim) {
        const bp = ballSim.at(t);
        if (bp) lookAt([bp[0], bp[1], 0.25], win(b.bonus.t + 0.2, b.bonus.t + 0.5, b.bonus.t + 2.1, b.bonus.t + 2.5, t));
        T.lift = Math.max(T.lift, 0.55 * win(b.bonus.t + 1.45, b.bonus.t + 1.65, b.bonus.t + 1.8, b.bonus.t + 2.1, t));
      }
    } else if (b.type === 'dance') {
      if (t < b.t0 - 0.5) continue;
      const beat = ((t - b.t0) * TL.music.bpm) / 60;
      const bow = win(b.t0 - 0.05, b.t0 + 0.25, b.t0 + 1.1, b.t0 + 1.5, t);
      T.bow = Math.max(T.bow, bow); T.excite = Math.max(T.excite, ss(b.t0 - 0.3, b.t0, t));
      T.sit = Math.max(T.sit, ss(b.t0 + 1.3, b.t0 + 1.8, t));
      T.pant = Math.max(T.pant, 0.75 * ss(b.t0 + 1.5, b.t0 + 2, t));
      T.squint = Math.max(T.squint, bow);
      T.nod += 0.05 * Math.sin(beat * Math.PI) * ss(b.t0 + 1.5, b.t0 + 2, t);
      const n = b.letters.length, k = Math.floor(beat / 2) % n;
      lookAt(slotOf(k, n).map((v, i) => (i === 1 ? 0.35 : v)), ss(b.t0 + 1.6, b.t0 + 2.1, t) * 0.75);
      T.lift = Math.max(T.lift, win(b.t1 - 1.6, b.t1 - 1.3, b.t1 - 0.5, b.t1 - 0.2, t)); T.liftWave = 1;
    } else if (b.type === 'outro') {
      if (t < b.t0 - 0.5) continue;
      T.sit = Math.max(T.sit, dance ? 1 : 0);
      T.lift = Math.max(T.lift, win(b.waveT[0], b.waveT[0] + 0.3, b.waveT[1] - 0.3, b.waveT[1], t)); T.liftWave = 1;
      T.squint = Math.max(T.squint, win(b.t0 + 0.1, b.t0 + 0.3, b.t0 + 1.0, b.t0 + 1.3, t));
      T.excite = Math.max(T.excite, 0.8);
    }
  }
  return T;
}

// word props: things drop beside the letter; animals leap out from behind it
function propPos(b, t) {
  const side = [SLOT[0] + b.L.w / 2 + (b.P.critter ? 0.32 : 0.12), 0, b.P.critter ? 0.22 : 0.2];
  if (!b.P.critter) return side;
  const u = clamp((t - (b.wordT + 0.05)) / 0.45, 0, 1), behind = [SLOT[0] + 0.05, 0, -0.45];
  const p = [lerp(behind[0], side[0], u), hopArc(u, 0.28), lerp(behind[2], side[2], u)];
  if (t > b.exitT) { const v = clamp((t - b.exitT) / 0.5, 0, 1); return [lerp(side[0], -2.6, v), hopArc(v, 0.22), lerp(side[2], 0.0, v)]; }
  return p;
}
function critterT(b) {
  return (t) => {
    const p = propPos(b, t), air = p[1] > 0.005;
    return { pos: p, yaw: t > b.exitT ? -1.4 : air ? -0.6 : 0.25, scale: b.P.scale, sit: air ? 0 : ss(b.wordT + 0.55, b.wordT + 0.85, t), hop: 0, look: [CAM[0], CAM[1], CAM[2]],
      mouth: mouthOf(t, 'cat'), blink: blinkAt(t + 0.9), excite: 0.4, perk: 0.6, tilt: 0.15 * Math.sin(t * 0.8), squint: b.meowT ? win(b.meowT, b.meowT + 0.1, b.meowT + 0.5, b.meowT + 0.7, t) * 0.6 : 0 };
  };
}
letterBeats.forEach((b) => { if (b.P?.critter) b.critT = critterT(b); });

// ------------------------------------------------------------------ frame
function renderAt(t) {
  set.update(t);
  const cur = beatOf(t);
  Object.values(LET).forEach((l) => (l.root.visible = false));

  // letters + props
  for (const b of letterBeats) {
    const inDance = dance && t >= dance.t0 && dance.letters.some((l) => l.ch === b.letter);
    if (!inDance) { const s = letterState(b, t); if (s) b.L.update({ ...s, t }); }
    if (!b.P) continue;
    const o = b.P.obj;
    o.visible = t >= b.wordT - 0.05 && (!!b.P.critter ? t < b.exitT + 0.5 : true);
    if (!o.visible) continue;
    if (b.P.critter) { b.P.critter.update(t, b.critT); continue; }
    // dropped prop: falls beside the letter, then rides back to the shelf with it
    const d = drop(Math.max(0, t - b.wordT), PROP_DROP.y0, b.P.e ?? 0.3);
    let p = propPos(b, t); p = [p[0], d.y, p[2]];
    if (t > b.exitT) { const u = clamp((t - b.exitT) / 0.75, 0, 1); p = [lerp(p[0], b.shelf[0] + 0.3, easeIO(u)), hopArc(u, 0.14), lerp(p[2], b.shelf[2] + 0.1, easeIO(u))]; }
    if (inDance) o.visible = false;
    o.position.set(...p); o.rotation.set(wobble(t - b.wordT - 0.2, 0.1), -0.3, 0);
    o.scale.set(1 + d.squash * 0.04, 1 - d.squash * 0.08, 1 + d.squash * 0.04).multiplyScalar(b.P.scale);
    o.traverse((m) => { if (m.material && 'opacity' in m.material && m.isMesh) { m.material.transparent = t < b.wordT + 0.12; m.material.opacity = ss(b.wordT - 0.05, b.wordT + 0.12, t); } });
  }
  if (dance && t >= dance.t0) dance.letters.forEach((l, k) => LET[l.ch].update({ ...danceState(l.ch, k, dance.letters.length, t), t }));

  // ball
  if (ball) {
    const bp = ballSim.at(t);
    ball.visible = !!bp;
    if (bp) { ball.position.set(bp[0], bp[1], 0.25); ball.rotation.set(0, 0, bp[2]); }
  }

  // host
  host.update(t, hostT);
  contact.position.x = host.group.position.x; contact.position.z = host.group.position.z - 0.02;

  // bubbles drift up after the first letter
  const bOn = ss(firstLetter + 0.6, firstLetter + 1.6, t);
  BUB.forEach((b) => {
    const u = ((t + b.p) % b.T) / b.T, s = bOn * win(0, 0.08, 0.85, 1, u);
    b.m.visible = s > 0.01;
    b.m.position.set(b.x + Math.sin(t * 1.1 + b.p) * 0.1 + u * 0.3, 0.2 + u * 1.9, b.z); b.m.scale.setScalar(Math.max(0.001, s));
  });

  // ---- camera: handheld breathing, slow push-in at the end, focus pulls to new letters
  const hand = (f, a) => a * (Math.sin(t * f) * 0.6 + Math.sin(t * f * 2.31 + 1.7) * 0.3 + Math.sin(t * f * 5.13 + 0.4) * 0.1);
  const push = cur.type === 'outro' ? easeIO(ss(cur.t0, cur.t1, t)) * 0.35 : 0;
  if (qs.get('cam') === 'close') { camera.position.set(0.55, 0.78, 1.25); camera.lookAt(0.2, 0.62, 0.2); }
  else {
    camera.position.set(CAM[0] + hand(0.9, 0.012), CAM[1] + hand(1.13, 0.008), CAM[2] - push + hand(0.7, 0.01));
    camera.lookAt(CAM[0] + hand(1.31, 0.01), 0.56 + 0.04 * push + hand(1.07, 0.006), 0);
  }
  camera.fov = fov; camera.updateProjectionMatrix();
  const lf = letterBeats.reduce((m, b) => Math.max(m, win(b.reveal, b.reveal + 0.35, b.wordT, b.wordT + 0.5, t)), 0);
  const fHost = camera.position.distanceTo(new THREE.Vector3(HOST[0], 0.6, HOST[2])), fLet = camera.position.distanceTo(new THREE.Vector3(SLOT[0], 0.4, SLOT[2]));
  bokeh.uniforms.focus.value = lerp(fHost, fLet, lf);
  film.uniforms.time.value = t;
  composer.render();
  drawOverlay(t);
}

// ------------------------------------------------------------------ overlay
const SP = Array.from({ length: 34 }, () => ({ a: R() * Math.PI * 2, r: R(), s: 0.5 + R(), p: R() * 6, c: ['#fff6c8', '#ffe9f5', '#e0f6ff', '#ffffff'][Math.floor(R() * 4)] }));
function twinkle(x, y, r, a, c) {
  if (a <= 0.01) return;
  og.globalAlpha = Math.min(1, a);
  const gr = og.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(255,255,255,0)');
  og.fillStyle = gr; og.beginPath(); og.arc(x, y, r, 0, 7); og.fill();
  og.fillStyle = c; og.beginPath();
  og.moveTo(x - r * 1.6, y); og.quadraticCurveTo(x, y, x, y - r * 1.6); og.quadraticCurveTo(x, y, x + r * 1.6, y); og.quadraticCurveTo(x, y, x, y + r * 1.6); og.quadraticCurveTo(x, y, x - r * 1.6, y); og.fill();
  og.globalAlpha = 1;
}
function caption(text, x, y, size, n) {
  og.font = `${size}px "Fredoka"`; og.textAlign = 'left'; og.textBaseline = 'alphabetic'; og.lineJoin = 'round';
  const full = og.measureText(text).width;
  let cx = clamp(x - full / 2, W * 0.02, W * 0.98 - full);
  [...text].forEach((c, i) => {
    const k = clamp(n - i, 0, 1), w = og.measureText(c).width;
    if (k > 0) {
      const s = U.easeOutBack(k);
      og.save(); og.translate(cx + w / 2, y); og.scale(s, s);
      og.shadowColor = 'rgba(20,15,25,0.5)'; og.shadowBlur = size * 0.14; og.shadowOffsetY = size * 0.05;
      og.lineWidth = size * 0.15; og.strokeStyle = '#33292f'; og.strokeText(c, -w / 2, 0);
      og.shadowColor = 'transparent'; og.fillStyle = '#ffffff'; og.fillText(c, -w / 2, 0);
      og.restore();
    }
    cx += w;
  });
}
function drawOverlay(t) {
  og.clearRect(0, 0, W, H);
  for (const b of letterBeats) {
    if (t < b.reveal || t > b.t1) continue;
    const [lx, ly] = proj([SLOT[0], b.y0 + b.L.h * 0.5, SLOT[2]]);
    const u = clamp((t - b.reveal) / 0.7, 0, 1);
    if (u < 1) SP.forEach((s) => {
      const rr = (1 - u) * H * 0.22 * (0.3 + s.r);
      twinkle(lx + Math.cos(s.a + u * 3.5 * s.s) * rr, ly + Math.sin(s.a + u * 3.5 * s.s) * rr * 1.2, H * 0.006 * s.s, Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(t * 9 + s.p)), s.c);
    });
    if (b.caption && t >= b.wordT) {
      const [cx] = proj([SLOT[0], 0, SLOT[2]]), [, cy] = proj([SLOT[0], 0, 0.3]);
      const n = ((t - b.wordT) / (b.wordDur * 0.75)) * b.word.length, fade = 1 - ss(b.exitT, b.exitT + 0.25, t);
      og.globalAlpha = fade; caption(b.word.toUpperCase(), cx, Math.min(cy + H * 0.06, H * 0.95), Math.round(H * 0.075), n); og.globalAlpha = 1;
    }
  }
  const fill = (c, a) => { if (a > 0.001) { og.globalAlpha = Math.min(1, a); og.fillStyle = c; og.fillRect(0, 0, W, H); og.globalAlpha = 1; } };
  fill('#000000', 1 - ss(0, 0.45, t));
  fill('#ffffff', ss(TL.duration - 0.5, TL.duration, t));
}

window.renderAt = renderAt;
renderAt(0.01);
window.__ready = true;
