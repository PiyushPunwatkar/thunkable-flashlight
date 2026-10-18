// Glossy 3D letters (that can come alive), word props and soap bubbles.
import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mesh, glossy, std, plush, apple, starGeo } from '../../socky/src/sets.js';
import * as U from '../../socky/src/util.js';
import { Critter } from './critter.js';
import { PROP_DROP } from './physics.js';

const { clamp, lerp } = U;

// ---------------------------------------------------------------- letters
// Letter stands on its base at the origin, facing +z. Height ~= size.
export class Letter {
  constructor(font, ch, color, size = 0.82) {
    const geo = new TextGeometry(ch, { font, size, depth: size * 0.26, curveSegments: 12, bevelEnabled: true, bevelThickness: size * 0.07, bevelSize: size * 0.045, bevelSegments: 6 });
    const pa = geo.attributes.position.array; // guard against degenerate bevel vertices
    let bad = false;
    for (let i = 0; i < pa.length; i++) if (!Number.isFinite(pa[i])) { pa[i] = 0; bad = true; }
    if (bad) geo.computeVertexNormals();
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.computeBoundingBox();
    this.h = geo.boundingBox.max.y; this.w = geo.boundingBox.max.x * 2; this.front = geo.boundingBox.max.z;
    // injection-moulded plastic: glossy clear coat over a slightly rough base
    this.mat = glossy(color, { roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.18, envMapIntensity: 0.55, emissive: color, emissiveIntensity: 0.03 });
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.mesh = mesh(geo, this.mat); this.body.add(this.mesh);
    this.color = color; this.ch = ch;
    this._buildAlive();
  }

  // Find a solid row on the glyph's face to mount eyes + mouth (works for any glyph shape).
  _faceSpot() {
    const rc = new THREE.Raycaster(), dir = new THREE.Vector3(0, 0, -1), hits = (x, y) => { rc.set(new THREE.Vector3(x, y, 2), dir); return rc.intersectObject(this.mesh).length > 0; };
    let best = null;
    for (let fy = 0.75; fy >= 0.3; fy -= 0.03) {
      const y = this.h * fy;
      let run = 0, bestRun = null;
      for (let x = -this.w / 2; x <= this.w / 2; x += 0.01) {
        if (hits(x, y)) { run++; if (!bestRun || run > bestRun.n) bestRun = { n: run, x1: x }; } else run = 0;
      }
      if (!bestRun) continue;
      const span = bestRun.n * 0.01, cx = bestRun.x1 - span / 2;
      const score = span - Math.abs(fy - 0.62) * 0.35;
      if (!best || score > best.score) best = { score, y, cx, span };
    }
    return best || { y: this.h * 0.6, cx: 0, span: 0.2 };
  }

