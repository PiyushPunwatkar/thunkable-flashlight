"""Socky and the Rainbow Bridge - Episode 2. Procedural soft-3D renderer (skia)."""
import skia, math, random, sys, subprocess, os
import numpy as np

W, H, FPS, DUR = 1080, 1920, 30, 60.0
NF = int(FPS * DUR)
S_CHAR = 1.25  # character scale

# ---------------------------------------------------------------- utilities
def clamp(v, a=0.0, b=1.0): return a if v < a else b if v > b else v
def lerp(a, b, p): return a + (b - a) * p
def seg(t, a, b): return clamp((t - a) / (b - a))
def smooth(p): p = clamp(p); return p * p * (3 - 2 * p)
def ease_io(p): p = clamp(p); return 4*p*p*p if p < .5 else 1 - (-2*p + 2) ** 3 / 2
def ease_out(p): p = clamp(p); return 1 - (1 - p) ** 3
def ease_back(p, s=1.70158):
    p = clamp(p); p -= 1; return p * p * ((s + 1) * p + s) + 1
def pulse(t, a, b):  # 0->1->0 bump over [a,b]
    p = seg(t, a, b); return math.sin(p * math.pi) if 0 < p < 1 else 0.0

def C(h, a=1.0):
    h = h.lstrip('#'); r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return skia.Color(r, g, b, int(clamp(a) * 255))
def CA(col, a):
    return skia.ColorSetA(col, int(clamp(a) * 255))
def mix(c1, c2, p):
    r = lerp(skia.ColorGetR(c1), skia.ColorGetR(c2), p); g = lerp(skia.ColorGetG(c1), skia.ColorGetG(c2), p)
    b = lerp(skia.ColorGetB(c1), skia.ColorGetB(c2), p); a = lerp(skia.ColorGetA(c1), skia.ColorGetA(c2), p)
    return skia.Color(int(r), int(g), int(b), int(a))

def P(color=None, shader=None, blur=0, stroke=0, blend=None, alpha=None, cap=None):
    p = skia.Paint(AntiAlias=True)
    if color is not None: p.setColor(color)
    if shader is not None: p.setShader(shader)
    if blur: p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur))
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style); p.setStrokeWidth(stroke)
        p.setStrokeCap(cap or skia.Paint.kRound_Cap); p.setStrokeJoin(skia.Paint.kRound_Join)
    if blend is not None: p.setBlendMode(blend)
    if alpha is not None: p.setAlphaf(alpha)
    return p
def lin(x0, y0, x1, y1, cols, pos=None):
    return skia.GradientShader.MakeLinear([skia.Point(x0, y0), skia.Point(x1, y1)], cols, pos)
def rad(x, y, r, cols, pos=None):
    return skia.GradientShader.MakeRadial(skia.Point(x, y), max(r, 0.01), cols, pos)
def oval(cx, cy, rx, ry): return skia.Rect(cx - rx, cy - ry, cx + rx, cy + ry)
ADD = skia.BlendMode.kPlus
SCREEN = skia.BlendMode.kScreen

# ---------------------------------------------------------------- timeline
# camera keyframes: t, cx, cy, zoom
CAM = [(0, 560, 1150, 1.0), (3.6, 1000, 1150, 1.0), (6.0, 1720, 1150, 0.58), (9.8, 1720, 1130, 0.6),
       (11.2, 1640, 1260, 0.8), (14.6, 1700, 1250, 0.8), (17.6, 1840, 880, 1.0), (29.8, 1840, 870, 1.0),
       (31.2, 1840, 820, 1.0), (49.9, 1840, 820, 1.0), (53.0, 2850, 1250, 1.0), (53.8, 2850, 1250, 1.0),
       (57.4, 2875, 1200, 1.35), (60.0, 2875, 1190, 1.42)]
def camera(t):
    for i in range(len(CAM) - 1):
        a, b = CAM[i], CAM[i + 1]
        if a[0] <= t <= b[0]:
            p = ease_io(seg(t, a[0], b[0]))
            return lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p)
    return CAM[-1][1:]

GROUND = 1500.0
WATER = 1530.0
BANK_L, BANK_R = 1300.0, 2500.0
BR_CX, BR_A, BR_H = 1900.0, 600.0, 650.0
STONES = [1450.0, 1650.0, 1850.0]
STONE_TOP = 1506.0
STONE_APPEAR = [10.0, 10.25, 10.5]
STONE_LIT = [11.0, 12.3, 13.6]
DISSOLVE = 15.0
RISE0, RISE1 = 15.2, 17.0
FLOWERS = [(1570.0, 'red'), (1840.0, 'yellow'), (2110.0, 'blue')]
FLOWER_HEAD_Y = 445.0
DOOR_FX, DOOR_BLOOM_Y = 2965.0, 1075.0
COUNT_T = [24.0, 25.0, 26.0, 27.0, 28.0]

def bridge_h(t):
    if t < RISE0: return 0.0
    p = seg(t, RISE0, RISE1)
    return BR_H * ease_back(p, 1.2)

def deck_y(x, h):
    u = (x - BR_CX) / BR_A
    if abs(u) >= 1: return GROUND
    return GROUND - h * math.sqrt(1 - u * u)

def surface_y(x, t):
    if x < BANK_L + 5 or x > BANK_R - 5: return GROUND
    best = WATER + 40
    for i, sx in enumerate(STONES):
        if abs(x - sx) < 80:
            best = min(best, STONE_TOP + 60 * (1 - stone_up(i, t)))
    h = bridge_h(t)
    if h > 0: best = min(best, deck_y(x, h))
    return best

def stone_up(i, t):
    up = ease_back(seg(t, STONE_APPEAR[i], STONE_APPEAR[i] + 0.8))
    return up * (1 - smooth(seg(t, DISSOLVE + 0.6, DISSOLVE + 1.4)))

# ------------------------------------------------------------ character motion
def hop_list(name):
    L = []  # (t0, t1, x0, x1, height)
    if name == 'socky':
        for i in range(6): L.append((0.2 + .55 * i, 0.2 + .55 * i + .5, 250 + 155 * i, 250 + 155 * (i + 1), 95))
        L += [(10.45, 11.0, 1180, 1450, 150), (11.75, 12.3, 1450, 1650, 140), (13.05, 13.6, 1650, 1850, 140),
              (14.25, 14.65, 1850, 1850, 70), (17.55, 18.1, 1850, 2060, 100)]
        for tc in COUNT_T: L.append((tc + .05, tc + .5, 2060, 2060, 70))
        L.append((29.2, 29.95, 2060, 2060, 120))  # celebration spin
        L += [(38.1, 38.55, 2060, 1995, 75), (38.65, 39.1, 1995, 1930, 75)]
        for k in range(6): L.append((47.95 + .3 * k, 47.95 + .3 * k + .26, 1930, 1930, 26))
        for k in range(7): L.append((57.45 + .32 * k, 57.45 + .32 * k + .28, 2760, 2760, 40))
    else:
        for i in range(6): L.append((0.35 + .55 * i, 0.35 + .55 * i + .5, 90 + 158 * i, 90 + 158 * (i + 1), 90))
        L += [(10.9, 11.35, 1040, 1180, 90), (11.75, 12.3, 1180, 1450, 150), (13.05, 13.6, 1450, 1650, 140),
              (14.35, 14.75, 1650, 1650, 70), (17.9, 18.4, 1650, 1720, 80)]
        L.append((29.35, 29.85, 1720, 1720, 70))
        for k in range(5): L.append((48.1 + .34 * k, 48.1 + .34 * k + .28, 1720, 1720, 20))
        L += [(58.0, 58.35, 2620, 2620, 30), (58.7, 59.05, 2620, 2620, 30)]
    return L
