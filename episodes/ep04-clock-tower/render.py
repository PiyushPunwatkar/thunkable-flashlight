"""Socky and the Clock Tower - Episode 4. Shares the sock model (Episode 2) and town look (Episode 3)."""
import os, sys, math, subprocess, importlib.util
import skia, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ep02-rainbow-bridge'))
import render as E2
_spec = importlib.util.spec_from_file_location('ep3render', os.path.join(HERE, '..', 'ep03-tiny-door', 'render.py'))
E3 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(E3)
from render import (W, H, FPS, clamp, lerp, seg, smooth, ease_io, ease_out, ease_back, pulse, C, CA, mix, P, lin, rad,
                    oval, star, ADD, SCREEN, draw_char, draw_shadow, S_CHAR)

DUR = 60.0
NF = int(FPS * DUR)
G = 1500.0

def base_state(x, y, **kw):
    st = dict(x=x, y=y, air=max(0.0, G - y), sx=1, sy=1, dir=1, spin=0, lean=0, look=(0.75, 0.0), mouth='smile',
              eye=1.0, squint=0, jiggle_t=5.0, alpha=1.0, brow=0)
    st.update(kw); return st

def run_hops(st, hops, t, x_start):
    """Bunny hops with squash & stretch (same feel as Episodes 2-3). Returns x, air, last landing time."""
    x = x_start; air = 0; last = -10
    for (t0, t1, x0, x1, hh) in hops:
        if t >= t1: x = x1; last = max(last, t1)
        if t0 <= t < t1:
            p = (t - t0) / (t1 - t0)
            x = lerp(x0, x1, smooth(p) * .3 + p * .7); air = 4 * hh * p * (1 - p)
            st['sy'] = 1 + 0.12 * math.sin(p * math.pi); st['sx'] = 1 / st['sy']
            if p < 0.12: st['sy'] = 0.85 + p; st['sx'] = 1.12
            if x1 < x0: st['dir'] = -1
        if t1 <= t < t1 + 0.18:
            q = (t - t1) / 0.18; s = 0.18 * math.sin(q * math.pi) * (1 - q * 0.3)
            st['sy'] = 1 - s; st['sx'] = 1 + s * 0.8
    return x, air, last

def look_at(st, tx, ty):
    dx = (tx - st['x']) * st['dir']; dy = ty - (st['y'] - 160 * S_CHAR); d = math.hypot(dx, dy) + 1e-6
    return (dx / d, dy / d)

def draw_sock(cv, st, t, name):
    if st['alpha'] <= 0.01: return
    if st['alpha'] < 1:
        cv.saveLayerAlpha(None, int(st['alpha'] * 255)); draw_char(cv, st, t, name); cv.restore()
    else: draw_char(cv, st, t, name)

# ======================================================== shared pieces: gears & clock
def gear_path(r, teeth, depth=0.14):
    p = skia.Path(); n = teeth * 4
    for i in range(n + 1):
        a = 2 * math.pi * i / n; k = i % 4
        rr = r if k in (1, 2) else r * (1 - depth)
        (p.moveTo if i == 0 else p.lineTo)(rr * math.cos(a), rr * math.sin(a))
    p.close(); return p
_GCACHE = {}
def draw_gear(cv, x, y, r, teeth, ang, col, hub=True, alpha=1.0, shape=None):
    key = (round(r), teeth, shape)
    if key not in _GCACHE:
        if shape == 'star': _GCACHE[key] = E3.star_path(r, r * 0.55)
        elif shape == 'triangle':
            p = skia.Path(); pts = [(r * math.cos(-math.pi / 2 + k * 2 * math.pi / 3), r * math.sin(-math.pi / 2 + k * 2 * math.pi / 3)) for k in range(3)]
            p.moveTo(*pts[0]); p.lineTo(*pts[1]); p.lineTo(*pts[2]); p.close()
            sp = skia.Paint(AntiAlias=True); sp.setPathEffect(skia.CornerPathEffect.Make(r * 0.22))
            dst = skia.Path(); sp.getFillPath(p, dst); _GCACHE[key] = dst
        else: _GCACHE[key] = gear_path(r, teeth)
    pth = _GCACHE[key]
    c = C(col)
    cv.save(); cv.translate(x, y); cv.rotate(ang)
    if alpha < 1: cv.saveLayerAlpha(None, int(alpha * 255))
    cv.save(); cv.translate(8, 12); cv.drawPath(pth, P(C('#3a1a10', 0.25), blur=10)); cv.restore()
    cv.drawPath(pth, P(shader=rad(-r * .3, -r * .35, r * 1.6, [mix(c, C('#ffffff'), .45), c, mix(c, C('#2a1408'), .35)], [0, .5, 1])))
    cv.drawPath(pth, P(mix(c, C('#2a1408'), .45), stroke=3))
    if hub:
        cv.drawCircle(0, 0, r * 0.62, P(mix(c, C('#2a1408'), .12), stroke=r * 0.06))
        for k in range(5 if shape is None else 0):
            a = k * 2 * math.pi / 5
            cv.drawCircle(math.cos(a) * r * 0.42, math.sin(a) * r * 0.42, r * 0.11, P(mix(c, C('#2a1408'), .4)))
        cv.drawCircle(0, 0, r * 0.18, P(shader=rad(-r * .05, -r * .05, r * .2, [C('#FFF6D0'), C('#D9A21E'), C('#8A5A00')])))
    cv.drawOval(oval(-r * .35, -r * .45, r * .25, r * .12), P(C('#ffffff', 0.3), blur=r * 0.05))
    if alpha < 1: cv.restore()
    cv.restore()

def draw_clock_face(cv, cx, cy, r, ha, ma, glow=0.6, rim='#E8B01E'):
    cv.drawCircle(cx, cy, r * 1.3, P(shader=rad(cx, cy, r * 1.3, [C('#FFF6C8', 0.6 * glow), C('#FFE27A', 0)]), blend=ADD))
    cv.drawCircle(cx, cy, r * 1.08, P(shader=lin(cx - r, cy - r, cx + r, cy + r, [C('#FFF3B0'), C(rim), C('#A86E05')])))
    cv.drawCircle(cx, cy, r, P(shader=rad(cx - r * .25, cy - r * .25, r * 1.4, [C('#FFFFFF'), C('#FFF6DA'), C('#FFE3A0')], [0, .6, 1])))
    for k in range(12):
        a = k * math.pi / 6
        cv.drawCircle(cx + math.cos(a) * r * 0.82, cy + math.sin(a) * r * 0.82, r * (0.07 if k % 3 == 0 else 0.04), P(C('#7E58C0')))
    h, m = math.radians(ha), math.radians(ma)
    cv.drawLine(cx, cy, cx + math.sin(h) * r * 0.48, cy - math.cos(h) * r * 0.48, P(C('#4a2a6a'), stroke=r * 0.085))
    cv.drawLine(cx, cy, cx + math.sin(m) * r * 0.72, cy - math.cos(m) * r * 0.72, P(C('#4a2a6a'), stroke=r * 0.055))
    cv.drawCircle(cx, cy, r * 0.09, P(C('#E8B01E')))
    cv.drawOval(oval(cx - r * .4, cy - r * .55, r * .3, r * .12), P(C('#FFFFFF', 0.45), blur=r * 0.05))

