// Timeline-driven renderer. window.__TL (from plan.mjs) describes every beat; renderAt(t) draws one frame.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { sparkles } from '../../socky/src/sets.js';
import * as U from '../../socky/src/util.js';
import { Critter } from './critter.js';
import { Letter, makeProp, beachBall, bubble } from './props.js';
import { buildMeadow } from './meadow.js';

const { clamp, lerp, ss, win, easeOutBack } = U;
const TL = window.__TL;
const qs = new URLSearchParams(location.search);
const W = +qs.get('w') || TL.width, H = +qs.get('h') || TL.height;

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.appendChild(renderer.domElement);
const overlay = document.createElement('canvas'); overlay.width = W; overlay.height = H; document.body.appendChild(overlay);
const og = overlay.getContext('2d');

const camera = new THREE.PerspectiveCamera(36, W / H, 0.05, 400);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: +(qs.get('msaa') ?? 4) }));
const set = buildMeadow(new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);
const scene = set.scene;
const bokeh = new BokehPass(scene, camera, { focus: 2.7, aperture: 0.0016, maxblur: 0.006 });
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.18, 0.5, 0.96);
composer.addPass(new RenderPass(scene, camera)); if (qs.get('bokeh') !== '0') composer.addPass(bokeh); composer.addPass(bloom); composer.addPass(new OutputPass());
const bokehRender = bokeh.render.bind(bokeh);
bokeh.render = (...a) => {
  const hidden = [];
  scene.traverse((o) => { if (o.userData.noDepth && o.visible) { o.visible = false; hidden.push(o); } });
  const bg = scene.background; scene.background = null;
  bokehRender(...a);
  hidden.forEach((o) => (o.visible = true)); scene.background = bg;
};

// ------------------------------------------------------------------ cast
const font = new FontLoader().parse(await (await fetch('../fonts/Fredoka-Bold.typeface.json')).json());
document.fonts.add(await new FontFace('Fredoka', 'url(../fonts/Fredoka-Bold.ttf)').load());

const HOST = [0.2, 0, 0.05], SLOT = [-0.82, 0.01, -0.02];
const host = new Critter(TL.host.species, { ...(TL.host.fur && { fur: TL.host.fur }), accent: TL.host.accent });
scene.add(host.group);

const LET = {}; // one Letter per character, shared by its letter beat and the dance
const letterFor = (ch, color) => (LET[ch] ||= (() => { const l = new Letter(font, ch, color); scene.add(l.root); return l; })());
const beats = TL.beats.map((b) => {
  const B = { ...b };
  if (b.type === 'letter') {
    B.L = letterFor(b.letter, b.color);
    if (b.prop) { B.P = makeProp(b.prop, { emoji: b.emoji }); scene.add(B.P.obj); B.P.obj.visible = false; }
    if (b.bonus) { B.bonusObj = beachBall(0.15); scene.add(B.bonusObj); B.bonusObj.visible = false; }
    B.spark = sparkles({ count: 90, box: [-0.45, 0, -0.2, 0.45, 0.95, 0.25], colors: ['#ffffff', '#fff3b0', '#ffd0f0', b.color], size: 0.07, seed: 11 + b.idx, speed: 1.6 });
    B.spark.position.set(...SLOT); scene.add(B.spark);
  }
  if (b.type === 'dance') B.letters.forEach((l) => letterFor(l.ch, l.color));
  return B;
});
const hostSpark = sparkles({ count: 80, box: [-0.6, 0.1, -0.3, 0.6, 1.2, 0.4], colors: ['#ffffff', '#fff3b0', '#ffd6f5', '#c8f4ff'], size: 0.06, seed: 5, speed: 1.4 });
hostSpark.position.set(...HOST); scene.add(hostSpark);
const confetti = sparkles({ count: 140, box: [-2, 0.2, -1, 2, 1.8, 0.6], colors: ['#ff7eb6', '#ffd23f', '#7fd4ff', '#a8f07a', '#c77dff'], size: 0.06, seed: 55, speed: 2 });
scene.add(confetti);

