// Procedural cartoon quadruped (puppy / kitten) built from primitives.
// Origin is on the ground between the feet, facing +z. Standing height ~1.0.
import * as THREE from 'three';
import { mesh, plush, glossy, std, starGeo } from '../../socky/src/sets.js';
import * as U from '../../socky/src/util.js';

const { clamp, lerp } = U;

export const SPECIES = {
  puppy: {
    fur: '#e2a955', cream: '#f8dcae', earC: '#c98a3c', pad: '#4a2c26', nose: '#2a1712', iris: '#3a2210',
    ears: 'floppy', muzzle: 0.135, tail: 'plume', whiskers: false, collar: true, stripes: null, body: [0.22, 0.21, 0.3],
  },
  kitten: {
    fur: '#f0a04b', cream: '#fff1dc', earC: '#ffb0b8', pad: '#ff9fb0', nose: '#ff8fa3', iris: '#79c043',
    ears: 'pointy', muzzle: 0.1, tail: 'curl', whiskers: true, collar: false, stripes: '#d06f24', body: [0.19, 0.19, 0.27],
  },
};

function stripeTex(base, stripe) {
  return U.canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = stripe; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { // crown / back only, so the face stays clean
      const y = 10 + i * 22; g.lineWidth = 7 + (i % 3) * 2; g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 26 + i) * 6);
      g.stroke();
    }
  });
}