HOPS = {n: hop_list(n) for n in ('socky', 'friend')}
SLIDE = {'socky': (50.0, 52.8, 1930, 2760), 'friend': (50.35, 53.15, 1720, 2620)}

def last_landing(name, t):
    last = -10
    for (t0, t1, *_r) in HOPS[name]:
        if t1 <= t: last = max(last, t1)
    return last

def char_state(name, t):
    st = dict(x=0, y=0, air=0, sx=1, sy=1, dir=1, spin=0, lean=0,
              look=(0.75, 0.0), mouth='smile', eye=1.0, squint=0)
    # base x
    xs = None
    s0, s1, sxa, sxb = SLIDE[name]
    hops = HOPS[name]
    x = hops[0][2]
    for (t0, t1, x0, x1, hh) in hops:
        if t >= t1: x = x1
    if s0 <= t: x = lerp(sxa, sxb, ease_io(seg(t, s0, s1)))
    for (t0, t1, x0, x1, hh) in hops:
        if t >= t1 and t1 > s1 and t > s1: x = x1
    air = 0; sq = 0
    for (t0, t1, x0, x1, hh) in hops:
        if t0 <= t < t1:
            p = (t - t0) / (t1 - t0)
            x = lerp(x0, x1, smooth(p) * .3 + p * .7)
            air = 4 * hh * p * (1 - p)
            st['sy'] = 1 + 0.12 * math.sin(p * math.pi); st['sx'] = 1 / st['sy']
            if p < 0.12: st['sy'] = 0.85 + p; st['sx'] = 1.12
            if x1 < x0: st['dir'] = -1
        # landing squash
        if t1 <= t < t1 + 0.18:
            q = (t - t1) / 0.18
            s = 0.18 * math.sin(q * math.pi) * (1 - q * 0.3)
            st['sy'] = 1 - s; st['sx'] = 1 + s * 0.8
    st['x'] = x
    st['y'] = surface_y(x, t) - air
    st['air'] = air
    # idle breathing
    if air == 0: st['sy'] *= 1 + 0.018 * math.sin(t * 3.1 + (0 if name == 'socky' else 1.3))
    # facing
    if name == 'socky':
        if 38.1 <= t < 39.25: st['dir'] = -1
    # spin celebration
    if name == 'socky' and 29.2 <= t < 29.95:
        st['spin'] = seg(t, 29.2, 29.95) * 2 * math.pi * 2
    # sliding pose
    if s0 <= t < s1:
        st['lean'] = 12 * pulse(t, s0, s1); st['mouth'] = 'open'; st['squint'] = 0
    # expressions / looks per section
    def lk(v): st['look'] = v
    if 3.4 < t < 6.4: lk((1.0, 0.05))
    if 6.4 <= t < 10.2: lk((0.75, -0.75)); st['mouth'] = 'o' if 7.0 < t < 9.4 else 'smile'; st['eye'] = 1 + 0.12 * smooth(seg(t, 6.6, 7.2))
    if 10.2 <= t < 14.0: lk((0.85, 0.45))
    if 14.2 <= t < 15.0: st['mouth'] = 'open'
    if 15.0 <= t < 20.0:
        st['mouth'] = 'o'; st['eye'] = 1.18
        a = t * 1.6 + (0 if name == 'socky' else 1.0)
        lk((0.8 * math.cos(a), -0.4 + 0.35 * math.sin(a * 1.3)))
    if 20.0 <= t < 23.6:  # watching the butterflies swirl
        bx, by = butterfly_swirl(0, t)
        lk(look_at(st, bx, by)); st['mouth'] = 'open'
    if 23.6 <= t < 29.2:
        lk((-0.2, -0.85)); st['mouth'] = 'smile'
        for i, tc in enumerate(COUNT_T):
            if tc - 0.6 <= t < tc + 0.9: lk(look_at(st, *count_bfly(i, t)))
    if 29.2 <= t < 30.6: st['mouth'] = 'open'; st['squint'] = 1 if name == 'socky' else 0
    if 30.6 <= t < 36.4:
        lk((0.3, -0.85)); st['mouth'] = 'smile'
    if 33.9 <= t < 36.2:
        fx = FLOWERS[min(2, int((t - 33.9) / 0.75))][0]
        lk(look_at(st, fx, FLOWER_HEAD_Y))
    if 36.4 <= t < 38.1: lk(look_at(st, FLOWERS[1][0], FLOWER_HEAD_Y)); st['mouth'] = 'open'; st['eye'] = 1.12
    if 38.1 <= t < 40.0: st['mouth'] = 'open'
    if 39.8 <= t < 47.9:
        if name == 'socky': lk((0.1, -1.0)); st['mouth'] = 'smile'
        else: lk((0.9, -0.3))
        if 42.6 <= t < 47.6 and name == 'friend':
            lk(look_at(st, *swirl2(1, t)))
    if 47.9 <= t < 50.0: st['mouth'] = 'open'; st['squint'] = 1
    if 53.0 <= t < 57.4:
        lk(look_at(st, DOOR_FX, DOOR_BLOOM_Y)); st['mouth'] = 'o' if t > 54.8 else 'open'; st['eye'] = 1.15
    if 57.4 <= t:
        if name == 'socky':
            q = smooth(seg(t, 57.2, 57.6))
            lk((lerp(0.75, -0.05, q), lerp(-0.4, 0.12, q))); st['eye'] = 1.22; st['mouth'] = 'open'
        else:
            lk(look_at(st, DOOR_FX, DOOR_BLOOM_Y)); st['mouth'] = 'o'; st['eye'] = 1.15
    st['jiggle_t'] = t - last_landing(name, t)
    return st

def look_at(st, tx, ty):
    dx = (tx - st['x']) * st['dir']; dy = ty - (st['y'] - 160 * S_CHAR)
    d = math.hypot(dx, dy) + 1e-6
    return (dx / d, dy / d)

# ------------------------------------------------------------ butterflies
BF_COLS = [('#FF7BC5', '#C2187A'), ('#FFB347', '#E8590C'), ('#5FE0D1', '#0C8C8C'),
           ('#B79CFF', '#5B3CC4'), ('#B6F36B', '#3E9C1E')]
SLOTS = [(1660 + 115 * i, 440 + 20 * abs(i - 2)) for i in range(5)]

def butterfly_swirl(i, t):
    a = (t - 20.0) * 1.9 + i * (2 * math.pi / 5)
    cx, cy = 2000, 1500 - BR_H - 170
    r = 170 + 30 * math.sin(t * 2 + i)
    x, y = cx + r * math.cos(a), cy + 0.55 * r * math.sin(a) - 30
    enter = ease_out(seg(t, 19.6 + 0.15 * i, 20.8 + 0.15 * i))
    x = lerp(1250 + 60 * i, x, enter); y = lerp(300, y, enter)
    leave = ease_io(seg(t, 22.9 + 0.08 * i, 23.7 + 0.08 * i))
    x = lerp(x, 1180, leave); y = lerp(y, 520 + 40 * i, leave)
    return x, y

def count_bfly(i, t):
    tc = COUNT_T[i]
    p = ease_out(seg(t, tc - 0.85, tc))
    sx, sy = SLOTS[i]
    x = lerp(1160, sx, p); y = lerp(560 + 90 * math.sin(i * 1.7), sy, p) - 60 * math.sin(p * math.pi)
    y += 8 * math.sin(t * 3 + i)
    lv = ease_io(seg(t, 30.0 + 0.1 * i, 31.0 + 0.1 * i))
    x = lerp(x, x + 200 * (i - 2), lv); y = lerp(y, -600, lv)
    return x, y