# ======================================================== scene A: arriving at the tower
TX = 1500.0  # tower centre
CLK = (1500.0, 700.0, 470.0)
DOOR_W, DOOR_H = 230, 330
EXT_FLOWERS = [(-700 + 95 * k + 30 * math.sin(k * 7), ['red', 'yellow', 'blue', 'pink'][k % 4], 40 + (k * 37) % 60) for k in range(40)
               if not (TX - 620 < -700 + 95 * k < TX + 620)]
ACAM = [(0, 860, 1020, 0.62), (3.6, 1420, 880, 0.56), (8.2, 1420, 870, 0.58), (9.3, 1420, 1250, 0.95),
        (10.2, 1440, 1290, 1.0), (11.0, 1500, 1360, 4.0)]
def cam_from(K, t):
    for a, b in zip(K, K[1:]):
        if a[0] <= t <= b[0]:
            p = seg(t, a[0], b[0]); p = p * p * p if b[3] > 2.5 else ease_io(p)
            return lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p)
    return K[-1][1:] if t > K[-1][0] else K[0][1:]

def ext_hands(t):
    m = 40 + t * 6; h = 300 + t * 0.5
    sp = ease_io(seg(t, 3.8, 5.6))
    m -= 1080 * sp; h -= 90 * sp
    if t >= 5.6: m += 6 * int((t - 5.6) / 0.75 + 1) * 1.0 - 6
    return h, m

def ext_state(name, t):
    socky = name == 'socky'
    st = base_state(0, G)
    if socky:
        hops = [(0.15 + .55 * i, 0.15 + .55 * i + .48, 300 + 156.7 * i, 300 + 156.7 * (i + 1), 85) for i in range(6)]
        hops += [(4.0, 4.42, 1240, 1240, 75), (10.0, 10.5, 1240, 1470, 90)]
        x0 = 300
    else:
        hops = [(0.3 + .55 * i, 0.3 + .55 * i + .48, 130 + 158.3 * i, 130 + 158.3 * (i + 1), 80) for i in range(6)]
        hops += [(4.15, 4.55, 1080, 1080, 60), (10.25, 10.75, 1080, 1450, 90)]
        x0 = 130
    x, air, last = run_hops(st, hops, t, x0)
    st.update(x=x, y=G - air, air=air, jiggle_t=t - last)
    if air == 0: st['sy'] *= 1 + 0.018 * math.sin(t * 3.1 + (0 if socky else 1.3))
    cx, cy, r = CLK
    if t < 3.6: st['look'] = (0.85, -0.35)
    elif t < 8.6:
        st['look'] = look_at(st, cx, cy); st['eye'] = 1.2 + 0.08 * pulse(t, 4.0, 4.6); st['mouth'] = 'o' if t < 7.0 else 'open'
    else:
        st['look'] = look_at(st, TX, G - 160); st['mouth'] = 'open'; st['eye'] = 1.12
    fa = (10.42, 10.62) if socky else (10.68, 10.88)
    st['alpha'] = 1 - seg(t, *fa)
    return st

def draw_landscape_sky(cv, cx, cy, z, t):
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=lin(0, 0, 0, H, [C('#7C86F0'), C('#B49CF0'), C('#FFB8D2'), C('#FFE0A8')], [0, .35, .7, 1])))
    for k in range(40):
        x = (k * 263.7) % W; y = (k * 151.3) % (H * 0.45)
        a = 0.3 + 0.7 * max(0, math.sin(t * 2 + k * 1.9)) ** 3
        cv.drawCircle(x, y, 2.5 + 2 * a, P(C('#FFFFFF', a * 0.9)))
    cv.drawCircle(180, 300, 80, P(C('#FFF8E0', 0.95)))
    cv.drawCircle(180, 300, 250, P(shader=rad(180, 300, 250, [C('#FFF6D0', 0.5), C('#FFF6D0', 0)]), blend=ADD))
    E2.layer(cv, cx, cy, z, 0.3)
    hp = skia.Path(); hp.moveTo(-1200, 2600); hp.lineTo(-1200, 900)
    for i in range(10): hp.quadTo(-1200 + i * 500 + 250, 760 + 60 * math.sin(i * 2.3), -1200 + (i + 1) * 500, 900)
    hp.lineTo(3800, 2600); hp.close()
    cv.drawPath(hp, P(shader=lin(0, 750, 0, 1300, [C('#C9B0F0'), C('#A58BDD')])))
    for k in range(26):  # the tiny town twinkling far below
        x = -1100 + k * 190; y = 920 + 40 * math.sin(k * 1.3)
        cv.drawRect(skia.Rect(x - 30, y - 60, x + 30, y + 80), P(C('#B79CE6')))
        tri = skia.Path(); tri.moveTo(x - 38, y - 58); tri.lineTo(x, y - 100); tri.lineTo(x + 38, y - 58); tri.close()
        cv.drawPath(tri, P(C('#9B7ED6')))
        cv.drawRect(skia.Rect(x - 10, y - 30, x + 10, y - 8), P(C('#FFE9A0', 0.6 + 0.4 * math.sin(t * 1.5 + k))))
    cv.restore()

def draw_tower(cv, t, door_open):
    x0, x1 = TX - 560, TX + 560
    cv.drawCircle(TX, 600, 1500, P(shader=rad(TX, 600, 1500, [C('#FFF0B8', 0.5), C('#FFC4E8', 0.18), C('#FFC4E8', 0)], [0, .4, 1]), blend=SCREEN))
    body = skia.Path(); body.moveTo(x0, G + 20); body.lineTo(x0 + 60, -100); body.lineTo(x1 - 60, -100); body.lineTo(x1, G + 20); body.close()
    cv.drawPath(body, P(shader=lin(x0, 0, x1, 0, [C('#FFF1DC'), C('#F2D4C0'), C('#C9A2B8')], [0, .5, 1])))
    for k in range(14):
        yy = -40 + k * 115
        cv.drawLine(x0 + 30, yy, x1 - 30, yy, P(C('#9a6a8a', 0.18), stroke=4))
    # clock section
    cx, cy, r = CLK
    cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(x0 - 30, cy - r - 90, x1 + 30, cy + r + 90), 40, 40),
                 P(shader=lin(x0, 0, x1, 0, [C('#E8C2FF'), C('#B48AE8'), C('#7E58C0')])))
    ha, ma = ext_hands(t)
    draw_clock_face(cv, cx, cy, r, ha, ma, glow=0.8 + 0.2 * math.sin(t * 2))
    # roof + finial
    rf = skia.Path(); rf.moveTo(x0 - 80, cy - r - 80); rf.quadTo(TX - 120, -500, TX, -1050); rf.quadTo(TX + 120, -500, x1 + 80, cy - r - 80); rf.close()
    cv.drawPath(rf, P(shader=lin(x0, 0, x1, 0, [C('#7FB2FF'), C('#4D6BE0'), C('#2E3C9A')])))
    star(cv, TX, -1100, 70 + 10 * math.sin(t * 3), C('#FFE27A'))
    for wx in (x0 + 170, x1 - 170):
        E3.window(cv, wx, 1330, 90, 130, t, arch=True)
    # tiny door at the bottom
    dw, dh = DOOR_W, DOOR_H
    cv.save(); cv.translate(TX, G - dh / 2 + 2)
    fr = E2.door_shape(dw + 34, dh + 24)
    cv.drawPath(fr, P(shader=lin(-dw, -dh, dw, dh, [C('#FFF3B0'), C('#E8B01E'), C('#A86E05')])))
    hole = E2.door_shape(dw, dh)
    cv.drawPath(hole, P(shader=rad(0, 20, dh, [C('#FFFFFF'), C('#FFF4B8'), C('#FFC94A')], [0, .4, 1])))
    if door_open > 0:
        cv.drawCircle(0, 0, 520 * door_open, P(shader=rad(0, 0, 520 * door_open, [C('#FFF8D6', 0.8 * door_open), C('#FFD45E', 0)]), blend=ADD))
        for g in range(3):  # peek of turning gears inside
            cv.save(); cv.clipPath(hole, doAntiAlias=True)
            draw_gear(cv, -60 + g * 70, -40 + 60 * (g % 2), 55, 10, t * (40 if g % 2 else -40), ['#E8B01E', '#D9823A', '#6FB7FF'][g], alpha=0.6 * door_open)
            cv.restore()
    cv.save(); cv.clipPath(hole, doAntiAlias=True)
    pw = 1 - door_open * 1.15
    if pw > -0.2:
        cv.translate(-dw / 2, 0); cv.scale(pw, 1); cv.translate(dw / 2, 0)
        cv.drawPath(hole, P(shader=lin(-dw / 2, 0, dw / 2, 0, [C('#9B7BFF'), C('#7A5CC7'), C('#5A3CA0')])))
        for yy in (-70, 0, 70):
            cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(-dw / 2 + 22, yy + 10, dw / 2 - 22, yy + 46), 8, 8), P(C('#4a2a8a', 0.4)))
        cv.drawCircle(dw / 2 - 30, 20, 13, P(shader=rad(dw / 2 - 33, 17, 15, [C('#FFFFFF'), C('#FFC21A'), C('#9C6200')])))
    cv.restore()
    cv.drawPath(hole, P(C('#8A5A00', 0.6), stroke=4))
    cv.restore()

