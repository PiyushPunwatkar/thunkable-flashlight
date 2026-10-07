"""Socky and the Tiny Door - Episode 3. Reuses the Episode 2 characters + flower scene (skia)."""
import os, sys, math, random, subprocess
import skia, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ep02-rainbow-bridge'))
import render as E2
from render import (W, H, FPS, clamp, lerp, seg, smooth, ease_io, ease_out, ease_back, pulse, C, CA, mix, P, lin, rad,
                    oval, star, ADD, SCREEN, draw_char, draw_shadow, S_CHAR)

DUR = 60.0
NF = int(FPS * DUR)
G = 1500.0  # town ground

# ======================================================== part 1: the flower door (Episode 2 world)
T3 = [0.0]
def t_map(t):  # Episode-3 time -> Episode-2 time (door 55.3->56.8 = slowly opening, never reaching ep2's ending)
    return 55.3 + 0.62 * t if t < 2.4 else 56.788 + 0.6 * (t - 2.4)

FCAM = [(0, 2875, 1190, 1.42), (2.4, 2860, 1190, 1.3), (4.3, 2880, 1170, 1.3), (5.0, 2965, 1075, 6.0)]
def flower_cam(_t):
    t = T3[0]
    for a, b in zip(FCAM, FCAM[1:]):
        if a[0] <= t <= b[0]:
            p = seg(t, a[0], b[0]); p = p * p * p if b[0] == 5.0 else ease_io(p)
            return lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p)
    return FCAM[-1][1:]

DOOR = (E2.DOOR_FX, E2.DOOR_BLOOM_Y)
def base_state(x, y, **kw):
    st = dict(x=x, y=y, air=max(0.0, G - y), sx=1, sy=1, dir=1, spin=0, lean=0, look=(0.75, 0.0), mouth='smile',
              eye=1.0, squint=0, jiggle_t=5.0)
    st.update(kw); return st

def flower_state(name, _t):
    t = T3[0]
    socky = name == 'socky'
    x0 = 2760 if socky else 2620
    look = (0.8, -0.65)
    breeze = smooth(seg(t, 1.4, 2.4))
    # friend scoots over and grabs on (squishes against Socky)
    if not socky: x0 = lerp(2620, 2688, ease_back(seg(t, 2.5, 3.0)))
    st = base_state(x0, G, look=look, mouth='o' if t < 2.6 else 'open', eye=1.15 + 0.1 * breeze)
    # breeze pulls the stripes upward: stretch + lean toward the door, flutter
    fl = math.sin(t * 31 + (0 if socky else 1.3)) * 0.03 * breeze
    st['sy'] = 1 + 0.22 * breeze * (1 if socky else 0.75) + fl; st['sx'] = 1 / st['sy']
    st['lean'] = 9 * breeze + 3 * math.sin(t * 17) * breeze
    if not socky and t > 2.5: st['lean'] -= 6 * smooth(seg(t, 2.5, 2.9)); st['look'] = (-0.6, -0.3)
    if socky and t > 2.9: st['look'] = (-0.5, -0.2)
    # WHOOSH: sucked into the doorway, spinning and shrinking
    t0 = 3.55 if socky else 3.62
    p = seg(t, t0, t0 + 0.75)
    if p > 0:
        e = p * p
        tx, ty = DOOR[0] - 4, DOOR[1] + 10
        st['x'] = lerp(x0, tx, e) - 90 * math.sin(p * math.pi) * (1 if socky else 0.7)
        st['y'] = lerp(G, ty + 60 * (1 - e), e) - 120 * math.sin(p * math.pi)
        k = lerp(1.0, 0.06, e)
        st['sx'] *= k; st['sy'] *= k; st['lean'] = 540 * e; st['mouth'] = 'open'
        st['air'] = G - st['y']
        if p >= 1: st['sx'] = st['sy'] = 0.0001
    return st

def draw_flower_part(cv, t):
    T3[0] = t
    E2.char_state = flower_state
    E2.camera = flower_cam
    tm = t_map(t)
    E2.draw_frame(cv, tm)
    cx, cy, z = flower_cam(0)
    def scr(wx, wy): return (wx - cx) * z + W / 2, (wy - cy) * z + H / 2
    dx, dy = scr(*DOOR)
    # magical breeze: glowing streaks + sparkles spiralling into the door
    b = smooth(seg(t, 1.3, 2.2)) * (1 - smooth(seg(t, 4.6, 5.0)))
    if b > 0:
        for k in range(26):
            ph = (t * 0.9 + k * 0.137) % 1.0
            ang = k * 2.39996 + ph * 2.2
            r0 = (1 - ph) * 900 + 40
            x1, y1 = dx + r0 * math.cos(ang), dy + r0 * math.sin(ang) * 0.8
            r1 = r0 * 0.78; a2 = ang + 0.35
            x2, y2 = dx + r1 * math.cos(a2), dy + r1 * math.sin(a2) * 0.8
            pth = skia.Path(); pth.moveTo(x1, y1); pth.quadTo((x1 + x2) / 2 + 30, (y1 + y2) / 2 - 30, x2, y2)
            a = b * math.sin(ph * math.pi) * 0.7
            cv.drawPath(pth, P(C('#FFF6D0', a), stroke=5, blend=ADD))
            if k % 3 == 0: star(cv, x2, y2, 11, C(['#FFFFFF', '#FFE27A', '#FFC2F0'][k % 3], a))
    if t > 3.4:  # whoosh swirl ring
        p = seg(t, 3.4, 4.6)
        for i in range(3):
            rr = (1 - p) * (380 + i * 120) * z / 1.3
            cv.drawArc(oval(dx, dy, rr, rr * 0.8), (t * 400 + i * 120) % 360, 220, False, P(C('#FFFFFF', 0.45 * math.sin(p * math.pi)), stroke=10, blend=ADD))
    # golden flash into the tiny world
    f = smooth(seg(t, 4.4, 5.0))
    if f > 0: cv.drawRect(skia.Rect(0, 0, W, H), P(mix(C('#FFE9A8'), C('#FFFFFF'), f), alpha=f))
    if t < 0.8: cv.drawRect(skia.Rect(0, 0, W, H), P(C('#FFF2C8', 0.45 * (1 - t / 0.8))))  # Episode 2's golden ending glow

# ======================================================== part 2: the tiny town
TCAM = [(5.0, 1110, 1000, 0.8), (10.0, 1230, 1010, 0.86), (11.6, 1345, 1000, 1.0), (25.0, 1355, 1000, 1.0),
        (27.5, 1450, 990, 1.0), (40.0, 1490, 980, 1.0), (50.0, 1530, 980, 1.0), (52.4, 1590, 990, 1.0),
        (55.2, 2130, 990, 0.62), (60.0, 2190, 980, 0.64)]
def town_cam(t):
    for a, b in zip(TCAM, TCAM[1:]):
        if a[0] <= t <= b[0]:
            p = ease_io(seg(t, a[0], b[0]))
            return lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p)
    return TCAM[-1][1:]

DOORS = [(1330, 'round', '#9B7BFF'), (1545, 'square', '#3CC7B4'), (1765, 'triangle', '#FF9F43')]
DOOR_GLOW = [15.6, 16.5, 17.4]
COUNT_T = [33.4, 34.6, 35.8, 37.0, 38.2]
OBJ_X = [1300, 1460, 1620, 1780]; OBJ_Y = 1010
TOWER_X, TOWER_BASE = 2800, 1290
PATH_PTS = [(1720, 1545), (2250, 1565), (2520, 1395), (2780, 1300)]