  _buildAlive() {
    const a = (this.alive = new THREE.Group()); this.body.add(a); a.visible = false;
    const f = this._faceSpot(), z = this.front + 0.006, sp = clamp(f.span * 0.24, 0.045, 0.085);
    const white = std('#ffffff', { roughness: 0.3 }), black = glossy('#111111', { roughness: 0.1 }), hl = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.eyeL = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(f.cx + sx * sp, f.y + 0.03, z); a.add(e);
      e.add(mesh(new THREE.SphereGeometry(0.05, 20, 14), white, { scale: [1, 1.2, 0.4], shadow: false }));
      e.add(mesh(new THREE.SphereGeometry(0.03, 16, 12), black, { pos: [0, -0.005, 0.016], scale: [1, 1.1, 0.4], shadow: false }));
      e.add(mesh(new THREE.SphereGeometry(0.009, 8, 6), hl, { pos: [0.01, 0.012, 0.03], shadow: false }));
      this.eyeL.push(e);
    }
    a.add(mesh(new THREE.TorusGeometry(0.04, 0.009, 8, 20, Math.PI), std('#3a1010'), { pos: [f.cx, f.y - 0.055, z], rot: [0, 0, Math.PI], shadow: false }));
    // limbs: legs from the base, arms from the sides, white gloves + chunky shoes
    const limbM = std('#2b2b33', { roughness: 0.5 }), glove = std('#ffffff', { roughness: 0.4 }), shoe = glossy(new THREE.Color(this.color).offsetHSL(0, 0, -0.18));
    this.legsL = []; this.armsL = [];
    for (const sx of [-1, 1]) {
      const l = new THREE.Group(); l.position.set(sx * Math.min(0.13, this.w * 0.28), 0.02, 0); a.add(l);
      l.add(mesh(new THREE.CapsuleGeometry(0.022, 0.16, 4, 8), limbM, { pos: [0, -0.1, 0] }));
      l.add(mesh(new THREE.SphereGeometry(0.06, 18, 12), shoe, { pos: [0, -0.2, 0.03], scale: [0.9, 0.6, 1.4] }));
      this.legsL.push(l);
      const ar = new THREE.Group(); ar.position.set(sx * (this.w / 2 - 0.02), this.h * 0.45, 0); a.add(ar);
      ar.add(mesh(new THREE.CapsuleGeometry(0.02, 0.17, 4, 8), limbM, { pos: [sx * 0.1, 0, 0], rot: [0, 0, Math.PI / 2] }));
      ar.add(mesh(new THREE.SphereGeometry(0.048, 16, 12), glove, { pos: [sx * 0.2, 0, 0] }));
      this.armsL.push(ar);
    }
  }

  // Physically driven toy. s: pos, rot [x,y,z], squash 0..1, opacity, glow, t,
  // alive 0..1 + beat (cartoon style only: eyes, arms and shoes appear and dance).
  update(s) {
    const r = this.root, op = clamp(s.opacity ?? 1, 0, 1);
    r.visible = op > 0.01;
    if (!r.visible) return;
    const t = s.t ?? 0, al = s.alive ?? 0, bp = s.beat ?? t * 2;
    r.position.set(...s.pos); r.rotation.set(...(s.rot ?? [0, 0, 0]));
    r.scale.setScalar(s.scale ?? 1);
    const sq = (s.squash ?? 0) * 0.05;
    this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    this.mat.emissiveIntensity = 0.03 + 0.5 * (s.glow ?? 0);
    this.mat.opacity = op; this.mat.transparent = op < 0.999;
    this.alive.visible = al > 0.02;
    if (!this.alive.visible) return;
    this.alive.scale.setScalar(Math.max(0.001, al));
    this.legsL.forEach((l, i) => { l.rotation.x = Math.sin(bp * Math.PI + i * Math.PI) * 0.5; });
    this.armsL.forEach((a, i) => { const sx = i ? 1 : -1; a.rotation.z = sx * (0.5 + 0.6 * Math.sin(bp * Math.PI + i)); });
    const blink = (t * 0.9 + this.ch.charCodeAt(0) * 0.37) % 3 < 0.12 ? 0.1 : 1;
    this.eyeL.forEach((e) => (e.scale.y = blink));
  }
}

// ---------------------------------------------------------------- word props
export function beachBall(r = 0.17) {
  const tex = U.canvasTex(512, 256, (g, w, h) => {
    const cols = ['#ff3b30', '#ffffff', '#ffcc00', '#2f8cff', '#ffffff', '#34c759'];
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect((i * w) / 6, 0, w / 6 + 1, h); });
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h * 0.07); g.fillRect(0, h * 0.93, w, h * 0.07);
  });
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(r, 48, 32), glossy('#ffffff', { map: tex, roughness: 0.2 }), { rot: [0.5, 0, 0.4] }));
  g.userData.r = r;
  return g;
}

function egg() {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; pts.push(new THREE.Vector2(Math.max(0.001, Math.sin(a) * 0.13 * (1 - 0.18 * Math.cos(a))), -Math.cos(a) * 0.17 + 0.17)); }
  const g = new THREE.Group(); g.add(mesh(new THREE.LatheGeometry(pts, 40), glossy('#fff6e6', { roughness: 0.35 }))); return g;
}

