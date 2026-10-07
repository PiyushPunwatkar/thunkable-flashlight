import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as U from './util.js';

const { rng, win, ss, clamp, lerp } = U;
const TW = () => (TW.t ||= U.twinkleTex());
const GL = () => (GL.t ||= U.glowTex());

export function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }); }
export function plush(color, o = {}) { return new THREE.MeshPhysicalMaterial({ color, roughness: 0.85, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff').lerp(new THREE.Color(color), 0.3), ...o }); }
export function glossy(color, o = {}) { return new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12, ...o }); }

function mesh(geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = null, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos); m.rotation.set(...rot);
  if (scale) Array.isArray(scale) ? m.scale.set(...scale) : m.scale.setScalar(scale);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// Twinkling particle cloud (custom shader so each point can pulse).
export function sparkles({ count, box, color = '#fff6c8', size = 0.25, seed = 1, speed = 1, tex = 'twinkle', colors = null }) {
  const R = rng(seed);
  const pos = new Float32Array(count * 3), ph = new Float32Array(count), sz = new Float32Array(count), col = new Float32Array(count * 3);
  const c0 = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = lerp(box[0], box[3], R()); pos[i * 3 + 1] = lerp(box[1], box[4], R()); pos[i * 3 + 2] = lerp(box[2], box[5], R());
    ph[i] = R() * 100; sz[i] = size * (0.5 + R());
    c0.set(colors ? colors[i % colors.length] : color);
    col[i * 3] = c0.r; col[i * 3 + 1] = c0.g; col[i * 3 + 2] = c0.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('psize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('pcol', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, map: { value: tex === 'twinkle' ? TW() : GL() }, opacity: { value: 1 }, scaleH: { value: 1000 }, speed: { value: speed }, drift: { value: 0.15 } },
    vertexShader: `attribute float phase; attribute float psize; attribute vec3 pcol; uniform float time; uniform float scaleH; uniform float speed; uniform float drift;
      varying float vA; varying vec3 vC;
      void main(){ vec3 p = position; float t = time*speed;
        p.x += sin(t*0.5+phase)*drift; p.y += sin(t*0.7+phase*1.3)*drift; p.z += cos(t*0.4+phase)*drift;
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        vA = 0.25 + 0.75*pow(0.5+0.5*sin(t*2.2+phase*7.0), 3.0); vC = pcol;
        gl_PointSize = psize*scaleH/(-mv.z)*(0.6+0.6*vA); }`,
    fragmentShader: `uniform sampler2D map; uniform float opacity; varying float vA; varying vec3 vC;
      void main(){ vec4 tx = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC*tx.rgb*2.0, tx.a*vA*opacity); }`,
  });
  const p = new THREE.Points(g, mat);
  p.userData.noDepth = true; p.frustumCulled = false;
  return p;
}

export function glowSprite(color, scale, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GL(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale); s.userData.noDepth = true;
  return s;
}

function starShape(R = 1, r = 0.5, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r : R;
    i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return s;
}
export function starGeo(R = 0.5) {
  const g = new THREE.ExtrudeGeometry(starShape(R, R * 0.5), { depth: R * 0.25, bevelEnabled: true, bevelThickness: R * 0.18, bevelSize: R * 0.14, bevelSegments: 4, curveSegments: 2 });
  g.center(); return g;
}

// ---------------------------------------------------------------- toys
export function ball(color, r = 0.3) {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(r, 40, 28), glossy(color));
  const band = mesh(new THREE.TorusGeometry(r * 1.0, r * 0.13, 10, 48), glossy('#ffffff'), { rot: [Math.PI / 2, 0, 0] });
  const band2 = mesh(new THREE.TorusGeometry(r * 1.0, r * 0.07, 8, 48), glossy('#ffffff'), { rot: [0, 0, 0] });
  g.add(b, band, band2);
  g.userData.r = r;
  return g;
}

export function teddy(color = '#3f7cff') {
  const g = new THREE.Group(), m = plush(color), l = plush('#9cc3ff'), d = std('#141018', { roughness: 0.3 });
  g.add(mesh(new THREE.SphereGeometry(0.3, 32, 24), m, { pos: [0, 0.3, 0], scale: [1, 1.1, 0.9] }));
  g.add(mesh(new THREE.SphereGeometry(0.17, 24, 16), l, { pos: [0, 0.28, 0.2], scale: [1, 1.2, 0.5] }));
  g.add(mesh(new THREE.SphereGeometry(0.26, 32, 24), m, { pos: [0, 0.74, 0] }));
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.1, 20, 14), m, { pos: [sx * 0.19, 0.95, -0.02] }));
    g.add(mesh(new THREE.SphereGeometry(0.055, 16, 10), l, { pos: [sx * 0.19, 0.95, 0.04], scale: [1, 1, 0.5] }));
    g.add(mesh(new THREE.CapsuleGeometry(0.08, 0.16, 6, 12), m, { pos: [sx * 0.3, 0.38, 0.06], rot: [0.3, 0, sx * 0.6] }));
    g.add(mesh(new THREE.CapsuleGeometry(0.09, 0.1, 6, 12), m, { pos: [sx * 0.15, 0.06, 0.12], rot: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), d, { pos: [sx * 0.085, 0.79, 0.22] }));
  }
  g.add(mesh(new THREE.SphereGeometry(0.1, 20, 14), l, { pos: [0, 0.68, 0.21], scale: [1.1, 0.8, 0.8] }));
  g.add(mesh(new THREE.SphereGeometry(0.035, 12, 8), d, { pos: [0, 0.71, 0.3], scale: [1.3, 1, 1] }));
  return g;
}