def bez(pts, u):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = pts; v = 1 - u
    return (v**3 * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u**3 * x3, v**3 * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u**3 * y3)

def hops3(name):
    L = []
    if name == 'socky':
        L += [(8.15, 8.45, 1100, 1100, 30), (9.15, 9.45, 1100, 1100, 30), (10.4, 10.8, 1100, 1100, 45)]
        L += [(25.95, 26.4, 1100, 1260, 90), (26.5, 26.95, 1260, 1440, 90), (27.05, 27.45, 1440, 1600, 80)]
        L += [(30.15, 30.6, 1600, 1600, 120), (31.05, 31.5, 1600, 1600, 110), (31.95, 32.4, 1600, 1600, 120)]
        for i in (0, 2, 4): L.append((COUNT_T[i] - 0.38, COUNT_T[i] + 0.38, 1600, 1600, 125))
        for k in range(3): L.append((39.15 + .3 * k, 39.15 + .3 * k + .26, 1600, 1600, 24))
        L.append((48.3, 49.05, 1600, 1600, 130))
        for k in range(6): L.append((56.3 + .6 * k, 56.3 + .6 * k + .45, 1600 + 120 * k, 1720 + 120 * k, 80))
    else:
        L += [(8.4, 8.7, 875, 875, 28), (10.6, 11.0, 875, 875, 40)]
        L += [(27.0, 27.45, 875, 1120, 80), (27.55, 28.0, 1120, 1300, 80), (28.1, 28.5, 1300, 1430, 70)]
        L += [(30.55, 31.0, 1430, 1430, 110), (31.45, 31.9, 1430, 1430, 100), (32.35, 32.8, 1430, 1430, 110)]
        for i in (1, 3): L.append((COUNT_T[i] - 0.38, COUNT_T[i] + 0.38, 1430, 1430, 125))
        for k in range(3): L.append((39.3 + .32 * k, 39.3 + .32 * k + .26, 1430, 1430, 20))
        L.append((48.55, 49.1, 1430, 1430, 80))
        for k in range(6): L.append((56.7 + .6 * k, 56.7 + .6 * k + .45, 1430 + 120 * k, 1550 + 120 * k, 75))
    return L
HOPS3 = {n: hops3(n) for n in ('socky', 'friend')}
LAND = {'socky': (5.15, 6.1, 1100), 'friend': (5.3, 6.3, 875)}

def town_state(name, t):
    socky = name == 'socky'
    tl0, tl1, xl = LAND[name]
    st = base_state(xl, G)
    x = xl; air = 0
    last = tl1
    for (t0, t1, x0, x1, hh) in HOPS3[name]:
        if t >= t1: x = x1; last = max(last, t1)
        if t0 <= t < t1:
            p = (t - t0) / (t1 - t0)
            x = lerp(x0, x1, smooth(p) * .3 + p * .7); air = 4 * hh * p * (1 - p)
            st['sy'] = 1 + 0.12 * math.sin(p * math.pi); st['sx'] = 1 / st['sy']
            if p < 0.12: st['sy'] = 0.85 + p; st['sx'] = 1.12
        if t1 <= t < t1 + 0.18:
            q = (t - t1) / 0.18; s = 0.18 * math.sin(q * math.pi) * (1 - q * 0.3)
            st['sy'] = 1 - s; st['sx'] = 1 + s * 0.8
    # tumbling in from the sky
    if t < tl1:
        p = seg(t, tl0 - 0.15, tl1)
        air = lerp(1500, 0, p * p); x = xl - 160 * (1 - p)
        st['lean'] = 720 * (1 - p) * (1 if socky else -1); st['mouth'] = 'open'; st['eye'] = 1.2
    if tl1 <= t < tl1 + 0.25:
        q = (t - tl1) / 0.25; s = 0.3 * math.sin(q * math.pi); st['sy'] = 1 - s; st['sx'] = 1 + s
    st['x'] = x; st['y'] = G - air; st['air'] = air; st['jiggle_t'] = t - last
    if air == 0: st['sy'] *= 1 + 0.018 * math.sin(t * 3.1 + (0 if socky else 1.3))
    def lk(v): st['look'] = v
    def at(tx, ty):
        dx = (tx - st['x']) * st['dir']; dy = ty - (st['y'] - 160 * S_CHAR); d = math.hypot(dx, dy) + 1e-6
        return (dx / d, dy / d)
    # --- acting
    if 6.1 <= t < 10.2:  # amazement: look around the tiny town
        st['eye'] = 1.22; st['mouth'] = 'o' if t < 7.4 else 'open'
        a = (t - 6.1) * 1.5 + (0 if socky else 0.8)
        lk((math.cos(a) * 0.9, -0.55 + 0.35 * math.sin(a * 1.7)))
        if socky and 8.3 <= t < 9.3: st['dir'] = -1
        if not socky and 8.55 <= t < 9.6: st['dir'] = -1
    if 10.2 <= t < 12.0:
        lk(at(1545, 1380)); st['mouth'] = 'o'; st['eye'] = 1.15
    if 12.0 <= t < 13.2:
        lk(at(1545, 1150)); st['mouth'] = 'o'
    if 13.2 <= t < 15.6:  # confused: head tilts, eyes darting between doors
        dd = DOORS[int((t * 2.2) % 3)][0]
        lk(at(dd, 1390)); st['lean'] = 7 * math.sin(t * 3.4); st['mouth'] = 'o'
    if 15.6 <= t < 18.3:
        i = min(2, int((t - 15.6) / 0.9)); lk(at(DOORS[i][0], 1390))
    if 18.3 <= t < 20.3:  # thinking hard
        lk((0.35, -0.95)); st['lean'] = -5; st['mouth'] = 'smile'
        if socky: st['squint'] = 0
    if 20.3 <= t < 23.0:  # looks out at the viewer while the question is asked
        lk((0.0, 0.12)) if socky else lk(at(1545, 1390)); st['eye'] = 1.1
    if 23.0 <= t < 25.9:
        dd = DOORS[int(((t - 23.0) * 1.4) % 3)][0]; lk(at(dd, 1390))
    if 25.2 <= t < 28.3: lk(at(1765, 1380)); st['mouth'] = 'open'
    if 28.3 <= t < 30.1: lk(at(1765, 1060)); st['mouth'] = 'open'; st['eye'] = 1.15
    if 30.1 <= t < 33.0:
        bx, by = bubble_pos(int((t * 1.3) % 5), t); lk(at(bx, by)); st['mouth'] = 'open'
    if 33.0 <= t < 39.0:
        i = min(4, max(0, int((t - 33.0 + 0.6) / 1.2))); bx, by = bubble_pos(i, t); lk(at(bx, by)); st['mouth'] = 'smile'
    if 39.0 <= t < 40.4: st['squint'] = 1; st['mouth'] = 'open'
    if 40.4 <= t < 43.4:
        i = min(3, int((t - 40.4) / 0.75)); lk(at(OBJ_X[i], OBJ_Y))
    if 43.4 <= t < 44.6: lk((0.0, 0.12)) if socky else lk(at(OBJ_X[3], OBJ_Y))
    if 44.6 <= t < 46.2:
        i = int(((t - 44.6) * 2.5) % 4); lk(at(OBJ_X[i], OBJ_Y))
    if 46.2 <= t < 48.3: lk(at(OBJ_X[3], OBJ_Y)); st['mouth'] = 'open'; st['eye'] = 1.12
    if 48.3 <= t < 49.05 and socky: st['spin'] = seg(t, 48.3, 49.05) * 4 * math.pi; st['mouth'] = 'open'; st['squint'] = 1
    if 49.0 <= t < 50.2: st['mouth'] = 'open'
    if 50.2 <= t < 52.6:
        mx, my = map_pos(t); lk(at(mx, my)); st['mouth'] = 'o'; st['eye'] = 1.18
    if 52.6 <= t < 56.2:
        lk(at(TOWER_X, 150)); st['mouth'] = 'o'; st['eye'] = 1.22
    if 56.2 <= t:
        lk(at(TOWER_X, 300)); st['mouth'] = 'open'
        if socky and t < 56.4: st['mouth'] = 'smile'
    return st

