import * as THREE from 'three';
import { clamp, lerp, kf } from './util.js';

// Rest pose spine (local space, character faces +z, cuff on top, toe forward).
const REST = [
  [0, 1.62, -0.06], [0, 1.25, -0.06], [0, 0.88, -0.06], [0, 0.58, -0.05],
  [0, 0.37, 0.07], [0, 0.29, 0.36], [0, 0.29, 0.64],
].map((p) => new THREE.Vector3(...p));
const TOP = 1.62;
const SEG = 72, RAD = 30;

// radius by normalised length u (before toe cap)
const RADIUS = [[0, 0.355], [0.05, 0.335], [0.45, 0.335], [0.6, 0.35], [0.75, 0.3], [1, 0.285]];

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

function deform(p, s, out) {
  // squash & stretch (volume preserving), twist, forward lean, side bend
  const k = 1 / Math.sqrt(s.sy);
  let x = p.x * k, y = p.y * s.sy, z = (p.z + 0.03) * k - 0.03;
  const y0 = 0.42 * s.sy, H = TOP * s.sy - y0;
  const f = clamp((y - y0) / H, 0, 1);
  if (s.twist) { const a = s.twist * f, c = Math.cos(a), sn = Math.sin(a); const zz = z + 0.06; [x, z] = [x * c + zz * sn, -x * sn + zz * c - 0.06]; }
  if (s.lean) { const a = s.lean * f, c = Math.cos(a), sn = Math.sin(a), dy = y - y0, dz = z + 0.03; z = -0.03 + dz * c + dy * sn; y = y0 + dy * c - dz * sn; }
  if (s.side) { const a = s.side * f, c = Math.cos(a), sn = Math.sin(a), dy = y - y0; const nx = x * c + dy * sn; y = y0 + dy * c - x * sn; x = nx; }
  return out.set(x, y, z);
}

export class Sock {
  constructor(mats) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const geo = new THREE.BufferGeometry();
    const n = (SEG + 1) * (RAD + 1);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    for (let i = 0; i <= SEG; i++) for (let j = 0; j <= RAD; j++) { const k = i * (RAD + 1) + j; uv[k * 2] = j / RAD; uv[k * 2 + 1] = i / SEG; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j, b = a + RAD + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, mats.sock);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.body.add(this.mesh);