def draw_exterior(cv, t):
    cx, cy, z = cam_from(ACAM, t)
    draw_landscape_sky(cv, cx, cy, z, t)
    E2.layer(cv, cx, cy, z, 1.0)
    door_open = ease_io(seg(t, 8.7, 9.8))
    draw_tower(cv, t, door_open)
    # hilltop meadow + glowing path to the door
    hl = skia.Path(); hl.moveTo(-1500, G - 10); hl.quadTo(400, G - 40, TX + 1800, G - 10); hl.lineTo(TX + 1800, 3600); hl.lineTo(-1500, 3600); hl.close()
    cv.drawPath(hl, P(shader=lin(0, G - 30, 0, G + 900, [C('#9BE58C'), C('#5BC75A'), C('#3e9f45')])))
    for k in range(60):
        x = -1400 + k * 70; sway = 5 * math.sin(t * 2 + k)
        pth = skia.Path(); pth.moveTo(x - 6, G + 4); pth.quadTo(x, G - 30, x + sway, G - 48 - (k * 13) % 24); pth.quadTo(x + 2, G - 20, x + 6, G + 4); pth.close()
        cv.drawPath(pth, P(C(['#4fc85a', '#6ad96a', '#3fb04c'][k % 3])))
    for k in range(28):
        x = -900 + k * 85
        if x > TX - 140: break
        a = 0.75 + 0.25 * math.sin(t * 6 - k * 0.7)
        cv.drawCircle(x, G + 30, 30, P(shader=rad(x, G + 30, 30, [C('#FFF3A0', 0.8 * a), C('#FFD45E', 0)]), blend=ADD))
        cv.drawOval(oval(x, G + 30, 18, 9), P(C('#FFF6C0', a)))
    for (fx, kind, hh) in EXT_FLOWERS:  # meadow flowers behind the path
        E2.draw_stem(cv, fx, G + 6, fx + 3 * math.sin(t + fx), G - hh, w=7)
        E2.draw_flower_head(cv, fx + 3 * math.sin(t + fx), G - hh, 26, kind, rot=fx % 40, n=6)
    for (mx, dy, r, h, col) in ((-150, 520, 190, 300, '#FF6F91'), (2350, 640, 220, 340, '#B388FF'), (600, 900, 150, 220, '#7FD4FF'),
                                (2700, 260, 140, 210, '#FF8A65')):
        cv.save(); cv.translate(0, dy); E2.draw_mushroom(cv, mx, r, h, col); cv.restore()
    for (fx, fy, kind) in ((150, G + 420, 'yellow'), (1150, G + 700, 'pink'), (1900, G + 380, 'blue'), (2900, G + 820, 'red'), (420, G + 1100, 'blue'), (2050, G + 1150, 'yellow')):
        for k in range(3):
            x = fx - 50 + k * 50; hh = 120 + 40 * (k % 2)
            E2.draw_stem(cv, x, fy, x + 4 * math.sin(t + k), fy - hh, w=9)
            E2.draw_flower_head(cv, x + 4 * math.sin(t + k), fy - hh, 40, kind, rot=k * 25 + 5 * math.sin(t), n=6)
    sts = {n: ext_state(n, t) for n in ('friend', 'socky')}
    for n, st in sts.items():
        if st['alpha'] > 0.5: draw_shadow(cv, st['x'], G, st['air'])
    for n, st in sts.items(): draw_sock(cv, st, t, n)
    # the golden map leads the way, then dissolves into sparkles at the tower
    if t < 4.2:
        so = sts['socky']
        mx = min(so['x'] + 190, 1380); my = 1120 + 12 * math.sin(t * 2.2)
        s = 1 - smooth(seg(t, 3.5, 3.9))
        if s > 0.02: E3.draw_map(cv, mx, my, s, t + 56, 1.0)
        if 3.5 < t < 4.2:
            p = seg(t, 3.5, 4.2)
            for k in range(12):
                a = k * 0.52; rr = 30 + 200 * ease_out(p)
                star(cv, mx + math.cos(a) * rr, my + math.sin(a) * rr, 16 * (1 - p), C(['#FFE27A', '#FFFFFF', '#FFC2F0'][k % 3], 1 - p))
    # backwards spin swoosh rings on the clock
    if 3.8 < t < 5.8:
        p = seg(t, 3.8, 5.8); ccx, ccy, r = CLK
        for i in range(2):
            cv.drawArc(oval(ccx, ccy, r * (1.18 + .1 * i), r * (1.18 + .1 * i)), (-t * 500 - i * 140) % 360, 120, False,
                       P(C('#FFFFFF', 0.55 * math.sin(p * math.pi)), stroke=14, blend=ADD))
    for k in range(40):
        x = -400 + (k * 97.1) % 3600 + 20 * math.sin(t * 0.7 + k); y = 1450 - ((t * (12 + k % 7 * 5) + k * 61) % 1400)
        a = max(0, math.sin(t * 1.8 + k * 2.3)) ** 3
        if a > 0.08: cv.drawCircle(x, y, 5 + 4 * a, P(C('#FFF5C0', 0.85 * a)))
    cv.restore()
    vignette(cv)
    f = smooth(seg(t, 10.55, 11.0))
    if f > 0: cv.drawRect(skia.Rect(0, 0, W, H), P(mix(C('#FFE9A8'), C('#FFFFFF'), f), alpha=f))
    if t < 0.5: cv.drawRect(skia.Rect(0, 0, W, H), P(C('#FFF3B0', 0.5 * (1 - t / 0.5))))