export function apple() {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    const r = Math.sin(a) * (1 + 0.08 * Math.sin(a * 2)) * 0.36;
    let y = -Math.cos(a) * 0.34;
    if (i < 3 || i > 21) y *= 0.85;
    prof.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  g.add(mesh(new THREE.LatheGeometry(prof, 40), glossy('#e8262c', { roughness: 0.3 })));
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.2, 8), std('#6b3f1d'), { pos: [0.01, 0.36, 0], rot: [0, 0, -0.2] }));
  const leaf = mesh(new THREE.SphereGeometry(0.1, 16, 10), std('#4cc23a'), { pos: [0.1, 0.4, 0], rot: [0, 0, -0.6], scale: [1.2, 0.35, 0.6] });
  g.add(leaf);
  return g;
}

function crayon(color, h) {
  const g = new THREE.Group();
  const r = 0.32, tip = 0.75;
  const body = std(color, { roughness: 0.55 });
  const paper = std(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25), { roughness: 0.8 });
  g.add(mesh(new THREE.CylinderGeometry(r, r, h, 28), body, { pos: [0, h / 2, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, h * 0.62, 28), paper, { pos: [0, h * 0.42, 0] }));
  for (const f of [0.18, 0.66]) g.add(mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.12, 28), std('#1d1d2a'), { pos: [0, h * f, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(r * 0.25, r, tip, 28), body, { pos: [0, h + tip / 2, 0] }));
  return g;
}

function dustBunny(color, seed) {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.42, 5);
  const R = rng(seed), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.06 * Math.sin(v.x * 40 + seed) * Math.sin(v.y * 37) * Math.sin(v.z * 43) + (R() - 0.5) * 0.08; v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const fur = new THREE.MeshPhysicalMaterial({ color: '#f1ecff', roughness: 1, sheen: 1, sheenColor: new THREE.Color(color), sheenRoughness: 0.3, emissive: new THREE.Color(color), emissiveIntensity: 0.55 });
  const body = mesh(geo, fur, { pos: [0, 0.4, 0], scale: [1, 0.88, 1] });
  g.add(body);
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.26, 6, 10), fur, { pos: [sx * 0.15, 0.85, -0.05], rot: [-0.2, 0, -sx * 0.3] }));
    g.add(mesh(new THREE.SphereGeometry(0.045, 12, 8), std('#1a1424', { roughness: 0.2 }), { pos: [sx * 0.12, 0.47, 0.37] }));
    g.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), { pos: [sx * 0.12 + 0.015, 0.49, 0.41], shadow: false }));
  }
  g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), std('#ff8fb1'), { pos: [0, 0.4, 0.41] }));
  const halo = glowSprite(color, 2.0, 0.5); halo.position.y = 0.45; g.add(halo);
  g.userData.body = body;
  return g;
}

function rubberDuck() {
  const g = new THREE.Group(), y = glossy('#ffd21f'), o = glossy('#ff8a1f');
  g.add(mesh(new THREE.SphereGeometry(0.5, 32, 24), y, { pos: [0, 0.42, 0], scale: [1.25, 0.85, 1] }));
  g.add(mesh(new THREE.SphereGeometry(0.33, 32, 24), y, { pos: [0.35, 0.95, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.16, 20, 12), o, { pos: [0.66, 0.9, 0], scale: [1.3, 0.5, 1] }));
  for (const sz of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.05, 12, 8), std('#111'), { pos: [0.52, 1.05, sz * 0.17] }));
  g.add(mesh(new THREE.SphereGeometry(0.22, 16, 12), y, { pos: [-0.6, 0.62, 0], scale: [1, 0.6, 0.5], rot: [0, 0, 0.6] }));
  return g;
}

function toyCar() {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(1.6, 0.5, 0.9, 4, 0.18), glossy('#ff3b4e'), { pos: [0, 0.45, 0] }));
  g.add(mesh(new RoundedBoxGeometry(0.9, 0.45, 0.8, 4, 0.16), glossy('#ff3b4e'), { pos: [-0.1, 0.85, 0] }));
  g.add(mesh(new RoundedBoxGeometry(0.92, 0.3, 0.82, 4, 0.1), glossy('#9fe3ff', { roughness: 0.05 }), { pos: [-0.1, 0.88, 0] }));
  for (const x of [-0.5, 0.5]) for (const z of [-0.45, 0.45]) {
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 24), std('#222', { roughness: 0.8 }), { pos: [x, 0.22, z], rot: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 16), std('#ffd84a'), { pos: [x, 0.22, z], rot: [Math.PI / 2, 0, 0] }));
  }
  return g;
}

function ringStacker() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.2, 32), glossy('#ff7ab8'), { pos: [0, 0.1, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 16), glossy('#ffd84a'), { pos: [0, 1.2, 0] }));
  ['#ff4d4d', '#ff9a3c', '#ffe14d', '#5cd65c', '#4da6ff'].forEach((c, i) => {
    const r = 0.55 - i * 0.08;
    g.add(mesh(new THREE.TorusGeometry(r, 0.15, 16, 32), glossy(c), { pos: [0, 0.35 + i * 0.3, 0], rot: [Math.PI / 2, 0, 0] }));
  });
  g.add(mesh(new THREE.SphereGeometry(0.18, 16, 12), glossy('#b07aff'), { pos: [0, 2.35, 0] }));
  return g;
}

function block(color, s = 0.8) { return mesh(new RoundedBoxGeometry(s, s, s, 4, s * 0.14), std(color, { roughness: 0.45 })); }