def swirl2(i, t):  # riddle flutter around the flowers
    a = (t - 42.6) * 1.3 + i * 1.25
    x = 1840 + 360 * math.cos(a) ; y = 470 + 140 * math.sin(a * 1.6 + i)
    enter = ease_out(seg(t, 42.6 + 0.2 * i, 43.6 + 0.2 * i))
    sx = 1200 if i % 2 == 0 else 2500
    x = lerp(sx, x, enter); y = lerp(250 + 60 * i, y, enter)
    lv = ease_io(seg(t, 49.0, 50.6)); y = lerp(y, -500, lv)
    return x, y

def head_bfly(t):  # glowing butterfly that lands on Socky's head
    st = char_state('socky', t)
    hx, hy = st['x'] - 8 * S_CHAR, st['y'] - 222 * S_CHAR * st['sy']
    p = ease_io(seg(t, 39.6, 40.8))
    x = lerp(2400, hx, p) + 40 * math.sin(p * math.pi * 2) * (1 - p)
    y = lerp(250, hy, p) - 80 * math.sin(p * math.pi)
    lv = ease_io(seg(t, 48.0, 49.6))
    x = lerp(x, 2300, lv); y = lerp(y, 150, lv)
    landed = 40.8 <= t < 48.0
    return x, y, landed

# ------------------------------------------------------------ drawing: characters
def sock_path():
    p = skia.Path()
    p.moveTo(-46, -190); p.lineTo(-46, -58)
    p.cubicTo(-46, -12, -22, 0, 12, 0); p.lineTo(62, 0)
    p.cubicTo(100, 0, 104, -62, 62, -64)
    p.cubicTo(52, -64, 46, -72, 46, -86); p.lineTo(46, -190)
    p.cubicTo(46, -216, -46, -216, -46, -190); p.close()
    return p
SOCK = sock_path()
RED, YEL, DRED = C('#EC2F3B'), C('#FFD233'), C('#8E1520')

def draw_shadow(cv, x, gy, air, k=1.0):
    s = S_CHAR * k * max(0.45, 1 - air / 260)
    cv.drawOval(oval(x + 14 * S_CHAR, gy + 2, 70 * s, 14 * s), P(C('#1d3b2a', 0.30 * max(0.3, 1 - air / 300)), blur=8))

def draw_eye(cv, ex, ey, r, look, jig, eye_k, squint, blink):
    r *= eye_k
    if squint:
        pth = skia.Path(); pth.moveTo(ex - r * .75, ey + r * .15); pth.quadTo(ex, ey - r * 1.0, ex + r * .75, ey + r * .15)
        cv.drawPath(pth, P(C('#2a0a0e'), stroke=r * 0.32)); return
    cv.drawCircle(ex + 2, ey + 5, r * 1.02, P(C('#5a0d14', 0.35), blur=4))
    cv.save(); cv.translate(ex, ey); cv.scale(1, max(0.08, 1 - blink))
    cv.drawCircle(0, 0, r, P(shader=rad(-r * .3, -r * .35, r * 1.5, [C('#ffffff'), C('#f4f4f8'), C('#c9cad6')], [0, .55, 1])))
    cv.drawCircle(0, 0, r, P(C('#6b1e26', 0.55), stroke=2.2))
    pr = r * 0.48
    lx, ly = look
    m = r - pr - 2.5
    px, py = lx * m + jig[0], ly * m + jig[1]
    d = math.hypot(px, py)
    if d > m: px, py = px / d * m, py / d * m
    cv.drawCircle(px, py, pr, P(shader=rad(px - pr * .3, py - pr * .3, pr * 1.3, [C('#3a3550'), C('#08070d')])))
    cv.drawCircle(px - pr * .35, py - pr * .4, pr * .32, P(C('#ffffff', 0.95)))
    cv.drawCircle(-r * .45, -r * .5, r * .16, P(C('#ffffff', 0.9)))
    cv.restore()

def draw_char(cv, st, t, name):
    x, y = st['x'], st['y']
    cv.save()
    cv.translate(x, y)
    cv.rotate(st['lean'] * st['dir'])
    sx = st['sx'] * st['dir'] * S_CHAR
    if st['spin']: sx *= math.cos(st['spin'])
    cv.scale(sx, st['sy'] * S_CHAR)
    # body stripes clipped to sock
    cv.save(); cv.clipPath(SOCK, doAntiAlias=True)
    cv.drawRect(skia.Rect(-60, -230, 120, 10), P(YEL))
    band = 25
    yy = -230
    k = 0
    while yy < 10:
        if k % 2 == 0: cv.drawRect(skia.Rect(-60, yy, 120, yy + band), P(RED))
        yy += band; k += 1
    # cuff ribbing
    cv.drawRect(skia.Rect(-60, -230, 120, -186), P(C('#D9202C')))
    for rx in range(-42, 46, 10):
        cv.drawLine(rx, -212, rx, -188, P(C('#ff6b72', 0.5), stroke=3))
    # toe & heel caps
    cv.drawOval(oval(76, -30, 34, 40), P(C('#D9202C')))
    cv.drawOval(oval(-36, -14, 26, 26), P(C('#D9202C')))
    # 3D shading
    cv.drawRect(skia.Rect(-60, -230, 120, 10), P(shader=lin(-48, 0, 48, 0,
        [C('#3a0008', 0.38), C('#000000', 0.0), C('#ffffff', 0.18), C('#000000', 0.0), C('#3a0008', 0.32)], [0, .25, .42, .62, 1])))
    cv.drawRect(skia.Rect(-60, -70, 120, 10), P(shader=lin(0, -70, 0, 4, [C('#000000', 0), C('#3a0008', 0.35)])))
    cv.drawRect(skia.Rect(-60, -230, 120, -150), P(shader=lin(0, -215, 0, -150, [C('#fff6d6', 0.28), C('#ffffff', 0)])))
    cv.drawOval(oval(-24, -150, 12, 44), P(C('#ffffff', 0.32), blur=7))
    cv.drawOval(oval(70, -40, 14, 9), P(C('#ffffff', 0.35), blur=4))
    cv.restore()
    cv.drawPath(SOCK, P(C('#7c0f18', 0.55), stroke=3.2))
    # rim light
    cv.save(); cv.clipPath(SOCK, doAntiAlias=True)
    rim = skia.Path(SOCK); rim.offset(-6, 4)
    cv.drawPath(SOCK, P(C('#fff1b0', 0.35), stroke=5, blur=2)) if False else None
    cv.restore()
    # blush
    cv.drawOval(oval(-18, -127, 13, 7), P(C('#ff6fa0', 0.45), blur=4))
    cv.drawOval(oval(44, -124, 10, 6), P(C('#ff6fa0', 0.45), blur=4))
    # googly eyes with jiggle
    jt = st['jiggle_t']
    amp = 5.5 * math.exp(-jt * 4.0) * math.sin(jt * 26) if jt < 2 else 0
    jig = (amp * 0.6, amp)
    ph = (t * 0.83 + (0.37 if name == 'friend' else 0)) % 3.7
    blink = math.sin(seg(ph, 0, 0.16) * math.pi) if ph < 0.16 else 0
    draw_eye(cv, -4, -160, 25, st['look'], jig, st['eye'], st['squint'], blink)
    draw_eye(cv, 33, -155, 22, st['look'], (jig[0] * 1.2, jig[1] * 1.1), st['eye'], st['squint'], blink)
    # mouth
    m = st['mouth']
    if m == 'smile':
        pth = skia.Path(); pth.moveTo(6, -118); pth.quadTo(20, -105, 34, -118)
        cv.drawPath(pth, P(C('#4a0a10'), stroke=4.2))
    elif m == 'open':
        pth = skia.Path(); pth.moveTo(4, -120); pth.quadTo(20, -88, 37, -120); pth.close()
        cv.drawPath(pth, P(C('#4a0a10')))
        cv.save(); cv.clipPath(pth, doAntiAlias=True); cv.drawOval(oval(21, -100, 10, 7), P(C('#ff7a8a'))); cv.restore()
    else:
        cv.drawOval(oval(21, -112, 7, 9), P(C('#4a0a10')))
    cv.restore()

