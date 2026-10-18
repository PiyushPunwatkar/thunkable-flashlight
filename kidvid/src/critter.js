// Realistic procedural puppy / kitten.
// Sculpted (SDF) head and body under shell fur, two-bone IK legs that keep the paws
// planted, wet eyes with lids, a hinged jaw, and spring dynamics for gaze, ears and tail.
// Origin is on the ground between the feet, facing +z. Head top ~0.95.
import * as THREE from 'three';
import * as U from '../../socky/src/util.js';
import { sculpt, mirrorX, ellipsoid, sphere, cone, smin, smax } from './sculpt.js';
import { furMaterial, addFur } from './fur.js';

const { clamp, lerp } = U;
const C = (h) => new THREE.Color(h);

export const SPECIES = {
  puppy: {
    fur: '#c7852f', light: '#e8bd7c', dark: '#9a5a1e', nose: '#1d1412', iris: ['#5a3518', '#2a170b'], pupil: 'round',
    skull: [0.165, 0.15, 0.16], muzzle: [0.08, 0.065, 0.22], ear: 'floppy', eyeR: 0.036, tail: 'plume',
    furLen: 0.028, spacing: 0.0038, stripes: null, collar: '#2f6fc0', whiskers: false, scale: 1.2,
  },
  kitten: {
    fur: '#d58a42', light: '#f6ead8', dark: '#9b5522', nose: '#d77d86', iris: ['#9cc24a', '#4f7a1e'], pupil: 'slit',
    skull: [0.155, 0.14, 0.145], muzzle: [0.06, 0.05, 0.18], ear: 'pointy', eyeR: 0.038, tail: 'long',
    furLen: 0.02, spacing: 0.0034, stripes: '0.55', collar: null, whiskers: true, scale: 1.1,
  },
};

const H0 = [0, 0.32, -0.18]; // hip pivot in rest pose
const SHOULDER = [0.08, 0.33, 0.13], HIP = [0.09, 0.31, -0.18];
const LEG = { front: [0.145, 0.17], hind: [0.15, 0.15] }, PAW_Y = 0.034;
const DT = 1 / 240;

class Spring {
  constructor(x = 0) { this.x = x; this.v = 0; }
  step(target, w, z, dt) { const a = w * w * (target - this.x) - 2 * z * w * this.v; this.v += a * dt; this.x += this.v * dt; return this.x; }
}

function irisTex(cols, pupil) {
  return U.canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = new THREE.Color(cols[1]).multiplyScalar(0.45).getStyle(); g.fillRect(0, 0, w, h); // sclera stays hidden and dark, as in dogs and cats
    const cx = w * 0.25, cy = h * 0.5, R = w * 0.135;
    const gr = g.createRadialGradient(cx, cy, R * 0.25, cx, cy, R);
    gr.addColorStop(0, cols[0]); gr.addColorStop(0.85, cols[1]); gr.addColorStop(1, '#0c0705');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * 1.02, 0, 7); g.fill();
    const Rr = U.rng(7);
    for (let i = 0; i < 260; i++) { // iris fibres
      const a = Rr() * Math.PI * 2, r0 = R * (0.3 + Rr() * 0.2), r1 = R * (0.7 + Rr() * 0.3);
      g.strokeStyle = `rgba(${Rr() < 0.5 ? '255,220,160' : '20,10,5'},${0.08 + Rr() * 0.12})`; g.lineWidth = 1 + Rr() * 2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
    g.fillStyle = '#050303'; g.beginPath();
    if (pupil === 'slit') g.ellipse(cx, cy, R * 0.16, R * 0.62, 0, 0, 7); else g.arc(cx, cy, R * 0.46, 0, 7);
    g.fill();
  });
}

