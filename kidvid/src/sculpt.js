// Signed-distance sculpting: describe an organic shape with smooth-blended primitives,
// then polygonise it once (marching cubes) into an indexed BufferGeometry.
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const { sqrt, max, min, abs } = Math;
const len3 = (x, y, z) => sqrt(x * x + y * y + z * z);

// ---- primitives (inigo quilez), all take a point (x,y,z)
export function ellipsoid(x, y, z, c, r) {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  const k0 = len3(px, py, pz), k1 = len3(px / r[0], py / r[1], pz / r[2]);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -min(r[0], r[1], r[2]);
}
export const sphere = (x, y, z, c, r) => len3(x - c[0], y - c[1], z - c[2]) - r;
// capsule whose radius tapers from r1 at a to r2 at b
export function cone(x, y, z, a, b, r1, r2) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const px = x - a[0], py = y - a[1], pz = z - a[2];
  const l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const yv = px * bx + py * by + pz * bz, zv = yv - l2;
  const qx = px * l2 - bx * yv, qy = py * l2 - by * yv, qz = pz * l2 - bz * yv;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zv) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yv) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
}
export function smin(a, b, k) { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; }
export const smax = (a, b, k) => -smin(-a, -b, k);

// Polygonise sdf(x,y,z) inside the box center ± half. colorFn / attrs add per-vertex attributes.
export function sculpt(sdf, { center = [0, 0, 0], half = 0.5, res = 56, color = null, attrs = {} } = {}) {
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 200000);
  mc.isolation = 0;
  const h = Array.isArray(half) ? half : [half, half, half], hs = mc.halfsize;
  for (let k = 0; k < res; k++) for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = center[0] + ((i - hs) / hs) * h[0], y = center[1] + ((j - hs) / hs) * h[1], z = center[2] + ((k - hs) / hs) * h[2];
    // edges of the grid are forced outside so every shape closes
    const edge = i < 2 || j < 2 || k < 2 || i > res - 3 || j > res - 3 || k > res - 3;
    mc.field[i + j * mc.yd + k * mc.zd] = edge ? -1 : -sdf(x, y, z);
  }
  mc.update();
  const n = mc.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    pos[v * 3] = center[0] + mc.positionArray[v * 3] * h[0];
    pos[v * 3 + 1] = center[1] + mc.positionArray[v * 3 + 1] * h[1];
    pos[v * 3 + 2] = center[2] + mc.positionArray[v * 3 + 2] * h[2];
    const nx = mc.normalArray[v * 3] / h[0], ny = mc.normalArray[v * 3 + 1] / h[1], nz = mc.normalArray[v * 3 + 2] / h[2], l = len3(nx, ny, nz) || 1;
    nor[v * 3] = nx / l; nor[v * 3 + 1] = ny / l; nor[v * 3 + 2] = nz / l;
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g = mergeVertices(g, 1e-6);
  const p = g.attributes.position, cnt = p.count;
  if (color) {
    const c = new Float32Array(cnt * 3), tmp = new THREE.Color();
    for (let v = 0; v < cnt; v++) { tmp.copy(color(p.getX(v), p.getY(v), p.getZ(v))); c[v * 3] = tmp.r; c[v * 3 + 1] = tmp.g; c[v * 3 + 2] = tmp.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  for (const [name, fn] of Object.entries(attrs)) {
    const a = new Float32Array(cnt);
    for (let v = 0; v < cnt; v++) a[v] = fn(p.getX(v), p.getY(v), p.getZ(v));
    g.setAttribute(name, new THREE.BufferAttribute(a, 1));
  }
  g.computeBoundingSphere();
  mc.geometry.dispose();
  return g;
}

// Mirror a geometry across x = 0 (fixes winding and normals).
export function mirrorX(geo) {
  const g = geo.clone(), p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return g;
}