# ------------------------------------------------------------ butterflies & flowers
def wing_path(up):
    p = skia.Path()
    if up:
        p.moveTo(0, -2); p.cubicTo(18, -40, 62, -52, 64, -26); p.cubicTo(66, -6, 30, 4, 0, 2)
    else:
        p.moveTo(0, 2); p.cubicTo(30, 6, 52, 18, 44, 40); p.cubicTo(36, 56, 10, 34, 0, 6)
    p.close(); return p
WU, WL = wing_path(True), wing_path(False)

def draw_butterfly(cv, x, y, s, cols, t, ph=0, glow=0, rot=0, flap_speed=14):
    c1, c2 = C(cols[0]), C(cols[1])
    cv.save(); cv.translate(x, y); cv.rotate(rot); cv.scale(s, s)
    if glow > 0:
        cv.drawCircle(0, 0, 95, P(shader=rad(0, 0, 95, [C('#fff6a8', 0.55 * glow), C('#ffd966', 0)]), blend=ADD))
    f = abs(math.cos(t * flap_speed + ph)) * 0.8 + 0.2
    for side in (-1, 1):
        cv.save(); cv.scale(side * f, 1)
        for wp, sc in ((WU, 1.0), (WL, 0.9)):
            cv.drawPath(wp, P(shader=rad(0, 0, 70, [mix(c1, C('#ffffff'), .35), c1, c2], [0, .45, 1])))
            cv.drawPath(wp, P(C('#3b1a4a', 0.45), stroke=2))
        cv.drawCircle(42, -26, 7, P(C('#ffffff', 0.8)))
        cv.drawCircle(28, 24, 5, P(C('#ffffff', 0.7)))
        cv.restore()
    cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(-5, -24, 5, 26), 5, 5), P(shader=lin(-5, 0, 5, 0, [C('#5a3a7a'), C('#2a1640')])))
    cv.drawCircle(0, -27, 7, P(C('#3a2556')))
    for side in (-1, 1):
        pth = skia.Path(); pth.moveTo(side * 2, -32); pth.quadTo(side * 10, -52, side * 18, -54)
        cv.drawPath(pth, P(C('#3a2556'), stroke=2.2)); cv.drawCircle(side * 18, -54, 3.5, P(C('#3a2556')))
    cv.restore()

FL_COL = {'red': ('#FF5A5F', '#C81E35', '#FF9AA0', '#FFD25E'),
          'yellow': ('#FFE04A', '#F5A300', '#FFF4A8', '#E2702A'),
          'blue': ('#4FA8FF', '#1F4FC9', '#A8D8FF', '#FFD25E'),
          'pink': ('#FF8AD8', '#C2187A', '#FFD0F0', '#FFC845')}

def draw_flower_head(cv, x, y, R, kind, rot=0, open_k=1.0, n=8):
    c1, c2, c3, cc = (C(h) for h in FL_COL[kind])
    cv.save(); cv.translate(x, y); cv.rotate(rot)
    cv.drawCircle(6, 14, R * 1.02, P(C('#1a2a1a', 0.18), blur=14))
    for layer in (0, 1):
        ln = R * (1.0 if layer == 0 else 0.78); wd = R * (0.42 if layer == 0 else 0.36)
        for i in range(n):
            a = (360 / n) * i + (22.5 if layer else 0)
            cv.save(); cv.rotate(a)
            rr = oval(0, -ln * 0.52, wd, ln * 0.52)
            cv.drawOval(rr, P(shader=lin(0, 0, 0, -ln, [c3 if layer else c1, c1, c2], [0, .5, 1])))
            cv.drawOval(oval(-wd * .25, -ln * .55, wd * .22, ln * .3), P(C('#ffffff', 0.25), blur=4))
            cv.restore()
    cr = R * 0.33
    cv.drawCircle(0, 0, cr, P(shader=rad(-cr * .3, -cr * .3, cr * 1.4, [mix(cc, C('#ffffff'), .4), cc, mix(cc, C('#000000'), .35)], [0, .5, 1])))
    for i in range(14):
        a = i * 2.4; rr = cr * 0.75 * math.sqrt((i + .5) / 14)
        cv.drawCircle(math.cos(a) * rr, math.sin(a) * rr, cr * 0.07, P(C('#ffffff', 0.35)))
    cv.restore()

def draw_stem(cv, x0, y0, x1, y1, w=24, sway=0):
    pth = skia.Path(); pth.moveTo(x0, y0); pth.quadTo(x0 + sway * 0.6 + 30, (y0 + y1) / 2, x1, y1)
    cv.drawPath(pth, P(C('#2f8f3a'), stroke=w + 6))
    cv.drawPath(pth, P(shader=lin(x0 - w, 0, x0 + w, 0, [C('#3fae4a'), C('#7be07c'), C('#2f8f3a')]), stroke=w))

def draw_leaf(cv, x, y, L, ang, col='#4cbf55'):
    cv.save(); cv.translate(x, y); cv.rotate(ang)
    pth = skia.Path(); pth.moveTo(0, 0); pth.cubicTo(L * .3, -L * .35, L * .8, -L * .3, L, 0); pth.cubicTo(L * .8, L * .25, L * .3, L * .3, 0, 0)
    cv.drawPath(pth, P(shader=lin(0, -L * .3, 0, L * .3, [C('#8be88a'), C(col), C('#2c8a36')])))
    cv.drawLine(0, 0, L * .9, 0, P(C('#2c8a36', 0.6), stroke=2.5))
    cv.restore()

# ------------------------------------------------------------ scenery
rng = random.Random(7)
GRASS = [(x, rng.uniform(24, 58), rng.uniform(-0.3, 0.3), rng.choice(['#4fc85a', '#3fb04c', '#6ad96a', '#5ccf5f']))
         for x in np.arange(-1400, 4600, 13) if not (BANK_L + 10 < x < BANK_R - 10)]
DECOR = []
for x in list(np.arange(-1300, BANK_L - 60, 95)) + list(np.arange(BANK_R + 60, 4500, 95)):
    if rng.random() < 0.55:
        DECOR.append((x + rng.uniform(-30, 30), rng.choice(['red', 'yellow', 'blue', 'pink']), rng.uniform(16, 28), rng.uniform(30, 90)))
MUSH = [(-200, 150, 300, '#FF6F91'), (420, 115, 230, '#B388FF'), (940, 90, 170, '#FF8A65'), (3480, 140, 280, '#FF6F91'),
        (3800, 100, 200, '#7FD4FF'), (2620 + 900, 0, 0, '#000000')]
MUSH = [m for m in MUSH if m[1] > 0]
CLOUDS = [(rng.uniform(-600, 2600), rng.uniform(-250, 420), rng.uniform(0.7, 1.3)) for _ in range(9)]
SPARK = [(rng.uniform(-1500, 4500), rng.uniform(-200, 1650), rng.uniform(0, 6.28), rng.uniform(2, 5)) for _ in range(140)]
BOKEH = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(14, 40), rng.uniform(0, 6.28)) for _ in range(18)]
LILY = [(1360, 0.9), (1560, 0.7), (2250, 1.0), (2420, 0.8)]