export function dino() {
  const g = new THREE.Group();
  const green = plush('#62d36f'), belly = plush('#c8f5a8'), spk = plush('#ffb13d'), dk = std('#1e3a1e');
  const body = new THREE.Group(); g.add(body);
  body.add(mesh(new THREE.SphereGeometry(1, 40, 28), green, { pos: [0, 0.82, 0], scale: [1.45, 0.95, 1.05] }));
  body.add(mesh(new THREE.SphereGeometry(0.8, 32, 20), belly, { pos: [0.25, 0.55, 0.0], scale: [1.3, 0.7, 1.12] }));
  const tail = new THREE.Group(); tail.position.set(-1.25, 0.55, 0); body.add(tail);
  tail.add(mesh(new THREE.ConeGeometry(0.55, 1.9, 24), green, { pos: [-0.8, -0.1, 0.25], rot: [0.3, 0, Math.PI / 2 + 0.25] }));
  for (let i = 0; i < 6; i++) {
    const a = -0.95 + i * 0.4;
    body.add(mesh(new THREE.ConeGeometry(0.26 - Math.abs(i - 2.5) * 0.02, 0.55, 14), spk, { pos: [Math.sin(a) * 1.35, 0.82 + Math.cos(a) * 0.92, -0.05], rot: [0, 0, -a] }));
  }
  for (const [x, z] of [[-0.75, 0.6], [0.75, 0.6], [-0.75, -0.55], [0.75, -0.55]]) body.add(mesh(new THREE.SphereGeometry(0.32, 20, 14), green, { pos: [x, 0.25, z], scale: [1.2, 0.8, 1] }));
  const head = new THREE.Group(); head.position.set(1.45, 0.62, 0.35); body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.62, 36, 24), green, { scale: [1.15, 0.9, 1] }));
  head.add(mesh(new THREE.SphereGeometry(0.42, 28, 18), belly, { pos: [0.42, -0.12, 0.08], scale: [1, 0.72, 1.1] }));
  for (const sz of [-1, 1]) {
    head.add(mesh(new THREE.TorusGeometry(0.1, 0.026, 8, 16, Math.PI), dk, { pos: [0.56, 0.2, sz * 0.25], rot: [0, Math.PI / 2 + sz * 0.45, Math.PI], shadow: false }));
    head.add(mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshBasicMaterial({ color: '#ff9db5', transparent: true, opacity: 0.6, depthWrite: false }), { pos: [0.58, 0.02, sz * 0.36], rot: [0, Math.PI / 2 + sz * 0.6, 0], shadow: false }));
    head.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), dk, { pos: [0.78, -0.02, sz * 0.13 + 0.1] }));
  }
  const bubble = mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#cfefff', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, depthWrite: false }), { pos: [0.85, -0.05, 0.3], shadow: false });
  head.add(bubble);
  g.userData = { body, head, tail, bubble };
  return g;
}

function marble() {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: '#bfeaff', transparent: true, opacity: 0.42, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, metalness: 0, envMapIntensity: 2.2, depthWrite: false });
  const shell = mesh(new THREE.SphereGeometry(0.62, 48, 32), glass, { shadow: false });
  const swirl = mesh(new THREE.TorusKnotGeometry(0.28, 0.07, 120, 12, 2, 3), new THREE.MeshStandardMaterial({ color: '#ff8a3c', emissive: '#ff6a00', emissiveIntensity: 0.7, roughness: 0.3 }));
  const swirl2 = mesh(new THREE.TorusKnotGeometry(0.22, 0.05, 100, 10, 3, 2), new THREE.MeshStandardMaterial({ color: '#3cb6ff', emissive: '#0080ff', emissiveIntensity: 0.6, roughness: 0.3 }));
  swirl.renderOrder = swirl2.renderOrder = 0; shell.renderOrder = 2;
  g.add(swirl, swirl2, shell);
  const glint = glowSprite('#ffffff', 0.5, 0.8); glint.position.set(0.25, 0.3, 0.5); g.add(glint);
  g.userData = { swirl, glint };
  return g;
}