function fish(color = '#ff8c2a') {
  const g = new THREE.Group(), m = glossy(color);
  g.add(mesh(new THREE.SphereGeometry(0.16, 32, 20), m, { pos: [0, 0.16, 0], scale: [1.3, 0.9, 0.6] }));
  g.add(mesh(new THREE.ConeGeometry(0.1, 0.16, 20), m, { pos: [-0.25, 0.16, 0], rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.35] }));
  for (const sz of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.035, 14, 10), std('#ffffff'), { pos: [0.12, 0.2, sz * 0.08], scale: [1, 1, 0.5] }));
    g.add(mesh(new THREE.SphereGeometry(0.02, 12, 8), glossy('#111111'), { pos: [0.13, 0.2, sz * 0.095], scale: [1, 1, 0.5] }));
  }
  return g;
}

// Any word without a 3D model: its emoji floats inside a glossy bubble token.
function emojiToken(emoji) {
  const g = new THREE.Group();
  const tex = U.canvasTex(256, 256, (c, w) => { c.font = `${w * 0.72}px "Noto Color Emoji"`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(emoji, w / 2, w * 0.56); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true })); sp.scale.setScalar(0.3); sp.position.y = 0.2;
  const b = bubble(0.21); b.position.y = 0.2;
  g.add(sp, b);
  return g;
}

// returns { obj, place: 'drop' (falls beside the letter) | 'trot' (animal leaps out from behind it), critter?, scale, e }
export function makeProp(name, { emoji, font } = {}) {
  const k = (name || '').toLowerCase();
  if (k === 'cat' || k === 'kitten') {
    const c = new Critter('kitten'); return { obj: c.group, place: 'trot', critter: c, scale: 0.46 };
  }
  if (k === 'dog' || k === 'puppy') {
    const c = new Critter('puppy', { fur: '#9c6430', light: '#d9b48a', dark: '#6e4220', collar: '#d04a6a' }); return { obj: c.group, place: 'trot', critter: c, scale: 0.42 };
  }
  const table = {
    apple: () => { const a = apple(); a.scale.setScalar(0.5); a.position.y = 0.17; const g = new THREE.Group(); g.add(a); return g; },
    ball: () => { const b = beachBall(0.17); b.position.y = 0.17; const g = new THREE.Group(); g.add(b); return g; },
    egg, fish,
    star: () => { const s = mesh(starGeo(0.18), glossy('#ffd21f', { emissive: '#ffb800', emissiveIntensity: 0.3 })); s.position.y = 0.2; const g = new THREE.Group(); g.add(s); return g; },
  };
  if (table[k]) return { obj: table[k](), place: 'drop', scale: 1, e: PROP_DROP.e[k] };
  return { obj: emojiToken(emoji || '⭐'), place: 'drop', scale: 1, e: 0.3 };
}

// ---------------------------------------------------------------- bubbles
const BUBBLE_MAT = () => (BUBBLE_MAT.m ||= new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { opacity: { value: 1 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
  fragmentShader: `uniform float opacity; varying vec3 vN; varying vec3 vV;
    vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
    void main(){ float f = 1.0 - max(dot(vN, vV), 0.0); float rim = pow(f, 2.2);
      vec3 c = mix(vec3(1.0), hue(f*1.6 + vN.y*0.4 + 0.2), 0.55);
      float spec = pow(max(dot(reflect(-normalize(vec3(-0.5,0.7,0.6)), vN), vV), 0.0), 60.0);
      gl_FragColor = vec4(min(c*(0.7+spec*1.2), vec3(1.0)), min(rim*0.32 + 0.015 + spec*0.6, 1.0)*opacity);
      #include <colorspace_fragment>
    }`,
}));
export function bubble(r = 0.08) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), BUBBLE_MAT());
  m.userData.noDepth = true; m.renderOrder = 5;
  return m;
}