# ------------------------------------------------ props
def bubble_pos(i, t):
    """Five big bubbles: drift out of the triangle door, bob, then float to a sock to be popped on the count."""
    rest = [(1380, 1030), (1500, 960), (1620, 1010), (1740, 950), (1860, 1020)]
    sx, sy = 1765, 1360
    e = ease_out(seg(t, 28.4 + 0.25 * i, 29.8 + 0.25 * i))
    rx, ry = rest[i]
    x = lerp(sx, rx, e) + 18 * math.sin(t * 1.7 + i * 1.3); y = lerp(sy, ry, e) + 14 * math.sin(t * 2.1 + i)
    if 30.0 <= t < 32.9:  # dodge the catching hops
        x += 40 * math.sin(t * 2.6 + i * 2); y -= 30 * abs(math.sin(t * 2.2 + i))
    tc = COUNT_T[i]
    tgt = 1600 + 12 if i % 2 == 0 else 1430 + 12
    m = ease_io(seg(t, tc - 1.0, tc - 0.15))
    x = lerp(x, tgt, m); y = lerp(y, G - 125 - 280 - 52, m)
    return x, y

def draw_bubble(cv, x, y, r, t, i):
    cv.drawCircle(x, y, r, P(shader=rad(x, y, r, [C('#FFFFFF', 0.02), C('#E8F6FF', 0.08), C('#B8E4FF', 0.32)], [0, .7, 1])))
    sweep = skia.GradientShader.MakeSweep(x, y, [C('#FF9AD5', .8), C('#FFE27A', .8), C('#8BF0C8', .8), C('#8FC8FF', .8), C('#C5A3FF', .8), C('#FF9AD5', .8)],
                                          localMatrix=skia.Matrix.RotateDeg(t * 60 + i * 50, (x, y)))
    cv.drawCircle(x, y, r - 2, P(shader=sweep, stroke=5))
    cv.drawOval(oval(x - r * .38, y - r * .42, r * .22, r * .13), P(C('#FFFFFF', 0.85)))
    cv.drawCircle(x + r * .4, y + r * .38, r * .07, P(C('#FFFFFF', 0.6)))

def draw_pop(cv, x, y, p, r=55):
    a = 1 - p
    cv.drawCircle(x, y, r * (1 + 0.8 * p), P(C('#FFFFFF', 0.8 * a), stroke=6 * a + 1))
    for k in range(8):
        ang = k * math.pi / 4 + 0.3
        rr = r * (0.9 + 1.4 * p)
        cv.drawCircle(x + math.cos(ang) * rr, y + math.sin(ang) * rr, 7 * a + 1, P(C(['#9FE6FF', '#FFC2F0', '#FFF39A'][k % 3], a)))
    star(cv, x, y, 30 * a, C('#FFFFFF', a))

def apple_path(r):
    p = skia.Path()
    p.moveTo(0, -r * 0.62)
    p.cubicTo(r * 0.45, -r * 1.05, r * 1.15, -r * 0.7, r * 1.0, r * 0.05)
    p.cubicTo(r * 0.9, r * 0.75, r * 0.45, r * 1.05, 0, r * 0.88)
    p.cubicTo(-r * 0.45, r * 1.05, -r * 0.9, r * 0.75, -r * 1.0, r * 0.05)
    p.cubicTo(-r * 1.15, -r * 0.7, -r * 0.45, -r * 1.05, 0, -r * 0.62)
    p.close(); return p
APPLE = apple_path(62)

def draw_apple(cv, x, y, s, rot=0):
    cv.save(); cv.translate(x, y); cv.rotate(rot); cv.scale(s, s)
    cv.drawCircle(0, 8, 70, P(C('#3a1030', 0.18), blur=12))
    cv.drawPath(APPLE, P(shader=rad(-22, -20, 95, [C('#FF8A80'), C('#F0262F'), C('#A3101C')], [0, .45, 1])))
    cv.drawOval(oval(-26, -18, 11, 20), P(C('#FFFFFF', 0.55), blur=4))
    pth = skia.Path(); pth.moveTo(0, -36); pth.quadTo(2, -58, 10, -70)
    cv.drawPath(pth, P(C('#6B3E1E'), stroke=7))
    lf = skia.Path(); lf.moveTo(6, -60); lf.cubicTo(20, -82, 44, -80, 52, -68); lf.cubicTo(40, -54, 18, -52, 6, -60); lf.close()
    cv.drawPath(lf, P(shader=lin(6, -80, 52, -54, [C('#9BEA7A'), C('#3FA244')])))
    cv.restore()

def star_path(R, r=None, n=5):
    r = r or R * 0.48; p = skia.Path()
    for i in range(n * 2):
        a = -math.pi / 2 + i * math.pi / n; rr = R if i % 2 == 0 else r
        (p.moveTo if i == 0 else p.lineTo)(rr * math.cos(a), rr * math.sin(a))
    p.close(); return p
STAR = star_path(78)

def draw_big_star(cv, x, y, s, rot=0, glow=0.0):
    cv.save(); cv.translate(x, y); cv.rotate(rot); cv.scale(s, s)
    if glow > 0: cv.drawCircle(0, 0, 150, P(shader=rad(0, 0, 150, [C('#FFF3A0', 0.7 * glow), C('#FFE066', 0)]), blend=ADD))
    cv.drawPath(STAR, P(C('#A8670A', 0.3), blur=8))
    cv.drawPath(STAR, P(shader=rad(-18, -22, 110, [C('#FFFBD0'), C('#FFD233'), C('#F09A0A')], [0, .45, 1])))
    cv.drawPath(STAR, P(C('#C27A06', 0.7), stroke=4))
    cv.drawOval(oval(-18, -24, 10, 18), P(C('#FFFFFF', 0.6), blur=3))
    cv.restore()

def map_pos(t):
    p = ease_io(seg(t, 51.0, 52.4))
    x = lerp(OBJ_X[3], 1745, p); y = lerp(OBJ_Y, 1070, p) - 60 * math.sin(p * math.pi)
    if t > 56.2:  # floats ahead, leading the way
        so = town_state('socky', t)['x'] if t < 60.1 else 2320
        x = max(x, so + 150)
    return x, y + 10 * math.sin(t * 2.2)