function leatherBump() {
  return U.canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, w);
    const R = U.rng(3);
    for (let i = 0; i < 900; i++) { const x = R() * w, y = R() * w, r = 2 + R() * 5; g.fillStyle = `rgba(${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},0.25)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  }, { srgb: false, repeat: [3, 3] });
}

export class Critter {
  constructor(species = 'puppy', o = {}) {
    const S = (this.S = { ...SPECIES[species], ...o });
    this.species = species;
    const fur = C(S.fur), light = C(S.light), dark = C(S.dark);
    const ss = THREE.MathUtils.smoothstep;
    const furOpts = { spacing: S.spacing, stripes: S.stripes };
    const coat = (geo, opts = {}) => {
      const m = new THREE.Mesh(geo, furMaterial({ ...furOpts, ...opts, shells: false }));
      m.castShadow = true; m.receiveShadow = true;
      addFur(m, { ...furOpts, layers: 12, ...opts });
      return m;
    };
    const g = (this.group = new THREE.Group());
    this.hips = new THREE.Group(); g.add(this.hips);
    const local = (p) => [p[0] - H0[0], p[1] - H0[1], p[2] - H0[2]];

    // ---- torso + neck (one smooth surface)
    const torsoSdf = (x, y, z) => {
      let d = ellipsoid(x, y, z, [0, 0.34, 0.08], [0.16, 0.155, 0.19]);                         // chest
      d = smin(d, ellipsoid(x, y, z, [0, 0.31, -0.07], [0.15, 0.135, 0.18]), 0.08);             // belly
      d = smin(d, ellipsoid(x, y, z, [0, 0.33, -0.19], [0.15, 0.145, 0.13]), 0.08);             // rump
      d = smin(d, ellipsoid(Math.abs(x), y, z, [0.08, 0.35, 0.12], [0.07, 0.085, 0.08]), 0.05);  // shoulders
      d = smin(d, ellipsoid(Math.abs(x), y, z, [0.09, 0.3, -0.18], [0.075, 0.11, 0.1]), 0.06);   // thighs
      d = smin(d, cone(x, y, z, [0, 0.38, 0.15], [0, 0.53, 0.24], 0.125, 0.1), 0.07);           // neck
      return d;
    };
    const torsoCol = (x, y, z) => fur.clone().lerp(light, ss(0.3, 0.2, y) * 0.7 + ss(0.08, 0.22, z) * ss(0.42, 0.3, y) * 0.6).lerp(dark, ss(0.42, 0.5, y) * ss(0.1, -0.05, z) * 0.35);
    const torso = coat(sculpt(torsoSdf, { center: [0, 0.37, -0.01], half: [0.24, 0.24, 0.36], res: 60, color: torsoCol, attrs: { flen: (x, y, z) => S.furLen * (1 + 0.6 * ss(0.25, 0.17, y) + 0.6 * ss(0.12, 0.24, z) * ss(0.36, 0.46, y)) } }));
    torso.position.set(-H0[0], -H0[1], -H0[2]);
    this.hips.add(torso); this.torso = torso;

    // ---- head
    const [sx, sy, sz] = S.skull, [mr, mh, ml] = S.muzzle;
    const EYE = [0.072, 0.105, 0.134];
    const headSdf = (x, y, z) => {
      let d = ellipsoid(x, y, z, [0, 0.1, 0.0], [sx, sy, sz]);
      d = smin(d, ellipsoid(x, y, z, [0, 0.035, 0.07], [sx * 0.85, sy * 0.62, sz * 0.75]), 0.06); // cheeks / jowls
      d = smin(d, cone(x, y, z, [0, 0.05, 0.08], [0, 0.03, ml], mr, mr * 0.82), 0.06);             // muzzle
      d = smin(d, ellipsoid(Math.abs(x), y, z, [0.055, 0.135, 0.11], [0.045, 0.035, 0.04]), 0.04); // brows
      d = smax(d, -ellipsoid(x, y, z, [0, -0.012, ml - 0.07], [mr * 0.78, 0.028, 0.1]), 0.012);   // mouth cavity under the muzzle
      d = smax(d, -sphere(Math.abs(x), y, z, EYE, S.eyeR * 1.02), 0.012);                       // eye sockets
      return d;
    };
    const headCol = (x, y, z) => fur.clone().lerp(light, ss(0.12, 0.2, z) * ss(0.11, 0.04, y) * 0.8 + ss(0.05, -0.02, y) * 0.5).lerp(dark, ss(0.17, 0.24, y) * 0.25);
    const head = (this.head = new THREE.Group()); head.position.set(...local([0, 0.53, 0.25])); this.hips.add(head);
    const skullMesh = coat(sculpt(headSdf, { center: [0, 0.09, 0.08], half: [0.2, 0.2, 0.24], res: 72, color: headCol, attrs: { flen: (x, y, z) => S.furLen * (0.45 + 0.75 * ss(0.15, 0.02, z)) * (0.8 + 0.4 * ss(0.1, 0.2, y)) * (0.25 + 0.75 * ss(S.eyeR * 1.1, S.eyeR * 2.2, Math.hypot(Math.abs(x) - EYE[0], y - EYE[1], z - EYE[2]))) } }), { droop: 0.25, comb: [0, 0.1, -0.6] });
    head.add(skullMesh);
    // nose: leathery, wet, with nostrils
    const noseSdf = (x, y, z) => {
      let d = ellipsoid(x, y, z, [0, 0, 0], [0.038, 0.027, 0.026]);
      d = smax(d, -ellipsoid(Math.abs(x), y, z, [0.017, -0.004, 0.024], [0.008, 0.006, 0.01]), 0.004);
      return d;
    };
    const nose = new THREE.Mesh(sculpt(noseSdf, { half: 0.05, res: 40 }), new THREE.MeshPhysicalMaterial({ color: S.nose, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, bumpMap: leatherBump(), bumpScale: 0.6 }));
    nose.position.set(0, 0.03 + mr * 0.82 * 0.55, ml + mr * 0.82 * 0.72); nose.scale.setScalar(species === 'kitten' ? 0.55 : 1); nose.castShadow = true;
    head.add(nose);
    // mouth: dark interior, hinged lower jaw with a tongue
    const mouthIn = new THREE.Mesh(new THREE.SphereGeometry(mr * 0.75, 20, 14), new THREE.MeshStandardMaterial({ color: '#2a0d0f', roughness: 0.6 }));
    mouthIn.position.set(0, -0.005, ml - 0.07); mouthIn.scale.set(1, 0.5, 1.4); head.add(mouthIn);
    const jaw = (this.jaw = new THREE.Group()); jaw.position.set(0, -0.008, 0.09); head.add(jaw);
    const jawSdf = (x, y, z) => cone(x, y, z, [0, 0, 0], [0, 0.0, ml - 0.14], mr * 0.62, mr * 0.5);
    jaw.add(coat(sculpt(jawSdf, { center: [0, 0, (ml - 0.1) / 2], half: [0.1, 0.07, 0.12], res: 44, color: () => light, attrs: { flen: () => S.furLen * 0.4 } }), { droop: 0.2, layers: 6 }));
    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#e46a7b', roughness: 0.32, clearcoat: 0.4 }));
    this.tongue.scale.set(0.62, 0.22, 1.1); this.tongue.position.set(0, 0.012, ml - 0.15); jaw.add(this.tongue);

    // eyes: glossy eyeball with iris texture, pigmented rim, fur-covered lids
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: irisTex(S.iris, S.pupil), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.02 });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#1a100c', roughness: 0.5 });
    const lidMat = furMaterial({ ...furOpts, shells: false });
    const lidGeo = (top) => { const q = new THREE.SphereGeometry(S.eyeR * 1.12, 28, 14, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2); q.setAttribute('flen', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count).fill(0), 1)); const c = new Float32Array(q.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = fur.r; c[i + 1] = fur.g; c[i + 2] = fur.b; } q.setAttribute('color', new THREE.BufferAttribute(c, 3)); return q; };
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(s * EYE[0], EYE[1], EYE[2] - 0.004); e.rotation.y = s * 0.32; head.add(e);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(S.eyeR, 40, 24), eyeMat); e.add(ball);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(S.eyeR * 0.93, S.eyeR * 0.12, 10, 40), rimMat); rim.position.z = S.eyeR * 0.36; rim.scale.set(1, 0.82, 1); e.add(rim);
      const up = new THREE.Mesh(lidGeo(true), lidMat), lo = new THREE.Mesh(lidGeo(false), lidMat);
      const upP = new THREE.Group(), loP = new THREE.Group(); upP.add(up); loP.add(lo); e.add(upP, loP);
      this.eyes.push({ e, ball, upP, loP });
    }

    // ears
    this.ears = [];
    const earSdf = S.ear === 'floppy'
      ? (x, y, z) => smin(ellipsoid(x, y, z, [0.012, -0.075, 0.0], [0.028, 0.095, 0.072]), ellipsoid(x, y, z, [0.0, -0.005, 0.0], [0.03, 0.03, 0.045]), 0.03)
      : (x, y, z) => smax(cone(x, y, z, [0, 0, 0], [0, 0.13, -0.01], 0.06, 0.008), Math.abs(z + 0.004) - 0.02, 0.01);
    const earGeo = sculpt(earSdf, { center: S.ear === 'floppy' ? [0, -0.07, 0] : [0, 0.06, 0], half: 0.13, res: 48, color: () => (S.ear === 'floppy' ? dark : fur), attrs: { flen: () => S.furLen * (S.ear === 'floppy' ? 1.2 : 0.6) } });
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      p.position.set(s * (S.ear === 'floppy' ? 0.125 : 0.085), S.ear === 'floppy' ? 0.185 : 0.21, S.ear === 'floppy' ? 0.025 : -0.01);
      const m = coat(s > 0 ? earGeo : mirrorX(earGeo), { droop: 0.6 });
      p.add(m); head.add(p);
      if (S.ear === 'pointy') { const inner = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 16), new THREE.MeshStandardMaterial({ color: '#e9a4a8', roughness: 0.7 })); inner.position.set(0, 0.05, 0.012); inner.scale.z = 0.25; p.add(inner); }
      this.ears.push({ p, s, sp: new Spring(0), sp2: new Spring(0) });
    }
    if (S.whiskers) for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0006, 0.13, 4), new THREE.MeshBasicMaterial({ color: '#f2efe8' }));
      w.position.set(s * 0.09, 0.025 + k * 0.01, ml - 0.04); w.rotation.set(0.1 * k, 0, s * (Math.PI / 2 - 0.12 * k)); head.add(w);
    }

    // collar with a tag
    if (S.collar) {
      // the collar sits down in the fur: only a hint of it shows between the hairs
      const col = new THREE.Mesh(new THREE.TorusGeometry(0.124, 0.014, 12, 48), new THREE.MeshStandardMaterial({ color: S.collar, roughness: 0.55 }));
      col.position.set(...local([0, 0.455, 0.205])); col.rotation.x = Math.PI / 2 - 0.5; col.scale.set(1, 1.05, 1); this.hips.add(col);
      const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 24), new THREE.MeshStandardMaterial({ color: '#d8b04a', metalness: 1, roughness: 0.25 }));
      tag.rotation.x = Math.PI / 2; tag.position.set(...local([0, 0.375, 0.285])); this.hips.add(tag);
    }

    // tail: chain of segments
    this.tail = [];
    const NT = 5, segL = S.tail === 'plume' ? 0.055 : 0.065;
    let parent = this.hips;
    for (let i = 0; i < NT; i++) {
      const seg = new THREE.Group(); seg.position.set(...(i ? [0, 0, -segL] : local([0, 0.38, -0.3])));
      const r1 = (S.tail === 'plume' ? 0.042 : 0.028) * (1 - i * 0.12), r2 = r1 * 0.88;
      seg.add(coat(sculpt((x, y, z) => cone(x, y, z, [0, 0, 0.01], [0, 0, -segL - 0.01], r1, r2), { center: [0, 0, -segL / 2], half: [0.06, 0.06, 0.07], res: 28, color: () => (i > 2 && S.tail === 'plume' ? light : fur), attrs: { flen: () => S.furLen * (S.tail === 'plume' ? 1.6 + i * 0.25 : 1.1) } }), { droop: 0.9, comb: [0, 0, -0.6], layers: 9 }));
      parent.add(seg); parent = seg; this.tail.push({ seg, sp: new Spring(0) });
    }

    // legs: upper + lower segment + paw, posed by IK every frame in root space
    const segGeo = (L, r1, r2, col) => sculpt((x, y, z) => cone(x, y, z, [0, 0.01, 0], [0, -L, 0], r1, r2), { center: [0, -L / 2, 0], half: [0.08, L / 2 + 0.07, 0.08], res: 36, color: () => col, attrs: { flen: () => S.furLen * 0.75 } });
    const pawGeo = sculpt((x, y, z) => {
      let d = ellipsoid(x, y, z, [0, 0, 0.012], [0.052, 0.034, 0.062]);
      for (const tx of [-0.028, -0.009, 0.009, 0.028]) d = smin(d, sphere(x, y, z, [tx, -0.006, 0.056 - Math.abs(tx) * 0.5], 0.019), 0.012);
      return d;
    }, { center: [0, 0, 0.02], half: 0.09, res: 40, color: () => light, attrs: { flen: () => S.furLen * 0.45 } });
    const padMat = new THREE.MeshStandardMaterial({ color: species === 'kitten' ? '#d9848d' : '#2b1d1a', roughness: 0.6 });
    this.legs = [];
    for (const [front, side] of [[1, -1], [1, 1], [0, -1], [0, 1]]) {
      const [L1, L2] = front ? LEG.front : LEG.hind;
      const up = coat(segGeo(L1, front ? 0.056 : 0.066, front ? 0.048 : 0.05, fur.clone().lerp(light, front ? 0.45 : 0.25)), { droop: 0.4, comb: [0, -0.3, -0.2], layers: 9 });
      const lo = coat(segGeo(L2 - 0.03, front ? 0.046 : 0.046, 0.043, fur.clone().lerp(light, front ? 0.55 : 0.3)), { droop: 0.4, comb: [0, -0.4, 0], layers: 9 });
      const paw = coat(pawGeo, { droop: 0.2, layers: 7 });
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10), padMat); pad.scale.set(1.2, 0.35, 1); pad.position.set(0, -0.028, 0.0); paw.add(pad);
      g.add(up, lo, paw);
      const anchor = front ? SHOULDER : HIP;
      this.legs.push({ front, side, L1, L2, up, lo, paw, anchor: [side * anchor[0], anchor[1], anchor[2]], plant: [side * (front ? 0.08 : 0.095), PAW_Y, front ? 0.15 : -0.17] });
    }

    // dynamic state
    this.sp = {};
    for (const k of ['hipY', 'pitch', 'roll', 'yawH', 'pitchH', 'rollH', 'eyeX', 'eyeY', 'sit', 'bow', 'lift', 'perk', 'squint', 'crouch']) this.sp[k] = new Spring(0);
    this.wagPh = 0; this.t = undefined;
  }

  // targetFn(t) -> { pos, yaw, sit, bow, lift, liftWave, hop, crouch, look:[x,y,z], tilt, mouth, pant, squint, perk, excite, blink }
  update(t, targetFn) {
    if (this.t === undefined || t < this.t - 1e-6) this._reset(targetFn(0));
    while (this.t + DT <= t + 1e-9) { this.t += DT; this._step(targetFn(this.t), DT); }
    this._pose(targetFn(t), t);
  }

  _reset(T) {
    this.t = 0;
    for (const s of Object.values(this.sp)) { s.x = 0; s.v = 0; }
    this.sp.sit.x = T.sit ?? 0; this.sp.bow.x = T.bow ?? 0;
    this.ears.forEach((e) => { e.sp.x = e.sp.v = e.sp2.x = e.sp2.v = 0; });
    this.tail.forEach((s) => { s.sp.x = s.sp.v = 0; });
    this.prevYawH = 0; this.prevRollH = 0; this.prevPitchH = 0; this.prevHop = 0;
  }

  _gaze(T) {
    if (!T.look) return [0, 0];
    const hx = T.pos[0], hz = T.pos[2], hy = 0.75 * (T.scale ?? this.S.scale) + (T.hop ?? 0);
    const dx = T.look[0] - hx, dy = T.look[1] - hy, dz = T.look[2] - hz;
    return [clamp(Math.atan2(dx, dz) - (T.yaw ?? 0), -1.1, 1.1), clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.5)];
  }

  _step(T, dt) {
    const sp = this.sp, [gy, gp] = this._gaze(T);
    sp.sit.step(T.sit ?? 0, 6, 1, dt); sp.bow.step(T.bow ?? 0, 7, 0.9, dt);
    sp.lift.step(T.lift ?? 0, 9, 0.85, dt);
    sp.crouch.step(T.crouch ?? 0, 18, 0.7, dt);
    // head leads with the eyes; the head lags and settles slightly under-damped
    sp.eyeX.step(gy * 0.35, 40, 1, dt); sp.eyeY.step(gp * 0.4, 40, 1, dt);
    sp.yawH.step(gy * 0.8, 9, 0.8, dt); sp.pitchH.step(gp * 0.7 + (T.nod ?? 0), 9, 0.8, dt); sp.rollH.step(T.tilt ?? 0, 7, 0.7, dt);
    sp.perk.step(T.perk ?? 0, 10, 0.8, dt); sp.squint.step(T.squint ?? 0, 14, 1, dt);
    // ears: under-damped pendulums kicked by head motion and hops
    const dYaw = (sp.yawH.x - this.prevYawH) / dt, dRoll = (sp.rollH.x - this.prevRollH) / dt, dPitch = (sp.pitchH.x - this.prevPitchH) / dt;
    const dHop = ((T.hop ?? 0) - this.prevHop) / dt;
    this.prevYawH = sp.yawH.x; this.prevRollH = sp.rollH.x; this.prevPitchH = sp.pitchH.x; this.prevHop = T.hop ?? 0;
    for (const e of this.ears) {
      e.sp.v += (-dRoll * 1.6 - e.s * dYaw * 0.9) * dt * 9; e.sp.step(0, 11, 0.22, dt);
      e.sp2.v += (dPitch * 1.2 + dHop * 0.6) * dt * 9; e.sp2.step(0, 10, 0.25, dt);
    }
    // tail: oscillator at the base, each segment follows the one before it (wave travels down the tail)
    const ex = T.excite ?? 0.3;
    this.wagPh += dt * Math.PI * 2 * lerp(1.6, 4.2, ex);
    let prev = Math.sin(this.wagPh) * lerp(0.25, 0.75, ex);
    this.tail.forEach((s, i) => { prev = s.sp.step(prev, 30 - i * 3.5, 0.55, dt); });
  }

  _pose(T, t) {
    const sp = this.sp, S = this.S, g = this.group;
    const sit = clamp(sp.sit.x, 0, 1.05), bow = clamp(sp.bow.x, 0, 1.1), hop = T.hop ?? 0;
    g.position.set(T.pos[0], T.pos[1] ?? 0, T.pos[2]); g.rotation.y = T.yaw ?? 0; g.scale.setScalar(T.scale ?? S.scale);
    // body: sitting drops and pitches the hips back, a play-bow drops the chest
    const breath = Math.sin(t * Math.PI * 2 * lerp(0.45, 2.6, T.pant ?? 0)) * lerp(0.006, 0.012, T.pant ?? 0);
    const hipY = H0[1] - 0.13 * sit - 0.03 * sp.crouch.x + hop + 0.005 * Math.sin(t * 0.9);
    const pitch = -0.62 * sit + 0.42 * bow;
    this.hips.position.set(0.004 * Math.sin(t * 0.7), hipY + 0.02 * bow, H0[2] + 0.05 * sit);
    this.hips.rotation.set(pitch, 0, 0.02 * Math.sin(t * 0.55));
    this.torso.scale.set(1 + breath, 1 + breath * 0.6, 1);
    // head
    const h = this.head;
    h.rotation.set(-pitch * 0.85 - sp.pitchH.x + 0.08 * bow, sp.yawH.x, sp.rollH.x, 'YXZ');
    this.jaw.rotation.x = clamp(Math.max(T.mouth ?? 0, (T.pant ?? 0) * (0.35 + 0.25 * Math.sin(t * Math.PI * 2 * 2.6))), 0, 1) * 0.42;
    this.tongue.position.z = S.muzzle[2] - 0.15 + 0.035 * (T.pant ?? 0); this.tongue.position.y = 0.012 - 0.01 * (T.pant ?? 0);
    const blink = clamp(T.blink ?? 0, 0, 1), sq = clamp(sp.squint.x, 0, 1);
    for (const { ball, upP, loP } of this.eyes) {
      ball.rotation.set(-sp.eyeY.x, sp.eyeX.x, 0);
      upP.rotation.x = -0.7 + lerp(0.3 * sq, 1.6, blink);  // upper lid: open -> closed
      loP.rotation.x = 0.7 - lerp(0.45 * sq, 0.35, blink);
    }
    this.ears.forEach((e) => {
      if (S.ear === 'floppy') e.p.rotation.set(-0.05 - 0.25 * sp.perk.x + e.sp2.x - hop * 0.8, e.s * 0.25, e.s * (0.1 + 0.2 * sp.perk.x) + e.sp.x);
      else e.p.rotation.set(-0.05 + 0.15 * sp.perk.x + e.sp2.x * 0.3, 0, -e.s * (0.25 - 0.1 * sp.perk.x) + e.sp.x * 0.3);
    });
    const tailUp = lerp(0.35, 0.7, T.excite ?? 0.3) - 0.5 * sit;
    this.tail.forEach((s, i) => { s.seg.rotation.set(i ? 0.12 : tailUp + (S.tail === 'long' ? 0.5 : 0), s.sp.x * (i ? 0.35 : 1), 0); });
    // legs: two-bone IK in the sagittal plane, paws planted on the ground
    const cp = Math.cos(pitch), sn = Math.sin(pitch);
    this.legs.forEach((L, i) => {
      const ay = L.anchor[1] - H0[1], az = L.anchor[2] - H0[2];
      const A = [L.anchor[0], this.hips.position.y + ay * cp - az * sn, this.hips.position.z + ay * sn + az * cp];
      let F = [L.plant[0], PAW_Y + hop, L.plant[2]];
      if (!L.front) F = [L.plant[0] * 1.05, PAW_Y + hop, lerp(L.plant[2], -0.02, sit)];
      if (L.front && bow > 0) F[2] += 0.12 * bow;
      if (L.front && L.side === (T.liftSide === 'left' ? -1 : 1) && sp.lift.x > 0.01) {
        const l = clamp(sp.lift.x, 0, 1.2), wv = (T.liftWave ?? 0) * Math.sin(t * 11);
        F = [F[0] * 0.8, lerp(F[1], 0.2 + 0.035 * wv + 0.06 * sit, l), lerp(F[2], F[2] + 0.11, l)];
      }
      const dy = F[1] - A[1], dz = F[2] - A[2];
      const d = clamp(Math.hypot(dy, dz), Math.abs(L.L1 - L.L2) + 1e-3, L.L1 + L.L2 - 1e-3);
      const phi = Math.atan2(dz, -dy), b1 = Math.acos(clamp((L.L1 * L.L1 + d * d - L.L2 * L.L2) / (2 * L.L1 * d), -1, 1)), b2 = Math.acos(clamp((L.L2 * L.L2 + d * d - L.L1 * L.L1) / (2 * L.L2 * d), -1, 1));
      const s = L.front ? 1 : -1, th1 = phi - s * b1, th2 = phi + s * b2;
      L.up.position.set(A[0], A[1], A[2]); L.up.rotation.set(-th1, 0, 0);
      const K = [A[0], A[1] - L.L1 * Math.cos(th1), A[2] + L.L1 * Math.sin(th1)];
      L.lo.position.set(K[0], K[1], K[2]); L.lo.rotation.set(-th2, 0, 0);
      const P = [K[0], K[1] - L.L2 * Math.cos(th2), K[2] + L.L2 * Math.sin(th2)];
      const lifted = Math.max(0, P[1] - PAW_Y - hop);
      L.paw.position.set(P[0], P[1], P[2]); L.paw.rotation.set(clamp(lifted * 5, 0, 1.2), 0, 0);
    });
  }
}
