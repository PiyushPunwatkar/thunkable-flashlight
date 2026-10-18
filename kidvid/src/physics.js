// Deterministic toy physics shared by the planner (sound timing) and the renderer (motion).
// Units: 1 scene unit ~ 0.4 m, so gravity is 9.8 / 0.4.
export const G = 24.5;

// Object dropped from height y0 (above its resting height) at tau = 0, bouncing with
// restitution e. Returns height above rest, squash (0..1) and the contact times.
export function drop(tau, y0, e = 0.3) {
  const contacts = [];
  let t0 = Math.sqrt((2 * y0) / G), v = G * t0;
  contacts.push({ t: t0, v });
  if (tau < t0) return { y: y0 - 0.5 * G * tau * tau, squash: 0, contacts: contactsOf(y0, e) };
  let t = t0;
  for (let k = 0; k < 6; k++) {
    v *= e;
    const air = (2 * v) / G;
    if (tau < t + air) { const u = tau - t; return { y: v * u - 0.5 * G * u * u, squash: squashAt(tau, y0, e), contacts: contactsOf(y0, e) }; }
    t += air;
  }
  return { y: 0, squash: squashAt(tau, y0, e), contacts: contactsOf(y0, e) };
}
export function contactsOf(y0, e = 0.3) {
  const out = [];
  let t = Math.sqrt((2 * y0) / G), v = G * t;
  for (let k = 0; k < 6 && v > 0.15; k++) { out.push({ t, v }); v *= e; t += (2 * v) / G; }
  return out;
}
function squashAt(tau, y0, e) {
  let s = 0;
  for (const c of contactsOf(y0, e)) { const u = tau - c.t; if (u > 0 && u < 0.12) s = Math.max(s, Math.min(1, c.v / 6) * Math.sin((Math.PI * u) / 0.12)); }
  return s;
}
// Damped wobble after a landing (rocking toy), in radians.
export const wobble = (tau, amp = 0.08) => (tau > 0 ? amp * Math.exp(-5 * tau) * Math.sin(17 * tau) : 0);

// Ball rolling in, bouncing, nudged and finally kicked away. Integrated once at 240 Hz.
export function ballTrack({ t0, x0 = 2.6, y0 = 0.4, vx0 = -1.7, r = 0.15, ground = 0.15, nudges = [], until = 60 }) {
  const dt = 1 / 240, out = [], bounces = [];
  let x = x0, y = y0, vx = vx0, vy = 0, rot = 0, t = t0, ni = 0;
  const ns = [...nudges].sort((a, b) => a.t - b.t);
  while (t < until) {
    while (ni < ns.length && ns[ni].t <= t) { vx += ns[ni].vx; vy += ns[ni].vy ?? 0; ni++; }
    vy -= G * dt; x += vx * dt; y += vy * dt;
    if (y < ground) { y = ground; if (-vy > 0.35) bounces.push({ t, v: -vy }); vy = -vy * 0.58; vx *= 0.93; if (Math.abs(vy) < 0.35) vy = 0; }
    if (y <= ground + 1e-4) vx *= Math.exp(-0.9 * dt);
    rot += (-vx * dt) / r;
    out.push([x, y, rot]);
    t += dt;
  }
  return { t0, dt, out, bounces, at(tt) { if (tt <= t0) return null; const i = Math.min(out.length - 1, Math.floor((tt - t0) / dt)); return out[i]; } };
}

// Shared staging constants, so the planner's sound events land on the renderer's impacts.
export const LETTER_DROP = { delay: 0.5, y0: 0.3, e: 0.28 }; // after the reveal: hover, then fall
export const PROP_DROP = { y0: 0.25, e: { apple: 0.25, ball: 0.55, egg: 0.12, fish: 0.2, star: 0.3 } };
export const CRITTERS = /^(cat|kitten|dog|puppy)$/i;
export const bonusBall = (t0, danceT0, until) =>
  ballTrack({ t0, vx0: -1.55, nudges: [{ t: t0 + 1.75, vx: 0.45 }, ...(danceT0 != null ? [{ t: danceT0 - 0.35, vx: 3.2, vy: 2.2 }] : [])], until });