def cloud(cv, x, y, s):
    cv.save(); cv.translate(x, y); cv.scale(s, s)
    pth = skia.Path()
    for (dx, dy, r) in ((0, 0, 70), (70, -30, 85), (150, 0, 70), (75, 25, 70), (-50, 20, 50), (200, 25, 50)):
        pth.addCircle(dx, dy, r)
    cv.drawPath(pth, P(shader=lin(0, -110, 0, 90, [C('#ffffff'), C('#ffffff'), C('#d8e9ff')], [0, .5, 1])))
    cv.restore()

def layer(cv, cx, cy, z, p):
    zl = 1 + (z - 1) * p
    cv.save(); cv.translate(W / 2, H / 2); cv.scale(zl, zl); cv.translate(-cx * p, -cy * p)

def draw_sky(cv, t, cx, cy, z):
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=lin(0, 0, 0, H, [C('#5DB8FF'), C('#9FD8FF'), C('#FFEFD6'), C('#FFD9E6')], [0, .42, .78, 1])))
    cv.drawCircle(230, 330, 760, P(shader=rad(230, 330, 760, [C('#FFF8C4', 0.85), C('#FFE79A', 0.35), C('#FFE79A', 0)], [0, .35, 1])))
    # distant sky rainbow
    a = smooth(seg(t, 6.3, 8.8)) * (1 - smooth(seg(t, 15.2, 17.5)))
    if a > 0.01:
        layer(cv, cx, cy, z, 0.15)
        cols = ['#FF4D4D', '#FF9F43', '#FFE14D', '#5BD86B', '#4DA6FF', '#9B6BFF']
        sweep = 180 * ease_out(seg(t, 6.3, 8.6))
        for i, c in enumerate(cols):
            r = 560 - i * 30
            pr = P(C(c, 0.75 * a), stroke=31, cap=skia.Paint.kButt_Cap)
            cv.drawArc(oval(560, 540, r, r), 180, sweep, False, pr)
        cv.drawArc(oval(560, 540, 470, 470), 180, sweep, False, P(C('#ffffff', 0.35 * a), stroke=200, blur=40, cap=skia.Paint.kButt_Cap, blend=SCREEN))
        cv.restore()
    layer(cv, cx, cy, z, 0.2)
    for (x0, y0, s) in CLOUDS: cloud(cv, x0 + t * 9 * s, y0, s)
    cv.restore()
    # hills
    layer(cv, cx, cy, z, 0.4)
    pth = skia.Path(); pth.moveTo(-1500, 2600); pth.lineTo(-1500, 700)
    for i in range(12):
        x = -1500 + i * 420; pth.quadTo(x + 210, 470 + 90 * math.sin(i * 1.9), x + 420, 690 + 40 * math.sin(i))
    pth.lineTo(3600, 2600); pth.close()
    cv.drawPath(pth, P(shader=lin(0, 450, 0, 1200, [C('#A6E3A8'), C('#7FCB86')])))
    for i in range(9):  # pastel distant trees
        x = -1200 + i * 520 + 90 * math.sin(i * 3.1); yb = 690
        cv.drawRect(skia.Rect(x - 10, yb - 140, x + 10, yb + 20), P(C('#a98a7a', 0.6)))
        cv.drawCircle(x, yb - 170, 85, P(C(['#FFC1E3', '#C9F2C2', '#FFE7A8'][i % 3], 0.8)))
    cv.restore()
    layer(cv, cx, cy, z, 0.65)
    pth = skia.Path(); pth.moveTo(-1500, 2600); pth.lineTo(-1500, 1050)
    for i in range(14):
        x = -1500 + i * 400; pth.quadTo(x + 200, 860 + 70 * math.sin(i * 2.7), x + 400, 1040 + 30 * math.cos(i))
    pth.lineTo(4200, 2600); pth.close()
    cv.drawPath(pth, P(shader=lin(0, 850, 0, 1400, [C('#7FD67E'), C('#4FB65A')])))
    cv.restore()

def draw_mushroom(cv, x, r, h, col):
    cv.save(); cv.translate(x, GROUND + 6)
    cv.drawOval(oval(0, 0, r * .7, 14), P(C('#1d3b2a', 0.25), blur=8))
    stem = skia.Path(); stem.moveTo(-r * .22, 0); stem.cubicTo(-r * .3, -h * .5, -r * .18, -h * .8, -r * .16, -h)
    stem.lineTo(r * .16, -h); stem.cubicTo(r * .18, -h * .8, r * .3, -h * .5, r * .22, 0); stem.close()
    cv.drawPath(stem, P(shader=lin(-r * .3, 0, r * .3, 0, [C('#E8D9C8'), C('#FFF9F0'), C('#D9C4AE')])))
    cap = skia.Path(); cap.moveTo(-r, -h + 10); cap.cubicTo(-r, -h - r * .95, r, -h - r * .95, r, -h + 10)
    cap.quadTo(0, -h - 12, -r, -h + 10); cap.close()
    c = C(col)
    cv.drawPath(cap, P(shader=rad(-r * .3, -h - r * .5, r * 1.5, [mix(c, C('#ffffff'), .45), c, mix(c, C('#000000'), .3)], [0, .45, 1])))
    for (dx, dy, rr) in ((-.5, -.35, .13), (.1, -.6, .16), (.55, -.3, .11), (-.15, -.2, .09)):
        cv.drawOval(oval(dx * r, -h + dy * r, rr * r, rr * r * .8), P(C('#ffffff', 0.85)))
    cv.restore()

def draw_banks(cv, t):
    for (x0, x1, edge_l, edge_r) in ((-2000, BANK_L, False, True), (BANK_R, 5200, True, False)):
        pth = skia.Path()
        pth.moveTo(x0, 3600); pth.lineTo(x0, GROUND)
        if edge_r:
            pth.lineTo(x1 - 40, GROUND); pth.quadTo(x1 + 10, GROUND, x1 + 14, GROUND + 60); pth.lineTo(x1 + 40, 3600)
        else:
            pth.lineTo(x1, GROUND)
        if edge_l:
            pth = skia.Path(); pth.moveTo(x0 - 40, 3600); pth.lineTo(x0 - 14, GROUND + 60); pth.quadTo(x0 - 10, GROUND, x0 + 40, GROUND); pth.lineTo(x1, GROUND); pth.lineTo(x1, 3600)
        pth.close()
        cv.drawPath(pth, P(shader=lin(0, GROUND, 0, GROUND + 500, [C('#A5714B'), C('#7A4E31'), C('#5e3a24')], [0, .3, 1])))
        # pebbles + roots in the soil
        cv.save(); cv.clipPath(pth, doAntiAlias=True)
        for k in range(int((x1 - x0) / 60)):
            px = x0 + k * 60 + (k * 37 % 40); py = GROUND + 230 + (k * 71 % 420)
            r = 10 + (k * 13 % 18)
            cv.drawOval(oval(px, py, r * 1.4, r), P(shader=lin(0, py - r, 0, py + r, [C('#C9A27E'), C('#8A6142')])))
        cv.restore()
        # thick rounded grassy turf with wavy underside
        xa, xb = (x0 - 30 if edge_l else x0), (x1 + 30 if edge_r else x1)
        top = skia.Path(); top.moveTo(xa, GROUND + 30); top.quadTo(xa, GROUND - 8, xa + 40, GROUND - 8)
        top.lineTo(xb - 40, GROUND - 8); top.quadTo(xb, GROUND - 8, xb, GROUND + 30)
        n = int((xb - xa) / 70)
        for k in range(n, 0, -1):
            xx = xa + (xb - xa) * (k - 1) / n
            top.quadTo(xa + (xb - xa) * (k - .5) / n, GROUND + 175 + 18 * math.sin(k * 1.7), xx, GROUND + 140 + 10 * math.sin(k))
        top.close()
        cv.drawPath(top, P(shader=lin(0, GROUND - 8, 0, GROUND + 180, [C('#9BEA84'), C('#5BC75A'), C('#3e9f45'), C('#2f8a3b')], [0, .2, .7, 1])))
        cv.drawPath(top, P(C('#2a7a35', 0.5), stroke=3))
    for (gx, gh, gl, col) in GRASS:
        sway = 6 * math.sin(t * 2.2 + gx * 0.02) + gl * 20
        pth = skia.Path(); pth.moveTo(gx - 6, GROUND + 6); pth.quadTo(gx - 2, GROUND - gh * .5, gx + sway, GROUND - gh)
        pth.quadTo(gx + 3, GROUND - gh * .5, gx + 6, GROUND + 6); pth.close()
        cv.drawPath(pth, P(C(col)))