def vignette(cv):
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=rad(W / 2, H * 0.45, 1300, [C('#FFD9A0', 0.12), C('#FFD9A0', 0)]), blend=SCREEN))
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=rad(W / 2, H * 0.48, 1250, [C('#000000', 0), C('#000000', 0), C('#2a1440', 0.34)], [0, .62, 1])))

# ======================================================== scene B: the clockwork world
HC = (1450.0, 960.0, 380.0)        # hero clock on the back wall (later the secret window)
SILL = HC[1] + HC[2] - 30
SLOT = (1980.0, 1200.0, 150.0)     # where the round gear belongs
G1 = (820.0, 600.0, 300.0); G2 = (2200.0, 780.0, 300.0)
GAME = [(1200, 300, 'round', '#4DA6FF'), (1450, 300, 'star', '#FFD233'), (1700, 300, 'triangle', '#FF5A5F')]
COUNT_T = [33.0, 34.3, 35.6, 36.9, 38.2]
STARS = [(HC[0] + 560 * math.cos(math.radians(a)), HC[1] + 560 * math.sin(math.radians(a))) for a in (-160, -125, -90, -55, -20)]
BCAM = [(11.0, 1420, 1080, 1.7), (12.8, 1560, 1000, 0.9), (16.0, 1590, 1000, 0.92), (17.5, 1600, 1030, 0.97),
        (20.0, 1560, 920, 0.9), (30.0, 1560, 920, 0.9), (31.0, 1500, 900, 0.88), (45.9, 1500, 900, 0.88),
        (48.0, 1450, 1000, 1.12), (50.0, 1450, 1010, 1.0), (51.5, 1450, 980, 0.92), (56.9, 1450, 980, 0.95),
        (58.2, 1450, 960, 3.3), (60.0, 1450, 960, 3.3)]

def drive(t):
    """Clockwork speed: runs, grinds to a stop when the gear pops out, restarts when Socky fixes it."""
    if t < 15.9: return 1.0
    if t < 17.0: return 1 - smooth(seg(t, 15.9, 17.0))
    if t < 29.4: return 0.0
    return smooth(seg(t, 29.4, 30.0))
_ANG = None
def gear_angle(t):
    """Integrated rotation (degrees at speed 1 = 40 deg/s)."""
    global _ANG
    if _ANG is None:
        ts = np.arange(0, 60.2, 1 / 120); sp = np.array([drive(x) for x in ts])
        _ANG = (ts, np.cumsum(sp) * 40 / 120)
    return float(np.interp(t, _ANG[0], _ANG[1]))

def ticks_done(t):
    # minute hand ticks every 0.75 s while running; one extra tick on each count
    a = gear_angle(t) / 40
    n = int(a / 0.75)
    n += sum(1 for tc in COUNT_T if t >= tc)
    return n

def int_hands(t):
    m = 20 + 6 * ticks_done(t); h = 250 + 0.5 * ticks_done(t)
    if 40.6 <= t < 42.2:  # "I have hands": the hands wave
        w = math.sin((t - 40.6) * 9) * 22 * math.sin(seg(t, 40.6, 42.2) * math.pi); m += w; h -= w
    return h, m

def round_gear_pos(t):
    """Blue round gear: in the slot, pops out (15.4), returns with the shape game, rides Socky's head, snaps back in."""
    sx, sy, sr = SLOT
    if t < 15.4: return sx, sy, 1.0, 'slot'
    if t < 16.2:
        p = seg(t, 15.4, 16.2)
        return sx + 600 * p, sy - 380 * math.sin(p * math.pi * 0.9) + 500 * p * p, 1.0, 'fly'
    gx, gy = GAME[0][0], GAME[0][1]
    if t < 26.9: return gx, gy + 10 * math.sin(t * 2), 1.0, 'game'
    so = int_state('socky', t)
    hx, hy = so['x'] + 4, so['y'] - 270 * S_CHAR * so['sy'] - 30
    if t < 27.55:
        p = ease_io(seg(t, 26.95, 27.55)); return lerp(gx, hx, p), lerp(gy, hy, p), lerp(1.0, 0.62, p), 'drop'
    if t < 29.15: return hx, hy, 0.62, 'head'
    p = ease_io(seg(t, 29.15, 29.45))
    return lerp(hx, sx, p), lerp(hy, sy, p) - 80 * math.sin(p * math.pi), lerp(0.62, 1.0, p), 'snap'