const R = U.rng(3);
const BUB = Array.from({ length: 14 }, (_, i) => ({ m: bubble(0.04 + R() * 0.05), x: (R() - 0.5) * 3.6, z: -1.2 + R() * 1.4, p: R() * 7, T: 5 + R() * 3 }));
BUB.forEach((b) => scene.add(b.m));
const firstLetter = beats.find((b) => b.type === 'letter')?.t0 ?? 0;
const dance = beats.find((b) => b.type === 'dance'), outro = beats.find((b) => b.type === 'outro');

// ------------------------------------------------------------------ helpers
const at = (t, a) => clamp(t - a, 0, 1e9);
const bump = (t, a, d) => (t > a && t < a + d ? Math.sin((Math.PI * (t - a)) / d) : 0);
const voAt = (t, who) => TL.vo.find((v) => v.who === who && t >= v.t && t < v.t + v.dur);
function mouthOf(t, who) {
  const v = voAt(t, who);
  if (!v) return 0;
  const u = t - v.t;
  if (v.env) return clamp(v.env[Math.min(v.env.length - 1, Math.floor(u * 100))] * 1.3, 0, 1);
  return 0.5 + 0.5 * Math.sin(u * 24) * Math.sin(u * 8.7);
}
const BLINKS = []; for (let x = 1.3; x < TL.duration; x += 2.4 + R() * 1.8) BLINKS.push(x);
const blinkAt = (t) => BLINKS.reduce((m, b) => Math.max(m, win(b, b + 0.05, b + 0.1, b + 0.17, t)), 0);
const beatOf = (t) => beats.find((b) => t >= b.t0 && t < b.t1) ?? beats[beats.length - 1];
const proj = (p) => { const v = new THREE.Vector3(...p).project(camera); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };

// framing: keep ~3.2 units of the performance plane in view at any aspect
const aspect = W / H, halfW = 1.45, fov = 36;
const dist = Math.max(halfW / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect), 2.4);

// dance formation: alternate letters left / right of the host, outer ones further back
function slotOf(k, n) {
  const left = k < Math.ceil(n / 2), i = left ? Math.ceil(n / 2) - 1 - k : k - Math.ceil(n / 2);
  return { left, pos: [left ? -0.5 - i * 0.56 : 0.92 + i * 0.5, 0, -0.22 - i * 0.32] };
}

