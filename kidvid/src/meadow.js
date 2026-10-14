// Sunny flower meadow, framed for a locked-off 16:9 wide shot of the host (x~0) and letter (x~-1).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh, std, plush as plushNew, sparkles, glowSprite } from '../../socky/src/sets.js';
import * as U from '../../socky/src/util.js';

const { rng } = U;
const STEM = () => (STEM.m ||= std('#47a83a')), BARK = () => (BARK.m ||= std('#8a5a32')), ROCK = () => (ROCK.m ||= std('#8f949c', { roughness: 0.85 }));
const plush = (c) => (plush[c] ||= plushNew(c)); // shared materials so static decor can be merged

// Merge every static mesh under `root` into one mesh per material (SwiftShader is draw-call bound).
function bake(root) {
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(o.material)) byMat.set(o.material, { geos: [], shadow: o.castShadow });
    byMat.get(o.material).geos.push(g);
  });
  const out = new THREE.Group();
  for (const [m, { geos, shadow }] of byMat) {
    const merged = new THREE.Mesh(mergeGeometries(geos), m);
    merged.castShadow = shadow; merged.receiveShadow = true; out.add(merged);
  }
  return out;
}

function flower(R, petal, h, ps, n = 7) {
  const f = new THREE.Group(), pm = plush(petal);
  f.add(mesh(new THREE.CylinderGeometry(ps * 0.12, ps * 0.16, h, 8), STEM(), { pos: [0, h / 2, 0] }));
  const head = new THREE.Group(); head.position.y = h; head.rotation.x = 0.5 + R() * 0.3; f.add(head);
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; head.add(mesh(new THREE.SphereGeometry(ps, 16, 10), pm, { pos: [Math.cos(a) * ps * 1.15, 0, Math.sin(a) * ps * 1.15], scale: [1, 0.28, 0.6], rot: [0, -a, 0] })); }
  head.add(mesh(new THREE.SphereGeometry(ps * 0.62, 16, 10), plush('#ffc21f'), { pos: [0, ps * 0.12, 0], scale: [1, 0.55, 1] }));
  if (h > 0.5) for (const s of [-1, 1]) f.add(mesh(new THREE.SphereGeometry(ps * 0.9, 12, 8), plush('#4fb544'), { pos: [s * ps * 0.6, h * 0.35, 0], scale: [1, 0.25, 0.45], rot: [0, 0, s * 0.5] }));
  return f;
}

function tulip(color, h) {
  const f = new THREE.Group(), m = plush(color);
  f.add(mesh(new THREE.CylinderGeometry(0.018, 0.024, h, 8), STEM(), { pos: [0, h / 2, 0] }));
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; f.add(mesh(new THREE.SphereGeometry(0.11, 18, 12), m, { pos: [Math.cos(a) * 0.05, h + 0.08, Math.sin(a) * 0.05], scale: [0.65, 1.25, 0.65], rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] })); }
  f.add(mesh(new THREE.SphereGeometry(0.1, 12, 8), plush('#4fb544'), { pos: [0.06, h * 0.4, 0], scale: [0.3, 1.6, 0.6], rot: [0, 0, -0.4] }));
  return f;
}

function rock(R, s) {
  const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + (R() - 0.5) * 0.08); p.setXYZ(i, v.x, v.y * 0.6, v.z); }
  g.computeVertexNormals();
  return mesh(g, ROCK(), { scale: s });
}