    this.rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 10, 40), mats.cuff);
    this.rim.castShadow = true;
    this.inner = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mats.inner);
    this.body.add(this.rim, this.inner);

    // face
    this.eyes = [-1, 1].map((sx) => {
      const g = new THREE.Group();
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20), mats.eyeWhite);
      white.scale.set(1, 1, 0.55);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.074, 24, 16), mats.pupil);
      pupil.scale.set(1, 1, 0.35);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), mats.glint);
      const glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), mats.glint);
      g.add(white, pupil, glint, glint2);
      white.castShadow = true;
      this.body.add(g);
      return { g, white, pupil, glint, glint2, sx };
    });
    this.brows = [-1, 1].map(() => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.1, 4, 10), mats.brow);
      m.rotation.z = Math.PI / 2; g.add(m); this.body.add(g); return g;
    });
    this.cheeks = [-1, 1].map(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), mats.cheek); this.body.add(m); return m; });
    const mouth = new THREE.Group();
    const arc = new THREE.TorusGeometry(0.075, 0.018, 8, 28, Math.PI);
    this.mSmile = new THREE.Mesh(arc, mats.mouth); this.mSmile.rotation.z = Math.PI;
    this.mFrown = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.017, 8, 28, Math.PI), mats.mouth); this.mFrown.position.y = -0.045;
    this.mOpen = new THREE.Group();
    const od = new THREE.Mesh(new THREE.CircleGeometry(0.1, 32, Math.PI, Math.PI), mats.mouthIn);
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.052, 24, Math.PI, Math.PI), mats.tongue); tongue.position.set(0, -0.042, 0.004); tongue.scale.set(1, 0.6, 1);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 28, Math.PI), mats.mouth); lip.rotation.z = Math.PI;
    const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.2, 4, 8), mats.mouth); top.rotation.z = Math.PI / 2;
    this.mOpen.add(od, tongue, lip, top);
    this.mO = new THREE.Group();
    const oin = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), mats.mouthIn); oin.scale.set(0.85, 1.1, 1);
    const oring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 6, 24), mats.mouth); oring.scale.set(0.85, 1.1, 1);
    this.mO.add(oin, oring);
    mouth.add(this.mSmile, this.mFrown, this.mOpen, this.mO);
    this.mouth = mouth; this.body.add(mouth);

    this._ctrl = REST.map((p) => p.clone());
    this._restLen = new THREE.CatmullRomCurve3(REST, false, 'centripetal').getLength();
  }

  // Place an object on the surface: u (0 = cuff, along length), phi (radians from front), lift off surface.
  _surface(u, phi, lift, obj, roll = 0, sz = 1) {
    const c = this.curve, P = c.getPointAt(u), T = c.getTangentAt(u);
    const U = T.clone().negate();
    const Fr = this._frontAt(u);
    const F = Fr.sub(U.clone().multiplyScalar(Fr.dot(U))).normalize();
    const X = new THREE.Vector3().crossVectors(U, F).normalize();
    const nrm = F.clone().multiplyScalar(Math.cos(phi)).addScaledVector(X, Math.sin(phi));
    const r = this._radius(u);
    obj.position.copy(P).addScaledVector(nrm, r * this.rk + lift);
    const yAx = U.clone().sub(nrm.clone().multiplyScalar(U.dot(nrm))).normalize();
    const xAx = new THREE.Vector3().crossVectors(yAx, nrm);
    _m.makeBasis(xAx, yAx, nrm);
    obj.quaternion.setFromRotationMatrix(_m);
    if (roll) obj.rotateZ(roll);
    return { nrm, P };
  }

  _frontAt(u) {
    // interpolate per-control-point front vectors by u
    const fr = this._fronts, k = clamp(u * (fr.length - 1), 0, fr.length - 1);
    const i = Math.min(Math.floor(k), fr.length - 2), t = k - i;
    return fr[i].clone().lerp(fr[i + 1], t).normalize();
  }

  _radius(u) {
    const L = this.len, s = u * L;
    const rc = kf(1 - this.capFrac, RADIUS, (x) => x);
    const capStart = L - rc;
    if (s > capStart) { const q = clamp((s - capStart) / rc, 0, 1); return rc * Math.sqrt(Math.max(0, 1 - q * q)); }
    return kf(u, RADIUS, (x) => x);
  }

  update(st, camera) {
    const s = { sy: 1, lean: 0, side: 0, twist: 0, ...st };
    this.group.visible = s.visible !== false;
    if (!this.group.visible) return;
    this.group.position.set(...s.pos);
    this.group.rotation.set(0, s.yaw || 0, s.roll || 0);
    this.group.scale.setScalar(s.scale || 1);

    // spine
    const fronts = [];
    for (let i = 0; i < REST.length; i++) {
      deform(REST[i], s, this._ctrl[i]);
      const f = deform(_v.copy(REST[i]).add(new THREE.Vector3(0, 0, 0.05)), s, new THREE.Vector3()).sub(this._ctrl[i]).normalize();
      fronts.push(f);
    }
    if (s.spine && s.spineMix > 0) {
      for (let i = 0; i < REST.length; i++) {
        this._ctrl[i].lerp(new THREE.Vector3(...s.spine[i]), s.spineMix);
        fronts[i].lerp(new THREE.Vector3(...(s.front || [0, 0, 1])), s.spineMix).normalize();
      }
    }
    this._fronts = fronts;
    this.curve = new THREE.CatmullRomCurve3(this._ctrl, false, 'centripetal');
    this.len = this.curve.getLength();
    this.rk = 1 / Math.sqrt(clamp(this.len / this._restLen, 0.5, 2));
    this.capFrac = 0.285 * this.rk / this.len;

    const frames = this.curve.computeFrenetFrames(SEG, false);
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array;
    const du = 1 / SEG;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const P = this.curve.getPointAt(u), T = this.curve.getTangentAt(u);
      const r = this._radius(u) * this.rk;
      const dr = (this._radius(Math.min(1, u + du * 0.5)) - this._radius(Math.max(0, u - du * 0.5))) * this.rk / (this.len * du);
      const N = frames.normals[i], B = frames.binormals[i];
      for (let j = 0; j <= RAD; j++) {
        const a = (j / RAD) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const rx = N.x * ca + B.x * sa, ry = N.y * ca + B.y * sa, rz = N.z * ca + B.z * sa;
        const k = (i * (RAD + 1) + j) * 3;
        pos[k] = P.x + rx * r; pos[k + 1] = P.y + ry * r; pos[k + 2] = P.z + rz * r;
        let sl = clamp(-dr, -12, 12);
        if (i === SEG) { nor[k] = T.x; nor[k + 1] = T.y; nor[k + 2] = T.z; continue; }
        let nx = rx + T.x * sl, ny = ry + T.y * sl, nz = rz + T.z * sl;
        const l = Math.hypot(nx, ny, nz); nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.computeBoundingSphere();

    // cuff rim + dark inside
    const P0 = this.curve.getPointAt(0), T0 = this.curve.getTangentAt(0);
    const r0 = this._radius(0) * this.rk;
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), T0);
    this.rim.position.copy(P0); this.rim.quaternion.copy(_q); this.rim.scale.set(r0, r0, r0 * 0.9);
    this.inner.position.copy(P0).addScaledVector(T0, 0.1); this.inner.quaternion.copy(_q); this.inner.rotateX(Math.PI); this.inner.scale.setScalar(r0 * 0.92);

    // face anchors (u along length for rest heights)
    const uOf = (y) => ((TOP - y) / this._restLen);
    const eyeS = s.eyeScale || 1;
    const blink = clamp(s.blink || 0, 0, 1);
    const happyEyes = clamp(s.squint || 0, 0, 1);
    const tmpW = new THREE.Vector3();
    this.eyes.forEach((e, i) => {
      const { nrm } = this._surface(uOf(1.21), e.sx * 0.47, 0.015, e.g);
      e.g.scale.set(eyeS, eyeS * (1 - 0.92 * Math.max(blink, happyEyes * 0.7)), eyeS);
      // pupil direction
      let lx = 0, ly = 0;
      if (s.lookAt) {
        e.g.updateWorldMatrix(true, false);
        const wp = e.g.getWorldPosition(tmpW);
        const d = new THREE.Vector3(...s.lookAt).sub(wp);
        const inv = new THREE.Quaternion(); e.g.getWorldQuaternion(inv).invert();
        d.applyQuaternion(inv).normalize();
        lx = d.x; ly = d.y;
      }
      if (s.look) { lx = lerp(lx, s.look[0], s.lookMix ?? 1); ly = lerp(ly, s.look[1], s.lookMix ?? 1); }
      if (s.jig) { lx += s.jig[0]; ly += s.jig[1]; }
      const m = Math.hypot(lx, ly); if (m > 1) { lx /= m; ly /= m; }
      const ps = s.pupil || 1;
      const R = 0.072;
      const px = lx * R, py = ly * R;
      const pz = 0.15 * 0.55 * Math.sqrt(Math.max(0, 1 - (px * px + py * py) / 0.0225)) - 0.004;
      e.pupil.position.set(px, py, pz); e.pupil.scale.set(ps, ps, 0.35);
      e.glint.position.set(px + 0.028 * ps, py + 0.03 * ps, pz + 0.02);
      e.glint2.position.set(px - 0.02 * ps, py - 0.026 * ps, pz + 0.02);
      e.pupil.visible = e.glint.visible = e.glint2.visible = blink < 0.85;
    });

    // brows: tilt (+ = sad inner ends up), raise
    const sad = s.sad || 0, scared = s.scared || 0, happy = s.happy ?? 1, excite = s.excite || 0, curious = s.curious || 0;
    const raise = 0.03 * happy + 0.07 * scared + 0.05 * excite + 0.04 * curious - 0.01 * sad;
    this.brows.forEach((b, i) => {
      const sx = i === 0 ? -1 : 1;
      const tilt = -sx * (0.5 * sad + 0.15 * scared) + sx * 0.12 * happy + (i === 1 ? 0.25 * curious : -0.1 * curious);
      this._surface(uOf(1.43 + raise * (i === 1 ? 1 + curious : 1)), sx * 0.42, 0.012, b, tilt);
      b.visible = (s.brows ?? 1) > 0.01;
    });
    this.cheeks.forEach((c, i) => {
      this._surface(uOf(1.03), (i ? 1 : -1) * 0.66, 0.006, c);
      const cs = 0.6 + 0.6 * (s.blush ?? 0.5);
      c.scale.set(cs * 1.2, cs * 0.75, 1);
    });

    // mouth blend by expression weights
    const wO = clamp(scared + (s.ooh || 0), 0, 1);
    const wOpen = clamp(excite, 0, 1) * (1 - wO);
    const wFrown = clamp(sad, 0, 1) * (1 - wO) * (1 - wOpen);
    const wSmile = clamp(1 - wO - wOpen - wFrown, 0, 1);
    this._surface(uOf(0.98), 0, 0.006, this.mouth);
    const talk = s.talk || 0;
    const sc = (m, w, sy = 1) => { m.scale.set(w, w * sy, w); m.visible = w > 0.02; };
    sc(this.mSmile, wSmile * (1 + 0.25 * happy));
    sc(this.mFrown, wFrown);
    sc(this.mOpen, wOpen, 0.75 + 0.45 * talk);
    sc(this.mO, wO, 1 + 0.4 * talk);
  }
}