// ------------------------------------------------------------------ frame
function renderAt(t) {
  set.update(t);
  const cur = beatOf(t);
  Object.values(LET).forEach((l) => (l.root.visible = false));
  const hs = { pos: [...HOST], t, wag: 0.35, wagSpeed: 8, earFlop: 0.4, look: [0, 0], blink: blinkAt(t), mouth: mouthOf(t, 'host'), grin: 1, headYaw: 0, headRoll: 0, headPitch: 0, happy: 0 };
  hs.headPitch += 0.03 * Math.sin(t * 1.3); hs.headRoll += 0.03 * Math.sin(t * 0.9);

  // ---- letter beats
  for (const b of beats.filter((x) => x.type === 'letter')) {
    const L = b.L, live = t >= b.t0 - 0.1 && t < b.t1 + 0.1;
    b.spark.visible = live;
    if (b.P) b.P.obj.visible = false;
    if (!live) continue;
    const appear = ss(b.reveal + 0.12, b.reveal + 0.6, t) * (1 - ss(b.exitT, b.exitT + 0.35, t));
    L.update({ pos: SLOT, appear, t, glow: Math.exp(-at(t, b.reveal + 0.3) * 3) * ss(b.reveal, b.reveal + 0.3, t) });
    b.spark.material.uniforms.time.value = t;
    b.spark.material.uniforms.opacity.value = win(b.reveal, b.reveal + 0.2, b.reveal + 0.8, b.reveal + 1.6, t) + 0.6 * win(b.exitT, b.exitT + 0.1, b.exitT + 0.3, b.exitT + 0.6, t);
    // word prop
    if (b.P) {
      const pa = ss(b.wordT, b.wordT + 0.35, t) * (1 - ss(b.exitT, b.exitT + 0.3, t)), o = b.P.obj;
      o.visible = pa > 0.001;
      if (b.P.place === 'peek') {
        const up = easeOutBack(clamp((t - b.wordT) / 0.5, 0, 1)) * (1 - ss(b.exitT, b.exitT + 0.3, t));
        o.position.set(SLOT[0] + 0.02, lerp(L.h - 0.4, L.h - 0.08, up), lerp(-0.3, -0.06, up));
        o.scale.setScalar(Math.max(0.001, b.P.scale * Math.max(0.001, up)));
        b.P.critter.update({ pos: o.position.toArray(), scale: b.P.scale * Math.max(0.001, up), sit: 1, t, mouth: mouthOf(t, 'cat'), blink: blinkAt(t + 0.7), happy: win(b.meowT, b.meowT + 0.1, b.meowT + 0.6, b.meowT + 0.8, t), headRoll: 0.18 * Math.sin(t * 1.5), wag: 0.5, look: [0.3, 0], wave: b.meowT ? win(b.meowT + 0.4, b.meowT + 0.7, b.exitT - 0.3, b.exitT, t) * 0.8 : 0, wavePh: t * 8 });
      } else {
        const s = Math.max(0.001, easeOutBack(pa)) * b.P.scale;
        o.position.set(SLOT[0] + L.w / 2 + 0.1, 0, 0.2); o.scale.setScalar(s); o.rotation.y = -0.3 + Math.sin(t * 1.5) * 0.1;
        if (b.P.critter) b.P.critter.update({ pos: o.position.toArray(), yaw: 0.3, scale: s, sit: 1, t, blink: blinkAt(t + 1.1), wag: 1, mouth: 0 });
      }
    }
    // host performance across the beat
    const toward = win(b.reveal + 0.1, b.reveal + 0.45, b.wordT + b.wordDur, b.wordT + b.wordDur + 0.35, t);
    hs.headYaw += -0.55 * toward; hs.look[0] -= 0.9 * toward; hs.earPerk = toward;
    const ch = win(b.cheerT, b.cheerT + 0.1, b.cheerT + 0.6, b.cheerT + 0.85, t);
    if (b.barkT) hs.mouth = Math.max(hs.mouth, bump(t, b.barkT, 0.15), bump(t, b.barkT + 0.2, 0.15));
    hs.hop = 0.12 * bump(t, b.cheerT, 0.42); hs.happy = Math.max(hs.happy, ch); hs.wag = lerp(hs.wag, 1, ch); hs.wagSpeed = lerp(8, 16, ch);
    hs.squash = 0.06 * (bump(t, b.cheerT - 0.08, 0.1) + bump(t, b.cheerT + 0.4, 0.12));
    if (b.askT) {
      const ask = win(b.askT - 0.1, b.askT + 0.3, b.waitT[1] - 0.2, b.waitT[1] + 0.2, t);
      hs.headRoll += 0.26 * ask; hs.earPerk = Math.max(hs.earPerk ?? 0, ask); hs.brow = ask;
      const wait = win(b.waitT[0], b.waitT[0] + 0.2, b.waitT[1] - 0.2, b.waitT[1], t);
      hs.headPitch += 0.08 * wait * Math.sin((t - b.waitT[0]) * 7); hs.mouth = Math.max(hs.mouth, 0.25 * wait);
    }
    if (b.praiseT) hs.happy = Math.max(hs.happy, win(b.praiseT, b.praiseT + 0.1, b.praiseT + 0.8, b.praiseT + 1, t));
  }
  // bonus ball: rolls in, bounces and stays for the rest of the film
  for (const b of beats.filter((x) => x.bonusObj)) {
    const o = b.bonusObj, u = t - b.bonus.t;
    o.visible = u > 0;
    if (u <= 0) continue;
    const away = dance ? ss(dance.t0 - 0.2, dance.t0 + 0.8, t) : 0;
    const x = lerp(2.5, 1.08, 1 - Math.pow(1 - clamp(u / 1.5, 0, 1), 3)) + away * 1.8;
    const hop = [0.55, 0.95, 1.25, 1.45].reduce((y, d, k, a) => { const p = k ? a[k - 1] : 0; return u > p && u <= d ? 0.35 * Math.pow(0.55, k) * Math.sin((Math.PI * (u - p)) / (d - p)) : y; }, 0);
    o.position.set(x, 0.15 + hop, 0.25); o.rotation.z = (2.5 - x) / 0.15;
    const look = win(b.bonus.t + 0.2, b.bonus.t + 0.6, b.bonus.t + 2.0, b.bonus.t + 2.4, t);
    hs.headYaw += 0.45 * look; hs.look[0] += 0.8 * look;
    hs.tap = bump(t, b.bonus.t + 1.55, 0.5);
  }
  // ---- intro / dance / outro
  for (const b of beats) {
    if (b.type === 'intro') {
      const w = win(b.waveT[0], b.waveT[0] + 0.3, b.waveT[1] - 0.3, b.waveT[1], t);
      hs.wave = Math.max(hs.wave ?? 0, w); hs.wavePh = t * 9;
      hs.happy = Math.max(hs.happy, win(b.t0 + 0.9, b.t0 + 1.0, b.t0 + 1.5, b.t0 + 1.6, t));
      hostSpark.material.uniforms.opacity.value = win(b.t0, b.t0 + 0.3, b.t0 + 1.4, b.t0 + 2.4, t);
    }
    if (b.type === 'dance' || b.type === 'outro') {
      const on = ss(b.t0, b.t0 + 0.6, t);
      if (t < b.t0) continue;
      const beat = ((t - b.t0) * TL.music.bpm) / 60;
      if (b.type === 'dance') {
        hs.sit = Math.max(hs.sit ?? 0, on); hs.wag = 1; hs.wagSpeed = 14;
        hs.headRoll += 0.12 * Math.sin(beat * Math.PI) * on; hs.hop = Math.max(hs.hop ?? 0, 0.025 * Math.abs(Math.sin(beat * Math.PI)) * on);
        hs.wave = Math.max(hs.wave ?? 0, win(b.t0 + 0.6, b.t0 + 0.9, b.t1 - 0.4, b.t1, t)); hs.wavePh = beat * Math.PI;
        confetti.material.uniforms.opacity.value = win(b.t0, b.t0 + 0.3, b.t0 + 2.5, b.t0 + 4, t);
        // letters march in from both sides and dance around the host
        const n = b.letters.length;
        b.letters.forEach((l, k) => {
          const { left, pos } = slotOf(k, n), walk = ss(b.t0 + 0.1 + k * 0.08, b.t0 + 1.3 + k * 0.08, t);
          LET[l.ch].update({ pos: [lerp(left ? -3 : 3, pos[0], walk), 0, pos[2]], appear: 1, scale: 0.62, alive: 1, dance: 1, beat: beat + k * 0.5, t, yaw: (left ? 0.3 : -0.3) * (1 - walk) });
        });
      } else {
        hs.wave = Math.max(hs.wave ?? 0, win(b.waveT[0], b.waveT[0] + 0.3, b.waveT[1] - 0.3, b.waveT[1], t)); hs.wavePh = t * 10;
        hs.happy = Math.max(hs.happy, win(b.t0 + 0.2, b.t0 + 0.3, b.t0 + 1.0, b.t0 + 1.1, t));
      }
    }
  }
  // dance letters keep dancing through the outro
  if (dance && outro && t >= outro.t0) {
    const beat = ((t - dance.t0) * TL.music.bpm) / 60, n = dance.letters.length;
    hs.sit = 1;
    dance.letters.forEach((l, k) => LET[l.ch].update({ pos: slotOf(k, n).pos, appear: 1, scale: 0.62, alive: 1, dance: 1, beat: beat + k * 0.5, t }));
  }
  host.update(hs);

  // bubbles drift up after the first letter
  const bOn = ss(firstLetter + 0.6, firstLetter + 1.6, t);
  BUB.forEach((b) => {
    const u = ((t + b.p) % b.T) / b.T, s = bOn * win(0, 0.08, 0.85, 1, u);
    b.m.visible = s > 0.01;
    b.m.position.set(b.x + Math.sin(t * 1.3 + b.p) * 0.12, 0.25 + u * 1.9, b.z); b.m.scale.setScalar(Math.max(0.001, s));
  });
  confetti.material.uniforms.time.value = t; hostSpark.material.uniforms.time.value = t;

  // ---- camera: locked-off wide with a slow breathing drift
  const push = cur.type === 'outro' ? ss(cur.t0, cur.t1, t) * 0.35 : 0;
  camera.position.set(0.02 + 0.03 * Math.sin(t * 0.21), 0.66 + 0.015 * Math.sin(t * 0.33), dist - push + 0.04 * Math.sin(t * 0.17));
  camera.lookAt(0.02, 0.56 + 0.04 * push, 0); camera.fov = fov; camera.updateProjectionMatrix();
  bokeh.uniforms.focus.value = camera.position.distanceTo(new THREE.Vector3(...HOST));
  composer.render();
  drawOverlay(t, cur);
}

