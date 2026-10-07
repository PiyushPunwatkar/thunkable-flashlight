import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sock, sockMaterials } from './socky.js';
import { buildBedroom, buildUnderBed, buildGarden } from './sets.js';
import * as U from './util.js';

const { kf, clamp, lerp, ss, win, easeOutBack } = U;
const qs = new URLSearchParams(location.search);
const W = +qs.get('w') || 540, H = +qs.get('h') || 960;

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);
const overlay = document.createElement('canvas'); overlay.width = W; overlay.height = H; document.body.appendChild(overlay);
const og = overlay.getContext('2d');

const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 700);
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: +(qs.get('msaa') ?? 4) });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bokeh = new BokehPass(new THREE.Scene(), camera, { focus: 6, aperture: 0.002, maxblur: 0.008 });
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.6, 0.85);
composer.addPass(renderPass); if (qs.get('bokeh') !== '0') composer.addPass(bokeh); composer.addPass(bloom); composer.addPass(new OutputPass());
// keep glow sprites / particles / sky out of the depth pass so they don't get hard DOF edges
const bokehRender = bokeh.render.bind(bokeh);
bokeh.render = (...a) => {
  const hidden = [];
  bokeh.scene.traverse((o) => { if (o.userData.noDepth && o.visible) { o.visible = false; hidden.push(o); } });
  const bg = bokeh.scene.background; bokeh.scene.background = null;
  bokehRender(...a);
  hidden.forEach((o) => (o.visible = true)); bokeh.scene.background = bg;
};

const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ------------------------------------------------------------------ assets
const mats = sockMaterials(U.stripeTex(), U.knitBump());
const socky = new Sock(mats);
const friend = new Sock(mats);
const A = buildBedroom(env), B = buildUnderBed(env), C = buildGarden(env);
// particle sizes are in pixels: keep them proportional to the output height
for (const sc of [A.scene, B.scene, C.scene]) sc.traverse((o) => { if (o.material?.uniforms?.scaleH) o.material.uniforms.scaleH.value = 1.5 * H; });

// ------------------------------------------------------------------ hop tracks
const EVENTS = [];
const ev = (t, type, o = {}) => EVENTS.push({ t: +t.toFixed(3), type, ...o });

class Track {
  constructor(name, p0) { this.name = name; this.p0 = p0; this.h = []; }
  last() { return this.h.length ? this.h[this.h.length - 1].to : this.p0; }
  hop(t0, d, to, h = 0.6, o = {}) { this.h.push({ t0, t1: t0 + d, from: this.last(), to, h, k: 1, ...o }); return this; }
  chain(t0, n, d, gap, to, h = 0.6, o = {}) {
    const from = this.last();
    for (let i = 1; i <= n; i++) this.hop(t0 + (i - 1) * (d + gap), d, from.map((v, j) => lerp(v, to[j], i / n)), h, o);
    return this;
  }
  eval(t) {
    let pos = this.p0, sq = 0, jx = 0, jy = 0, air = 0, dir = null;
    for (const hp of this.h) {
      if (t >= hp.t1) pos = hp.to;
      else if (t >= hp.t0) {
        const u = (t - hp.t0) / (hp.t1 - hp.t0);
        pos = hp.from.map((v, j) => lerp(v, hp.to[j], u));
        pos = [pos[0], pos[1] + 4 * hp.h * u * (1 - u), pos[2]];
        air = Math.sin(Math.PI * u); sq += 0.12 * hp.k * air; jy += 0.4 * air * hp.k;
      }
      if (t >= hp.t0 - 0.5 && t < hp.t1 + 0.1) dir = Math.atan2(hp.to[0] - hp.from[0], hp.to[2] - hp.from[2]);
      const a = (t - (hp.t0 - 0.14)) / 0.14;
      if (a > 0 && a < 1) sq -= 0.16 * hp.k * Math.sin(Math.PI * a);
      const tau = t - hp.t1;
      if (tau >= 0 && tau < 0.9) {
        const e = Math.exp(-4.5 * tau);
        sq -= 0.22 * hp.k * Math.sin(Math.PI * tau / 0.18) * Math.exp(-5 * tau);
        jx += 0.25 * hp.k * e * Math.sin(24 * tau); jy -= 0.45 * hp.k * e * Math.cos(17 * tau);
      }
    }
    return { pos: [...pos], sy: 1 + sq, jig: [jx, jy], air, dir };
  }
  emit() { for (const hp of this.h) { ev(hp.t0, 'takeoff', { who: this.name, k: hp.k, big: !!hp.big }); ev(hp.t1, 'land', { who: this.name, k: hp.k, soft: !!hp.soft, big: !!hp.big }); } }
}

// ---------- Scene A: bedroom (0 - 10.1)
const BASKET = [1.0, 0, 0.6];
const sA = new Track('socky', [1.0, 1.95, 0.6])
  .hop(6.7, 0.55, [-1.2, 0, 2.9], 2.0, { big: true, boing: true })
  .hop(7.55, 0.42, [-1.5, 0, 0.9], 0.55)
  .hop(8.1, 0.42, [-1.8, 0, -1.2], 0.55)
  .hop(8.65, 0.42, [-2.1, 0, -3.3], 0.55)
  .hop(9.2, 0.42, [-2.4, 0, -5.8], 0.45);

