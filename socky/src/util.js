import * as THREE from 'three';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
// Smooth bump: 0 outside [a,d], 1 inside [b,c].
export const win = (a, b, c, d, x) => ss(a, b, x) * (1 - ss(c, d, x));

// Keyframe interpolation with cubic easing. keys: [[t, value], ...], value number or array.
export function kf(t, keys, ease = easeIO) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) {
      const u = ease(clamp((t - t0) / Math.max(1e-6, t1 - t0), 0, 1));
      return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], u)) : lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// Soft round sprite for sparkles / glows.
export function glowTex() {
  return canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    r.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

// Four-point twinkle star sprite.
export function twinkleTex() {
  return canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    const r = g.createRadialGradient(c, c, 0, c, c, c * 0.45);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
    g.globalCompositeOperation = 'lighter';
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const lg = g.createLinearGradient(c - dx * c, c - dy * c, c + dx * c, c + dy * c);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      if (dx) g.fillRect(0, c - 3, w, 6); else g.fillRect(c - 3, 0, 6, w);
    }
  });
}

// Knit stitch bump map (tileable).
export function knitBump() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const nx = 8, ny = 8, sx = w / nx, sy = h / ny;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = i * sx, y = j * sy;
      for (const side of [-1, 1]) {
        const gr = g.createLinearGradient(x + sx / 2, y, x + sx / 2 + side * sx / 2, y);
        gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.5, '#e0e0e0'); gr.addColorStop(1, '#6a6a6a');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x + sx / 2 + side * sx * 0.22, y + sy * 0.5, sx * 0.24, sy * 0.52, side * 0.45, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, { repeat: [3, 10], srgb: false });
}

// Sock stripes along v (length). Red / yellow bands with a red toe.
export function stripeTex() {
  return canvasTex(64, 1024, (g, w, h) => {
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      g.fillStyle = i % 2 === 0 ? '#e3151b' : '#ffb000';
      g.fillRect(0, (i / bands) * h, w, h / bands + 1);
    }
    // soft knit speckle
    const R = rng(7);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${R() < 0.3 ? '255,255,255' : '90,20,0'},${0.03 + R() * 0.04})`;
      g.fillRect(R() * w, R() * h, 1.5, 3);
    }
  });
}

export function woodTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const R = rng(11);
    const planks = 6;
    for (let p = 0; p < planks; p++) {
      const y0 = (p / planks) * h, ph = h / planks;
      const base = [196 + R() * 20, 140 + R() * 18, 92 + R() * 14];
      g.fillStyle = `rgb(${base.map(Math.round)})`;
      g.fillRect(0, y0, w, ph);
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = `rgba(110,62,30,${0.05 + R() * 0.08})`;
        g.lineWidth = 1 + R() * 2;
        g.beginPath();
        const yy = y0 + R() * ph;
        g.moveTo(0, yy);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, yy + Math.sin(x * 0.01 + k) * 3 + (R() - 0.5) * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(80,45,20,0.55)'; g.fillRect(0, y0, w, 3);
      const cut = R() * w; g.fillRect(cut, y0, 3, ph);
    }
  }, { repeat: [3, 3] });
}

export function wallTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#bfe3f2'; g.fillRect(0, 0, w, h);
    const R = rng(3);
    for (let i = 0; i < 18; i++) {
      const x = R() * w, y = R() * h, r = 6 + R() * 10;
      g.fillStyle = ['#fff6c9', '#ffd7e6', '#ffffff', '#d7f5d0'][i % 4];
      g.globalAlpha = 0.85;
      drawStar(g, x, y, r, r * 0.45, 5);
    }
    g.globalAlpha = 1;
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, 0, 18, h); }
  }, { repeat: [5, 3] });
}

export function drawStar(g, x, y, R, r, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

export function quiltTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const cols = ['#ffb3c7', '#bde7ff', '#fff1a8', '#c9f2c7', '#e4ccff', '#ffd6a5'];
    const n = 6, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = cols[(i * 2 + j * 3) % cols.length]; g.fillRect(i * s, j * s, s, s);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.arc(i * s + s / 2, j * s + s / 2, s * 0.14, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.setLineDash([6, 5]); g.lineWidth = 3;
      g.strokeRect(i * s + 5, j * s + 5, s - 10, s - 10);
    }
  }, { repeat: [2, 2] });
}

export function wickerTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#b07a3e'; g.fillRect(0, 0, w, h);
    const rows = 10, cols = 24, rh = h / rows, cw = w / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const off = (r + c) % 2;
      const gr = g.createLinearGradient(0, r * rh, 0, r * rh + rh);
      gr.addColorStop(0, off ? '#c9934f' : '#a06a30'); gr.addColorStop(0.5, off ? '#e8b878' : '#c58a47'); gr.addColorStop(1, off ? '#b07a3e' : '#8a5a28');
      g.fillStyle = gr;
      roundRect(g, c * cw + 1, r * rh + 1, cw - 2, rh - 2, 6); g.fill();
    }
  }, { repeat: [3, 1] });
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function carpetTex(c1, c2) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    const R = rng(5);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = R() < 0.5 ? c2 : 'rgba(255,255,255,0.08)';
      g.globalAlpha = 0.25 + R() * 0.3;
      g.fillRect(R() * w, R() * h, 2, 2 + R() * 3);
    }
    g.globalAlpha = 1;
  }, { repeat: [8, 8] });
}

export function grassGroundTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#6fcf4a'; g.fillRect(0, 0, w, h);
    const R = rng(9);
    for (let i = 0; i < 160; i++) {
      const x = R() * w, y = R() * h, r = 10 + R() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, R() < 0.5 ? 'rgba(150,230,90,0.45)' : 'rgba(60,160,50,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }, { repeat: [10, 10] });
}

// Sky dome with a vertical three-stop gradient that can be animated.
export function skyDome(radius = 400) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color('#5fb4ff') },
      mid: { value: new THREE.Color('#aee3ff') },
      bot: { value: new THREE.Color('#fff4d6') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(bot, mid, smoothstep(-0.05, 0.12, h));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  m.userData.noDepth = true;
  return m;
}