def draw_water(cv, t, cx, z):
    x0, x1 = BANK_L - 100, BANK_R + 100
    cv.drawRect(skia.Rect(x0, WATER, x1, 3600), P(shader=lin(0, WATER, 0, WATER + 600, [C('#7FE6FF'), C('#39B5EE'), C('#1C79C9'), C('#16549b')], [0, .15, .55, 1])))
    cv.drawRect(skia.Rect(x0, WATER - 3, x1, WATER + 10), P(C('#E8FDFF', 0.85), blur=2))
    for row in range(9):
        yy = WATER + 30 + row * 46 + row * row * 4
        for k in range(10):
            xx = x0 + ((k * 170 + row * 61 + t * (30 + row * 6)) % (x1 - x0))
            pth = skia.Path(); pth.moveTo(xx, yy); pth.quadTo(xx + 30, yy - 7, xx + 60 + row * 4, yy)
            cv.drawPath(pth, P(C('#ffffff', 0.45 - row * 0.035), stroke=4 - row * 0.25))
    for i in range(26):
        sx = x0 + (i * 97.3) % (x1 - x0); sy = WATER + 15 + (i * 53.1) % 260
        a = max(0, math.sin(t * 3 + i * 1.7)) ** 6
        if a > 0.05: star(cv, sx, sy, 10 + 6 * a, C('#ffffff', a))

def star(cv, x, y, r, col, rot=0):
    pth = skia.Path()
    for i in range(8):
        a = math.radians(rot + i * 45); rr = r if i % 2 == 0 else r * 0.25
        (pth.moveTo if i == 0 else pth.lineTo)(x + rr * math.cos(a), y + rr * math.sin(a))
    pth.close()
    cv.drawPath(pth, P(col))
    cv.drawCircle(x, y, r * .6, P(CA(col, skia.ColorGetA(col) / 255 * .5), blur=r * .5, blend=ADD))

def draw_lilies(cv, t):
    for (lx, s) in LILY:
        yy = WATER + 18 + 3 * math.sin(t * 1.5 + lx)
        cv.save(); cv.translate(lx, yy); cv.scale(s, s)
        pth = skia.Path(); pth.addOval(oval(0, 0, 70, 20))
        cut = skia.Path(); cut.moveTo(0, 0); cut.lineTo(70, -6); cut.lineTo(70, 8); cut.close()
        pth = skia.Op(pth, cut, skia.PathOp.kDifference_PathOp) or pth
        cv.drawPath(pth, P(shader=lin(0, -20, 0, 20, [C('#8BE07E'), C('#3a9a45')])))
        cv.restore()

def draw_stones(cv, t):
    for i, sx in enumerate(STONES):
        up = stone_up(i, t)
        if up <= 0.01: continue
        lit = smooth(seg(t, STONE_LIT[i] - 0.05, STONE_LIT[i] + 0.25))
        flash = pulse(t, DISSOLVE - 0.2, DISSOLVE + 0.9)
        y = STONE_TOP + 22 + 60 * (1 - up)
        a = clamp(up)
        g = 0.35 + 0.65 * lit + flash
        cv.drawOval(oval(sx, WATER + 6, 110 * up, 22), P(C('#ffffff', 0.5 * a), stroke=4))
        cv.drawCircle(sx, y - 6, 150, P(shader=rad(sx, y - 6, 150, [C('#E6FFFF', 0.75 * g * a), C('#7FF1FF', 0.35 * g * a), C('#7FF1FF', 0)]), blend=ADD))
        cv.save(); cv.translate(sx, y); cv.scale(up, 1)
        top = skia.Path(); top.addRRect(skia.RRect.MakeRectXY(skia.Rect(-78, -18, 78, 26), 34, 26))
        base = mix(C('#B9A8E8'), C('#E9FFFF'), lit)
        cv.drawPath(top, P(shader=lin(0, -18, 0, 26, [mix(base, C('#ffffff'), .5), base, mix(base, C('#2a2a6a'), .35)], [0, .4, 1]), alpha=a))
        cv.drawOval(oval(-20, -8, 34, 7), P(C('#ffffff', 0.6 * a), blur=3))
        cv.restore()
        if lit > 0:  # twinkle sparks around lit stone
            for k in range(6):
                ang = k * 1.05 + t * 2; rr = 70 + 25 * math.sin(t * 4 + k)
                star(cv, sx + rr * math.cos(ang), y - 20 + 0.4 * rr * math.sin(ang), 9, C('#ffffff', 0.8 * lit * a))

RB_COLS = ['#FF4D5E', '#FF9F43', '#FFE14D', '#5BD86B', '#4DA6FF', '#9B6BFF']
def draw_bridge(cv, t):
    h = bridge_h(t)
    if h < 2: return
    bw = 24
    for i, c in enumerate(RB_COLS):
        a0 = BR_A - i * bw; h0 = h - i * bw * (h / BR_H)
        a1 = a0 - bw; h1 = h0 - bw * (h / BR_H)
        pth = skia.Path()
        pth.arcTo(skia.Rect(BR_CX - a0, GROUND - h0, BR_CX + a0, GROUND + h0), 180, 180, True)
        pth.arcTo(skia.Rect(BR_CX - a1, GROUND - max(h1, 1), BR_CX + a1, GROUND + max(h1, 1)), 0, -180, False)
        pth.close()
        col = C(c)
        cv.drawPath(pth, P(shader=lin(0, GROUND - h0, 0, GROUND, [mix(col, C('#ffffff'), .35), col, mix(col, C('#000000'), .12)], [0, .3, 1])))
    # glossy highlight + glow
    outer = skia.Rect(BR_CX - BR_A + 6, GROUND - h + 6, BR_CX + BR_A - 6, GROUND + h - 6)
    cv.drawArc(outer, 200, 140, False, P(C('#ffffff', 0.55), stroke=6))
    cv.drawArc(skia.Rect(BR_CX - BR_A, GROUND - h, BR_CX + BR_A, GROUND + h), 180, 180, False, P(C('#fff7c2', 0.35), stroke=40, blur=22, blend=SCREEN))
    # sparkles along arch
    for k in range(18):
        u = ((k * 0.0557 + t * 0.06) % 1.0) * 2 - 1
        x = BR_CX + u * (BR_A - 70); y = deck_y(x, h - 70)
        a = max(0, math.sin(t * 5 + k * 2.1)) ** 4
        if a > 0.05: star(cv, x, y, 12 * a + 4, C('#ffffff', a))
    # magic cloud puffs at both feet
    for fx in (BR_CX - BR_A + 70, BR_CX + BR_A - 70):
        for (dx, dy, r) in ((-60, 0, 45), (0, -15, 60), (60, 0, 45), (20, 15, 40), (-30, 18, 38)):
            cv.drawCircle(fx + dx, GROUND + 10 + dy, r * min(1, h / 300), P(shader=rad(fx + dx, GROUND + dy - r * .4, r * 1.4, [C('#ffffff'), C('#ffe6f5'), C('#d6c7ff')], [0, .6, 1])))