def int_state(name, t):
    socky = name == 'socky'
    st = base_state(0, G)
    if socky:
        hops = [(11.15, 11.6, 1050, 1200, 80), (11.7, 12.15, 1200, 1350, 80), (13.4, 13.75, 1350, 1350, 40),
                (15.5, 15.85, 1350, 1350, 50),
                (27.1, 27.55, 1350, 1350, 100), (27.9, 28.35, 1350, 1560, 80), (28.45, 28.9, 1560, 1770, 80),
                (28.95, 29.4, 1770, 1770, 130), (29.6, 30.0, 1770, 1770, 60)]
        hops += [(tc - 0.05, tc + 0.4, 1770, 1770, 90) for tc in COUNT_T]
        hops += [(39.05, 39.45, 1770, 1770, 70), (48.3, 48.8, 1770, 1580, 80), (48.85, 49.25, 1580, 1500, 60),
                 (50.0, 50.45, 1500, 1660, 60), (56.6, 57.1, 1660, 1490, 190)]
        x0 = 1050
    else:
        hops = [(11.4, 11.85, 900, 1030, 75), (11.95, 12.4, 1030, 1150, 75), (13.7, 14.05, 1150, 1150, 35),
                (28.2, 28.65, 1150, 1360, 75), (28.75, 29.2, 1360, 1560, 75), (29.75, 30.15, 1560, 1560, 55),
                (39.2, 39.6, 1560, 1560, 60), (48.9, 49.35, 1560, 1380, 60), (50.1, 50.55, 1380, 1240, 60),
                (56.75, 57.25, 1240, 1400, 190)]
        x0 = 900
    x, air, last = run_hops(st, hops, t, x0)
    y = G - air
    sill_hop = (56.6, 57.1) if socky else (56.75, 57.25)
    if t >= sill_hop[0]:  # hop up onto the open window's sill
        p = seg(t, *sill_hop); y = lerp(G, SILL, smooth(p)) - (air if p < 1 else 0)
    st.update(x=x, y=y, air=G - y, jiggle_t=t - last)
    if air == 0: st['sy'] *= 1 + 0.018 * math.sin(t * 3.1 + (0 if socky else 1.3))
    def lk(v): st['look'] = v
    hx, hy, hr = HC
    if 12.2 <= t < 15.4:  # amazed by the clockwork
        st['eye'] = 1.2; st['mouth'] = 'o' if t < 13.4 else 'open'
        a = (t - 12.2) * 1.3 + (0 if socky else 1.1); lk((math.cos(a) * 0.9, -0.6 + 0.3 * math.sin(a * 1.6)))
    if 15.4 <= t < 20.0:
        if t < 16.3: gx, gy, _, _ = round_gear_pos(t); lk(look_at(st, gx, gy)); st['mouth'] = 'o'; st['eye'] = 1.22
        else:
            lk(look_at(st, SLOT[0], SLOT[1]) if (t * 0.8) % 2 < 1.3 else look_at(st, G2[0], G2[1]))
            st['mouth'] = 'frown'; st['brow'] = smooth(seg(t, 16.3, 16.8)); st['eye'] = 0.95
            if not socky and 18.2 < t < 19.2: lk((-0.9, -0.1))
            if socky and 18.4 < t < 19.4: lk((-0.9, 0.1))
    if 20.0 <= t < 27.0:
        st['brow'] = 0.6 * (1 - smooth(seg(t, 26.8, 27.1))); st['mouth'] = 'smile'
        i = int(((t - 20.0) * 1.0) % 3); lk(look_at(st, GAME[i][0], GAME[i][1]))
        if socky and 23.0 <= t < 24.7: lk((0.0, 0.12))
        if 26.8 <= t: lk(look_at(st, GAME[0][0], GAME[0][1])); st['mouth'] = 'open'; st['eye'] = 1.15
    if 27.0 <= t < 29.5:
        lk((0.2, -0.95) if socky else look_at(st, *round_gear_pos(t)[:2])); st['mouth'] = 'open'
    if 29.5 <= t < 33.0:
        st['mouth'] = 'open'; st['eye'] = 1.12; lk(look_at(st, hx, hy - 300))
    if 32.4 <= t < 39.0:
        i = min(4, max(0, int((t - 32.4) / 1.3))); lk(look_at(st, *STARS[i])); st['mouth'] = 'smile'
    if 39.0 <= t < 40.3: st['squint'] = 1; st['mouth'] = 'open'
    if 40.3 <= t < 45.9:
        lk(look_at(st, hx, hy)); st['mouth'] = 'smile'
        if socky and 44.6 <= t < 45.9: lk((0.0, 0.12))
    if 45.9 <= t < 48.1: lk(look_at(st, hx, hy)); st['mouth'] = 'o'; st['eye'] = 1.1
    if 48.1 <= t < 50.0:
        st['mouth'] = 'open'
        if t >= 49.25 if socky else t >= 49.35:  # hug the clock: squish against it, eyes closed in delight
            q = smooth(seg(t, 49.25, 49.5)) * (1 - smooth(seg(t, 49.85, 50.0)))
            st['squint'] = 1; st['sx'] *= 1 + 0.14 * q; st['sy'] *= 1 - 0.1 * q; st['lean'] = (-8 if socky else 8) * q
    if 50.0 <= t < 55.6:
        lk(look_at(st, hx, hy)); st['mouth'] = 'o'; st['eye'] = 1.22
        if socky and t >= 50.45: st['dir'] = -1
    if 55.2 <= t:
        if socky:  # turns to the camera: "Hop, hop, let's go!"
            q = smooth(seg(t, 55.2, 55.5)); st['dir'] = -1
            lk((lerp(0.7, 0.0, q), lerp(-0.5, 0.12, q))); st['eye'] = 1.22; st['mouth'] = 'open'
            if t >= 56.6: lk(look_at(st, hx, hy))
        else: lk(look_at(st, hx, hy)); st['mouth'] = 'open'; st['eye'] = 1.18
    fa = (57.2, 57.6) if socky else (57.35, 57.7)
    if t > fa[0]: st['alpha'] = 1 - seg(t, *fa)
    return st

def spring(cv, x, base, t, ph):
    ext = 0.5 + 0.5 * abs(math.sin(t * 3.2 + ph))
    if drive(t) < 0.5 and 16.5 < t < 29.4: ext = 0.15
    hgt = 70 + 120 * ext
    cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(x - 50, base - 16, x + 50, base + 4), 8, 8), P(C('#A86E05')))
    pth = skia.Path(); pth.moveTo(x - 32, base - 16)
    n = 8
    for k in range(1, n * 2 + 1):
        y = base - 16 - hgt * k / (n * 2)
        pth.lineTo(x + (32 if k % 2 else -32), y)
    cv.drawPath(pth, P(shader=lin(x - 32, 0, x + 32, 0, [C('#FFF3B0'), C('#D9A21E'), C('#8A5A00')]), stroke=9))
    top = base - 16 - hgt
    cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(x - 44, top - 14, x + 44, top + 4), 6, 6), P(C('#E8B01E')))
    by = top - 40 - 160 * abs(math.sin(t * 3.2 + ph + 0.4)) * (1 if not (16.5 < t < 29.4) else 0.0)
    cv.drawCircle(x, by, 32, P(shader=rad(x - 10, by - 10, 40, [C('#FFFFFF'), C(['#FF7BC5', '#7FD4FF'][int(ph) % 2]), C('#5a3a8a')], [0, .5, 1])))

def small_clock(cv, x, y, r, t, speed):
    cv.drawCircle(x + 5, y + 8, r * 1.15, P(C('#3a1a10', 0.25), blur=8))
    d = drive(t)
    a = gear_angle(t) * speed
    draw_clock_face(cv, x, y, r, a * 0.08, a, glow=0.25, rim='#D9823A')