def draw_map(cv, x, y, s, t, unroll):
    w, h = 250 * max(0.08, unroll), 170
    cv.save(); cv.translate(x, y); cv.rotate(4 * math.sin(t * 1.6)); cv.scale(s, s)
    cv.drawCircle(0, 0, 260, P(shader=rad(0, 0, 260, [C('#FFF0A0', 0.6), C('#FFD45E', 0)]), blend=ADD))
    body = skia.RRect.MakeRectXY(skia.Rect(-w / 2, -h / 2, w / 2, h / 2), 10, 10)
    cv.drawRRect(body, P(shader=lin(0, -h / 2, 0, h / 2, [C('#FFF6CC'), C('#FFE08A'), C('#F2B744')])))
    cv.drawRRect(body, P(C('#B97A12', 0.7), stroke=4))
    if unroll > 0.6:
        a = smooth(seg(unroll, 0.6, 1.0))
        cv.save(); cv.clipRRect(body, doAntiAlias=True)
        n = 11
        dots = smooth(seg(t, 52.0, 54.6))
        for k in range(int(n * dots)):
            u = k / (n - 1); px = lerp(-95, 70, u); py = 50 - 95 * u + 25 * math.sin(u * 6)
            cv.drawCircle(px, py, 5, P(C('#D2452E', a)))
        # tiny clock tower drawing
        cv.drawRect(skia.Rect(70, -40, 100, 20), P(C('#B06A10', a)))
        tri = skia.Path(); tri.moveTo(64, -40); tri.lineTo(85, -70); tri.lineTo(106, -40); tri.close()
        cv.drawPath(tri, P(C('#7A4CC0', a)))
        cv.drawCircle(85, -25, 9, P(C('#FFF6CC', a)))
        star(cv, -98, 52, 12, C('#E8452E', a))
        cv.restore()
    for sx in (-w / 2, w / 2):  # rolled ends
        cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(sx - 13, -h / 2 - 12, sx + 13, h / 2 + 12), 13, 13),
                     P(shader=lin(sx - 13, 0, sx + 13, 0, [C('#E09A2A'), C('#FFE9A8'), C('#C27A12')])))
    cv.restore()

# ------------------------------------------------ town scenery
rng = random.Random(11)
def window(cv, x, y, w, h, t, lit=1.0, arch=False):
    r = skia.RRect.MakeRectXY(skia.Rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2), w / 2 if arch else 6, w / 2 if arch else 6)
    fl = 0.9 + 0.1 * math.sin(t * 5 + x)
    cv.drawRRect(r, P(shader=rad(x, y, h, [C('#FFF6C2'), C('#FFC94A'), C('#F08A1A')], [0, .6, 1]), alpha=lit))
    cv.drawCircle(x, y, h * 1.1, P(shader=rad(x, y, h * 1.1, [C('#FFD27A', 0.35 * fl * lit), C('#FFD27A', 0)]), blend=ADD))
    cv.drawRRect(r, P(C('#7a4a2a', 0.8), stroke=4))
    cv.drawLine(x, y - h / 2, x, y + h / 2, P(C('#7a4a2a', 0.8), stroke=3))
    cv.drawLine(x - w / 2, y, x + w / 2, y, P(C('#7a4a2a', 0.8), stroke=3))

def house(cv, x0, x1, top, body, roof, t, kind='house'):
    w = x1 - x0; cxh = (x0 + x1) / 2
    cv.drawRect(skia.Rect(x0 + 12, top, x1 + 12, G), P(C('#2a1640', 0.18), blur=10))
    b = skia.RRect.MakeRectXY(skia.Rect(x0, top, x1, G + 5), 14, 14)
    cb = C(body)
    cv.drawRRect(b, P(shader=lin(x0, 0, x1, 0, [mix(cb, C('#ffffff'), .25), cb, mix(cb, C('#3a1a40'), .22)], [0, .45, 1])))
    cv.drawRect(skia.Rect(x0, G - 60, x1, G + 5), P(shader=lin(0, G - 60, 0, G, [C('#000000', 0), C('#3a1a40', 0.25)])))
    # roof
    cr = C(roof)
    rp = skia.Path(); rp.moveTo(x0 - 30, top + 10); rp.quadTo(cxh, top - w * 0.75, x1 + 30, top + 10); rp.close()
    cv.drawPath(rp, P(shader=lin(0, top - w * .6, 0, top + 10, [mix(cr, C('#ffffff'), .3), cr, mix(cr, C('#000000'), .25)])))
    for k in range(4):  # scalloped roof tiles
        yy = top - k * w * 0.13
        cv.drawLine(x0 + k * 22, yy, x1 - k * 22, yy, P(C('#000000', 0.12), stroke=3))
    cv.drawRect(skia.Rect(x1 - w * .28, top - w * .5, x1 - w * .16, top - w * .2), P(C('#9a5a4a')))
    if kind == 'shop':
        aw_y = G - 330
        n = 6; sw = w / n
        cv.drawRect(skia.Rect(x0 - 10, aw_y - 40, x1 + 10, aw_y), P(C('#ffffff')))
        for k in range(n):
            cv.drawRect(skia.Rect(x0 - 10 + k * (w + 20) / n, aw_y - 40, x0 - 10 + (k + .5) * (w + 20) / n, aw_y), P(C(roof)))
        for k in range(n):
            cv.drawArc(oval(x0 - 10 + (k + .5) * (w + 20) / n, aw_y, (w + 20) / n / 2, 18), 0, 180, True, P(C(roof) if k % 2 == 0 else C('#ffffff')))
        # shop window with toys
        wx0, wx1, wy0, wy1 = x0 + 25, x1 - 25, aw_y + 40, G - 40
        cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(wx0, wy0, wx1, wy1), 12, 12), P(shader=rad((wx0 + wx1) / 2, wy0, wy1 - wy0, [C('#FFF6D0'), C('#FFD98A')])))
        cv.drawCircle((wx0 + wx1) / 2, (wy0 + wy1) / 2, (wy1 - wy0) * 0.9, P(C('#FFD27A', 0.25), blend=ADD))
        mid = (wy0 + wy1) / 2 + 20
        cv.drawCircle(wx0 + 50, mid + 20, 34, P(shader=skia.GradientShader.MakeSweep(wx0 + 50, mid + 20, [C('#FF4D5E'), C('#FFE14D'), C('#4DA6FF'), C('#FF4D5E')])))
        cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(wx0 + 95, mid - 6, wx0 + 150, mid + 54), 6, 6), P(C('#5BD86B')))
        cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(wx0 + 110, mid - 56, wx0 + 160, mid - 6), 6, 6), P(C('#9B6BFF')))
        tx = wx1 - 55  # teddy
        cv.drawCircle(tx, mid + 25, 30, P(C('#C98A4E'))); cv.drawCircle(tx, mid - 22, 24, P(C('#C98A4E')))
        cv.drawCircle(tx - 18, mid - 40, 9, P(C('#B0743A'))); cv.drawCircle(tx + 18, mid - 40, 9, P(C('#B0743A')))
        cv.drawCircle(tx - 8, mid - 24, 3.5, P(C('#2a1a10'))); cv.drawCircle(tx + 8, mid - 24, 3.5, P(C('#2a1a10')))
        cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(wx0, wy0, wx1, wy1), 12, 12), P(C('#7a4a2a'), stroke=6))
        for yy in np.arange(top + 110, aw_y - 90, 170):
            window(cv, x0 + w * .3, yy, 62, 74, t, arch=True); window(cv, x1 - w * .3, yy, 62, 74, t, arch=True)
    else:
        for yy in np.arange(top + 100, G - 260, 170):
            window(cv, x0 + w * .3, yy, 62, 74, t, arch=True)
            window(cv, x1 - w * .3, yy, 62, 74, t, arch=True)
        dr = skia.RRect.MakeRectXY(skia.Rect(cxh - 45, G - 150, cxh + 45, G + 2), 45, 45)
        cv.drawRRect(dr, P(shader=lin(0, G - 150, 0, G, [C('#C47B4A'), C('#8A4E2A')])))
        cv.drawCircle(cxh + 25, G - 70, 6, P(C('#FFD233')))
        for k in range(3):  # flower box
            cv.drawCircle(x0 + w * .3 - 20 + k * 20, top + 135, 9, P(C(['#FF6FA0', '#FFE14D', '#9B7BFF'][k])))