def draw_bridge_rise_fx(cv, t):
    p = seg(t, DISSOLVE, DISSOLVE + 2.2)
    if 0 < p < 1:
        for k in range(60):
            i = k % 3
            ang = k * 2.39996; sp = 140 + (k * 37 % 160)
            x = STONES[i] + math.cos(ang) * sp * p * 1.6
            y = STONE_TOP - math.sin(ang * .5 + 1) * sp * p * 2.2 - 40 * p
            a = (1 - p) * (0.6 + 0.4 * math.sin(t * 20 + k))
            star(cv, x, y, 14 * (1 - p * .5), C(['#FFFFFF', '#FFF39A', '#B9F6FF', '#FFC2F0'][k % 4], a))

def draw_door_flower(cv, t):
    x, by, gy = DOOR_FX, DOOR_BLOOM_Y, GROUND
    sway = 4 * math.sin(t * 1.2)
    draw_stem(cv, x, gy + 10, x + sway, by + 60, w=40, sway=sway)
    draw_leaf(cv, x + 8, gy - 150, 190, -28); draw_leaf(cv, x - 10, gy - 230, 170, 205)
    o = ease_back(seg(t, 53.0, 54.4), 1.1)
    R = 260
    c1, c2, c3 = C('#FF8AD8'), C('#C2187A'), C('#FFD3F1')
    cv.save(); cv.translate(x + sway, by)
    n = 10
    for layer_i in (0, 1):
        for i in range(n):
            open_a = (360 / n) * i + (18 if layer_i else 0)
            # closed: petals clustered upward like a tulip bud
            closed_a = -90 + (i - (n - 1) / 2) * (9 if layer_i == 0 else 6) + 90
            a = lerp(closed_a, open_a, clamp(o))
            ln = R * (1.0 if layer_i == 0 else 0.8) * lerp(0.62, 1.0, clamp(o))
            wd = R * lerp(0.26, 0.4, clamp(o)) * (1 if layer_i == 0 else .9)
            cv.save(); cv.rotate(a)
            cv.drawOval(oval(0, -ln * 0.5, wd, ln * 0.55), P(shader=lin(0, 0, 0, -ln, [c3 if layer_i else c1, c1, c2], [0, .5, 1])))
            cv.drawOval(oval(-wd * .3, -ln * .55, wd * .2, ln * .3), P(C('#ffffff', 0.28), blur=5))
            cv.restore()
    # center disk + golden door
    k = smooth(seg(o, 0.25, 0.9))
    if k > 0:
        cr = 118 * k
        cv.drawCircle(0, 0, cr, P(shader=rad(-cr * .3, -cr * .3, cr * 1.4, [C('#FFF0A8'), C('#FFC845'), C('#D88A12')], [0, .5, 1])))
        cv.scale(k, k)
        draw_door(cv, t)
    cv.restore()

def door_shape(w, h):
    pth = skia.Path(); pth.moveTo(-w / 2, h / 2); pth.lineTo(-w / 2, -h / 2 + w / 2)
    pth.arcTo(skia.Rect(-w / 2, -h / 2, w / 2, -h / 2 + w), 180, 180, False); pth.lineTo(w / 2, h / 2); pth.close()
    return pth

def draw_door(cv, t):
    w, h = 84, 124
    op = ease_io(seg(t, 54.8, 56.8))
    shine = smooth(seg(t, 54.8, 57.0))
    frame = door_shape(w + 22, h + 16)
    cv.drawPath(frame, P(shader=lin(-w, -h, w, h, [C('#FFF3B0'), C('#E8B01E'), C('#A86E05')])))
    hole = door_shape(w, h)
    cv.drawPath(hole, P(shader=rad(0, 10, h, [C('#FFFFFF'), C('#FFF4B8'), C('#FFC94A')], [0, .4, 1])))
    if shine > 0:  # light rays
        cv.save()
        for i in range(12):
            cv.save(); cv.rotate(i * 30 + t * 18)
            ray = skia.Path(); ray.moveTo(0, 0); ray.lineTo(-40, -900); ray.lineTo(40, -900); ray.close()
            cv.drawPath(ray, P(shader=lin(0, 0, 0, -900, [C('#FFF6C8', 0.55 * shine), C('#FFE27A', 0)]), blend=ADD))
            cv.restore()
        cv.restore()
        cv.drawCircle(0, 0, 420 * shine, P(shader=rad(0, 0, 420 * shine, [C('#FFF8D6', 0.9 * shine), C('#FFD45E', 0.35 * shine), C('#FFD45E', 0)]), blend=ADD))
    # door panel hinged on left edge
    cv.save(); cv.clipPath(hole, doAntiAlias=True)
    pw = 1 - op * 1.15
    if pw > -0.2:
        cv.save(); cv.translate(-w / 2, 0); cv.scale(pw, 1); cv.translate(w / 2, 0)
        cv.drawPath(hole, P(shader=lin(-w / 2, 0, w / 2, 0, [C('#FFD95A'), C('#F2A90F'), C('#C98207')])))
        for yy in (-30, 0, 30):
            cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(-w / 2 + 12, yy + 8, w / 2 - 12, yy + 26), 5, 5), P(C('#B87504', 0.5)))
        cv.drawCircle(w / 2 - 16, 10, 7, P(shader=rad(w / 2 - 18, 8, 9, [C('#FFFFFF'), C('#FFC21A'), C('#9C6200')])))
        cv.restore()
    cv.restore()
    cv.drawPath(hole, P(C('#8A5A00', 0.6), stroke=3))

def draw_color_flowers(cv, t):
    sp = [seg(t, 30.3 + .25 * i, 31.6 + .25 * i) for i in range(3)]
    for i, (fx, kind) in enumerate(FLOWERS):
        g = sp[i]
        if g <= 0: continue
        stem_top = lerp(WATER, FLOWER_HEAD_Y + 60, ease_out(g))
        sway = 6 * math.sin(t * 1.4 + i)
        wig = 0
        if kind == 'yellow' and 36.4 <= t < 39.5:
            wig = 14 * math.sin((t - 36.4) * 18) * math.exp(-(t - 36.4) * 0.9)
        draw_stem(cv, fx, WATER + 10, fx + sway, stem_top, w=26, sway=sway)
        if g > .5:
            draw_leaf(cv, fx + 6, lerp(WATER, 1150, ease_out(g)), 130 * clamp((g - .5) * 2), -25)
            draw_leaf(cv, fx - 6, lerp(WATER, 1000, ease_out(g)), 110 * clamp((g - .5) * 2), 200)
        pop = ease_back(seg(t, 30.9 + .25 * i, 31.7 + .25 * i), 2.2)
        if pop > 0:
            s = 1 + (0.12 * pulse(t, 36.4, 37.4) if kind == 'yellow' else 0)
            draw_flower_head(cv, fx + sway, stem_top - 40, 112 * pop * s, kind, rot=wig + 3 * math.sin(t + i))
        cv.drawOval(oval(fx, WATER + 12, 40 + 10 * math.sin(t * 3 + i), 8), P(C('#ffffff', 0.5), stroke=3))
    # yellow sparkle celebration
    if 36.4 <= t < 39.5:
        fx = FLOWERS[1][0]
        for k in range(12):
            ang = k * 0.52 + t * 2.5; rr = 150 + 25 * math.sin(t * 6 + k)
            a = (0.5 + 0.5 * math.sin(t * 9 + k)) * (1 - seg(t, 38.7, 39.5))
            star(cv, fx + rr * math.cos(ang), FLOWER_HEAD_Y - 40 + rr * math.sin(ang), 14, C('#FFF7B0', a))
        cv.drawCircle(fx, FLOWER_HEAD_Y - 40, 210, P(shader=rad(fx, FLOWER_HEAD_Y - 40, 210, [C('#FFF6A0', 0.45 * (1 - seg(t, 38.7, 39.5))), C('#FFF6A0', 0)]), blend=ADD))