export function sockMaterials(stripes, knit) {
  return {
    sock: new THREE.MeshPhysicalMaterial({ map: stripes, bumpMap: knit, bumpScale: 1.0, roughness: 0.78, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff8a5a'), side: THREE.DoubleSide }),
    cuff: new THREE.MeshPhysicalMaterial({ color: '#ffb300', bumpMap: knit, bumpScale: 1.0, roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color('#ffc040') }),
    inner: new THREE.MeshStandardMaterial({ color: '#5a1210', roughness: 1, side: THREE.DoubleSide }),
    eyeWhite: new THREE.MeshPhysicalMaterial({ color: '#f0f0f0', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    pupil: new THREE.MeshStandardMaterial({ color: '#141018', roughness: 0.25 }),
    glint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    brow: new THREE.MeshStandardMaterial({ color: '#7a1d14', roughness: 0.7 }),
    cheek: new THREE.MeshBasicMaterial({ color: '#ff7f9a', transparent: true, opacity: 0.55, depthWrite: false }),
    mouth: new THREE.MeshStandardMaterial({ color: '#5b0f12', roughness: 0.5 }),
    mouthIn: new THREE.MeshStandardMaterial({ color: '#3a0a0e', roughness: 0.6, side: THREE.DoubleSide }),
    tongue: new THREE.MeshStandardMaterial({ color: '#ff6f86', roughness: 0.5, side: THREE.DoubleSide }),
  };
}