def draw_room(cv, t, cx, cy, z):
    lit = clamp(1 - 0.35 * smooth(seg(t, 15.9, 17.0)) + 0.17 * smooth(seg(t, 20.0, 20.8)) + 0.18 * smooth(seg(t, 29.4, 30.0)))
    cv.drawRect(skia.Rect(0, 0, W, H), P(shader=lin(0, 0, 0, H, [C('#5A3A6A'), C('#B5733F'), C('#E3A96A'), C('#8A5434')], [0, .3, .7, 1])))
    ang = gear_angle(t)
    E2.layer(cv, cx, cy, z, 0.5)  # far gears silhouettes
    for (gx, gy, r, tth, sp, col) in ((300, 300, 260, 18, 0.6, '#C98A4E'), (1100, 120, 200, 14, -0.8, '#B87A44'),
                                      (1700, 500, 300, 20, 0.5, '#D49A5A'), (2300, 200, 220, 16, -0.7, '#C98A4E'),
                                      (600, 1000, 240, 16, -0.6, '#B87A44'), (2000, 1050, 260, 18, 0.6, '#C98A4E')):
        draw_gear(cv, gx, gy, r, tth, ang * sp, col, alpha=0.45)
    cv.restore()
    E2.layer(cv, cx, cy, z, 1.0)
    # back wall panels
    cv.drawRect(skia.Rect(400, -400, 2700, G), P(shader=lin(0, -400, 0, G, [C('#F6D9A8', 0.25), C('#E3A96A', 0.35)])))
    for k in range(7):
        x = 420 + k * 330
        cv.drawRRect(skia.RRect.MakeRectXY(skia.Rect(x, 1180, x + 290, 1470), 18, 18), P(C('#8A5434', 0.25), stroke=6))
    # god rays
    for k in range(4):
        rp = skia.Path(); x = 600 + k * 420
        rp.moveTo(x, -500); rp.lineTo(x + 160, -500); rp.lineTo(x + 520, G); rp.lineTo(x + 260, G); rp.close()
        cv.drawPath(rp, P(shader=lin(0, -500, 0, G, [C('#FFF3C8', 0.22 * lit), C('#FFF3C8', 0)]), blend=SCREEN))
    # big gear train
    draw_gear(cv, G1[0], G1[1], G1[2], 22, ang, '#D9823A')
    draw_gear(cv, G2[0], G2[1], G2[2], 22, -ang + 8, '#E8B01E')
    draw_gear(cv, 1060, 1180, 110, 10, -ang * 2.7, '#4DB6AC')
    draw_gear(cv, 2060, 300, 140, 12, ang * 2.1, '#FF8AB8')
    draw_gear(cv, 880, 1250, 80, 8, ang * 3.6, '#9B7BFF')
    # tiny clocks + springs
    for (x, y, r, sp) in ((640, 1020, 64, 6), (2380, 1180, 58, -5), (980, 260, 52, 9), (1900, 560, 46, 7), (560, 560, 40, 11)):
        small_clock(cv, x, y, r, t, sp)
    spring(cv, 700, G, t, 0.0); spring(cv, 2400, G, t, 1.7)
    # missing-gear axle
    sx, sy, sr = SLOT
    cv.drawCircle(sx, sy, sr * 0.2, P(shader=rad(sx - 5, sy - 5, sr * .25, [C('#FFF6D0'), C('#D9A21E'), C('#8A5A00')])))
    if 16.2 < t < 29.4:
        a = 0.35 + 0.25 * math.sin(t * 4)
        dash = P(C('#FFFFFF', a), stroke=5); dash.setPathEffect(skia.DashPathEffect.Make([18, 14], t * 20))
        cv.drawCircle(sx, sy, sr, dash)
    # floor
    cv.drawRect(skia.Rect(-800, G - 10, 3800, 3400), P(shader=lin(0, G, 0, G + 700, [C('#C98A4E'), C('#9A6232'), C('#6E4222')])))
    for k in range(30):
        x = -800 + k * 160
        cv.drawLine(x, G + 20, x - 120, G + 900, P(C('#5a3418', 0.25), stroke=4))
    cv.drawRect(skia.Rect(-800, G - 16, 3800, G + 14), P(shader=lin(0, G - 16, 0, G + 14, [C('#FFF3B0'), C('#D9A21E'), C('#8A5A00')])))
    cv.drawOval(oval(1450, G + 230, 760, 170), P(C('#3a1a10', 0.2), blur=12))
    for k, col in enumerate(('#FF6F91', '#FFD233', '#4DA6FF', '#5BD86B', '#9B7BFF')):
        cv.drawOval(oval(1450, G + 220, 740 - k * 130, 160 - k * 28), P(C(col)))
    for k in range(18):
        a = k * 0.349; cv.drawCircle(1450 + 700 * math.cos(a), G + 220 + 150 * math.sin(a), 9, P(C('#FFF3B0')))
    for (gx, gy, r, col) in ((520, G + 520, 70, '#E8B01E'), (2420, G + 600, 85, '#4DB6AC'), (900, G + 820, 55, '#FF8AB8'), (2050, G + 900, 60, '#D9823A')):
        cv.save(); cv.translate(gx, gy); cv.scale(1, 0.45); draw_gear(cv, 0, 0, r, 10, gx % 40, col); cv.restore()
    for (gx, gw) in ((1450, 520), (700, 250), (2400, 250)):
        cv.drawOval(oval(gx, G + 60, gw, 60), P(shader=rad(gx, G + 60, gw, [C('#FFE6A0', 0.35 * lit), C('#FFE6A0', 0)]), blend=ADD))
    return lit

def draw_window_view(cv, t, wx, wy, wr, open_k):
    """Through the secret window: the enormous magical landscape (drawn in its own 1080x1920 frame)."""
    s = clamp(wr / 1100, 0.45, 1.0)
    cv.save()
    clip = skia.Path(); clip.addCircle(wx, wy, wr * open_k if open_k < 1 else wr)
    if open_k < 1:  # the two halves of the clock face swing open like shutters
        clip = skia.Path(); clip.addRect(skia.Rect(wx - wr * open_k, wy - wr, wx + wr * open_k, wy + wr))
        circ = skia.Path(); circ.addCircle(wx, wy, wr); clip = skia.Op(clip, circ, skia.PathOp.kIntersect_PathOp)
    cv.clipPath(clip, doAntiAlias=True)
    cv.translate(wx, wy); cv.scale(s, s); cv.translate(-540, -960)
    draw_landscape(cv, t, socks=t > 57.6)
    cv.restore()