export class Critter {
  constructor(species = 'puppy', o = {}) {
    const S = { ...SPECIES[species], ...o };
    this.S = S; this.species = species;
    const fur = plush(S.fur, S.stripes ? { map: stripeTex(S.fur, S.stripes), color: '#ffffff' } : {});
    const furPlain = plush(S.fur), cream = plush(S.cream), earM = plush(S.earC);
    const dark = glossy(S.nose, { roughness: 0.3 }), padM = std(S.pad, { roughness: 0.7 });
    const g = (this.group = new THREE.Group());
    const hips = (this.hips = new THREE.Group()); g.add(hips);
    const [bx, by, bz] = S.body;

    hips.add(mesh(new THREE.SphereGeometry(1, 40, 28), fur, { pos: [0, 0.36, -0.02], scale: [bx, by, bz] }));
    hips.add(mesh(new THREE.SphereGeometry(0.16, 28, 20), cream, { pos: [0, 0.4, 0.16], scale: [1, 1.15, 0.8] }));

    // legs: pivot at shoulder / hip, paw at the bottom with pads underneath
    this.legs = [];
    for (const [x, z, front] of [[-0.11, 0.15, 1], [0.11, 0.15, 1], [-0.12, -0.15, 0], [0.12, -0.15, 0]]) {
      const p = new THREE.Group(); p.position.set(x, 0.33, z);
      p.add(mesh(new THREE.CapsuleGeometry(0.062, 0.18, 6, 14), front ? furPlain : fur, { pos: [0, -0.15, 0] }));
      const paw = new THREE.Group(); paw.position.set(0, -0.29, 0.025); p.add(paw);
      paw.add(mesh(new THREE.SphereGeometry(0.078, 24, 16), cream, { scale: [1, 0.68, 1.22] }));
      paw.add(mesh(new THREE.SphereGeometry(0.034, 14, 10), padM, { pos: [0, -0.046, -0.012], scale: [1.15, 0.35, 1] }));
      for (const tx of [-0.034, 0, 0.034]) paw.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), padM, { pos: [tx, -0.04, 0.042 - Math.abs(tx) * 0.4], scale: [1, 0.45, 1] }));
      hips.add(p); this.legs.push(p);
    }

    // tail
    const tail = (this.tail = new THREE.Group()); tail.position.set(0, 0.42, -0.27); hips.add(tail);
    const N = S.tail === 'plume' ? 7 : 10;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const p = S.tail === 'plume' ? [0, 0.2 * u + 0.12 * u * u, -0.2 * u] : [0.04 * Math.sin(u * 3), 0.34 * u, -0.14 * u + 0.12 * u * u];
      const r = S.tail === 'plume' ? 0.055 + 0.03 * Math.sin(Math.PI * u) : 0.042 - 0.008 * u;
      tail.add(mesh(new THREE.SphereGeometry(r, 16, 12), u > 0.75 && S.tail === 'plume' ? cream : fur, { pos: p }));
    }

    // collar + star tag
    if (S.collar) {
      hips.add(mesh(new THREE.TorusGeometry(0.135, 0.026, 12, 40), glossy(S.accent || '#2f8fe0'), { pos: [0, 0.53, 0.11], rot: [Math.PI / 2 - 0.45, 0, 0] }));
      this.tag = mesh(starGeo(0.045), glossy('#ffc928', { emissive: '#ff9d00', emissiveIntensity: 0.35, metalness: 0.3 }), { pos: [0, 0.45, 0.235] });
      hips.add(this.tag);
    }

    // head
    const head = (this.head = new THREE.Group()); head.position.set(0, 0.5, 0.12); hips.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.27, 48, 36), fur, { pos: [0, 0.22, 0.02], scale: [1.08, 0.98, 0.96] }));
    for (const sx of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.12, 24, 16), species === 'puppy' ? furPlain : cream, { pos: [sx * 0.15, 0.11, 0.12], scale: [1, 0.85, 0.9] }));
    const mz = S.muzzle;
    head.add(mesh(new THREE.SphereGeometry(mz, 32, 24), cream, { pos: [0, 0.12, 0.215], scale: [1.18, 0.82, 0.9] }));
    head.add(mesh(new THREE.SphereGeometry(species === 'puppy' ? 0.048 : 0.026, 24, 16), dark, { pos: [0, 0.165, 0.215 + mz * 0.86], scale: [1.35, 0.92, 0.9] }));
    // mouth: smile line + open mouth with tongue
    const lineM = std('#3a2018', { roughness: 0.6 });
    this.smile = mesh(new THREE.TorusGeometry(0.042, 0.007, 8, 24, Math.PI), lineM, { pos: [0, 0.098, 0.215 + mz * 0.82], rot: [0.25, 0, Math.PI], shadow: false });
    head.add(this.smile);
    const mouth = (this.mouth = new THREE.Group()); mouth.position.set(0, 0.075, 0.215 + mz * 0.7); head.add(mouth);
    mouth.add(mesh(new THREE.SphereGeometry(0.05, 20, 14), std('#4a1515', { roughness: 0.8 }), { scale: [1.15, 1, 0.55], shadow: false }));
    this.tongue = mesh(new THREE.SphereGeometry(0.034, 16, 12), std('#ff7d8e', { roughness: 0.45 }), { pos: [0, -0.024, 0.016], scale: [1, 0.55, 0.9], shadow: false });
    mouth.add(this.tongue);
    if (S.whiskers) for (const sx of [-1, 1]) for (const k of [-1, 0, 1]) {
      head.add(mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.16, 4), std('#ffffff'), { pos: [sx * 0.13, 0.12 + k * 0.016, 0.25], rot: [0, 0, Math.PI / 2 + k * 0.15 * sx], shadow: false }));
    }

    // eyes: big glossy irises, two highlights, happy-closed arcs for blinks and smiles
    this.eyes = []; this.lids = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(sx * 0.105, 0.25, 0.225); e.rotation.y = sx * 0.28; head.add(e);
      const ball = new THREE.Group(); e.add(ball);
      ball.add(mesh(new THREE.SphereGeometry(0.066, 28, 20), std('#ffffff', { roughness: 0.3 }), { scale: [1, 1.12, 0.55], shadow: false }));
      const iris = new THREE.Group(); ball.add(iris);
      iris.add(mesh(new THREE.SphereGeometry(0.056, 28, 20), glossy(S.iris, { roughness: 0.15 }), { pos: [0, 0, 0.018], scale: [1, 1.08, 0.5], shadow: false }));
      iris.add(mesh(new THREE.SphereGeometry(species === 'kitten' ? 0.022 : 0.034, 20, 14), glossy('#080505', { roughness: 0.1 }), { pos: [0, 0, 0.034], scale: species === 'kitten' ? [0.45, 1.5, 0.5] : [1, 1.05, 0.5], shadow: false }));
      const hl = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      iris.add(mesh(new THREE.SphereGeometry(0.017, 12, 8), hl, { pos: [0.018, 0.024, 0.05], shadow: false }));
      iris.add(mesh(new THREE.SphereGeometry(0.008, 10, 6), hl, { pos: [-0.016, -0.02, 0.05], shadow: false }));
      const lid = mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 24, Math.PI), lineM, { pos: [0, -0.005, 0.03], shadow: false });
      e.add(lid);
      // brow
      e.add(mesh(new THREE.CapsuleGeometry(0.012, 0.045, 4, 8), plush(S.earC), { pos: [0, 0.095, 0.012], rot: [0, 0, Math.PI / 2 + sx * 0.15], shadow: false }));
      this.eyes.push({ e, ball, iris, brow: e.children[e.children.length - 1] }); this.lids.push(lid);
    }

    // ears
    this.ears = [];
    for (const sx of [-1, 1]) {
      const p = new THREE.Group(); head.add(p);
      if (S.ears === 'floppy') {
        p.position.set(sx * 0.215, 0.37, -0.02);
        p.add(mesh(new THREE.SphereGeometry(1, 28, 20), earM, { pos: [sx * 0.03, -0.15, 0.01], scale: [0.095, 0.19, 0.052], rot: [0, 0, sx * 0.25] }));
      } else {
        p.position.set(sx * 0.15, 0.4, 0.0);
        p.add(mesh(new THREE.ConeGeometry(0.095, 0.2, 24), fur, { pos: [0, 0.08, 0], scale: [1, 1, 0.55] }));
        p.add(mesh(new THREE.ConeGeometry(0.06, 0.13, 20), plush(S.earC), { pos: [0, 0.07, 0.03], scale: [1, 1, 0.4] }));
      }
      this.ears.push(p);
    }
  }

  // s: pos, yaw, scale, sit, wave, hop, lean, headYaw, headPitch, headRoll, blink, happy, mouth, wag, look[x,y], step, t
  update(s) {
    const S = this.S, t = s.t ?? 0, g = this.group;
    const br = Math.sin(t * 2.4) * 0.012 * (s.breathe ?? 1);
    g.position.set(s.pos[0], (s.pos[1] ?? 0) + (s.hop ?? 0), s.pos[2]);
    g.rotation.y = s.yaw ?? 0;
    g.scale.setScalar(s.scale ?? 1);
    const sit = s.sit ?? 0, sq = s.squash ?? 0;
    this.hips.position.y = -0.1 * sit + br * 0.5;
    this.hips.rotation.x = -0.42 * sit + (s.lean ?? 0);
    this.hips.rotation.z = s.roll ?? 0;
    this.hips.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    // legs: front legs counter-rotate the hip pitch so paws stay planted; back legs fold when sitting
    const step = s.step ?? 0, sp = s.stepPh ?? 0;
    this.legs.forEach((l, i) => {
      const front = i < 2, side = i % 2 ? 1 : -1, ph = sp + (i === 0 || i === 3 ? 0 : Math.PI);
      l.rotation.set(0, 0, 0); l.scale.set(1, 1, 1);
      if (front) l.rotation.x = 0.42 * sit - (s.lean ?? 0) + Math.sin(ph) * 0.45 * step;
      else { l.rotation.x = -(s.lean ?? 0) + sit * 1.25 + Math.sin(ph) * 0.45 * step; l.scale.y = 1 - 0.25 * sit; }
      l.position.y = 0.33 + (front ? 0 : -0.04 * sit);
    });
    // wave: right front leg raises paw-pads-to-camera and swings
    const w = s.wave ?? 0, wl = this.legs[s.waveSide === 'left' ? 0 : 1], ws = s.waveSide === 'left' ? -1 : 1;
    if (w > 0) {
      wl.rotation.x = lerp(wl.rotation.x, -2.35, w);
      wl.rotation.z = ws * w * (0.35 + 0.42 * Math.sin((s.wavePh ?? t * 9)));
      wl.position.y += 0.06 * w;
    }
    const tap = s.tap ?? 0;
    if (tap > 0) this.legs[1].rotation.x -= tap * 0.9;
    // head
    const h = this.head;
    h.rotation.set((s.headPitch ?? 0) + 0.2 * sit - br, s.headYaw ?? 0, s.headRoll ?? 0, 'YXZ');
    const look = s.look ?? [0, 0];
    for (const { iris, ball, brow } of this.eyes) {
      iris.position.set(clamp(look[0], -1, 1) * 0.014, clamp(look[1], -1, 1) * 0.012, 0);
      brow.position.y = 0.095 + (s.brow ?? 0) * 0.02;
    }
    const closed = clamp(Math.max(s.blink ?? 0, s.happy ?? 0), 0, 1);
    this.eyes.forEach(({ ball }, i) => { ball.scale.y = Math.max(0.06, 1 - closed); ball.visible = closed < 0.95; this.lids[i].visible = closed > 0.5; this.lids[i].scale.y = (s.happy ?? 0) > (s.blink ?? 0) ? 1 : 0.35; });
    const m = clamp(s.mouth ?? 0, 0, 1);
    this.mouth.scale.set(0.8 + 0.3 * m, Math.max(0.02, m), 1);
    this.mouth.visible = m > 0.03;
    this.smile.scale.set(1 + 0.25 * (s.grin ?? 1), 1 + 0.4 * (s.grin ?? 1), 1);
    this.tongue.position.y = -0.024 - 0.01 * m;
    // tail wag + ears
    const wag = s.wag ?? 0.4, ws2 = s.wagSpeed ?? 9;
    this.tail.rotation.set(-0.2 * (s.tailUp ?? 0) + 0.25 * sit, Math.sin(t * ws2) * 0.7 * wag, Math.sin(t * ws2) * 0.2 * wag);
    const perk = s.earPerk ?? 0;
    this.ears.forEach((e, i) => {
      const sx = i ? 1 : -1, flop = Math.sin(t * 7 + i) * 0.06 * (s.earFlop ?? 0.4) - (s.headRoll ?? 0) * 0.5;
      if (S.ears === 'floppy') e.rotation.set(-0.15 * perk, 0, sx * (0.05 + 0.35 * perk) + flop);
      else e.rotation.set(0, 0, -sx * (0.32 - 0.12 * perk) + flop * 0.4);
    });
  }
}
