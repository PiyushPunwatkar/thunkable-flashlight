// Shell-texture fur: N offset copies of a mesh (one instanced draw) that discard
// fragments outside the hair strands. Strands come from a 3D noise volume sampled at
// the un-offset surface point, so every shell agrees and the hair stands up along the
// normal, droops with gravity and lies along a comb direction.
import * as THREE from 'three';
import * as U from '../../socky/src/util.js';

const NOISE = () => (NOISE.t ||= (() => {
  const N = 64, R = U.rng(1234), d = new Uint8Array(N * N * N);
  for (let i = 0; i < d.length; i++) d[i] = Math.floor(R() * 256);
  const t = new THREE.Data3DTexture(d, N, N, N);
  t.format = THREE.RedFormat; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
})());

const SHARED = { gravity: { value: new THREE.Vector3(0, -1, 0) } };

// Fur-ready material for both the base skin (layer 0) and the shells.
// spacing: distance between strands (scene units); attribute `flen` (fur length) and `color` are per vertex.
export function furMaterial({ spacing = 0.006, droop = 0.5, comb = [0, 0, -0.4], layers = 14, roughness = 0.82, shells = true, stripes = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });
  const uni = { noiseTex: { value: NOISE() }, freq: { value: 1 / (64 * spacing) }, layers: { value: layers }, droop: { value: droop }, comb: { value: new THREE.Vector3(...comb) }, gravity: SHARED.gravity };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float flen; ${shells ? 'attribute float layer;' : ''}
        uniform float layers; uniform float droop; uniform vec3 comb; uniform vec3 gravity;
        varying vec3 vFurP; varying float vL;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFurP = position;
        vL = ${shells ? 'layer / layers' : '0.0'};
        vec3 gObj = inverse(mat3(modelMatrix)) * gravity;
        transformed += (normal * vL + (gObj * droop + comb) * vL * vL) * flen;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler3D noiseTex; uniform float freq; varying vec3 vFurP; varying float vL;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float s1 = texture(noiseTex, vFurP * freq).r;                 // strand mask
        float s2 = texture(noiseTex, vFurP * freq * 0.21 + 0.31).r;   // clumps: local hair length
        float hl = 0.55 + 0.45 * s2;
        // roots cover the skin completely; fewer strands survive higher up, so each one tapers
        if (vL > 0.0 && s1 < 0.04 + 0.92 * vL / hl) discard;
        float k = clamp(vL / hl, 0.0, 1.0);
        diffuseColor.rgb *= mix(0.55, 1.0, sqrt(k)) * mix(0.9, 1.1, s2);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.12, 1.02), k * k);  // sun-bleached tips
        ${stripes ? `diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * ${stripes}, smoothstep(0.55, 0.75, sin(vFurP.z * 70.0 + sin(vFurP.y * 22.0) * 2.0 + texture(noiseTex, vFurP * 0.6).r * 4.0) * 0.5 + 0.5));` : ''}`);
  };
  m.customProgramCacheKey = () => `fur-${shells}-${stripes}`;
  return m;
}

// Gives `mesh` (geometry with flen + color attributes) a fur coat of `layers` shells.
export function addFur(mesh, opts = {}) {
  const layers = opts.layers ?? 14;
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(mesh.geometry.attributes)) g.setAttribute(k, mesh.geometry.attributes[k]);
  g.setIndex(mesh.geometry.index);
  g.setAttribute('layer', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: layers }, (_, i) => i + 1)), 1));
  g.boundingSphere = mesh.geometry.boundingSphere.clone(); g.boundingSphere.radius += 0.05;
  const shells = new THREE.InstancedMesh(g, furMaterial({ ...opts, layers }), layers);
  shells.castShadow = false; shells.receiveShadow = true; shells.frustumCulled = false;
  mesh.add(shells);
  return shells;
}