def spotlight(cv, t, cx, cy, z):
    """Dim the frame except the flower being highlighted (gentle camera highlight)."""
    seq = [(33.9, 34.65, 0), (34.65, 35.4, 1), (35.4, 36.15, 2), (36.4, 38.2, 1)]
    dim = smooth(seg(t, 33.6, 34.0)) * (1 - smooth(seg(t, 38.0, 38.6)))
    if dim <= 0: return
    idx = None
    for (a, b, i) in seq:
        if a <= t < b: idx = i
    if idx is None:
        return
    fx = (FLOWERS[idx][0] - cx) * z + W / 2; fy = (FLOWER_HEAD_Y - 40 - cy) * z + H / 2
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=rad(fx, fy, 600, [C('#1a1030', 0), C('#1a1030', 0), C('#1a1030', 0.5 * dim)], [0, .26, .46])))
    cv.drawCircle(fx, fy, 165 * z, P(C('#FFF6C8', 0.16 * dim), blur=45, blend=SCREEN))

# ------------------------------------------------------------ frame
def draw_frame(cv, t):
    cx, cy, z = camera(t)
    draw_sky(cv, t, cx, cy, z)
    layer(cv, cx, cy, z, 1.0)
    draw_water(cv, t, cx, z)
    draw_lilies(cv, t)
    draw_stones(cv, t)
    draw_color_flowers(cv, t)
    draw_banks(cv, t)
    for (mx, r, h, col) in MUSH: draw_mushroom(cv, mx, r, h, col)
    for (dx, kind, r, hh) in DECOR:
        draw_stem(cv, dx, GROUND + 4, dx + 3 * math.sin(t + dx), GROUND - hh, w=6)
        draw_flower_head(cv, dx + 3 * math.sin(t + dx), GROUND - hh, r, kind, rot=dx % 40, n=6)
    if t > 48: draw_door_flower(cv, t)
    draw_bridge(cv, t)
    draw_bridge_rise_fx(cv, t)
    # characters (friend behind)
    sts = {n: char_state(n, t) for n in ('friend', 'socky')}
    for n, st in sts.items():
        draw_shadow(cv, st['x'], surface_y(st['x'], t), st['air'])
    for n, st in sts.items():
        draw_char(cv, st, t, n)
        if 50.0 <= t < 53.2:  # rainbow sparkle trail while sliding
            for k in range(6):
                tt = t - k * 0.06; s2 = char_state(n, tt)
                star(cv, s2['x'] - 30 * S_CHAR, s2['y'] - 20, 12 - k, C(RB_COLS[k % 6], 0.9 - k * 0.13))
    # butterflies
    if 19.6 <= t < 23.9:
        for i in range(5):
            x, y = butterfly_swirl(i, t)
            draw_butterfly(cv, x, y, 0.85, BF_COLS[i], t, ph=i, rot=12 * math.sin(t * 2 + i))
    if 23.0 <= t < 31.3:
        for i in range(5):
            if t >= COUNT_T[i] - 0.85:
                x, y = count_bfly(i, t)
                pop = pulse(t, COUNT_T[i] - 0.05, COUNT_T[i] + 0.35)
                if pop > 0:
                    cv.drawCircle(x, y, 120, P(shader=rad(x, y, 120, [C('#FFFFFF', 0.6 * pop), C('#FFFFFF', 0)]), blend=ADD))
                draw_butterfly(cv, x, y, 0.85 + 0.22 * pop, BF_COLS[i], t, ph=i * 1.3, rot=8 * math.sin(t * 2.3 + i))
    if 42.6 <= t < 50.8:
        for i in range(5):
            x, y = swirl2(i, t)
            draw_butterfly(cv, x, y, 0.8, BF_COLS[i], t, ph=i * 0.7, rot=15 * math.sin(t * 2 + i))
    if 39.6 <= t < 49.8:
        x, y, landed = head_bfly(t)
        draw_butterfly(cv, x, y, 0.75, ('#FFF59A', '#FFB300'), t, glow=1.0 + 0.3 * math.sin(t * 4),
                       flap_speed=4 if landed else 14)
    # ambient magic sparkles / fireflies
    for (sx, sy, ph, sp) in SPARK:
        yy = sy - (t * sp * 6) % 400
        a = max(0, math.sin(t * sp + ph)) ** 3
        if a > 0.08:
            cv.drawCircle(sx + 14 * math.sin(t + ph), yy, 4 + 3 * a, P(C('#FFF9C4', 0.8 * a)))
            cv.drawCircle(sx + 14 * math.sin(t + ph), yy, 14, P(C('#FFF59D', 0.25 * a), blur=8, blend=ADD))
    if t >= 58.5:  # end chime sparkle burst from the door
        p = seg(t, 58.5, 60)
        for k in range(36):
            ang = k * 2.39996; r = 60 + 520 * ease_out(p) * (0.5 + (k % 5) / 8)
            star(cv, DOOR_FX + math.cos(ang) * r, DOOR_BLOOM_Y + math.sin(ang) * r, 16 * (1 - p * .6),
                 C(['#FFFFFF', '#FFF39A', '#FFC2F0', '#B9F6FF'][k % 4], 1 - p * .7), rot=t * 90)
    cv.restore()
    spotlight(cv, t, cx, cy, z)
    # foreground bokeh
    for (bx, by, br, ph) in BOKEH:
        a = 0.10 + 0.08 * math.sin(t * 0.9 + ph)
        cv.drawCircle((bx - cx * 0.15) % W, (by + 30 * math.sin(t * 0.4 + ph)) % H, br, P(C('#FFFBE0', a), blur=br * 0.35, blend=ADD))
    # warm cinematic grade: top-left light + vignette
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=rad(260, 280, 1300, [C('#FFE8B0', 0.22), C('#FFE8B0', 0)]), blend=SCREEN))
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=rad(W / 2, H * 0.48, 1250, [C('#000000', 0), C('#000000', 0), C('#2a1440', 0.32)], [0, .62, 1])))
    # opening fade-in and golden ending glow
    if t < 0.6: cv.drawRect(skia.Rect(0, 0, W, H), P(C('#000000', 1 - t / 0.6)))
    g = smooth(seg(t, 59.0, 60.0))
    if g > 0: cv.drawRect(skia.Rect(0, 0, W, H), P(C('#FFF2C8', 0.55 * g)))

def render_range(a, b, out):
    surf = skia.Surface(W, H)
    cv = surf.getCanvas()
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', str(FPS),
                           '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for f in range(a, b):
        cv.clear(skia.ColorWHITE)
        draw_frame(cv, f / FPS)
        arr = surf.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType)
        ff.stdin.write(arr.tobytes())
    ff.stdin.close(); ff.wait()

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'still':
        surf = skia.Surface(W, H); cv = surf.getCanvas()
        for ts in sys.argv[3:]:
            cv.clear(skia.ColorWHITE); draw_frame(cv, float(ts))
            surf.makeImageSnapshot().save(f'{sys.argv[2]}/f_{float(ts):05.1f}.png', skia.kPNG)
    else:
        a, b = int(sys.argv[2]), int(sys.argv[3])
        render_range(a, b, sys.argv[4])