// ---------- Scene B: under the bed (10.1 - 29.95)
const sB = new Track('socky', [-1.0, 0, 0.6])
  .chain(11.4, 8, 0.34, 0.075, [7.4, 0, 0.6], 0.26, { k: 0.5, soft: true })
  .hop(14.82, 0.22, [7.4, 0, 0.6], 0.12, { k: 0.6, soft: true })
  .chain(16.95, 6, 0.4, 0.07, [15.6, 0, 0.5], 0.5, { k: 0.8 })
  .hop(21.2, 0.38, [15.9, 0, 0.1], 0.3, { k: 0.6, soft: true })
  .hop(21.9, 0.38, [16.15, 0, -0.3], 0.3, { k: 0.6, soft: true })
  .hop(24.22, 0.3, [15.85, 0, -0.3], 0.18, { k: 0.6 })
  .hop(25.0, 0.35, [16.1, 0, -0.32], 0.15, { k: 0.5 })
  .chain(27.5, 5, 0.42, 0.06, [23.6, 0, 0.15], 0.55);
const fB = new Track('friend', [17.2, 0, -0.35])
  .hop(25.0, 0.35, [16.92, 0, -0.32], 0.15, { k: 0.5 })
  .chain(27.56, 5, 0.42, 0.06, [24.2, 0, -0.75], 0.55);
const SPIN = [25.95, 27.35];
const CNT = [34.0, 35.0, 36.0, 37.0, 38.0];
const STARS = [52.7, 53.36, 54.02, 54.68, 55.34, 56.0];

// ---------- Scene C: garden (29.95 - 60)
const sC = new Track('socky', [-3.4, 0, 0.6])
  .hop(30.0, 0.42, [-2.0, 0, 0.3], 0.6)
  .hop(30.5, 0.42, [-0.5, 0, 0.0], 0.6);
CNT.forEach((c) => sC.hop(c - 0.36, 0.36, [-0.5, 0, 0.0], 0.32, { k: 0.8 }));
sC.hop(39.4, 0.55, [-0.5, 0, 0.0], 1.0, { big: true })
  .hop(48.62, 0.55, [-0.5, 0, 0.0], 1.0, { big: true })
  .chain(56.25, 2, 0.42, 0.08, [-0.5, 0, -2.0], 0.55)
  .hop(57.35, 0.38, [-0.45, 0, -2.0], 0.3, { k: 0.7 });
const fC = new Track('friend', [-3.0, 0, 0.2])
  .hop(30.1, 0.42, [-1.0, 0, 0.0], 0.6)
  .hop(30.6, 0.42, [0.5, 0, -0.2], 0.6);
CNT.forEach((c) => fC.hop(c - 0.3, 0.3, [0.5, 0, -0.2], 0.22, { k: 0.6 }));
fC.hop(39.5, 0.5, [0.5, 0, -0.2], 0.8, { big: true })
  .hop(48.75, 0.5, [0.5, 0, -0.2], 0.8, { big: true })
  .chain(56.35, 2, 0.42, 0.08, [0.7, 0, -2.5], 0.55);

for (const tr of [sA, sB, fB, sC, fC]) tr.emit();

// ball bounce plan (garden)
const BALLPOS = [[-1.2, 1.0], [-0.6, 1.15], [0, 1.25], [0.6, 1.15], [1.2, 1.0]];
const BALLAWAY = [[-3.2, -6.5], [-1.6, -8.5], [0.6, -9.5], [2.4, -8.0], [3.8, -6.8]];
CNT.forEach((c, i) => ev(c, 'ballBoing', { i }));
ev(39.95, 'ballsHappy');
ev(48.45, 'ballBoing', { i: 0, answer: true });
ev(47.95, 'ballBoing', { i: 0, soft: true });
STARS.forEach((c, i) => ev(c, 'starDing', { i }));
for (const [t, type, o] of [
  [0.2, 'ambience', {}], [1.05, 'rustle', {}], [2.35, 'rustle', {}], [3.4, 'sad', {}], [5.0, 'brave', {}],
  [9.45, 'whoosh', {}], [10.0, 'magic', {}], [12.9, 'snoreIn', {}], [14.78, 'snore', {}], [14.85, 'pop', { soft: true }], [15.0, 'wiggle', {}],
  [16.0, 'giggle', {}], [20.2, 'glint', {}], [20.55, 'gasp', {}], [23.05, 'tug', {}], [23.45, 'tug', {}], [23.85, 'tug', {}], [24.22, 'pop', {}],
  [24.55, 'blink', {}], [25.05, 'hug', {}], [25.95, 'spin', {}], [27.2, 'shimmerUp', {}], [29.4, 'magic', { big: true }],
  [39.45, 'confetti', {}], [40.85, 'appear', {}], [41.05, 'appear', {}], [41.25, 'appear', {}], [48.5, 'confetti', {}],
  [49.5, 'poof', {}], [50.2, 'twinkle', {}], [57.45, 'turn', {}], [59.5, 'chime', {}],
]) ev(t, type, o);

const VO = [
  ['n01', 2.6], ['n02', 11.0], ['n03', 25.05], ['n04', 30.45],
  ...CNT.map((c, i) => [`c${i + 1}`, c + 0.07]),
  ['s01', 39.45], ['n05', 41.4], ['n06', 43.5], ['n07', 48.55], ['n08', 49.85],
  ...STARS.map((c, i) => [`c${i + 1}`, c + 0.05]),
  ['n09', 56.72], ['giggle', 16.0],
];

// ------------------------------------------------------------------ helpers
const V = (a) => new THREE.Vector3(...a);
const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);
const camPos = () => camera.position.toArray();
const talk = (t, a, b) => (t > a && t < b ? 0.5 + 0.5 * Math.sin((t - a) * 26) * Math.sin((t - a) * 9.3) : 0);