def tri_path(w, h):
    p = skia.Path(); p.moveTo(-w / 2, 0); p.lineTo(0, -h); p.lineTo(w / 2, 0); p.close(); return p

def shape_path(kind):
    p = skia.Path()
    if kind == 'round': p.addCircle(0, -100, 96)
    elif kind == 'square': p.addRRect(skia.RRect.MakeRectXY(skia.Rect(-92, -194, 92, -6), 10, 10))
    else:
        p = skia.Path(); p.moveTo(-112, -6); p.lineTo(0, -222); p.lineTo(112, -6); p.close()
    return p
SHAPES = {k: shape_path(k) for k in ('round', 'square', 'triangle')}

def draw_door_building(cv, t):
    x0, x1, top = 1150, 1945, 600
    house(cv, x0, x1, top, '#FFE3C2', '#E8668A', t)
    # round attic window
    window(cv, (x0 + x1) / 2, top + 110, 90, 90, t, arch=True)
    for yy in (top + 290, top + 460):
        for xx in (1260, 1440, 1650, 1830): window(cv, xx, yy, 66, 84, t, arch=True)
    # ivy
    for k in range(22):
        cv.drawCircle(x0 + 8 + 7 * math.sin(k), top + 60 + k * 38, 16, P(C('#5BC75A' if k % 2 else '#3FA244')))
    for i, (dx, kind, col) in enumerate(DOORS):
        g = pulse(t, DOOR_GLOW[i], DOOR_GLOW[i] + 0.9)
        if kind == 'triangle': g = max(g, 0.85 * smooth(seg(t, 24.9, 25.4)) * (1 - smooth(seg(t, 28.6, 29.6))))
        open_k = ease_io(seg(t, 27.7, 28.5)) if kind == 'triangle' else 0
        cv.save(); cv.translate(dx, G + 2)
        sp = SHAPES[kind]
        if g > 0:
            cv.drawCircle(0, -105, 230, P(shader=rad(0, -105, 230, [C('#FFF3A8', 0.75 * g), C('#FFE066', 0)]), blend=ADD))
        # frame
        fr = skia.Path(sp); m = skia.Matrix(); m.setScale(1.16, 1.1, 0, -100 if kind != 'triangle' else -60); fr.transform(m)
        cv.drawPath(fr, P(shader=lin(-120, -230, 120, 0, [C('#FFF3B0'), C('#E8B01E'), C('#A86E05')])))
        # interior (seen when open): bubbly light
        cv.drawPath(sp, P(shader=rad(0, -90, 180, [C('#FFFFFF'), C('#D8C8FF'), C('#7A5CC7')], [0, .4, 1])))
        cv.save(); cv.clipPath(sp, doAntiAlias=True)
        pw = 1 - open_k * 1.2
        if pw > -0.2:
            cv.translate(-115, 0); cv.scale(pw, 1); cv.translate(115, 0)
            c = C(col)
            cv.drawPath(sp, P(shader=lin(-110, 0, 110, 0, [mix(c, C('#ffffff'), .3), c, mix(c, C('#000000'), .25)])))
            cv.drawPath(sp, P(C('#ffffff', 0.18 + 0.4 * g), blend=SCREEN))
            ky = -90 if kind != 'triangle' else -60
            cv.drawCircle(46 if kind != 'triangle' else 30, ky, 10, P(shader=rad(42, ky - 4, 12, [C('#FFFFFF'), C('#FFC21A'), C('#9C6200')])))
        cv.restore()
        cv.drawPath(sp, P(C('#8A5A00', 0.55), stroke=4))
        if g > 0.2:
            for k in range(6):
                a = k * 1.05 + t * 2.5; rr = 140
                star(cv, rr * math.cos(a), -105 + rr * 0.9 * math.sin(a), 12, C('#FFFFFF', g * (0.5 + 0.5 * math.sin(t * 8 + k))))
        cv.restore()
    # tiny bell on a bracket above the middle door
    bx, by = 1545, 1225
    cv.drawLine(bx - 50, by - 50, bx + 30, by - 50, P(C('#8A5A2A'), stroke=8))
    cv.drawLine(bx - 50, by - 50, bx - 50, by - 10, P(C('#8A5A2A'), stroke=8))
    sw = 22 * math.sin((t - 12.0) * 16) * math.exp(-(t - 12.0) * 2.2) if 12.0 <= t < 14.5 else 0
    cv.save(); cv.translate(bx, by - 50); cv.rotate(sw)
    bl = skia.Path(); bl.moveTo(-26, 52); bl.cubicTo(-26, 10, -16, 4, 0, 4); bl.cubicTo(16, 4, 26, 10, 26, 52); bl.close()
    cv.drawLine(0, 0, 0, 6, P(C('#8A5A2A'), stroke=4))
    cv.drawPath(bl, P(shader=lin(-26, 0, 26, 0, [C('#FFF3B0'), C('#F2B21E'), C('#A86E05')])))
    cv.drawCircle(0, 56, 7, P(C('#A86E05')))
    cv.restore()
    if 12.0 <= t < 13.2:
        p = seg(t, 12.0, 13.2)
        for k in range(3):
            rr = 40 + 70 * ((p * 2 + k / 3) % 1)
            cv.drawArc(oval(bx, by - 20, rr, rr * 0.8), -150, 120, False, P(C('#FFFFFF', 0.6 * (1 - p)), stroke=4))

def lantern_string(cv, xa, ya, xb, yb, sag, t, n, seed):
    pth = skia.Path(); pth.moveTo(xa, ya); pth.quadTo((xa + xb) / 2, (ya + yb) / 2 + sag * 2, xb, yb)
    cv.drawPath(pth, P(C('#5a3a5a', 0.8), stroke=3))
    for k in range(1, n):
        u = k / n; x = lerp(lerp(xa, (xa + xb) / 2, u), lerp((xa + xb) / 2, xb, u), u)
        y = lerp(lerp(ya, (ya + yb) / 2 + sag * 2, u), lerp((ya + yb) / 2 + sag * 2, yb, u), u)
        col = C(['#FF8A65', '#FFD54F', '#FF7BC5', '#7FD4FF', '#B6F36B'][(k + seed) % 5])
        sw = 5 * math.sin(t * 2 + k + seed)
        cv.save(); cv.translate(x, y); cv.rotate(sw)
        cv.drawCircle(0, 30, 70, P(shader=rad(0, 30, 70, [CA(col, 0.45), CA(col, 0)]), blend=ADD))
        cv.drawLine(0, 0, 0, 8, P(C('#5a3a5a'), stroke=2))
        cv.drawOval(oval(0, 30, 18, 23), P(shader=rad(-4, 24, 26, [C('#FFFFFF'), col, mix(col, C('#000000'), .2)], [0, .5, 1])))
        cv.drawRect(skia.Rect(-8, 6, 8, 10), P(C('#C27A12'))); cv.drawRect(skia.Rect(-8, 50, 8, 54), P(C('#C27A12')))
        cv.restore()