export function buildMeadow(env) {
  const scene = new THREE.Scene();
  const sky = U.skyDome(300);
  sky.material.uniforms.top.value.set('#6cc0ff'); sky.material.uniforms.mid.value.set('#c4ecff'); sky.material.uniforms.bot.value.set('#fff3d2');
  scene.add(sky);
  scene.environment = env; scene.environmentIntensity = 0.35;
  scene.fog = new THREE.Fog('#dff3ff', 14, 70);
  scene.add(new THREE.HemisphereLight('#d6eeff', '#6cbf48', 0.75));
  const sun = new THREE.DirectionalLight('#fff0d0', 2.2);
  sun.position.set(-5, 9, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#ffe6b0', 0.9); rim.position.set(-2, 4, -6); scene.add(rim);
  const fill = new THREE.DirectionalLight('#fff0f6', 0.4); fill.position.set(3, 2, 6); scene.add(fill);
  // sun glow behind the trees, top-left of frame
  const sunGlow = glowSprite('#fff4cf', 30, 0.95); sunGlow.position.set(-7, 7.5, -30); scene.add(sunGlow);
  const sunCore = glowSprite('#ffffff', 8, 1); sunCore.position.set(-7, 7.5, -29.5); scene.add(sunCore);

  const ground = mesh(new THREE.PlaneGeometry(300, 300), std('#ffffff', { map: U.grassGroundTex(), roughness: 0.95 }), { rot: [-Math.PI / 2, 0, 0] });
  ground.castShadow = false; scene.add(ground);
  for (const [x, z, r, sy, c] of [[-14, -30, 16, 0.32, '#8fdc66'], [12, -34, 20, 0.28, '#7fd35c'], [0, -50, 28, 0.3, '#9be274'], [-30, -22, 14, 0.4, '#86d95f'], [28, -24, 14, 0.36, '#8fdc66']]) {
    scene.add(mesh(new THREE.SphereGeometry(r, 48, 24), std(c, { roughness: 1 }), { pos: [x, -r * sy * 0.2, z], scale: [1, sy, 1], shadow: false }));
  }

  // instanced grass with wind sway
  const R = rng(7);
  const blade = new THREE.PlaneGeometry(0.03, 0.1, 1, 3); blade.translate(0, 0.05, 0);
  { const p = blade.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.1; p.setX(i, p.getX(i) * (1 - y * 0.85)); p.setZ(i, y * y * 0.04); } blade.computeVertexNormals(); }
  const gMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide });
  const uni = { time: { value: 0 } };
  gMat.onBeforeCompile = (sh) => {
    sh.uniforms.time = uni.time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hh = clamp(position.y/0.1,0.0,1.0); vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      transformed.x += sin(time*1.7 + ip.x*1.3 + ip.y*0.9)*0.03*hh*hh; transformed.z += cos(time*1.2 + ip.x)*0.015*hh*hh;`);
  };
  const N = 26000, grass = new THREE.InstancedMesh(blade, gMat, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const z = 1.8 - Math.pow(R(), 1.6) * 9, x = (R() - 0.5) * (4.6 + (1.8 - z) * 1.1);
    const s = (0.7 + R() * 0.8) * (Math.abs(x) < 1.6 && z > -0.8 && z < 0.8 ? 0.6 : 1);
    q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.4, R() * Math.PI * 2, (R() - 0.5) * 0.4));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.8 + R() * 0.7), s));
    grass.setMatrixAt(i, m4);
    grass.setColorAt(i, c.setHSL(0.25 + R() * 0.07, 0.62 + R() * 0.2, 0.38 + R() * 0.2));
  }
  grass.receiveShadow = true; scene.add(grass);

  // small flowers carpet (kept out of the performance area)
  const decor = new THREE.Group();
  const petC = ['#ff8cc6', '#ffffff', '#ffd23f', '#b98cff', '#ff9f5a', '#8fd0ff', '#ff6f91'];
  for (let i = 0; i < 160; i++) {
    let x = (R() - 0.5) * 7, z = 1.6 - R() * 7;
    if (Math.abs(x + 0.4) < 1.5 && z > -1.1 && z < 1.0) continue;
    const f = flower(R, petC[i % petC.length], 0.08 + R() * 0.22, 0.03 + R() * 0.03, 6);
    f.position.set(x, 0, z); f.rotation.y = R() * 6; decor.add(f);
  }
  // blue flower bushes, rocks, hero flowers framing the top corners, trees
  for (const [x, z, s] of [[1.55, -0.9, 0.42], [-1.95, -0.6, 0.38], [2.3, -2.2, 0.6], [-2.6, -1.8, 0.5]]) {
    const b = new THREE.Group();
    for (let k = 0; k < 6; k++) b.add(mesh(new THREE.SphereGeometry(0.5, 20, 14), plush('#3f9a3f'), { pos: [(R() - 0.5) * 0.9, 0.3 + R() * 0.2, (R() - 0.5) * 0.5], scale: 0.6 + R() * 0.4 }));
    for (let k = 0; k < 22; k++) { const f = flower(R, ['#8fb8ff', '#a6c8ff', '#ffffff'][k % 3], 0.02, 0.06, 5); f.position.set((R() - 0.5) * 1.1, 0.45 + R() * 0.35, (R() - 0.2) * 0.5); f.rotation.x = -0.6; b.add(f); }
    b.position.set(x, 0, z); b.scale.setScalar(s); decor.add(b);
  }
  for (const [x, z, s] of [[-1.85, 0.25, [0.22, 0.2, 0.18]], [1.25, -0.5, [0.16, 0.14, 0.14]], [-1.15, -1.3, [0.2, 0.18, 0.16]], [2.2, 0.4, [0.24, 0.2, 0.2]]]) { const r = rock(R, s); r.position.set(x, 0.03, z); decor.add(r); }
  const heroes = [];
  for (const [x, z, h, col, ps] of [[1.95, -1.6, 1.45, '#ff9ccf', 0.17], [2.45, -2.3, 1.15, '#ffb36b', 0.12], [-2.3, -1.4, 0.75, '#ff9ccf', 0.11], [1.2, -2.8, 0.9, '#ffffff', 0.1]]) {
    const f = flower(R, col, h, ps, 9); f.position.set(x, 0, z); f.rotation.y = -0.4; scene.add(f); heroes.push(f);
  }
  for (const [x, z, h, col] of [[-1.55, -2.1, 1.25, '#9a7dff'], [-1.25, -2.5, 0.9, '#ff7eb6']]) { const t = tulip(col, h); t.position.set(x, 0, z); scene.add(t); heroes.push(t); }
  for (const [x, z, s] of [[-3.4, -4.2, 0.95], [4.4, -7.5, 1.1], [-6, -11, 1.3], [2.6, -16, 1.3], [-2.2, -19, 1.4], [8, -15, 1.4], [-10, -17, 1.5]]) {
    const t = new THREE.Group();
    t.add(mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.0, 12), BARK(), { pos: [0, 1.0, 0] }));
    const cm = plush(['#4ec94a', '#63d65a', '#3fbf6a'][Math.floor(R() * 3)]);
    for (const [dx, dy, dz, r] of [[0, 2.4, 0, 1.0], [0.7, 2.0, 0.2, 0.7], [-0.65, 2.1, 0.15, 0.75], [0.1, 3.0, -0.1, 0.7]]) t.add(mesh(new THREE.SphereGeometry(r, 24, 16), cm, { pos: [dx, dy, dz] }));
    t.position.set(x, 0, z); t.scale.setScalar(s); decor.add(t);
  }
  scene.add(bake(decor));
  const cloudM = std('#ffffff', { roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.4, fog: false });
  const clouds = [];
  for (const [x, y, z, s] of [[-12, 12, -45, 1.0], [10, 14, -50, 1.3], [24, 10, -40, 0.8]]) {
    const cg = new THREE.Group();
    for (const [dx, dy, r] of [[0, 0, 3], [3, -0.6, 2.4], [-3, -0.7, 2.4], [1.5, 1.5, 2.2], [-1.5, 1.2, 2]]) cg.add(mesh(new THREE.SphereGeometry(r, 18, 12), cloudM, { pos: [dx, dy, 0], shadow: false }));
    cg.position.set(x, y, z); cg.scale.setScalar(s); scene.add(cg); clouds.push(cg);
  }
  const pollen = sparkles({ count: 70, box: [-2.6, 0.2, -3, 2.6, 2.0, 1.0], color: '#fff7c8', size: 0.05, seed: 66, speed: 0.6, tex: 'glow' });
  scene.add(pollen);

  return {
    scene,
    update(t) {
      uni.time.value = t;
      pollen.material.uniforms.time.value = t;
      clouds.forEach((c, i) => (c.position.x += Math.sin(t * 0.05 + i) * 0.002));
      heroes.forEach((h, i) => (h.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.025));
    },
  };
}