// camera keys: [t, pos, target, fov, mode]; mode 'track' = near-constant speed on the segment ending at that key
const trackEase = (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) * 0.25;
function camKf(t, keys, sel) {
  if (t <= keys[0][0]) return sel(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1];
    if (t <= k1[0]) {
      const u = clamp((t - k0[0]) / (k1[0] - k0[0]), 0, 1), e = k1[4] === 'track' ? trackEase(u) : U.easeIO(u);
      const a = sel(k0), b = sel(k1);
      return Array.isArray(a) ? a.map((x, j) => lerp(x, b[j], e)) : lerp(a, b, e);
    }
  }
  return sel(keys[keys.length - 1]);
}
function setCam(t, keys, jitter = 1) {
  const p = camKf(t, keys, (k) => k[1]);
  const g = camKf(t, keys, (k) => k[2]);
  const f = camKf(t, keys, (k) => k[3] ?? 45);
  camera.position.set(p[0] + jitter * 0.03 * Math.sin(t * 0.7), p[1] + jitter * 0.025 * Math.sin(t * 0.9 + 1), p[2] + jitter * 0.02 * Math.sin(t * 0.5 + 2));
  camera.lookAt(g[0] + jitter * 0.02 * Math.sin(t * 0.6 + 0.5), g[1] + jitter * 0.02 * Math.sin(t * 0.8), g[2]);
  camera.fov = f; camera.updateProjectionMatrix();
  return { p, g };
}

function post(scene, { exposure = 1, bloomS = 0.3, bloomR = 0.5, bloomT = 0.85, focus = 6, aperture = 0.0012, maxblur = 0.006 }) {
  renderPass.scene = scene; bokeh.scene = scene;
  renderer.toneMappingExposure = exposure;
  bloom.strength = bloomS; bloom.radius = bloomR; bloom.threshold = bloomT;
  bokeh.uniforms.focus.value = focus; bokeh.uniforms.aperture.value = aperture; bokeh.uniforms.maxblur.value = maxblur;
}

const dist = (a) => camera.position.distanceTo(V(a));

// ------------------------------------------------------------------ scene A
function frameA(t) {
  const scene = A.scene; A.update(t);
  scene.add(socky.group); scene.remove(friend.group);
  const tr = sA.eval(t);
  let pos = tr.pos;
  if (t < 6.7) pos = [1.0, kf(t, [[0.9, 0.5], [1.6, 1.45], [2.1, 1.45], [2.6, 1.95], [6.3, 1.95], [6.45, 1.89], [6.7, 1.95]]), 0.6];
  const toCam = yawTo(pos, [1.6, 3, 8]);
  let yaw = toCam;
  if (t > 7.0) yaw = kf(t, [[7.0, -0.55], [7.3, -0.55], [7.6, Math.PI - 0.12], [9.6, Math.PI - 0.12]]);
  const look = [kf(t, [[1.6, 0], [1.9, -0.85], [2.4, -0.85], [2.75, 0.85], [3.15, 0.85], [3.45, -0.2], [4.3, -0.3], [5.1, 0.1], [5.7, 0], [6.2, -0.5]]),
    kf(t, [[3.2, 0], [3.5, -0.75], [4.6, -0.75], [5.1, 0.3], [5.8, 0.15], [6.3, -0.2]])];
  const sad = kf(t, [[3.25, 0], [3.65, 1], [4.6, 1], [5.05, 0]]);
  const brave = kf(t, [[4.8, 0], [5.3, 1]]);
  const excite = kf(t, [[5.5, 0], [5.75, 1], [6.4, 1], [6.6, 0.4], [7.3, 0.7], [8.0, 0.2]]);
  socky.update({
    pos, yaw, sy: tr.sy * (1 - 0.06 * sad) + 0.05 * win(4.9, 5.2, 5.4, 5.7, t) + 0.04 * win(1.5, 1.62, 1.7, 1.85, t),
    lean: 0.12 * sad + 0.12 * tr.air - 0.08 * win(5.0, 5.3, 5.6, 5.9, t),
    twist: kf(t, [[1.6, 0], [1.9, -0.35], [2.4, -0.35], [2.75, 0.35], [3.15, 0.35], [3.45, 0]]),
    side: -0.08 * win(4.9, 5.2, 5.6, 6.0, t),
    look, jig: tr.jig, sad, happy: 1 - sad, excite, curious: 0.4 * win(1.6, 1.9, 3.1, 3.4, t),
    blink: win(1.35, 1.4, 1.45, 1.5, t) + win(4.75, 4.8, 4.85, 4.9, t),
    eyeScale: 1 + 0.12 * brave * win(5.0, 5.3, 6.2, 6.6, t), blush: 0.5 + 0.4 * excite,
  });
  setCam(t, [
    [0, [1.9, 3.35, 8.8], [0.95, 2.35, 0.5], 42],
    [2.4, [1.65, 3.1, 7.3], [0.95, 2.6, 0.6], 38],
    [6.4, [1.35, 3.0, 6.7], [0.9, 2.55, 0.6], 37],
    [6.62, [1.3, 3.15, 7.3], [0.7, 2.85, 0.8], 41],
    [7.0, [0.7, 3.05, 8.6], [-0.2, 2.4, 1.8], 47],
    [7.45, [0.3, 2.5, 8.3], [-0.9, 1.2, 2.4], 46],
    [8.35, [-0.9, 2.1, 5.8], [-1.7, 1.0, -1.0], 44],
    [9.4, [-1.9, 1.45, 2.4], [-2.3, 0.95, -5.0], 44],
    [10.1, [-2.3, 1.1, -2.6], [-2.4, 0.9, -9], 46],
  ]);
  post(A.scene, { exposure: 1.0, bloomS: 0.22, bloomR: 0.5, bloomT: 0.92, focus: dist(socky.group.position.toArray().map((v, i) => v + [0, 1.2, 0][i])), aperture: 0.0016, maxblur: 0.007 });
}