STONES3 = []
for row in range(14):
    yy = G + 18 + row * 34 + row * row * 3.2
    hh = 12 + row * 1.6; ww = 34 + row * 4
    off = (row % 2) * ww
    for k in range(int(5200 / (2 * ww)) + 2):
        STONES3.append((-800 + off + k * 2 * ww + rng.uniform(-6, 6), yy, ww * 0.9, hh, rng.uniform(0, 1)))

def draw_ground(cv, t):
    cv.drawRect(skia.Rect(-1000, G - 6, 4600, 3200), P(shader=lin(0, G, 0, G + 900, [C('#F2D7B0'), C('#E2B98A'), C('#C99868')])))
    for (x, y, w, h, v) in STONES3:
        c = mix(C('#F7E2C2'), C('#E8C59A'), v)
        cv.drawOval(oval(x, y, w, h), P(shader=lin(0, y - h, 0, y + h, [mix(c, C('#ffffff'), .3), c, mix(c, C('#8a5a3a'), .25)])))
    cv.drawRect(skia.Rect(-1000, G - 6, 4600, G + 40), P(shader=lin(0, G - 6, 0, G + 40, [C('#5a3a3a', 0.25), C('#5a3a3a', 0)])))

def draw_hill_tower(cv, t, reveal):
    # glow behind the tower
    gl = (0.35 + 0.65 * reveal) * (1 + 0.15 * math.sin(t * 2.4) * reveal)
    cv.drawCircle(TOWER_X, 250, 900, P(shader=rad(TOWER_X, 250, 900, [C('#FFF0B8', 0.75 * gl), C('#FFC4E8', 0.3 * gl), C('#FFC4E8', 0)], [0, .4, 1]), blend=SCREEN))
    x0, x1 = TOWER_X - 170, TOWER_X + 170
    body = skia.Path(); body.moveTo(x0, TOWER_BASE + 20); body.lineTo(x0 + 30, 40); body.lineTo(x1 - 30, 40); body.lineTo(x1, TOWER_BASE + 20); body.close()
    cv.drawPath(body, P(shader=lin(x0, 0, x1, 0, [C('#FFF1DC'), C('#F2D4C0'), C('#C9A2B8')], [0, .5, 1])))
    for k in range(9):  # stone bands
        yy = 140 + k * 125
        cv.drawLine(x0 + 30 * (1 - (yy - 40) / (TOWER_BASE - 20)), yy, x1 - 30 * (1 - (yy - 40) / (TOWER_BASE - 20)), yy, P(C('#9a6a8a', 0.25), stroke=4))
    for k in range(4):
        window(cv, TOWER_X, 480 + k * 200, 56, 84, t, lit=0.6 + 0.4 * reveal, arch=True)
    # clock section
    cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(x0 - 10, -130, x1 + 10, 70), 20, 20), P(shader=lin(x0, 0, x1, 0, [C('#E8C2FF'), C('#B48AE8'), C('#7E58C0')])))
    cx, cy, r = TOWER_X, -30, 128
    cv.drawCircle(cx, cy, r + 60, P(shader=rad(cx, cy, r + 60, [C('#FFF6C8', 0.8 * gl), C('#FFE27A', 0)]), blend=ADD))
    cv.drawCircle(cx, cy, r + 12, P(shader=lin(cx - r, cy - r, cx + r, cy + r, [C('#FFF3B0'), C('#E8B01E'), C('#A86E05')])))
    cv.drawCircle(cx, cy, r, P(shader=rad(cx - 30, cy - 30, r * 1.4, [C('#FFFFFF'), C('#FFF6DA'), C('#FFE3A0')], [0, .6, 1])))
    for k in range(12):
        a = k * math.pi / 6
        cv.drawCircle(cx + math.cos(a) * r * 0.82, cy + math.sin(a) * r * 0.82, 9 if k % 3 == 0 else 5, P(C('#7E58C0')))
    ha = math.radians(-60 + t * 6); ma = math.radians(t * 72)
    cv.drawLine(cx, cy, cx + math.sin(ha) * r * 0.48, cy - math.cos(ha) * r * 0.48, P(C('#4a2a6a'), stroke=11))
    cv.drawLine(cx, cy, cx + math.sin(ma) * r * 0.72, cy - math.cos(ma) * r * 0.72, P(C('#4a2a6a'), stroke=7))
    cv.drawCircle(cx, cy, 12, P(C('#E8B01E')))
    # roof + finial
    rf = skia.Path(); rf.moveTo(x0 - 40, -125); rf.quadTo(TOWER_X - 40, -300, TOWER_X, -470); rf.quadTo(TOWER_X + 40, -300, x1 + 40, -125); rf.close()
    cv.drawPath(rf, P(shader=lin(x0, 0, x1, 0, [C('#7FB2FF'), C('#4D6BE0'), C('#2E3C9A')])))
    star(cv, TOWER_X, -500, 34 + 6 * math.sin(t * 3), C('#FFE27A'))
    # hill
    hl = skia.Path(); hl.moveTo(2120, G + 4); hl.cubicTo(2450, G, 2580, TOWER_BASE + 10, TOWER_X, TOWER_BASE)
    hl.cubicTo(3200, TOWER_BASE - 8, 3500, 1380, 4100, G); hl.lineTo(4100, G + 60); hl.lineTo(2120, G + 60); hl.close()
    cv.drawPath(hl, P(shader=lin(0, TOWER_BASE, 0, G, [C('#9BE58C'), C('#5BC75A')])))
    for k in range(16):
        u = k / 15; x = lerp(2300, 3900, u); y = G - (G - TOWER_BASE) * math.exp(-((x - TOWER_X) / 520) ** 2) + 30
        cv.drawCircle(x, y, 9, P(C(['#FF7BC5', '#FFE14D', '#FFFFFF', '#9B7BFF'][k % 4])))

def draw_path_dots(cv, t):
    p = smooth(seg(t, 52.5, 54.9))
    if p <= 0: return
    n = 30
    for k in range(int(n * p) + 1):
        u = k / n
        if u > p: break
        x, y = bez(PATH_PTS, u)
        a = 0.75 + 0.25 * math.sin(t * 6 - k * 0.7)
        s = 1.6 - 0.6 * u
        cv.drawCircle(x, y, 34 * s, P(shader=rad(x, y, 34 * s, [C('#FFF3A0', 0.9 * a), C('#FFD45E', 0)]), blend=ADD))
        cv.drawOval(oval(x, y, 14 * s, 8 * s), P(C('#FFF6C0', a)))
        cv.drawOval(oval(x, y, 14 * s, 8 * s), P(C('#E8A01E', 0.8 * a), stroke=3))
    hx, hy = bez(PATH_PTS, p)
    star(cv, hx, hy - 10, 18, C('#FFFFFF', 0.9))