def draw_landscape(cv, t, socks=False):
    L = 1080
    cv.drawRect(skia.Rect(-1400, -1400, L + 1400, 3400), P(shader=lin(0, -400, 0, 1300, [C('#6FB6FF'), C('#BFE3FF'), C('#FFD8E8'), C('#FFE6B0')], [0, .4, .75, 1])))
    cv.drawCircle(540, 820, 900, P(shader=rad(540, 820, 900, [C('#FFF6C8', 0.8), C('#FFE6A0', 0.25), C('#FFE6A0', 0)], [0, .3, 1]), blend=SCREEN))
    # far mountains with snowy caps
    for (mx, my, mw, col) in ((-300, 1100, 700, '#B6A6F0'), (250, 1060, 620, '#9C8CE6'), (800, 1100, 700, '#B6A6F0'),
                              (1300, 1080, 600, '#9C8CE6'), (-800, 1080, 600, '#9C8CE6')):
        pk = skia.Path(); pk.moveTo(mx - mw / 2, 1300); pk.quadTo(mx - mw * 0.1, my - 560, mx, my - 600); pk.quadTo(mx + mw * 0.1, my - 560, mx + mw / 2, 1300); pk.close()
        cv.drawPath(pk, P(shader=lin(mx - mw / 2, 0, mx + mw / 2, 0, [mix(C(col), C('#ffffff'), .3), C(col), mix(C(col), C('#3a2a6a'), .2)])))
        cap = skia.Path(); cap.moveTo(mx - mw * 0.13, my - 470); cap.quadTo(mx, my - 640, mx + mw * 0.13, my - 470)
        cap.quadTo(mx + mw * .05, my - 440, mx, my - 480); cap.quadTo(mx - mw * .05, my - 440, mx - mw * 0.13, my - 470); cap.close()
        cv.drawPath(cap, P(C('#FFFFFF', 0.92)))
    # the mysterious next destination: a floating crystal castle among the clouds
    fx, fy = 540, 760 + 10 * math.sin(t * 1.2)
    pulse_k = 0.6 + 0.4 * math.sin(t * 2.4) + 1.2 * pulse(t, 58.8, 60.2)
    cv.drawCircle(fx, fy, 330, P(shader=rad(fx, fy, 330, [C('#E8FBFF', 0.75 * min(1.5, pulse_k)), C('#C2A8FF', 0.25), C('#C2A8FF', 0)], [0, .4, 1]), blend=ADD))
    isl = skia.Path(); isl.moveTo(fx - 150, fy + 30); isl.quadTo(fx, fy + 210, fx + 150, fy + 30); isl.close()
    cv.drawPath(isl, P(shader=lin(0, fy + 30, 0, fy + 200, [C('#8BE07E'), C('#8A6142')])))
    for (dx, h, w, col) in ((-80, 120, 34, '#9FE8FF'), (-35, 190, 42, '#C9B0FF'), (15, 250, 50, '#B9F6FF'), (65, 170, 40, '#FFC2F0'), (105, 110, 30, '#9FE8FF')):
        cr = skia.Path(); cr.moveTo(fx + dx - w / 2, fy + 32); cr.lineTo(fx + dx - w / 2, fy + 32 - h + w); cr.lineTo(fx + dx, fy + 32 - h)
        cr.lineTo(fx + dx + w / 2, fy + 32 - h + w); cr.lineTo(fx + dx + w / 2, fy + 32); cr.close()
        cv.drawPath(cr, P(shader=lin(fx + dx - w / 2, 0, fx + dx + w / 2, 0, [C('#FFFFFF'), C(col), mix(C(col), C('#5a3a9a'), .3)])))
    if t > 58.8:  # beam of light from the castle: the hook
        p = seg(t, 58.8, 60.0)
        bm = skia.Path(); bm.moveTo(fx + 10, fy - 230); bm.lineTo(fx - 50, -1400); bm.lineTo(fx + 70, -1400); bm.close()
        cv.drawPath(bm, P(shader=lin(0, fy - 230, 0, -600, [C('#FFFFFF', 0.85 * p), C('#E8FBFF', 0)]), blend=ADD))
    star(cv, fx + 15, fy - 240, 26 + 10 * math.sin(t * 4), C('#FFFFFF'))
    for (cx, cy, s) in ((fx - 190, fy + 120, 1.0), (fx + 170, fy + 110, 0.9), (-120, 600, 1.3), (1150, 520, 1.2), (300, 380, .8), (820, 330, .9)):
        E2.cloud(cv, cx + 20 * math.sin(t * 0.3 + cx), cy, s)
    # rolling hills
    for (yy, col1, col2, amp, ph) in ((1250, '#A6E3A8', '#7FCB86', 50, 0.0), (1420, '#8BDB86', '#5BBF5E', 70, 1.3), (1650, '#6FD06C', '#3FA244', 90, 2.1)):
        hp = skia.Path(); hp.moveTo(-1400, 3400); hp.lineTo(-1400, yy)
        for i in range(12): hp.quadTo(-1400 + i * 330 + 165, yy - amp + amp * 0.6 * math.sin(i * 1.7 + ph), -1400 + (i + 1) * 330, yy)
        hp.lineTo(2600, 3400); hp.close()
        cv.drawPath(hp, P(shader=lin(0, yy - amp, 0, yy + 600, [C(col1), C(col2)])))
    # glowing path winding to the castle (perspective)
    def pp(u):
        y = lerp(2050, 1010, u ** 0.8); x = 540 + 260 * math.sin(u * 5.5) * (1 - u)
        return x, y, lerp(260, 14, u ** 0.7)
    left = skia.Path(); right = []
    for k in range(41):
        x, y, w = pp(k / 40); (left.moveTo if k == 0 else left.lineTo)(x - w / 2, y); right.append((x + w / 2, y))
    for (x, y) in reversed(right): left.lineTo(x, y)
    left.close()
    cv.drawPath(left, P(shader=lin(0, 2050, 0, 1000, [C('#FFE9A0'), C('#FFD45E'), C('#FFF6D0')])))
    cv.drawPath(left, P(C('#FFF3B0', 0.6), blur=18, blend=ADD))
    for k in range(18):
        u = ((k / 18) + t * 0.08) % 1.0; x, y, w = pp(u)
        star(cv, x + w * 0.3 * math.sin(k), y - 10, 6 + 14 * (1 - u), C('#FFFFFF', 0.9 * (1 - u * 0.5)))
    if socks:  # tiny Socky + friend hopping off along the path
        for n, off in (('friend', 0.0), ('socky', 0.06)):
            p = seg(t, 57.7, 60.4)
            u = 0.04 + off + 0.28 * p
            hopph = ((t - 57.7) / 0.42 + (0.5 if n == 'friend' else 0)) % 1.0
            x, y, w = pp(u)
            k = w / 260 * 0.75
            st = base_state(0, 0, look=(0.3, -0.6), mouth='open')
            st['y'] = -4 * 70 * hopph * (1 - hopph)
            st['sy'] = 1 + 0.12 * math.sin(hopph * math.pi); st['sx'] = 1 / st['sy']
            cv.save(); cv.translate(x + (-50 if n == 'friend' else 30) * k, y - 4); cv.scale(k, k)
            cv.drawOval(oval(14, 2, 70, 14), P(C('#3a2a1a', 0.25), blur=6))
            draw_char(cv, st, t, n)
            cv.restore()