// ------------------------------------------------------------------ scene B
const WRAP = [[-0.889, 0.382, 0], [-0.797, 1.08, 0.02], [-0.315, 1.5, 0.04], [0.315, 1.5, 0.05], [0.797, 1.08, 0.08], [0.906, 0.46, 0.18], [0.95, 0.27, 0.55]];
function frameB(t) {
  const scene = B.scene; B.update(t);
  scene.add(socky.group, friend.group);
  const tr = sB.eval(t), ft = fB.eval(t);
  const dn = B.dino.userData;
  // dino: breathing, snore bubble, wiggle
  const br = Math.sin(t * 2.4);
  dn.body.scale.set(1 + 0.025 * br, 1 + 0.035 * br, 1 + 0.025 * br);
  const wig = win(14.8, 14.9, 15.6, 15.9, t);
  dn.body.rotation.z = wig * 0.08 * Math.sin(t * 22);
  dn.body.rotation.x = wig * 0.05 * Math.sin(t * 17);
  dn.tail.rotation.y = 0.15 * Math.sin(t * 1.3) + wig * 0.5 * Math.sin(t * 15);
  dn.head.rotation.z = 0.04 * br + wig * 0.12;
  const bub = t < 14.8 ? 0.4 + 0.6 * ss(12.9, 14.75, t) * (0.8 + 0.2 * Math.sin(t * 2.4)) + 0.25 * Math.max(0, Math.sin(t * 2.4)) * (t < 12.9 ? 1 : 0) : Math.max(0, 1 - (t - 14.8) / 0.08) * 1.6;
  dn.bubble.scale.setScalar(Math.max(0.001, bub * 1.4)); dn.bubble.visible = bub > 0.02;
  // marble
  const mb = B.marble;
  const roll = ss(24.2, 26.6, t);
  mb.position.set(lerp(18.0, 21.6, roll), 0.62, lerp(-0.5, -2.6, roll));
  mb.rotation.set(0, 0, -roll * 6.0); mb.rotation.x = roll * 2;
  mb.userData.swirl.rotation.y = t * 0.3;
  mb.userData.glint.material.opacity = 0.5 + 0.5 * win(20.1, 20.3, 20.9, 21.6, t) + 0.2 * Math.sin(t * 5);
  mb.userData.glint.scale.setScalar(0.5 + 1.4 * win(20.1, 20.3, 20.6, 21.3, t));
  B.glints.material.uniforms.opacity.value = win(20.0, 20.25, 21.5, 23.0, t);
  // golden opening
  const gold = ss(26.8, 29.9, t);
  B.sunL.intensity = 140 * gold; B.openGlow.material.opacity = 0.9 * gold;

  // ---- socky
  let pos = tr.pos;
  let yaw = 0.35;
  const travelYaw = Math.PI / 2 - 0.75;
  yaw = kf(t, [[10.1, 0.25], [11.1, 0.5], [11.4, travelYaw], [14.7, travelYaw], [14.85, 0.75], [16.8, 0.6], [17.0, travelYaw], [20.0, travelYaw], [20.5, Math.PI / 2 - 0.45], [23.0, Math.PI / 2 - 0.25], [24.6, Math.PI / 2 - 0.65], [25.9, Math.PI / 2 - 0.65]]);
  const hugT = win(25.0, 25.3, 25.75, 26.0, t);
  // spin around each other
  const sp = clamp((t - SPIN[0]) / (SPIN[1] - SPIN[0]), 0, 1), spa = U.easeIO(sp) * Math.PI * 2;
  const mid = [16.51, 0, -0.32];
  let fpos = ft.pos;
  if (t > SPIN[0] && t < SPIN[1]) {
    const hopY = 0.22 * Math.abs(Math.sin(sp * Math.PI * 3));
    pos = [mid[0] - Math.cos(spa) * 0.41, hopY, mid[2] + Math.sin(spa) * 0.36];
    fpos = [mid[0] + Math.cos(spa) * 0.41, hopY, mid[2] - Math.sin(spa) * 0.36];
  }
  if (t > SPIN[0] && t < SPIN[1] + 0.2) yaw = Math.PI / 2 - 0.65 - spa;
  if (t >= 27.35) yaw = kf(t, [[27.35, Math.PI / 2 - 0.65 - Math.PI * 2], [27.55, travelYaw - Math.PI * 2]]);
  const tug = t > 23.0 && t < 24.22 ? Math.pow(Math.max(0, Math.sin(((t - 23.0) / 0.4) * Math.PI)), 0.7) : 0;
  const scaredB = win(14.8, 14.85, 15.55, 15.8, t);
  const gig = win(15.95, 16.1, 16.7, 16.9, t);
  const awe = win(10.1, 10.2, 11.0, 11.4, t);
  const notice = win(20.45, 20.6, 21.0, 21.3, t);
  const glow = 1 - ss(23.0, 23.3, t) + ss(24.3, 24.5, t);
  socky.update({
    pos, yaw,
    sy: tr.sy + 0.07 * scaredB + 0.06 * gig * Math.sin(t * 30) - 0.05 * tug,
    lean: 0.16 * win(11.3, 11.5, 14.5, 14.8, t) + 0.1 * tr.air - 0.38 * tug + 0.12 * hugT + 0.15 * notice - 0.1 * awe + 0.18 * win(22.35, 22.6, 22.8, 23.0, t),
    side: 0.03 * scaredB * Math.sin(t * 70) + 0.1 * gig * Math.sin(t * 12) - 0.12 * hugT,
    twist: -0.25 * win(11.8, 12.1, 12.5, 12.8, t) + 0.25 * win(13.0, 13.3, 13.6, 13.9, t),
    look: [0.7 * Math.sin(t * 2.3) * win(11.4, 11.6, 14.5, 14.7, t), 0.5 * awe - 0.15 * win(11.4, 11.6, 14.5, 14.7, t)],
    lookMix: 1 - win(14.75, 14.8, 16.0, 16.4, t) - win(20.3, 20.5, 23.9, 24.1, t) - win(24.3, 24.5, 25.9, 26.1, t),
    lookAt: win(14.75, 14.8, 16.0, 16.4, t) > 0 ? [8.6, 0.8, -3.0] : win(20.3, 20.5, 24.1, 24.3, t) > 0 ? [17.7, 0.8, -0.5] : friend.group.position.toArray().map((v, i) => v + [0, 1.2, 0][i]),
    jig: tr.jig, happy: 1 - scaredB, scared: scaredB, ooh: awe * 0.9 + notice, excite: 0.9 * gig + 0.7 * win(24.4, 24.6, 25.0, 25.2, t) + 0.8 * win(26.0, 26.2, 27.2, 27.5, t),
    squint: gig + 0.8 * hugT, eyeScale: 1 + 0.2 * scaredB + 0.18 * awe + 0.22 * notice,
    curious: 0.6 * win(11.4, 11.6, 14.4, 14.7, t), blush: 0.5 + 0.5 * (gig + hugT),
    blink: win(12.4, 12.45, 12.5, 12.55, t) + win(18.4, 18.45, 18.5, 18.55, t) + win(22.9, 22.95, 23.0, 23.05, t),
  });
  // ---- friend
  const unwrap = clamp(easeOutBack(clamp((t - 24.22) / 0.45, 0, 1)), 0, 1.15);
  const pull = t < 24.22 ? ss(23.0, 24.2, t) : 0;
  const spine = WRAP.map((p, i) => (i < 2 ? [p[0] - 0.22 * pull * (2 - i) - 0.06 * tug, p[1] - 0.05 * pull, p[2]] : p));
  let fy;
  if (t < 24.22) fpos = [18.0 - 0.1 * pull, 0, -0.5];
  else if (t < 25.0) fpos = [lerp(18.0, 17.2, ss(24.22, 24.55, t)), 0.25 * Math.sin(Math.PI * clamp((t - 24.22) / 0.33, 0, 1)), lerp(-0.5, -0.35, ss(24.22, 24.55, t))];
  fy = t < 24.22 ? 0 : kf(t, [[24.22, 0], [24.55, -Math.PI / 2 + 0.65]]);
  if (t > SPIN[0] && t < SPIN[1] + 0.2) fy = -Math.PI / 2 + 0.65 - spa;
  if (t >= 27.35) fy = kf(t, [[27.35, -Math.PI / 2 + 0.65 - Math.PI * 2], [27.6, travelYaw - Math.PI * 2]]);
  const fAwake = ss(24.45, 24.6, t);
  friend.update({
    pos: fpos, yaw: fy, sy: ft.sy * (t < 24.22 ? 1 : 1) + 0.12 * win(24.2, 24.3, 24.4, 24.6, t),
    spine, spineMix: 1 - unwrap, front: [0, 0.35, 1],
    lean: 0.12 * hugT + 0.1 * ft.air, side: 0.12 * hugT,
    lookAt: socky.group.position.toArray().map((v, i) => v + [0, 1.2, 0][i]), lookMix: t > 27.4 ? 0 : 1 - 0, look: [0.6, 0.05],
    jig: [ft.jig[0] + 0.3 * Math.exp(-5 * Math.max(0, t - 24.55)) * Math.sin(30 * (t - 24.55)) * (t > 24.55 ? 1 : 0), ft.jig[1]],
    blink: 1 - fAwake, happy: fAwake, sad: 0.4 * (1 - fAwake), squint: 0.8 * hugT,
    excite: 0.7 * win(24.6, 24.8, 25.0, 25.2, t) + 0.8 * win(26.0, 26.2, 27.2, 27.5, t), blush: 0.4 + 0.6 * hugT,
    eyeScale: 1 + 0.15 * win(24.5, 24.6, 24.8, 25.0, t), brows: fAwake,
  });
  // ---- camera
  const sx = pos[0];
  const cam = setCam(t, [
    [10.1, [-1.2, 0.9, 5.6], [-0.3, 3.0, -3.0], 52],
    [11.3, [-0.45, 1.5, 5.4], [-0.75, 1.4, 0], 48],
    [14.5, [7.7, 1.7, 5.7], [7.4, 1.3, 0], 48, 'track'],
    [15.1, [8.6, 1.9, 5.8], [8.1, 0.9, -1.2], 48],
    [16.8, [8.7, 1.9, 5.8], [8.2, 0.9, -1.2], 48],
    [19.8, [15.5, 1.7, 5.6], [15.4, 1.2, 0], 48, 'track'],
    [20.7, [16.9, 1.9, 7.4], [16.95, 0.95, -0.2], 50],
    [22.6, [17.3, 1.7, 6.2], [17.3, 0.95, -0.4], 50],
    [24.4, [16.6, 1.6, 5.4], [16.6, 0.95, -0.4], 48],
    [25.4, [16.5, 1.55, 4.6], [16.5, 1.05, -0.35], 44],
    [27.3, [16.6, 1.65, 4.9], [16.6, 1.05, -0.35], 46],
    [29.95, [22.6, 1.6, 4.9], [25.0, 1.5, -0.5], 46, 'track'],
  ]);
  const focusT = t < 20.4 || t > 21.1 ? socky.group.position.toArray() : [17.0, 0.6, -0.2];
  post(B.scene, { exposure: 1.05 + 0.5 * ss(28.4, 29.9, t), bloomS: 0.75 + 0.6 * gold, bloomR: 0.7, bloomT: 0.6, focus: dist([focusT[0], 1.0, focusT[2]]), aperture: 0.0022, maxblur: 0.009 });
}