def draw_town_sky(cv, t, cx, cy, z):
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=lin(0, 0, 0, H, [C('#7C86F0'), C('#B49CF0'), C('#FFB8D2'), C('#FFE0A8')], [0, .35, .7, 1])))
    for k in range(40):
        x = (k * 263.7) % W; y = (k * 151.3) % (H * 0.45)
        a = 0.3 + 0.7 * max(0, math.sin(t * 2 + k * 1.9)) ** 3
        cv.drawCircle(x, y, 2.5 + 2 * a, P(C('#FFFFFF', a * 0.9)))
    cv.drawCircle(860, 260, 85, P(C('#FFF8E0', 0.95)))
    cv.drawCircle(860, 260, 260, P(shader=rad(860, 260, 260, [C('#FFF6D0', 0.5), C('#FFF6D0', 0)]), blend=ADD))
    E2.layer(cv, cx, cy, z, 0.3)
    hp = skia.Path(); hp.moveTo(-1200, 2400); hp.lineTo(-1200, 760)
    for i in range(10): hp.quadTo(-1200 + i * 500 + 250, 620 + 60 * math.sin(i * 2.3), -1200 + (i + 1) * 500, 760)
    hp.lineTo(3800, 2400); hp.close()
    cv.drawPath(hp, P(shader=lin(0, 600, 0, 1100, [C('#C9B0F0'), C('#A58BDD')])))
    for k in range(26):  # distant twinkling windows
        x = -1100 + k * 190; y = 760 + 40 * math.sin(k * 1.3)
        cv.drawRect(skia.Rect(x - 30, y - 60, x + 30, y + 80), P(C('#B79CE6')))
        tri = skia.Path(); tri.moveTo(x - 38, y - 58); tri.lineTo(x, y - 100); tri.lineTo(x + 38, y - 58); tri.close()
        cv.drawPath(tri, P(C('#9B7ED6')))
        a = 0.6 + 0.4 * math.sin(t * 1.5 + k)
        cv.drawRect(skia.Rect(x - 10, y - 30, x + 10, y - 8), P(C('#FFE9A0', a)))
    cv.restore()
    E2.layer(cv, cx, cy, z, 0.6)
    cols = ['#FFC1D9', '#C9F2E0', '#FFE7A8', '#D9C9FF', '#B9E6FF']
    for k in range(14):
        x = -700 + k * 330; top = 880 + 50 * math.sin(k * 2.1); c = C(cols[k % 5])
        cv.drawRect(skia.Rect(x, top, x + 260, 1700), P(shader=lin(x, 0, x + 260, 0, [mix(c, C('#ffffff'), .2), mix(c, C('#7a5aa0'), .2)])))
        rp = skia.Path(); rp.moveTo(x - 20, top + 6); rp.lineTo(x + 130, top - 120); rp.lineTo(x + 280, top + 6); rp.close()
        cv.drawPath(rp, P(C(['#E8668A', '#4DB6AC', '#F2A33A', '#8C6FE0', '#5A9BE0'][k % 5])))
        for j in range(2):
            a = 0.7 + 0.3 * math.sin(t * 2 + k + j)
            cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(x + 50 + j * 110, top + 60, x + 100 + j * 110, top + 120), 8, 8), P(C('#FFE08A', a)))
    cv.restore()