// ================================================================ BEDROOM
export function buildBedroom(env) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe3f2');
  scene.environment = env; scene.environmentIntensity = 0.25;
  scene.fog = new THREE.Fog('#f6e7d2', 30, 90);

  const hemi = new THREE.HemisphereLight('#e6f4ff', '#ffd7b0', 0.85); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d6', 2.3);
  sun.position.set(-3, 15, -16); sun.target.position.set(0.5, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#ffe8f0', 0.55); fill.position.set(6, 7, 12); scene.add(fill);

  const floor = mesh(new THREE.PlaneGeometry(80, 80), std('#ffffff', { map: U.woodTex(), roughness: 0.55 }), { rot: [-Math.PI / 2, 0, 0] });
  floor.material.map.repeat.set(6, 6); floor.castShadow = false; scene.add(floor);
  const rugTex = U.canvasTex(512, 512, (g, w) => {
    ['#ff9fb8', '#ffe08a', '#9fe0ff', '#c7a8ff', '#a8f0b0', '#fff3e0'].forEach((c, i, a) => { g.fillStyle = c; g.beginPath(); g.arc(w / 2, w / 2, (w / 2) * (1 - i / a.length), 0, Math.PI * 2); g.fill(); });
  });
  const rug = mesh(new THREE.CircleGeometry(5.2, 64), std('#ffffff', { map: rugTex, roughness: 1 }), { pos: [1.5, 0.02, 2.5], rot: [-Math.PI / 2, 0, 0] });
  rug.castShadow = false; scene.add(rug);

  const wallMat = std('#ffffff', { map: U.wallTex(), roughness: 0.9 });
  const back = mesh(new THREE.PlaneGeometry(80, 40), wallMat, { pos: [0, 20, -13] }); back.castShadow = false; scene.add(back);
  const left = mesh(new THREE.PlaneGeometry(60, 40), wallMat, { pos: [-16, 20, 10], rot: [0, Math.PI / 2, 0] }); left.castShadow = false; scene.add(left);
  scene.add(mesh(new THREE.BoxGeometry(80, 0.9, 0.3), std('#ffffff'), { pos: [0, 0.45, -12.9] }));

  // window with morning sky
  const skyTex = U.canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6cc3ff'); gr.addColorStop(1, '#fff1c9'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (const [x, y, r] of [[60, 90, 26], [90, 80, 32], [120, 92, 24], [180, 150, 20], [205, 142, 26], [230, 152, 18]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff7b0'; g.beginPath(); g.arc(200, 60, 22, 0, Math.PI * 2); g.fill();
  });
  const win_ = mesh(new THREE.PlaneGeometry(7, 6.5), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false, fog: false }), { pos: [-1.5, 10.5, -12.95], shadow: false });
  win_.material.color.setScalar(1.6); scene.add(win_);
  const wf = std('#ffffff', { roughness: 0.5 });
  for (const [x, y, w, h] of [[-1.5, 13.85, 7.6, 0.4], [-1.5, 7.15, 7.6, 0.4], [-5.1, 10.5, 0.4, 7], [2.1, 10.5, 0.4, 7], [-1.5, 10.5, 0.25, 6.6], [-1.5, 10.5, 7, 0.25]]) scene.add(mesh(new RoundedBoxGeometry(w, h, 0.4, 2, 0.08), wf, { pos: [x, y, -12.75] }));
  const cur = plush('#ff9fc0', { side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const cg = new THREE.PlaneGeometry(2.4, 9.5, 24, 1), p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 5.5) * 0.18);
    cg.computeVertexNormals();
    scene.add(mesh(cg, cur, { pos: [-1.5 + sx * 4.9, 10, -12.5] }));
  }
  // sunbeams
  const beamTex = U.canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h); });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + i * 0.4, 18), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    b.position.set(-3.5 + i * 1.6, 6.5, -7.5); b.rotation.set(-0.75, 0, 0.12 - i * 0.05); b.userData.noDepth = true;
    scene.add(b);
  }
  const motes = sparkles({ count: 140, box: [-6, 1, -12, 4, 12, 2], color: '#fff0c8', size: 0.08, seed: 4, tex: 'glow', speed: 0.6 });
  scene.add(motes);

  // bed
  const wood = std('#d9a066', { roughness: 0.5, map: U.woodTex() });
  const bed = new THREE.Group(); scene.add(bed);
  for (const x of [-7.4, 6.4]) for (const z of [-5.1, -11.4]) bed.add(mesh(new THREE.CylinderGeometry(0.4, 0.32, 2.2, 20), wood, { pos: [x, 1.1, z] }));
  bed.add(mesh(new RoundedBoxGeometry(14.6, 1.1, 7.2, 4, 0.3), wood, { pos: [-0.5, 2.7, -8.25] }));
  bed.add(mesh(new RoundedBoxGeometry(14.2, 1.7, 6.9, 5, 0.6), std('#fffaf2', { roughness: 0.9 }), { pos: [-0.5, 4.05, -8.25] }));
  const quilt = plush('#ffffff', { map: U.quiltTex() });
  bed.add(mesh(new RoundedBoxGeometry(10.6, 0.45, 7.5, 4, 0.2), quilt, { pos: [1.4, 5.0, -8.25] }));
  bed.add(mesh(new RoundedBoxGeometry(10.6, 1.3, 0.3, 4, 0.14), quilt, { pos: [1.4, 4.5, -4.48], rot: [0.05, 0, 0] }));
  bed.add(mesh(new THREE.SphereGeometry(1, 32, 20), plush('#fff3f8'), { pos: [-5.6, 5.55, -8.3], scale: [1.6, 0.65, 2.8] }));
  bed.add(mesh(new RoundedBoxGeometry(0.7, 8.5, 7.6, 4, 0.3), wood, { pos: [-8.0, 4.25, -8.25] }));
  const bunny = teddy('#ffb3cf'); bunny.position.set(-3.6, 5.2, -6.4); bunny.scale.setScalar(1.8); bunny.rotation.y = 0.4; bed.add(bunny);
  // under-bed hints of magic
  const hint = sparkles({ count: 40, box: [-6, 0.2, -11, 5, 1.8, -5.5], colors: ['#ffd6ff', '#bff6ff', '#fff1a8'], size: 0.18, seed: 12, speed: 0.8 });
  scene.add(hint);
  const shade = U.canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(22,14,40,0.96)'); gr.addColorStop(1, 'rgba(22,14,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const under = mesh(new THREE.PlaneGeometry(19, 11), new THREE.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false, fog: false }), { pos: [-0.5, 0.03, -8.3], rot: [-Math.PI / 2, 0, 0], shadow: false });
  scene.add(under);
  scene.add(mesh(new THREE.PlaneGeometry(14.4, 2.2), new THREE.MeshBasicMaterial({ color: '#1a1030', fog: false }), { pos: [-0.5, 1.1, -11.7], shadow: false }));
  for (const sx of [-1, 1]) scene.add(mesh(new THREE.PlaneGeometry(7.0, 2.2), new THREE.MeshBasicMaterial({ color: '#1f1438', fog: false }), { pos: [-0.5 + sx * 7.15, 1.1, -8.2], rot: [0, Math.PI / 2, 0], shadow: false }));
  const ubl = new THREE.PointLight('#b58cff', 6, 9, 2); ubl.position.set(0, 0.8, -8.5); scene.add(ubl);

  // shelf + books
  scene.add(mesh(new RoundedBoxGeometry(6.5, 0.3, 1.4, 2, 0.08), wood, { pos: [7.5, 8.2, -12.3] }));
  const bc = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f43'];
  let bx = 4.6;
  for (let i = 0; i < 9; i++) { const h = 1.3 + ((i * 37) % 5) * 0.15, w = 0.45 + ((i * 13) % 3) * 0.08; scene.add(mesh(new RoundedBoxGeometry(w, h, 1.1, 2, 0.05), std(bc[i % bc.length]), { pos: [bx + w / 2, 8.35 + h / 2, -12.3], rot: [0, 0, i === 6 ? -0.2 : 0] })); bx += w + 0.06; }
  // picture of a sun
  const pic = U.canvasTex(256, 256, (g, w) => { g.fillStyle = '#fffdf5'; g.fillRect(0, 0, w, w); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(128, 120, 50, 0, 7); g.fill(); g.strokeStyle = '#ffb000'; g.lineWidth = 10; g.lineCap = 'round'; for (let i = 0; i < 10; i++) { const a = i * 0.628; g.beginPath(); g.moveTo(128 + Math.cos(a) * 70, 120 + Math.sin(a) * 70); g.lineTo(128 + Math.cos(a) * 100, 120 + Math.sin(a) * 100); g.stroke(); } g.fillStyle = '#7ed957'; g.fillRect(0, 210, w, 46); });
  scene.add(mesh(new RoundedBoxGeometry(3.2, 3.2, 0.2, 2, 0.06), std('#ff9fc0'), { pos: [8.8, 13, -12.85] }));
  scene.add(mesh(new THREE.PlaneGeometry(2.7, 2.7), std('#ffffff', { map: pic }), { pos: [8.8, 13, -12.7], shadow: false }));

  // laundry basket
  const prof = [];
  for (let i = 0; i <= 12; i++) { const y = (i / 12) * 2.4; prof.push(new THREE.Vector2(1.25 + (y / 2.4) * 0.3, y)); }
  const basket = new THREE.Group(); basket.position.set(1.0, 0, 0.6); scene.add(basket);
  const wick = std('#ffffff', { map: U.wickerTex(), roughness: 0.8, side: THREE.DoubleSide });
  basket.add(mesh(new THREE.LatheGeometry(prof, 48), wick));
  basket.add(mesh(new THREE.CircleGeometry(1.25, 32), wick, { pos: [0, 0.05, 0], rot: [-Math.PI / 2, 0, 0] }));
  basket.add(mesh(new THREE.TorusGeometry(1.56, 0.12, 12, 64), std('#c48a4a', { roughness: 0.7 }), { pos: [0, 2.4, 0], rot: [Math.PI / 2, 0, 0] }));
  basket.add(mesh(new THREE.TorusGeometry(1.29, 0.1, 12, 64), std('#c48a4a', { roughness: 0.7 }), { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) basket.add(mesh(new THREE.TorusGeometry(0.35, 0.08, 10, 24, Math.PI), std('#c48a4a'), { pos: [sx * 1.6, 2.0, 0], rot: [0, Math.PI / 2, 0] }));
  const cc = ['#7ec8ff', '#ff8fb1', '#a8e66b', '#ffd36b', '#c4a3ff', '#ffffff', '#ff9f5a', '#6be0c8'];
  const R = rng(21);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + R() * 0.3, rr = 0.75 + R() * 0.45;
    basket.add(mesh(new THREE.SphereGeometry(0.55 + R() * 0.2, 24, 16), plush(cc[i % cc.length]), { pos: [Math.cos(a) * rr, 1.95 + R() * 0.22, Math.sin(a) * rr], scale: [1.2, 0.55, 1], rot: [R(), R() * 3, R() * 0.5] }));
  }
  for (const [a, c] of [[0.9, '#7ec8ff'], [2.6, '#ff8fb1'], [-0.3, '#ffd36b']]) {
    const pts = [new THREE.Vector3(Math.cos(a) * 1.0, 2.5, Math.sin(a) * 1.0), new THREE.Vector3(Math.cos(a) * 1.62, 2.62, Math.sin(a) * 1.62), new THREE.Vector3(Math.cos(a) * 1.82, 2.0, Math.sin(a) * 1.82), new THREE.Vector3(Math.cos(a) * 1.78, 1.2, Math.sin(a) * 1.78)];
    basket.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.24, 14), plush(c)));
  }
  // floor toys
  const blocksC = ['#ff5e5e', '#ffcc33', '#4da6ff', '#5cd65c'];
  [[4.2, 0.4, 3.0, 0.2], [5.1, 0.4, 3.4, -0.3], [4.6, 1.2, 3.2, 0.5], [-3.6, 0.4, 4.2, 0.4]].forEach(([x, y, z, r], i) => { const b = block(blocksC[i]); b.position.set(x, y, z); b.rotation.y = r; scene.add(b); });
  const car = toyCar(); car.position.set(4.5, 0, -2.5); car.rotation.y = -0.6; scene.add(car);

  return { scene, sun, motes, hint, basket, update(t) { motes.material.uniforms.time.value = t; hint.material.uniforms.time.value = t; } };
}