// ------------------------------------------------------------------ scene C
function frameC(t) {
  const scene = C.scene;
  const dusk = ss(49.8, 51.6, t);
  C.update(t, dusk);
  scene.add(socky.group, friend.group);
  const tr = sC.eval(t), ft = fC.eval(t);
  const camP = camPos();
  // balls
  C.balls.forEach((b, i) => {
    const [bx, bz] = BALLPOS[i], c = CNT[i];
    let y = 0, x = bx, z = bz, sq = 0;
    const u = (t - (c - 0.55)) / 0.55;
    if (u > 0 && u < 1) y = 1.2 * 4 * u * (1 - u);
    const tau = t - c; if (tau > 0 && tau < 0.8) sq = 0.3 * Math.sin(Math.PI * tau / 0.16) * Math.exp(-6 * tau);
    const pre = (t - (c - 0.7)) / 0.15; if (pre > 0 && pre < 1) sq += 0.2 * Math.sin(Math.PI * pre);
    const hu = (t - 39.5) / 0.45; if (hu > 0 && hu < 1) y += 0.6 * 4 * hu * (1 - hu);
    // bounce away to the background
    const aw = clamp((t - (40.55 + i * 0.07)) / 0.9, 0, 1);
    if (aw > 0) { x = lerp(bx, BALLAWAY[i][0], aw); z = lerp(bz, BALLAWAY[i][1], aw); y += Math.abs(Math.sin(aw * Math.PI * 2)) * 0.9 * (1 - aw * 0.5); }
    if (i === 0) {
      const k1 = clamp((t - 47.55) / 0.4, 0, 1), k2 = clamp((t - 48.05) / 0.4, 0, 1);
      if (t > 47.55) { const p1 = [-1.9, -3.0]; x = lerp(BALLAWAY[0][0], p1[0], k1); z = lerp(BALLAWAY[0][1], p1[1], k1); y = 1.1 * 4 * k1 * (1 - k1); }
      if (t > 48.05) { x = lerp(-1.9, 0, k2); z = lerp(-3.0, 1.7, k2); y = 1.0 * 4 * k2 * (1 - k2); }
      const t3 = t - 48.45; if (t3 > 0 && t3 < 0.8) sq = 0.3 * Math.sin(Math.PI * t3 / 0.16) * Math.exp(-6 * t3);
      const k3 = clamp((t - 49.6) / 0.9, 0, 1);
      if (k3 > 0) { x = lerp(0, 4.5, k3); z = lerp(1.7, -3.5, k3); y = Math.abs(Math.sin(k3 * Math.PI * 2)) * 0.8; }
    }
    b.position.set(x, 0.25 + y - 0.25 * Math.max(0, sq) * 0.5, z);
    b.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
    b.rotation.set(t * 0.5 + i, i, aw * 8);
    const h = C.ballHalo[i];
    h.position.copy(b.position);
    const counted = ss(c - 0.05, c + 0.1, t) * (1 - ss(40.4, 40.8, t));
    h.material.opacity = 0.35 * counted + 0.7 * Math.exp(-4 * Math.max(0, t - c)) * (t > c ? 1 : 0) + (i === 0 ? 0.9 * Math.exp(-3 * Math.max(0, t - 48.45)) * (t > 48.45 ? 1 : 0) : 0);
    h.scale.setScalar(1.15 + 0.5 * Math.exp(-4 * Math.max(0, t - c)) * (t > c ? 1 : 0));
  });
  // riddle props
  const PP = [[-0.88, 2.05, 1.0], [0, 2.3, 1.1], [0.88, 1.6, 1.0]];
  C.props.forEach((p, i) => {
    const a = clamp(easeOutBack(clamp((t - (40.85 + i * 0.2)) / 0.45, 0, 1)), 0, 1.2) * (1 - ss(49.45 + i * 0.08, 49.8 + i * 0.08, t));
    p.visible = a > 0.001;
    const focusP = 0.12 * win(43.4 + i, 43.6 + i, 44.3 + i, 44.5 + i, t);
    p.scale.setScalar(Math.max(0.001, a * (1 + focusP)));
    p.position.set(PP[i][0], PP[i][1] + 0.08 * Math.sin(t * 2 + i * 2), PP[i][2]);
    p.rotation.y = 0.35 * Math.sin(t * 0.9 + i); p.rotation.z = i === 0 ? 0.12 * Math.sin(t * 1.3) : 0;
  });
  // sky stars
  C.skyStars.forEach((s, i) => {
    const x = -3.4 + i * 1.36, y = 9.4 + 1.3 * Math.sin(Math.PI * (i + 0.5) / 6), z = -15;
    s.position.set(x, y, z);
    const appear = ss(50.2 + i * 0.12, 50.9 + i * 0.12, t);
    const lit = ss(STARS[i] - 0.05, STARS[i] + 0.1, t);
    const flare = t > STARS[i] ? Math.exp(-4 * (t - STARS[i])) : 0;
    s.visible = appear > 0.001;
    s.scale.setScalar(Math.max(0.001, appear * (0.55 + 0.45 * lit + 0.35 * flare) * (1 + 0.04 * Math.sin(t * 3 + i))));
    s.userData.m.material.emissiveIntensity = 0.3 + 1.8 * lit + 2 * flare;
    s.userData.g.material.opacity = 0.12 * appear + 0.35 * lit + 0.5 * flare;
    s.rotation.z = 0.15 * Math.sin(t + i);
    s.lookAt(camera.position);
  });
  C.confetti.material.uniforms.opacity.value = win(39.45, 39.6, 40.6, 41.2, t) + win(48.5, 48.65, 49.6, 50.2, t);
  C.confetti.position.y = -0.5 + 0.6 * ((t > 48 ? t - 48.5 : t - 39.45) % 2);

  // ---- socky
  const lookCam = [camP[0], camP[1], camP[2]];
  let yaw = kf(t, [[29.95, Math.PI / 2 - 0.4], [30.9, 0.25], [56.1, 0.2], [56.3, Math.PI - 0.1], [57.3, Math.PI - 0.1], [57.75, 0.12]]);
  let fyaw = kf(t, [[29.95, Math.PI / 2 - 0.4], [31.0, -0.25], [56.1, -0.2], [56.4, Math.PI + 0.1]]);
  const ballLook = (who) => {
    for (let i = 4; i >= 0; i--) if (t > CNT[i] - 0.65 && t < CNT[i] + 0.35) return C.balls[i].position.toArray();
    return null;
  };
  const starLook = () => { for (let i = 5; i >= 0; i--) if (t > STARS[i] - 0.25) return C.skyStars[i].position.toArray(); return C.skyStars[2].position.toArray(); };
  let lookAt = lookCam;
  if (t < 32.3) lookAt = C.balls[2].position.toArray();
  if (t > 33.7 && t < 38.4) lookAt = ballLook() || lookCam;
  if (t > 41.3 && t < 43.4) lookAt = [0, 3.4, 1];
  if (t > 43.4 && t < 46.6) lookAt = C.props[Math.min(2, Math.floor((t - 43.4) / 1.05))].position.toArray();
  if (t > 46.6 && t < 47.9) lookAt = [-1.5, 3.2, 3];
  if (t > 47.9 && t < 48.6) lookAt = C.balls[0].position.toArray();
  if (t > 50.35 && t < 57.6) lookAt = t < 52.5 ? [0, 9.6, -15] : starLook();
  const excite = 0.8 * win(30.4, 30.6, 31.8, 32.2, t) + win(39.4, 39.5, 40.8, 41.0, t) + win(48.45, 48.6, 49.6, 49.9, t) + 0.8 * win(57.7, 57.9, 58.4, 58.6, t) + 0.9 * win(59.3, 59.45, 60, 61, t);
  const ooh = win(41.4, 41.55, 42.0, 42.3, t) + win(50.35, 50.6, 51.6, 52.1, t);
  const think = win(46.6, 46.9, 47.8, 48.0, t);
  const curious = 0.7 * win(32.4, 32.7, 33.7, 34.0, t) + 0.8 * win(43.4, 43.6, 46.4, 46.7, t) + think + 0.9 * win(58.4, 58.6, 59.2, 59.4, t) + 0.6 * win(38.0, 38.2, 39.2, 39.4, t);
  socky.update({
    pos: tr.pos, yaw, sy: tr.sy + 0.04 * Math.sin(t * 3) * win(38.0, 38.2, 39.2, 39.4, t),
    lean: 0.1 * tr.air - 0.18 * win(50.4, 50.7, 56.0, 56.2, t) + 0.06 * curious - 0.14 * win(57.75, 57.9, 60, 61, t),
    side: 0.13 * curious * (t > 58 ? -1 : 1) + 0.08 * think * Math.sin(t * 3) + 0.06 * Math.sin(t * 4) * win(57.9, 58.1, 58.4, 58.5, t),
    lookAt, look: [0, 0], lookMix: 0, jig: tr.jig,
    happy: 1, excite, ooh, curious, talk: talk(t, 39.45, 40.26), squint: 0.6 * win(39.9, 40.0, 40.4, 40.6, t),
    eyeScale: 1 + 0.15 * ooh + 0.08 * excite, blush: 0.6 + 0.4 * excite,
    blink: win(35.55, 35.6, 35.65, 35.7, t) + win(45.2, 45.25, 45.3, 45.35, t) + win(53.9, 53.95, 54.0, 54.05, t) + win(58.95, 59.0, 59.05, 59.1, t),
  });
  let flookAt = lookAt;
  if (t > 57.6) flookAt = C.skyStars[3].position.toArray();
  friend.update({
    pos: ft.pos, yaw: fyaw, sy: ft.sy, lean: 0.1 * ft.air - 0.18 * win(50.5, 50.8, 60, 61, t) + 0.05 * curious,
    side: -0.1 * curious, lookAt: flookAt, look: [0, 0], lookMix: 0, jig: ft.jig,
    happy: 1, excite: excite * 0.8, ooh: ooh * 0.8, curious: curious * 0.8, blush: 0.6 + 0.3 * excite,
    blink: win(36.85, 36.9, 36.95, 37.0, t) + win(44.6, 44.65, 44.7, 44.75, t) + win(55.0, 55.05, 55.1, 55.15, t),
  });
  // ---- camera
  setCam(t, [
    [29.95, [-1.8, 1.3, 6.4], [-1.0, 0.9, 0.3], 50],
    [31.0, [0, 1.35, 7.3], [0, 0.9, 0.3], 48],
    [33.5, [0, 1.35, 7.1], [0, 0.88, 0.3], 48],
    [38.6, [0, 1.35, 7.0], [0, 0.9, 0.3], 48],
    [40.6, [0, 1.4, 6.8], [0, 1.2, 0.3], 48],
    [41.4, [0, 1.3, 7.1], [0, 1.45, 0.3], 50],
    [47.5, [0, 1.3, 6.8], [0, 1.4, 0.3], 50],
    [49.6, [0, 1.3, 7.1], [0, 1.2, 0.3], 50],
    [51.6, [0, 0.8, 6.4], [0, 4.3, -10], 52],
    [55.8, [0, 0.85, 6.1], [0, 4.4, -10], 52],
    [57.2, [-0.15, 0.85, 3.4], [-0.3, 3.3, -8], 50],
    [59.0, [-0.3, 0.8, 1.45], [-0.45, 1.7, -2.0], 44],
    [60.0, [-0.32, 0.82, 1.25], [-0.45, 1.7, -2.0], 44],
  ]);
  const fz = t > 50.5 && t < 56.8 ? dist([0, 1.0, -0.1]) : dist([tr.pos[0], 1.0, tr.pos[2]]);
  post(C.scene, { exposure: lerp(1.0, 1.05, dusk), bloomS: lerp(0.22, 0.5, dusk), bloomR: 0.55, bloomT: lerp(0.92, 0.8, dusk), focus: fz, aperture: lerp(0.0014, 0.0008, dusk), maxblur: 0.007 });
}