def draw_interior(cv, t):
    cx, cy, z = cam_from(BCAM, t)
    lit = draw_room(cv, t, cx, cy, z)
    hx, hy, hr = HC
    open_k = ease_io(seg(t, 50.2, 51.6))
    # hero clock / secret window
    cv.drawCircle(hx, hy, hr * 1.22, P(shader=rad(hx, hy, hr * 1.22, [C('#FFF3B0', 0.6), C('#FFE27A', 0)]), blend=ADD))
    cv.drawCircle(hx, hy, hr * 1.12, P(shader=lin(hx - hr, hy - hr, hx + hr, hy + hr, [C('#FFF3B0'), C('#E8B01E'), C('#A86E05')])))
    ha, ma = int_hands(t)
    riddle_glow = 0.6 + 0.6 * pulse(t, 40.3, 46.0) * (0.6 + 0.4 * math.sin(t * 5)) + 0.5 * pulse(t, 45.9, 48.3)
    if open_k < 1:
        if open_k > 0:  # shutters: two halves swing outward
            cv.save()
            for side in (-1, 1):
                cv.save(); cv.translate(hx + side * hr, hy); cv.scale(1 - open_k, 1); cv.translate(-(hx + side * hr), -hy)
                half = skia.Path(); half.addRect(skia.Rect(hx, hy - hr, hx + side * hr, hy + hr) if side > 0 else skia.Rect(hx - hr, hy - hr, hx, hy + hr))
                cv.save(); cv.clipPath(half, doAntiAlias=True); draw_clock_face(cv, hx, hy, hr, ha, ma, glow=riddle_glow); cv.restore()
                cv.restore()
            cv.restore()
        else:
            draw_clock_face(cv, hx, hy, hr, ha, ma, glow=riddle_glow)
    # the landscape behind the opened window (drawn in screen space, after restoring the world layer)
    # gears in the shape game
    for i, (gx, gy, shp, col) in enumerate(GAME):
        a_in = ease_back(seg(t, 20.0 + 0.25 * i, 20.7 + 0.25 * i), 2.0) * (1 - smooth(seg(t, 29.6, 30.2)))
        if i == 0 or a_in <= 0.01: continue
        yy = gy + 10 * math.sin(t * 2 + i)
        cv.drawCircle(gx, yy, 130 * a_in, P(shader=rad(gx, yy, 130 * a_in, [C('#FFFFFF', 0.4), C('#FFFFFF', 0)])))
        draw_gear(cv, gx, yy, 108 * a_in, 0, t * 20 * (1 if i % 2 else -1), col, shape=shp)
    rx, ry, rs, mode = round_gear_pos(t)
    if mode == 'game':
        a_in = ease_back(seg(t, 20.0, 20.7), 2.0)
        gl = smooth(seg(t, 26.75, 27.0))
        if gl > 0:
            cv.drawCircle(rx, ry, 190, P(shader=rad(rx, ry, 190, [C('#E0F4FF', 0.9 * gl), C('#9FD3FF', 0)]), blend=ADD))
            for k in range(8):
                a = k * 0.785 + t * 2.5
                star(cv, rx + 150 * math.cos(a), ry + 150 * math.sin(a), 14, C('#FFFFFF', gl * (0.5 + 0.5 * math.sin(t * 8 + k))))
        if a_in > 0.01:
            cv.drawCircle(rx, ry, 130 * a_in, P(shader=rad(rx, ry, 130 * a_in, [C('#FFFFFF', 0.4), C('#FFFFFF', 0)])))
            draw_gear(cv, rx, ry, 108 * a_in * (1 + 0.12 * pulse(t, 26.8, 27.6)), 12, t * 20, GAME[0][3])
    sts = {n: int_state(n, t) for n in ('friend', 'socky')}
    if mode in ('slot', 'fly', 'snap'):
        draw_gear(cv, rx, ry, SLOT[2] * rs if mode != 'slot' else SLOT[2], 14,
                  (gear_angle(t) * 2 if mode == 'slot' else t * 300 if mode == 'fly' else gear_angle(t) * 2), GAME[0][3])
    if t >= 29.45:
        draw_gear(cv, SLOT[0], SLOT[1], SLOT[2], 14, gear_angle(t) * 2, GAME[0][3])
        if t < 30.4:
            p = seg(t, 29.45, 30.4)
            for k in range(12):
                a = k * 0.52; rr = 60 + 240 * ease_out(p)
                star(cv, SLOT[0] + math.cos(a) * rr, SLOT[1] + math.sin(a) * rr, 16 * (1 - p), C(['#FFE27A', '#FFFFFF', '#9FD3FF'][k % 3], 1 - p))
    # counting stars around the clock
    if 30.2 <= t < 50.2:
        for i, (sx, sy) in enumerate(STARS):
            app = ease_back(seg(t, 30.3 + 0.15 * i, 30.8 + 0.15 * i)) * (1 - smooth(seg(t, 49.6, 50.2)))
            on = smooth(seg(t, COUNT_T[i] - 0.05, COUNT_T[i] + 0.15))
            allsp = pulse(t, 38.9, 40.3)
            yy = sy + 6 * math.sin(t * 2 + i)
            if on > 0 or allsp > 0:
                g = max(on, allsp) * (1 + 0.3 * pulse(t, COUNT_T[i], COUNT_T[i] + 0.5))
                cv.drawCircle(sx, yy, 150, P(shader=rad(sx, yy, 150, [C('#FFF3A0', 0.75 * min(1, g)), C('#FFE066', 0)]), blend=ADD))
            col = mix(C('#C9B0E0'), C('#FFD233'), on)
            cv.save(); cv.translate(sx, yy); cv.scale(app * (1 + 0.25 * pulse(t, COUNT_T[i], COUNT_T[i] + 0.4) + 0.15 * allsp), app)
            sp = E3.star_path(62)
            cv.drawPath(sp, P(shader=rad(-12, -14, 90, [mix(col, C('#ffffff'), .6), col, mix(col, C('#7a4a0a'), .35)], [0, .45, 1])))
            cv.drawPath(sp, P(C('#8A5A00', 0.5), stroke=3))
            cv.restore()
            if allsp > 0.1:
                for k in range(5):
                    a = k * 1.26 + t * 3
                    star(cv, sx + 85 * math.cos(a), yy + 85 * math.sin(a), 10, C('#FFFFFF', allsp))
    # socks
    for n, st in sts.items():
        if st['alpha'] > 0.5 and t < 57.3: draw_shadow(cv, st['x'], G, st['air'])
    if open_k >= 1 or (0 < open_k < 1):
        cv.restore()  # leave world layer to paint the window view in screen space
        draw_window_view(cv, t, (hx - cx) * z + W / 2, (hy - cy) * z + H / 2, hr * z, open_k)
        # light pouring in
        wsx, wsy = (hx - cx) * z + W / 2, (hy - cy) * z + H / 2
        cv.drawCircle(wsx, wsy, hr * z * 1.6, P(shader=rad(wsx, wsy, hr * z * 1.6, [C('#FFF6D0', 0), C('#FFF6D0', 0.25 * open_k), C('#FFF6D0', 0)], [0, .62, 1]), blend=ADD))
        E2.layer(cv, cx, cy, z, 1.0)
    for n, st in sts.items():
        draw_sock(cv, st, t, n)
        if n == 'socky' and round_gear_pos(t)[3] in ('drop', 'head'):
            gx, gy, gs, _ = round_gear_pos(t)
            draw_gear(cv, gx, gy, 92 * gs / 0.62 * 0.62, 12, t * 20 if round_gear_pos(t)[3] == 'drop' else 8 * math.sin(t * 5), GAME[0][3])
    # hearts for the hug
    if 49.2 <= t < 51.0:
        for k in range(6):
            p = seg(t, 49.25 + k * 0.18, 50.6 + k * 0.18)
            if 0 < p < 1:
                x = 1480 + 80 * math.sin(k * 2.1) + 30 * math.sin(t * 3 + k); y = 1180 - 260 * p
                heart(cv, x, y, 22 * (1 - p * .3), C(['#FF6FA0', '#FF9AC8', '#FF4D7A'][k % 3], 1 - p))
    # thinking/worry and fix sparkles + dust motes
    for k in range(40):
        x = 300 + (k * 97.1) % 2700 + 20 * math.sin(t * 0.7 + k); y = 1450 - ((t * (12 + k % 7 * 5) + k * 61) % 1600)
        a = max(0, math.sin(t * 1.8 + k * 2.3)) ** 3 * lit
        if a > 0.08: cv.drawCircle(x, y, 4 + 3 * a, P(C('#FFF5C0', 0.85 * a)))
    cv.restore()
    if lit < 0.99:  # the tower goes quiet: cooler, dimmer
        cv.drawRect(skia.Rect(0, 0, W, H), P(C('#2a2050', (1 - lit) * 0.9)))
    vignette(cv)
    f = 1 - smooth(seg(t, 11.0, 11.6))
    if f > 0: cv.drawRect(skia.Rect(0, 0, W, H), P(C('#FFFFFF', f)))

def heart(cv, x, y, s, col):
    p = skia.Path(); p.moveTo(x, y + s * 0.9)
    p.cubicTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.3, x, y - s * 0.45)
    p.cubicTo(x + s * 0.6, y - s * 1.3, x + s * 1.6, y - s * 0.2, x, y + s * 0.9); p.close()
    cv.drawPath(p, P(col))

def draw_final(cv, t):
    """Full-frame landscape once the camera has flown through the window."""
    draw_landscape(cv, t, socks=True)
    vignette(cv)
    if t > 58.8:
        p = seg(t, 58.8, 60.0)
        for k in range(18):
            a = k * 0.349 + t; rr = 60 + 420 * ease_out(p)
            star(cv, 540 + math.cos(a) * rr, 520 + math.sin(a) * rr, 18 * (1 - p * .5), C(['#FFFFFF', '#FFF39A', '#FFC2F0', '#B9F6FF'][k % 4], 1 - p * .6))

def draw_frame(cv, t):
    if t < 11.0: draw_exterior(cv, t)
    elif t < 58.2: draw_interior(cv, t)
    else: draw_final(cv, t)

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