// ================================================================ UNDER THE BED
export function buildUnderBed(env) {
  const scene = new THREE.Scene();
  const fogC = new THREE.Color('#2e2463');
  scene.background = fogC.clone();
  scene.fog = new THREE.FogExp2(fogC, 0.032);
  scene.environment = env; scene.environmentIntensity = 0.18;
  scene.add(new THREE.HemisphereLight('#a9b8ff', '#5b3f86', 0.55));
  const key = new THREE.DirectionalLight('#ffe6c8', 1.8);
  key.position.set(-6, 10, 10); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#8fe8ff', 1.1); rim.position.set(4, 6, -12); scene.add(rim);
  const pls = [['#ff8fd8', 2, 1.8, -2.5], ['#7ff0ff', 13.5, 2.4, -1.2], ['#ffd27a', 18.5, 2.0, -2.5]].map(([c, x, y, z]) => { const l = new THREE.PointLight(c, 8, 12, 2); l.position.set(x, y, z); scene.add(l); return l; });

  const ground = mesh(new THREE.PlaneGeometry(140, 60), std('#ffffff', { color: '#a99de6', map: U.carpetTex('#9b90dc', '#6d5fb8'), roughness: 1 }), { pos: [12, 0, 0], rot: [-Math.PI / 2, 0, 0] });
  ground.castShadow = false; scene.add(ground);
  // bed underside: slats with glowing gaps
  const slatMat = std('#5a3b2a', { roughness: 0.8 });
  for (let x = -8; x < 36; x += 2.4) scene.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 40), slatMat, { pos: [x, 7.8, -6] }));
  const gapGlow = mesh(new THREE.PlaneGeometry(50, 40), new THREE.MeshBasicMaterial({ color: '#ffcf8a', fog: false }), { pos: [14, 8.3, -6], rot: [Math.PI / 2, 0, 0], shadow: false });
  gapGlow.material.color.multiplyScalar(1.2); scene.add(gapGlow);
  for (const x of [-5.5, 33]) scene.add(mesh(new THREE.CylinderGeometry(1.6, 1.3, 9, 28), std('#c98f58', { map: U.woodTex() }), { pos: [x, 4, -7] }));

  // crayon forest
  const cols = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#3ddc84', '#2ec4f1', '#5e60ce', '#c77dff', '#ff70a6'];
  const R = rng(33);
  const crayons = [];
  const place = (x, z, h) => { const c = crayon(cols[crayons.length % cols.length], h); c.position.set(x, 0, z); c.rotation.set((R() - 0.5) * 0.12, R() * 6, (R() - 0.5) * 0.12); scene.add(c); crayons.push(c); };
  for (let i = 0; i < 26; i++) place(-4 + i * 1.45 + R() * 0.6, -4.2 - R() * 7, 3.2 + R() * 3.3);
    for (const c of crayons) { const s = glowSprite(['#fff6b0', '#ffc8f0', '#b8f4ff'][Math.floor(R() * 3)], 1.2, 0.35); s.position.set(c.position.x, c.children[0].geometry.parameters.height + 1.1, c.position.z); scene.add(s); }

  const bunnies = [[3.2, -2.6, '#ffb3e6'], [6.0, -1.3, '#a8f0ff'], [-1.2, -1.8, '#fff1a8'], [12.6, -1.6, '#c9b3ff'], [14.4, -2.8, '#ffb3e6'], [21.5, -1.6, '#a8f0ff'], [25.6, -2.2, '#fff1a8']].map(([x, z, c], i) => {
    const b = dustBunny(c, i + 3); b.position.set(x, 0, z); b.rotation.y = (z > 0 ? -0.3 : 0.2) + (x % 2) * 0.2; b.scale.setScalar(z > 0 ? 1.1 : 0.95); scene.add(b); return b;
  });
  const duck = rubberDuck(); duck.position.set(4.8, 0, -4.3); duck.rotation.y = 0.5; duck.scale.setScalar(1.1); scene.add(duck);
  const car = toyCar(); car.position.set(14.2, 0, -2.6); car.rotation.y = 0.5; scene.add(car);
  const stack = ringStacker(); stack.position.set(0.8, 0, -3.6); scene.add(stack);
  const bc = ['#ff5e5e', '#ffcc33', '#4da6ff', '#5cd65c', '#c77dff'];
  [[1.6, 0, -1.8], [12.6, 0, -2.9], [13.4, 0, -3.4], [13.0, 0.8, -3.15], [22.0, 0, -1.5], [27.5, 0, -2.6]].forEach(([x, y, z], i) => { const b = block(bc[i % 5]); b.position.set(x, y + 0.4, z); b.rotation.y = i * 0.7; scene.add(b); });
  const dn = dino(); dn.position.set(9.6, 0, -4.2); dn.rotation.y = -2.0; scene.add(dn);
  const mb = marble(); mb.position.set(18.0, 0.62, -0.5); scene.add(mb);

  // golden opening at the far edge of the bed
  const open = mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshBasicMaterial({ color: '#fff0c0', fog: false }), { pos: [32, 3.5, -1], rot: [0, -Math.PI / 2, 0], shadow: false });
  open.material.color.multiplyScalar(2.5); scene.add(open);
  const openGlow = glowSprite('#ffd27a', 16, 0.0); openGlow.position.set(30, 2.5, 0); scene.add(openGlow);
  const sunL = new THREE.PointLight('#ffc870', 0, 30, 1.5); sunL.position.set(29, 3, 0); scene.add(sunL);

  const spark = sparkles({ count: 420, box: [-6, 0.3, -10, 32, 7, 4.5], colors: ['#fff6b0', '#ffc8f0', '#b8f4ff', '#ffffff'], size: 0.22, seed: 8, speed: 1 });
  scene.add(spark);
  const glints = sparkles({ count: 30, box: [17.4, 0.2, -1.0, 18.6, 1.4, 0.2], color: '#ffffff', size: 0.35, seed: 19, speed: 2 });
  glints.material.uniforms.opacity.value = 0; scene.add(glints);

  return {
    scene, key, dino: dn, marble: mb, bunnies, open, openGlow, sunL, spark, glints, crayons, pls,
    update(t) {
      spark.material.uniforms.time.value = t; glints.material.uniforms.time.value = t;
      bunnies.forEach((b, i) => { const k = t * 1.6 + i; b.userData.body.scale.set(1 + 0.04 * Math.sin(k * 2), 0.88 - 0.04 * Math.sin(k * 2), 1 + 0.04 * Math.sin(k * 2)); b.position.y = 0.06 * Math.max(0, Math.sin(k)); });
      key.target.position.set(lerp(0, 26, clamp((t - 10) / 20, 0, 1)), 0, 0); key.position.set(key.target.position.x - 6, 10, 10);
    },
  };
}