// ------------------------------------------------------------------ overlay
const R = U.rng(99);
const SP = Array.from({ length: 70 }, () => ({ a: R() * Math.PI * 2, r: R(), s: 0.5 + R(), p: R() * 6, c: ['#fff6c8', '#ffd6f5', '#c8f4ff', '#ffffff'][Math.floor(R() * 4)] }));
function twinkle(x, y, r, a, c) {
  if (a <= 0.01) return;
  og.globalAlpha = a;
  const gr = og.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(255,255,255,0)');
  og.fillStyle = gr; og.beginPath(); og.arc(x, y, r, 0, 7); og.fill();
  og.fillStyle = c; og.beginPath();
  og.moveTo(x - r * 1.6, y); og.quadraticCurveTo(x, y, x, y - r * 1.6); og.quadraticCurveTo(x, y, x + r * 1.6, y); og.quadraticCurveTo(x, y, x, y + r * 1.6); og.quadraticCurveTo(x, y, x - r * 1.6, y); og.fill();
  og.globalAlpha = 1;
}
function drawOverlay(t) {
  og.clearRect(0, 0, W, H);
  const fill = (c, a) => { if (a > 0.001) { og.globalAlpha = Math.min(1, a); og.fillStyle = c; og.fillRect(0, 0, W, H); og.globalAlpha = 1; } };
  // A -> B : dive into the dark gap, sparkles open the magic world
  fill('#0d0820', ss(9.65, 10.05, t) * (1 - ss(10.12, 10.75, t)));
  // B -> C : golden light
  const gw = ss(29.15, 29.9, t) * (1 - ss(30.0, 30.75, t));
  if (gw > 0) {
    const gr = og.createRadialGradient(W * 0.55, H * 0.45, 0, W * 0.55, H * 0.45, H * 0.8);
    gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.5, 'rgba(255,236,190,1)'); gr.addColorStop(1, 'rgba(255,214,150,1)');
    og.globalAlpha = gw; og.fillStyle = gr; og.fillRect(0, 0, W, H); og.globalAlpha = 1;
  }
  for (const [t0, t1] of [[9.85, 11.0], [29.3, 30.9]]) {
    if (t < t0 || t > t1) continue;
    const u = (t - t0) / (t1 - t0);
    SP.forEach((s, i) => {
      const rr = (0.1 + s.r * 0.9 * (0.3 + u)) * H * 0.55;
      const x = W / 2 + Math.cos(s.a + u * 2.5 * s.s) * rr * 0.7, y = H * 0.48 + Math.sin(s.a + u * 2.5 * s.s) * rr;
      twinkle(x, y, H * 0.012 * s.s * (0.6 + 0.4 * Math.sin(t * 9 + s.p)), Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(t * 7 + s.p)), s.c);
    });
  }
  // final sparkle on Socky's smile + fade out
  if (t > 59.35) {
    const u = clamp((t - 59.35) / 0.5, 0, 1);
    twinkle(W * 0.63, H * 0.42, H * 0.03 * Math.sin(Math.PI * u), Math.sin(Math.PI * u), '#ffffff');
  }
  fill('#000000', 1 - ss(0, 0.6, t));
  fill('#0b0718', ss(59.8, 60.0, t));
  // gentle vignette
  const vg = og.createRadialGradient(W / 2, H * 0.47, H * 0.32, W / 2, H * 0.5, H * 0.72);
  vg.addColorStop(0, 'rgba(20,10,30,0)'); vg.addColorStop(1, 'rgba(20,10,30,0.32)');
  og.fillStyle = vg; og.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ main
function renderAt(t) {
  if (t < 10.1) frameA(t); else if (t < 29.95) frameB(t); else frameC(t);
  composer.render();
  drawOverlay(t);
}
window.renderAt = renderAt;
window.getEvents = () => ({ events: EVENTS.sort((a, b) => a.t - b.t), vo: VO });
renderAt(0.01);
window.__ready = true;