def draw_town(cv, t):
    cx, cy, z = town_cam(t)
    draw_town_sky(cv, t, cx, cy, z)
    E2.layer(cv, cx, cy, z, 1.0)
    reveal = smooth(seg(t, 52.4, 55.0))
    draw_hill_tower(cv, t, reveal)
    # houses & shops of the tiny town
    house(cv, -300, 120, 700, '#B9E6FF', '#5A9BE0', t)
    house(cv, 160, 560, 560, '#FFC1D9', '#8C6FE0', t)
    house(cv, 600, 1110, 690, '#C9F2E0', '#FF6F91', t, kind='shop')
    draw_door_building(cv, t)
    house(cv, 1985, 2330, 720, '#FFE7A8', '#4DB6AC', t, kind='shop')
    # lantern strings
    lantern_string(cv, -280, 820, 580, 760, 60, t, 6, 0)
    lantern_string(cv, 560, 790, 1150, 760, 70, t, 5, 2)
    lantern_string(cv, 1150, 1020, 1945, 1020, 70, t, 7, 1)
    lantern_string(cv, 1945, 800, 2330, 840, 50, t, 4, 3)
    # street lamps
    for lx in (1128, 1965):
        cv.drawRect(skia.Rect(lx - 7, 1230, lx + 7, G + 4), P(C('#4a3a6a')))
        cv.drawCircle(lx, 1222, 26, P(shader=rad(lx, 1218, 30, [C('#FFFFFF'), C('#FFE27A'), C('#F2A33A')], [0, .5, 1])))
        cv.drawCircle(lx, 1222, 130, P(shader=rad(lx, 1222, 130, [C('#FFE27A', 0.4), C('#FFE27A', 0)]), blend=ADD))
    draw_ground(cv, t)
    for (gx, gy) in ((1128, G + 40), (1965, G + 40), (850, G + 60), (1545, G + 50)):  # warm light pools
        cv.drawOval(oval(gx, gy, 220, 50), P(shader=rad(gx, gy, 220, [C('#FFE6A0', 0.35), C('#FFE6A0', 0)]), blend=ADD))
    draw_path_dots(cv, t)
    for (px, kind) in ((560, 'pink'), (1080, 'yellow'), (1880, 'blue'), (2380, 'red')):  # foreground flower planters
        py = 1790
        cv.drawOval(oval(px, py + 6, 120, 18), P(C('#3a1a30', 0.25), blur=8))
        for k in range(3):
            fx = px - 60 + k * 60; fh = 120 + 30 * (k % 2)
            E2.draw_stem(cv, fx, py - 40, fx + 4 * math.sin(t + k), py - 40 - fh, w=8)
            E2.draw_flower_head(cv, fx + 4 * math.sin(t + k), py - 40 - fh, 30, kind, rot=k * 20 + 6 * math.sin(t), n=6)
        bx = skia.RRect.MakeRectXY(skia.Rect(px - 110, py - 70, px + 110, py), 14, 14)
        cv.drawRRect(bx, P(shader=lin(0, py - 70, 0, py, [C('#D99A5E'), C('#A8683A')])))
        for k in range(4): cv.drawLine(px - 110, py - 70 + k * 18, px + 110, py - 70 + k * 18, P(C('#7a4a2a', 0.35), stroke=3))
        cv.drawRRect(bx, P(C('#7a4a2a'), stroke=4))
    # bubbles streaming out of the triangle door (many small) and the five big counting bubbles
    if 28.2 <= t < 33.5:
        for k in range(22):
            st0 = 28.2 + k * 0.12
            if t < st0: continue
            age = t - st0
            x = 1765 + (k % 5 - 2) * 30 + age * (40 + (k * 37) % 90) * (1 if k % 2 else -1) + 20 * math.sin(age * 3 + k)
            y = 1360 - age * (160 + (k * 53) % 120)
            r = 14 + (k * 7) % 18
            if y > 300: draw_bubble(cv, x, y, r, t, k)
    sts = {n: town_state(n, t) for n in ('friend', 'socky')}
    for n, st in sts.items(): draw_shadow(cv, st['x'], G, st['air'])
    if 28.4 <= t < 39.2:
        for i in range(5):
            tc = COUNT_T[i]
            if t < tc:
                bx, by = bubble_pos(i, t)
                draw_bubble(cv, bx, by, 52, t, i)
            elif t < tc + 0.5:
                bx, by = bubble_pos(i, tc); draw_pop(cv, bx, by, seg(t, tc, tc + 0.5))
    for n, st in sts.items():
        draw_char(cv, st, t, n)
    # thinking dots above Socky
    if 18.4 <= t < 20.3:
        s = sts['socky']; hx, hy = s['x'] - 10, s['y'] - 300 * S_CHAR
        for k in range(3):
            a = smooth(seg(t, 18.5 + k * 0.3, 18.8 + k * 0.3)) * (1 - smooth(seg(t, 20.0, 20.3)))
            cv.drawCircle(hx - 40 + k * 26, hy - k * 32, 9 + k * 6, P(C('#FFFFFF', 0.95 * a)))
            cv.drawCircle(hx - 40 + k * 26, hy - k * 32, 9 + k * 6, P(C('#8C6FE0', 0.5 * a), stroke=3))
    # celebration sparkles
    for (ta, tb, px, py) in ((48.3, 49.6, 1600, 1150), (39.1, 40.1, 1520, 1150), (10.4, 11.3, 1100, 1100)):
        if ta <= t < tb:
            p = seg(t, ta, tb)
            for k in range(14):
                a = k * 0.449 + 0.2; rr = 60 + 260 * ease_out(p)
                star(cv, px + math.cos(a) * rr, py + math.sin(a) * rr * 0.8 - 80 * p, 15 * (1 - p * .5), C(['#FFE27A', '#FF7BC5', '#7FD4FF', '#B6F36B'][k % 4], 1 - p))
    # odd-one-out: apple, apple, apple, star
    if 40.0 <= t < 51.3:
        sh = ease_back(seg(t, 39.8, 40.4)) * (1 - smooth(seg(t, 50.0, 50.8)))
        if sh > 0.01:  # soft floating cloud shelf so the objects pop off the busy wall
            cxs = (OBJ_X[0] + OBJ_X[3]) / 2
            for (dx, dy, r) in ((-300, 10, 110), (-150, -10, 130), (0, 5, 125), (150, -10, 130), (300, 10, 110)):
                cv.drawCircle(cxs + dx * sh, OBJ_Y + dy, r * sh, P(C('#FFFFFF', 0.82), blur=10))
        for i in range(4):
            app = ease_back(seg(t, 40.0 + 0.22 * i, 40.6 + 0.22 * i), 2.0)
            gone = smooth(seg(t, 49.8 + 0.12 * i, 50.3 + 0.12 * i)) if i < 3 else 0
            s = app * (1 - gone)
            if s <= 0.01: continue
            x, y = OBJ_X[i], OBJ_Y + 8 * math.sin(t * 2 + i)
            cv.drawCircle(x, y, 95 * s, P(shader=rad(x, y, 95 * s, [C('#FFFFFF', 0.5), C('#FFFFFF', 0)])))
            if i < 3: draw_apple(cv, x, y, s, rot=3 * math.sin(t * 1.5 + i))
            else:
                wig = 16 * math.sin((t - 46.2) * 16) if 46.2 <= t < 48.5 else 0
                pop = 1 + 0.15 * pulse(t, 46.2, 47.2)
                morph = seg(t, 50.2, 51.0)
                draw_big_star(cv, x, y, s * pop * (1 - morph), rot=wig + morph * 360, glow=pulse(t, 46.2, 48.6) + morph)
        # star -> map flash
        if 50.2 <= t < 51.4:
            p = seg(t, 50.2, 51.4)
            cv.drawCircle(OBJ_X[3], OBJ_Y, 220, P(shader=rad(OBJ_X[3], OBJ_Y, 220, [C('#FFFFFF', math.sin(p * math.pi)), C('#FFE27A', 0)]), blend=ADD))
    if t >= 50.6:
        mx, my = map_pos(t)
        un = ease_out(seg(t, 50.7, 51.6))
        draw_map(cv, mx, my, ease_back(seg(t, 50.6, 51.1)) * 1.0, t, un)
    # ambient floating light motes
    for k in range(50):
        x = -400 + (k * 97.1) % 3600 + 20 * math.sin(t * 0.7 + k); y = 1450 - ((t * (12 + k % 7 * 5) + k * 61) % 900)
        a = max(0, math.sin(t * 1.8 + k * 2.3)) ** 3
        if a > 0.08:
            cv.drawCircle(x, y, 4 + 3 * a, P(C('#FFF5C0', 0.85 * a)))
            cv.drawCircle(x, y, 16, P(C('#FFE9A0', 0.25 * a), blur=8, blend=ADD))
    cv.restore()
    # grade: warm lantern light + vignette; end sting glow
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=rad(W / 2, H * 0.45, 1300, [C('#FFD9A0', 0.12), C('#FFD9A0', 0)]), blend=SCREEN))
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=rad(W / 2, H * 0.48, 1250, [C('#000000', 0), C('#000000', 0), C('#2a1440', 0.34)], [0, .62, 1])))
    f = 1 - smooth(seg(t, 5.0, 5.9))
    if f > 0: cv.drawRect(skia.Rect(0, 0, W, H), P(C('#FFFFFF', f)))
    if t > 58.6:  # tower twinkle on the closing sting
        p = seg(t, 58.6, 60.0)
        sx, sy = (TOWER_X - cx) * z + W / 2, (-500 - cy) * z + H / 2
        for k in range(10):
            a = k * 0.628 + t; rr = 40 + 220 * ease_out(p)
            star(cv, sx + math.cos(a) * rr, sy + math.sin(a) * rr, 16 * (1 - p * .5), C('#FFFFFF', 1 - p * .6))
        cv.drawCircle(sx, sy, 300, P(shader=rad(sx, sy, 300, [C('#FFF3B0', 0.5 * math.sin(p * math.pi)), C('#FFF3B0', 0)]), blend=ADD))

def draw_frame(cv, t):
    if t < 5.0: draw_flower_part(cv, t)
    else: draw_town(cv, t)

def render_range(a, b, out):
    surf = skia.Surface(W, H); cv = surf.getCanvas()
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', str(FPS),
                           '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(a, b):
        cv.clear(skia.ColorWHITE); draw_frame(cv, f / FPS)
        ff.stdin.write(surf.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType).tobytes())
    ff.stdin.close(); ff.wait()

if __name__ == '__main__':
    if sys.argv[1] == 'still':
        surf = skia.Surface(W, H); cv = surf.getCanvas()
        for ts in sys.argv[3:]:
            cv.clear(skia.ColorWHITE); draw_frame(cv, float(ts))
            surf.makeImageSnapshot().save(f'{sys.argv[2]}/f_{float(ts):05.1f}.png', skia.kPNG)
    else:
        render_range(int(sys.argv[2]), int(sys.argv[3]), sys.argv[4])