// ================================================================ GARDEN
export function buildGarden(env) {
  const scene = new THREE.Scene();
  const sky = U.skyDome(300); scene.add(sky);
  scene.environment = env; scene.environmentIntensity = 0.4;
  scene.fog = new THREE.Fog('#cdeeff', 30, 140);
  const hemi = new THREE.HemisphereLight('#cfeaff', '#79c25a', 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3d9', 2.4);
  sun.position.set(-8, 14, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#ffe0f0', 0.45); fill.position.set(6, 4, 10); scene.add(fill);

  const groundMat = std('#ffffff', { map: U.grassGroundTex(), roughness: 0.95 });
  const ground = mesh(new THREE.PlaneGeometry(400, 400), groundMat, { rot: [-Math.PI / 2, 0, 0] }); ground.castShadow = false; scene.add(ground);
  const hillM = std('#7fd65a', { roughness: 1 });
  for (const [x, z, r, sy, c] of [[-30, -70, 30, 0.35, '#86d95f'], [25, -80, 36, 0.3, '#74cf55'], [0, -110, 50, 0.3, '#8fdf6a'], [-60, -40, 25, 0.4, '#7fd65a'], [55, -45, 25, 0.38, '#86d95f']]) {
    const h = mesh(new THREE.SphereGeometry(r, 48, 24), std(c, { roughness: 1 }), { pos: [x, -r * sy * 0.15, z], scale: [1, sy, 1], shadow: false }); scene.add(h);
  }
  // instanced grass with wind
  const R = rng(41);
  const blade = new THREE.PlaneGeometry(0.06, 0.3, 1, 4); blade.translate(0, 0.15, 0);
  { const p = blade.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.3; p.setX(i, p.getX(i) * (1 - y * 0.85)); p.setZ(i, y * y * 0.08); } blade.computeVertexNormals(); }
  const gMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide });
  const uni = { time: { value: 0 } };
  gMat.onBeforeCompile = (sh) => {
    sh.uniforms.time = uni.time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hh = clamp(position.y/0.3,0.0,1.0); vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      transformed.x += sin(time*1.8 + ip.x*0.6 + ip.y*0.4)*0.06*hh*hh; transformed.z += cos(time*1.3 + ip.x*0.5)*0.03*hh*hh;`);
  };
  const N = 14000;
  const grass = new THREE.InstancedMesh(blade, gMat, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const x = (R() - 0.5) * 22, z = 3.4 - R() * R() * 24;
    const s = (0.7 + R() * 0.7) * (Math.abs(x) < 2.2 && z > -1 ? 0.6 : 1);
    q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, R() * Math.PI * 2, (R() - 0.5) * 0.3));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.8 + R() * 0.6), s));
    grass.setMatrixAt(i, m4);
    grass.setColorAt(i, c.setHSL(0.26 + R() * 0.08, 0.6 + R() * 0.2, 0.36 + R() * 0.18));
  }
  grass.receiveShadow = true; scene.add(grass);

  // flowers
  const petC = ['#ff7eb6', '#ffffff', '#ffd23f', '#c77dff', '#ff9f43', '#7fd4ff'];
  const stemM = std('#3fae3a');
  const flowers = [];
  for (let i = 0; i < 70; i++) {
    let x = (R() - 0.5) * 26, z = 6 - R() * 30;
    if (Math.abs(x) < 3.4 && z > -4.5 && z < 4) x += Math.sign(x || 1) * 3.6;
    const f = new THREE.Group(), h = 0.4 + R() * 0.7, ps = 0.11 + R() * 0.07;
    f.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, h, 6), stemM, { pos: [0, h / 2, 0] }));
    const pm = plush(petC[i % petC.length]);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; f.add(mesh(new THREE.SphereGeometry(ps, 12, 8), pm, { pos: [Math.cos(a) * ps * 1.1, h, Math.sin(a) * ps * 1.1], scale: [1, 0.35, 0.7], rot: [0, -a, 0] })); }
    f.add(mesh(new THREE.SphereGeometry(ps * 0.6, 12, 8), std('#ffcc1f'), { pos: [0, h + 0.03, 0] }));
    f.position.set(x, 0, z); f.rotation.set(0.25, R() * 6, 0); scene.add(f); flowers.push(f);
  }
  // trees, mushrooms, clouds
  for (const [x, z, s] of [[-9, -16, 1.2], [8, -18, 1.4], [-15, -26, 1.6], [14, -28, 1.5], [-4, -32, 1.3], [5, -36, 1.2], [-20, -12, 1.2], [19, -14, 1.3]]) {
    const t = new THREE.Group();
    t.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 12), std('#9b6a3c'), { pos: [0, 2, 0] }));
    const cm = plush(['#4ec94a', '#63d65a', '#3fbf6a'][Math.floor(R() * 3)]);
    for (const [dx, dy, dz, r] of [[0, 5, 0, 2.2], [1.4, 4.3, 0.4, 1.5], [-1.3, 4.4, 0.3, 1.6], [0.2, 6.2, -0.3, 1.5]]) t.add(mesh(new THREE.SphereGeometry(r, 24, 16), cm, { pos: [dx, dy, dz] }));
    t.position.set(x, 0, z); t.scale.setScalar(s); scene.add(t);
  }
  for (const [x, z, s] of [[-2.9, -2.6, 0.9], [3.1, -3.4, 1.1], [-4.6, 1.5, 0.7], [4.2, 0.4, 0.75]]) {
    const m = new THREE.Group();
    m.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 16), std('#fff4e0'), { pos: [0, 0.25, 0] }));
    m.add(mesh(new THREE.SphereGeometry(0.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glossy('#ff4d4d'), { pos: [0, 0.45, 0], scale: [1, 0.7, 1] }));
    for (let k = 0; k < 6; k++) { const a = k * 1.1, e = 0.5 + (k % 3) * 0.25; m.add(mesh(new THREE.SphereGeometry(0.06, 10, 6), std('#ffffff'), { pos: [Math.cos(a) * 0.4 * Math.sin(e), 0.45 + Math.cos(e) * 0.31, Math.sin(a) * 0.4 * Math.sin(e)], scale: [1, 0.5, 1] })); }
    m.position.set(x, 0, z); m.scale.setScalar(s); scene.add(m);
  }
  const cloudM = std('#ffffff', { roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.35, fog: false });
  const clouds = [];
  for (const [x, y, z, s] of [[-30, 34, -90, 1.4], [20, 42, -100, 1.8], [45, 30, -80, 1.2], [-55, 46, -110, 1.6], [5, 28, -70, 1.0]]) {
    const cg = new THREE.Group();
    for (const [dx, dy, r] of [[0, 0, 5], [5, -1, 4], [-5, -1.2, 4], [2.5, 2.5, 3.8], [-2.5, 2, 3.5]]) cg.add(mesh(new THREE.SphereGeometry(r, 20, 14), cloudM, { pos: [dx, dy, 0], shadow: false }));
    cg.position.set(x, y, z); cg.scale.setScalar(s); scene.add(cg); clouds.push(cg);
  }
  // butterflies
  const flies = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group(), wm = new THREE.MeshStandardMaterial({ color: ['#ff8fd8', '#7fd4ff', '#ffd23f'][i], side: THREE.DoubleSide, roughness: 0.5, emissive: ['#ff8fd8', '#7fd4ff', '#ffd23f'][i], emissiveIntensity: 0.25 });
    const wg = new THREE.CircleGeometry(0.22, 16); wg.translate(0.2, 0, 0);
    const l = new THREE.Mesh(wg, wm), r = new THREE.Mesh(wg, wm); r.rotation.y = Math.PI;
    const lp = new THREE.Group(), rp = new THREE.Group(); lp.add(l); rp.add(r);
    b.add(lp, rp, mesh(new THREE.CapsuleGeometry(0.03, 0.18, 4, 8), std('#2a2140'), { rot: [Math.PI / 2, 0, 0] }));
    b.userData = { lp, rp }; scene.add(b); flies.push(b);
  }

  // five balls, riddle props, sky stars
  const balls = ['#ff3b3b', '#2f8cff', '#ffd21f', '#33c75a', '#a35cff'].map((c) => { const b = ball(c, 0.25); scene.add(b); return b; });
  const ballHalo = balls.map((b, i) => { const s = glowSprite(['#ff9a9a', '#9cc9ff', '#fff09a', '#a6f0b8', '#d6b3ff'][i], 1.4, 0); scene.add(s); return s; });
  const star = mesh(starGeo(0.42), glossy('#ffd21f', { emissive: '#ffb800', emissiveIntensity: 0.35 }));
  const props = [star, apple(), teddy('#3f7cff')];
  props.forEach((p) => scene.add(p));
  const skyStars = [];
  for (let i = 0; i < 6; i++) {
    const m = mesh(starGeo(0.55), new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#ffd84a', emissiveIntensity: 0.6, roughness: 0.4, fog: false }), { shadow: false });
    const g = glowSprite('#ffe58a', 2.0, 0); const grp = new THREE.Group(); grp.add(m, g); grp.userData = { m, g };
    scene.add(grp); skyStars.push(grp);
  }
  const fireflies = sparkles({ count: 120, box: [-8, 0.3, -12, 8, 4, 4], colors: ['#fff3a0', '#c8ff9a', '#ffd6f0'], size: 0.18, seed: 77, speed: 0.8, tex: 'glow' });
  fireflies.material.uniforms.opacity.value = 0; scene.add(fireflies);
  const confetti = sparkles({ count: 160, box: [-2.2, 0.2, -1.5, 2.2, 3.5, 1.5], colors: ['#ff7eb6', '#ffd23f', '#7fd4ff', '#a8f07a', '#c77dff'], size: 0.3, seed: 55, speed: 2 });
  confetti.material.uniforms.opacity.value = 0; scene.add(confetti);
  const pollen = sparkles({ count: 90, box: [-6, 0.4, -8, 6, 5, 4], color: '#fff7c8', size: 0.12, seed: 66, speed: 0.6, tex: 'glow' });
  scene.add(pollen);

  const skyDay = [new THREE.Color('#4aa8ff'), new THREE.Color('#a8dcff'), new THREE.Color('#fff4d6')];
  const skyDusk = [new THREE.Color('#231f5e'), new THREE.Color('#7a5cc4'), new THREE.Color('#ffb08a')];
  return {
    scene, sun, hemi, sky, balls, ballHalo, props, skyStars, fireflies, confetti, flowers, clouds, flies,
    update(t, dusk) {
      uni.time.value = t;
      for (const p of [fireflies, confetti, pollen]) p.material.uniforms.time.value = t;
      const u = sky.material.uniforms;
      u.top.value.copy(skyDay[0]).lerp(skyDusk[0], dusk); u.mid.value.copy(skyDay[1]).lerp(skyDusk[1], dusk); u.bot.value.copy(skyDay[2]).lerp(skyDusk[2], dusk);
      scene.fog.color.set('#cdeeff').lerp(new THREE.Color('#4b3c80'), dusk); scene.fog.far = lerp(140, 220, dusk);
      sun.intensity = lerp(2.4, 1.0, dusk); sun.color.set('#fff3d9').lerp(new THREE.Color('#ffb070'), dusk);
      hemi.intensity = lerp(0.95, 0.6, dusk); hemi.color.set('#cfeaff').lerp(new THREE.Color('#9a8cff'), dusk);
      fireflies.material.uniforms.opacity.value = dusk;
      pollen.material.uniforms.opacity.value = 1 - dusk;
      clouds.forEach((c, i) => { c.position.x += 0; c.children.forEach((s) => s.material.emissiveIntensity = lerp(0.35, 0.05, dusk)); c.position.x = [-30, 20, 45, -55, 5][i] + t * 0.3; });
      cloudM.color.set('#ffffff').lerp(new THREE.Color('#a48cc8'), dusk);
      flies.forEach((b, i) => {
        const k = t * 0.5 + i * 2.1;
        b.position.set(Math.sin(k) * (3.5 + i) + (i - 1) * 2.5, 1.6 + 0.6 * Math.sin(k * 1.7) + i * 0.4, -3 - i * 2 + Math.cos(k * 0.8) * 1.5);
        b.rotation.y = -k + Math.PI / 2;
        const f = Math.sin(t * 22 + i) * 0.9; b.userData.lp.rotation.y = f; b.userData.rp.rotation.y = -f;
      });
    },
  };
}