// ------------------------------------------------------------------ overlay
const SP = Array.from({ length: 46 }, () => ({ a: R() * Math.PI * 2, r: R(), s: 0.5 + R(), p: R() * 6, c: ['#fff6c8', '#ffd6f5', '#c8f4ff', '#ffffff'][Math.floor(R() * 4)] }));
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
      const s = easeOutBack(k);
      og.save(); og.translate(cx + w / 2, y); og.scale(s, s);
      og.shadowColor = 'rgba(30,20,40,0.45)'; og.shadowBlur = size * 0.12; og.shadowOffsetY = size * 0.05;
      og.lineWidth = size * 0.16; og.strokeStyle = '#3b2f3a'; og.strokeText(c, -w / 2, 0);
      og.shadowColor = 'transparent'; og.fillStyle = '#ffffff'; og.fillText(c, -w / 2, 0);
      og.restore();
    }
    cx += w;
  });
}
function drawOverlay(t, cur) {
  og.clearRect(0, 0, W, H);
  for (const b of beats) {
    if (b.type !== 'letter' || t < b.reveal || t > b.t1) continue;
    // swirl of twinkles as the letter materialises
    const [lx, ly] = proj([SLOT[0], b.L.h * 0.5, SLOT[2]]);
    const u = clamp((t - b.reveal) / 0.9, 0, 1);
    if (u < 1) SP.forEach((s) => {
      const rr = (1 - u) * H * 0.28 * (0.3 + s.r);
      twinkle(lx + Math.cos(s.a + u * 4 * s.s) * rr, ly + Math.sin(s.a + u * 4 * s.s) * rr * 1.2, H * 0.008 * s.s, Math.sin(Math.PI * u) * (0.7 + 0.3 * Math.sin(t * 9 + s.p)), s.c);
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
  const vg = og.createRadialGradient(W / 2, H * 0.5, H * 0.45, W / 2, H * 0.5, H * 1.0);
  vg.addColorStop(0, 'rgba(40,20,10,0)'); vg.addColorStop(1, 'rgba(40,20,10,0.22)');
  og.fillStyle = vg; og.fillRect(0, 0, W, H);
}

window.renderAt = renderAt;
renderAt(0.01);
window.__ready = true;
