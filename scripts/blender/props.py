"""World sprites: drones, stations, asteroids, salvage, tow ship, meteors, pirates, derelicts, probes."""
from __future__ import annotations

import math
import random

import kit
from ships import engine_bell, tape_x


def _c(a):
    return math.cos(math.radians(a))


def _s(a):
    return math.sin(math.radians(a))


# ---------- drones (4 animation frames each) --------------------------------------------------

def drone_hauler(i):
    M = kit.Model("drone_hauler")
    M.box((7, 5.4, 4), (0, 0, 1.5), "yellow", bevel=0.7)
    M.box((7.3, 5.7, 1.0), (0, 0, 0.5), "steel_dk")
    M.box((5, 4.4, 3.2), (0, 0, -2.3), "steel_lt", bevel=0.3)
    M.box((0.9, 4.8, 3.6), (-1.2, 0, -2.3), "tape")
    for x in (-2.9, 2.9):
        M.box((0.8, 5.8, 3.2), (x, 0, -1.6), "steel_dk")
    for y in (-3.2, 3.2):
        M.cyl(1.3, 3.0, (-3.6, y, 2.0), "steel_dk")
        M.sphere(1.0 if i % 2 else 0.7, (-5.3, y, 2.0), "e_engine")
    M.tube([(1.5, 0, 3.5), (1.5, 0, 5.6)], 0.4, "steel_lt")
    if i != 3:
        M.box((1.2, 0.5, 1.2), (2.2, -2.8, 2.0), "e_led_mint")
    return M


def drone_probe(i):
    M = kit.Model("drone_probe")
    M.sphere(3.0, (0, 0, 0), "bone_dk")
    M.cyl(3.15, 1.1, (0, 0, -0.6), "orange_dk", axis="z")
    for sx in (-1, 1):
        M.box((4.2, 0.5, 3.0), (sx * 5.6, 0, 0.2), "solar")
        M.box((1.4, 0.6, 0.6), (sx * 3.2, 0, 0.2), "steel_lt")
    M.tube([(0, 0, 2.8), (0, 0, 5.0)], 0.4, "steel_lt")
    a = i * 45
    M.box((5.0, 0.7, 0.7), (0, 0, 5.2), "steel_lt", rot=(0, 0, a))
    M.sphere(1.25, (0.4, -2.7, 0.5), "e_led_blue" if i != 2 else "glass", scale=(1, 0.5, 1))
    M.sphere(0.6 if i % 2 else 0.4, (0, 0, -3.3), "e_engine_blue")
    return M


def drone_salvager(i):
    M = kit.Model("drone_salvager")
    M.lathe([(-4.2, 1.2), (-3.2, 2.8), (2.2, 2.8), (3.4, 1.8)], (0, 0, 0), "teal", segs=10)
    M.cyl(3.0, 1.1, (-1.0, 0, 0), "steel_dk", segs=10)
    M.box((2.4, 0.5, 1.4), (1.0, -2.6, 0.5), "bone")
    spread = (10, 26, 42, 26)[i]
    for sz in (1, -1):
        base = (3.0, 0, sz * 1.2)
        mid = (base[0] + 3.0 * _c(spread), 0, base[2] + sz * 3.0 * _s(spread))
        tip = (mid[0] + 2.6 * _c(spread - 62), 0, mid[2] + sz * 2.6 * _s(spread - 62))
        M.tube([base, mid, tip], 0.55, "steel_lt")
    M.sphere(0.9 if i % 2 else 0.6, (-4.8, 0, 0), "e_engine")
    M.sphere(0.7, (3.6, -0.6, 0), "e_led_orange" if i in (1, 2) else "steel_dk")
    return M


def drone_fixer(i):
    M = kit.Model("drone_fixer")
    M.box((6.2, 5, 5), (-0.5, 0, 0.8), "steel_lt", bevel=0.8)
    M.box((6.5, 5.3, 1.2), (-0.5, 0, -0.6), "orange")
    M.strip((-1.6, 1.8), (1.8, 1.8), 1.6, "e_window_cool", -2.7)
    M.tube([(-2.0, 0, 3.3), (-2.6, 0, 5.4)], 0.4, "steel_lt")
    wob = (0.0, 0.8, 0.0, -0.6)[i]
    M.tube([(2.0, -1, -1.6), (4.6, -1, -3.8), (6.4, -1, -2.4 + wob)], 0.55, "steel_dk")
    spark = (0.0, 1.2, 0.7, 1.5)[i]
    if spark:
        M.sphere(spark, (7.0, -1.2, -2.2 + wob), "e_led_white")
        if i == 3:
            M.sphere(0.6, (8.6, -1.2, -3.6), "e_led_yellow")
            M.sphere(0.5, (7.6, -1.2, -0.2), "e_led_yellow")
    else:
        M.sphere(0.6, (6.8, -1.2, -2.2), "steel_lt")
    M.sphere(0.9 if i % 2 else 0.6, (-4.2, 0, 0.6), "e_engine")
    return M


# ---------- stations --------------------------------------------------------------------------

def station_ring(i):
    """Neutral waystation: a hub, a habitat ring with lit portholes, solar wings."""
    M = kit.Model("station_0")
    M.lathe([(-18, 1.5), (-14, 4.6), (-5, 6.2), (5, 6.2), (9, 4.4), (15, 3), (22, 1)], (0, 0, 0), "bone_dk", axis="z")
    M.cyl(6.6, 2.0, (0, 0, 0), "steel", axis="z")
    M.torus(30, 3.4, (0, 0, 0), "steel", segs=40)
    M.torus(30, 3.7, (0, 0, 0), "orange_dk", segs=40, squash=0.3)
    for a in range(0, 360, 90):
        M.tube([(6 * _c(a + 20), 6 * _s(a + 20), 0), (27 * _c(a + 20), 27 * _s(a + 20), 0)], 1.2, "steel_dk")
    for a in range(0, 360, 12):
        if a % 60 == 24:
            continue
        M.box((0.6, 1.5, 1.5), (33.4 * _c(a), 33.4 * _s(a), 0.9), "e_window", rot=(0, 0, a))
    for sx in (-1, 1):
        M.box((16, 0.6, 7), (sx * 12, 0, -15), "solar")
        M.box((16.4, 0.8, 0.8), (sx * 12, 0, -15), "steel_lt")
    M.box((3, 3, 6), (0, -8, 2), "steel_dk", bevel=0.4)
    M.box((1.2, 0.5, 1.2), (0, -9.6, 3.5), "e_led_green")
    M.tube([(0, 0, 22), (0, 0, 29)], 0.5, "steel_lt")
    M.sphere(0.9, (0, 0, 29.6), "e_led_red")
    M.box((5, 0.5, 4), (-27, -3.5, 0.5), "rust", rot=(0, 0, 8))
    M.root.rotation_euler = (math.radians(24), math.radians(-9), 0)
    return M


def station_lantern(i):
    """Lamplighters Guild: a hanging lantern over a trading disc."""
    M = kit.Model("station_1")
    M.lathe([(9, 10.5), (12, 8.5), (18, 4.0), (24, 1.0)], (0, 0, 0), "orange_dk", axis="z", segs=6)
    M.tube([(0, 0, 24), (0, 0, 31)], 0.6, "steel_lt")
    M.sphere(1.0, (0, 0, 31.6), "e_led_yellow")
    M.cyl(7.6, 13, (0, 0, 2.5), "e_window", axis="z", segs=6)
    for a in range(0, 360, 60):
        M.tube([(8.4 * _c(a), 8.4 * _s(a), -4), (8.4 * _c(a), 8.4 * _s(a), 9)], 0.8, "steel_dk")
    M.cyl(9.2, 1.6, (0, 0, 9.2), "steel", axis="z", segs=6)
    M.cyl(9.2, 1.6, (0, 0, -4.4), "steel", axis="z", segs=6)
    M.cyl(8.2, 1.0, (0, 0, 2.4), "steel_dk", axis="z", segs=6)
    M.cyl(4.2, 5, (0, 0, -7.5), "steel_dk", axis="z")
    M.cyl(21, 2.6, (0, 0, -11), "bone_dk", axis="z", segs=20)
    M.cyl(21.4, 0.9, (0, 0, -11), "orange", axis="z", segs=20)
    crates = ["teal", "rust", "cobalt", "steel_lt", "green", "red"]
    for n, a in enumerate(range(15, 360, 60)):
        M.box((5, 4, 3.4), (15 * _c(a), 15 * _s(a), -8.2), crates[n], rot=(0, 0, a), bevel=0.3)
    for a in range(0, 360, 30):
        M.box((0.6, 1.2, 1.0), (21.5 * _c(a), 21.5 * _s(a), -10.2), "e_led_yellow", rot=(0, 0, a))
    M.lathe([(-27, 0.6), (-21, 2.6), (-12.4, 4.4)], (0, 0, 0), "steel", axis="z")
    M.sphere(1.9, (0, 0, -28.2), "e_engine_hot")
    M.strip((-3.5, -17.5), (3.5, -17.5), 1.0, "tape", -4.0)
    M.root.rotation_euler = (math.radians(20), math.radians(5), 0)
    return M


def station_scrap(i):
    """Rustborn Collective: a welded heap of hull sections, a crane and a dish that almost works."""
    M = kit.Model("station_2")
    rng = random.Random(77)
    mats = ["rust", "steel", "steel_dk", "orange_dk", "bone_dk", "teal_dk", "rust", "steel", "red_dk"]
    for n in range(16):
        size = (rng.uniform(7, 17), rng.uniform(6, 12), rng.uniform(5, 11))
        loc = (rng.uniform(-22, 20), rng.uniform(-6, 6), rng.uniform(-9, 9))
        rot = (rng.uniform(-12, 12), rng.uniform(-18, 18), rng.uniform(-10, 10))
        M.box(size, loc, mats[n % len(mats)], rot=rot, bevel=0.6)
    M.extrude([(-9, -5.5), (11, -6), (16, -3.5), (17.5, 0.5), (14, 4.5), (-9, 4.5)], 12, (12, -5, 9), "steel_lt", rot=(8, -22, 0), bevel=1.0)
    M.strip((14, 10), (20, 14), 1.2, "e_window", -11.4)
    engine_bell(M, (-22, 2, -3), 3.0, 6.0, 9.0, glow="e_hot", core=None)
    M.tube([(-6, -2, 9), (-12, -2, 22), (2, -2, 27)], 0.9, "yellow")
    M.tube([(2, -2, 27), (2, -2, 21)], 0.4, "steel_lt")
    M.box((2.4, 2.4, 2.0), (2, -2, 20), "steel_dk")
    M.cyl(0.6, 3.5, (21, 0, 15), "steel_lt", r2=6.5, axis="z", rot=(0, 28, 0), segs=12)
    M.tube([(18, 0, 6), (20, 0, 13)], 0.7, "steel_dk")
    for x, z in ((-14, 4), (3, -6), (-3, 3)):
        tape_x(M, x, z, 2.5, -7.6)
    for x, z, m in ((-18, 8.5, "e_led_red"), (8, -9.5, "e_led_orange"), (24, 3.5, "e_led_red"), (-4, 11.5, "e_led_orange")):
        M.box((1.2, 0.6, 1.2), (x, -7.0, z), m)
    M.root.rotation_euler = (math.radians(10), math.radians(6), 0)
    return M


def station_monolith(i):
    """The Quiet Ledger: slabs that file their paperwork in silence."""
    M = kit.Model("station_3")
    M.box((14, 9, 62), (-3, 0, 2), "steel_dk", bevel=1.2)
    M.box((9, 7, 40), (10.5, 1, -6), "cobalt_dk", bevel=1.0)
    M.box((5, 5, 22), (-14, -1, 10), "steel", bevel=0.8)
    for x, z0, z1 in ((-6, 6, 28), (-3, -14, 12), (0, 10, 24), (0, -22, -8)):
        M.strip((x, z0), (x, z1), 1.0, "e_window_blue", -4.8)
    for z in (-16, -8, 2, 8):
        M.strip((9, z), (12.5, z), 1.0, "e_window_blue", -2.8)
    M.strip((-15, 4), (-15, 16), 1.0, "e_led_white", -3.8)
    M.torus(24, 0.9, (0, 0, -6), "steel_lt", rot=(8, 0, 0), segs=36)
    M.box((34, 14, 2.4), (1, 0, -30), "steel", bevel=0.6)
    for x in (-13, -5, 3, 11):
        M.box((1.6, 0.6, 1.0), (x, -7.2, -30), "e_window_cool")
    M.tube([(-3, 0, 33), (-3, 0, 40)], 0.5, "steel_lt")
    M.sphere(1.0, (-3, 0, 40.6), "e_led_white")
    M.root.rotation_euler = (math.radians(14), math.radians(-5), math.radians(-18))
    return M


# ---------- asteroids, meteors ----------------------------------------------------------------

ASTEROIDS = [
    # radius, material, seed, scale, subdivisions
    (5.0, "rock", 3, (1.15, 1, 0.9), 2),
    (7.0, "rock_rust", 11, (1.0, 1, 1.15), 2),
    (9.0, "rock", 23, (1.3, 1, 0.85), 2),
    (11.0, "rock_ice", 31, (1.0, 1, 1.0), 3),
    (14.0, "rock_carbon", 47, (1.25, 1, 0.9), 3),
    (17.0, "rock_violet", 59, (1.1, 1, 1.0), 3),
]


def asteroid(n):
    r, m, seed, scale, sub = ASTEROIDS[n]

    def build(i):
        M = kit.Model(f"asteroid_{n}")
        rng = random.Random(seed)
        M.rock(r, (0, 0, 0), m, seed, scale, subdiv=sub, rot=(rng.uniform(0, 360), rng.uniform(0, 360), 0))
        M.rock(r * 0.55, (r * 0.62, -r * 0.1, -r * 0.35), m, seed + 1, subdiv=2)
        if n == 1:
            for k in range(3):
                M.rock(1.4, (rng.uniform(-3, 3), -r * 0.9, rng.uniform(-3, 3)), "gold", seed + 5 + k, subdiv=1)
        if n == 3:
            M.rock(r * 0.4, (-r * 0.5, -r * 0.55, r * 0.35), "crystal_teal", seed + 2, subdiv=1)
        if n == 5:
            for k, (x, z, a) in enumerate(((-6, 8, 20), (-1, 11, -8), (4, 7, -35), (-9, 2, 55))):
                M.shard(1.8, 9 - k, (x, -r * 0.55, z), "crystal", rot=(-25, -a, 0))
            M.shard(1.5, 7, (-2, -r * 0.7, 6), "e_crystal", rot=(-30, 5, 0))
        return M

    return build


def meteor(n):
    r = (3.0, 4.0, 5.2, 3.6)[n]

    def build(i):
        M = kit.Model(f"meteor_{n}")
        rng = random.Random(900 + n)
        M.rock(r, (0, 0, 0), "rock_rust", 900 + n, (1.2, 1, 0.9), subdiv=2, rot=(rng.uniform(0, 360), rng.uniform(0, 360), 0))
        # The leading (lower left) face is glowing hot.
        for k in range(3 + n % 2):
            a = rng.uniform(180, 260)
            M.rock(r * rng.uniform(0.32, 0.5), (r * 0.72 * _c(a), -r * 0.5, r * 0.72 * _s(a)), "e_hot", 950 + n * 7 + k, subdiv=1)
        M.rock(r * 0.26, (-r * 0.5, -r * 0.8, -r * 0.45), "e_engine_hot", 990 + n, subdiv=1)
        return M

    return build


# ---------- salvage ---------------------------------------------------------------------------

def salvage_crate(i):
    M = kit.Model("salvage_crate")
    M.box((8.5, 7, 6.5), (0, 0, 0), "orange_dk", bevel=0.6)
    M.box((1.3, 7.4, 6.9), (-1.6, 0, 0), "tape")
    M.box((8.9, 7.4, 1.2), (0, 0, 0.6), "tape")
    M.box((2.4, 0.5, 1.8), (2.2, -3.5, -1.6), "bone")
    M.box((1.0, 0.5, 1.0), (3.0, -3.6, 2.2), "e_led_mint")
    M.root.rotation_euler = (math.radians(18), math.radians(-14), math.radians(-24))
    return M


def salvage_pod(i):
    M = kit.Model("salvage_pod")
    M.lathe([(-5.5, 1.4), (-4.5, 3.3), (3, 3.3), (5.4, 2.0), (6.2, 0.6)], (0, 0, 0), "bone_dk", segs=12)
    M.cyl(3.45, 1.4, (-2.2, 0, 0), "orange", segs=12)
    M.sphere(1.7, (1.9, -2.6, 0.6), "e_window_cool", scale=(1, 0.5, 1))
    M.cyl(2.4, 1.2, (-5.8, 0, 0), "steel_dk", segs=10)
    M.tube([(3, 0, 3), (4.5, 0, 6)], 0.4, "steel_lt")
    M.sphere(0.6, (4.7, 0, 6.4), "e_led_red")
    M.root.rotation_euler = (0, math.radians(-24), math.radians(-12))
    return M


def salvage_wreck(i):
    M = kit.Model("salvage_wreck")
    M.extrude([(-7, -3), (-2, -5), (5, -3.5), (7.5, 0.5), (3.5, 4), (0, 1.8), (-5.5, 4.6)], 3.2, (0, 0, 0), "steel", bevel=0.5)
    M.box((4.5, 0.5, 3.5), (-3, -1.8, -1), "rust")
    M.strip((1, -2.4), (5.4, 0.4), 1.0, "tape", -1.9)
    for x, top in ((-3, 7.5), (0.5, 5.5), (4, 7.0)):
        M.tube([(x, 0.5, 2), (x + 1.2, 0.5, top)], 0.55, "steel_dk")
    M.tube([(6, 0, -2), (9, 0, -4.2), (8.4, 0, -6.8)], 0.4, "orange_dk")
    M.box((0.9, 0.5, 0.9), (-5.2, -1.9, 2.4), "e_led_red")
    M.root.rotation_euler = (math.radians(12), math.radians(20), math.radians(-18))
    return M


def salvage_crystal(i):
    M = kit.Model("salvage_crystal")
    M.rock(3.4, (0, 0, -3.2), "rock_violet", 5, (1.3, 1, 0.7), subdiv=1)
    for x, a, ln, r, m in ((-3.2, 38, 8, 1.7, "crystal"), (3.0, -30, 9, 1.9, "crystal"), (-0.6, 8, 12.5, 2.3, "e_crystal"), (1.8, -8, 6, 1.4, "crystal"), (-1.8, 62, 5.5, 1.3, "crystal")):
        M.shard(r, ln, (x + _s(-a) * ln * -0.3, 0 if m == "crystal" else -0.6, -1.5 + _c(a) * ln * 0.36), m, rot=(0, -a, 0))
    return M


# ---------- tow ship, pirate ------------------------------------------------------------------

def tow(i):
    """Rescue tug of the breakdown service: hazard yellow over bare steel, crane boom, alternating beacons."""
    M = kit.Model("tow")
    M.extrude([(-14, -5), (12, -5), (17, -2), (17.5, 1.5), (13, 6), (-14, 6)], 12, (0, 0, 0), "steel", bevel=1.1)
    M.box((24, 10.6, 1.6), (-1, 0, -5.4), "steel_dk", bevel=0.4)
    M.extrude([(2, 2), (16.6, 2), (16.9, 2.6), (13.2, 6.3), (2, 6.3)], 12.4, (0, 0, 0), "yellow", bevel=0.5)
    M.strip((-14, 1.0), (2, 1.0), 2.0, "yellow", -6.1)
    for x in (-12, -8, -4):
        M.strip((x - 1.0, 0.0), (x + 1.0, 2.0), 1.0, "iron", -6.25)
    M.strip((6.0, 4.0), (13.0, 4.0), 2.0, "e_window_cool", -6.35)
    M.box((3.6, 10.6, 0.5), (15.3, 0, 4.2), "e_window_cool", rot=(0, 48, 0))
    M.box((6, 0.5, 3), (-9, -6.1, -2.5), "steel_dk")
    M.box((5, 0.5, 2.6), (1, -6.1, -2.3), "rust")
    M.strip((6, -3.0), (14, -3.0), 1.0, "bone_dk", -6.1)
    M.box((7, 4, 1.4), (7, 0, 6.8), "steel_dk")
    M.box((2.0, 2.4, 1.6), (5.0, 0, 8.2), "e_led_orange" if i == 0 else "rust")
    M.box((2.0, 2.4, 1.6), (9.0, 0, 8.2), "e_led_blue" if i == 2 else "cobalt_dk")
    # Crane boom, winch and hook at the stern.
    M.cyl(2.4, 4, (-9, 0, 7.2), "steel_dk", axis="y")
    M.tube([(-9, 0, 7), (-19, 0, 13.5), (-24.5, 0, 11.5)], 0.9, "yellow")
    M.tube([(-24.5, 0, 11.5), (-24.5, 0, 6.5)], 0.4, "steel_lt")
    M.torus(1.5, 0.5, (-24.5, 0, 5.0), "steel_lt", rot=(90, 0, 0), segs=10, rsegs=5, arc=250)
    M.sphere(0.7, (-19, 0, 14.4), "e_led_yellow" if i % 2 == 0 else "steel_dk")
    for z in (2.8, -2.2):
        engine_bell(M, (-14.5, 0, z), 1.5, 2.8, 4.6, core="e_engine_hot" if i % 2 else None)
    M.box((1.6, 9, 4.4), (17.6, 0, -1.4), "steel_dk", bevel=0.4)
    return M


def pirate(i):
    """Raider: a dark red wedge with pincer jaws. Built facing +X, then turned to face the player (-X)."""
    M = kit.Model("pirate")
    M.extrude([(-14, -3.5), (4, -5.5), (17, -2), (19, 0.5), (8, 4.5), (-14, 4.5)], 10, (0, 0, 0), "red_dk", bevel=0.9)
    M.extrude([(1, -5), (15, -8), (24, -6.6), (14, -4)], 4, (0, 0, 0), "steel_dk", bevel=0.4)
    M.extrude([(5, 4), (17, 7.6), (25, 6.6), (15, 3.2)], 3, (0, 0, 0), "steel_dk", bevel=0.4)
    M.extrude([(-13, 4), (-2, 4), (-9, 11.5), (-15, 8.5)], 1.4, (0, 0, 0), "iron", bevel=0.3)
    M.extrude([(-12, -3.5), (-5, -3.8), (-11, -9.5), (-14, -8)], 1.4, (0, 0, 0), "iron", bevel=0.3)
    for x, ln in ((-6, 5.5), (-1, 4.5), (4, 3.5)):
        M.shard(0.9, ln, (x, -2, 4.4 + ln * 0.4), "steel_lt", rot=(0, 18, 0), segs=4)
    # Emblem: a pale plate with two holes reads as a skull at this size.
    M.box((5, 0.5, 4), (-6.5, 5.0, 0.5), "bone")
    M.box((1.0, 0.6, 1.0), (-7.5, 5.2, 1.0), "iron")
    M.box((1.0, 0.6, 1.0), (-5.5, 5.2, 1.0), "iron")
    M.box((3, 0.6, 1.0), (-6.5, 5.2, -1.0), "iron")
    M.box((4, 0.5, 3), (2.5, 5.0, -1.5), "rust")
    M.strip((9, 1.6), (14, 1.0), 1.2, "e_led_red", 5.2)
    M.cyl(0.9, 12, (10, 3.2, -4.8), "steel")
    M.sphere(1.0 if i >= 2 else 0.7, (16.4, 3.2, -4.8), "e_led_red" if i >= 2 else "red_dk")
    M.box((5, 10.5, 7), (-15.5, 0, 0.5), "steel_dk", bevel=0.6)
    for z in (2.6, -1.8):
        engine_bell(M, (-17.5, 0, z), 1.5, 2.7, 4.2, glow="e_hot", ring="rust", core="e_engine" if i % 2 else None)
    M.root.rotation_euler = (0, 0, math.radians(180))
    return M


# ---------- derelicts -------------------------------------------------------------------------

def derelict_freighter(i):
    """A hauler snapped in two, lights long dead except one stubborn LED."""
    M = kit.Model("derelict_0")
    front = kit.Model("derelict_0_front")
    front.extrude([(18, -5.5), (27, -5.5), (29.5, -2), (29.5, 2.5), (25, 7), (18, 7)], 12, (0, 0, 0), "steel_lt", bevel=0.9)
    front.strip((21, 3.5), (27, 3.5), 2.0, "glass", -6.1)
    front.strip((18.5, -1.5), (29, -1.5), 1.0, "rust", -6.1)
    front.box((14, 5, 3), (10, 0, 0), "steel", bevel=0.5)
    front.box((8.2, 11, 6.2), (9, 0, 4.6), "rust", bevel=0.5)
    front.box((8.2, 11, 6.2), (10, 0, -4.6), "steel", bevel=0.5)
    front.tube([(4, 2, 1), (0, 2, 3.5), (-2, 2, 2)], 0.6, "orange_dk")
    front.tube([(4, -2, -1), (-0.5, -2, -2.5)], 0.7, "steel")
    front.root.rotation_euler = (math.radians(10), math.radians(-13), math.radians(-12))
    front.root.location = (0, 0, 3)
    front.root.parent = M.root
    rear = kit.Model("derelict_0_rear")
    rear.box((6, 12, 15), (-25.5, 0, 0), "steel", bevel=0.8)
    for z in (4.2, -4.2):
        engine_bell(rear, (-28.3, 0, z), 2.2, 4.3, 6.5, glow="iron", core=None, ring="rust")
    rear.box((18, 5, 3), (-14, 0, 0), "steel", bevel=0.5)
    rear.box((8.2, 11, 6.2), (-18.5, 0, 4.6), "teal", bevel=0.5)
    rear.box((8.2, 11, 6.2), (-18.5, 0, -4.6), "rust", bevel=0.5)
    rear.box((8.2, 11, 6.2), (-9.3, 0, -5.0), "bone_dk", bevel=0.5, rot=(0, 14, 0))
    tape_x(rear, -18.5, 4.6, 2.5, -5.8)
    rear.box((1.0, 0.5, 1.0), (-25.5, -6.3, 5), "e_led_green")
    rear.root.rotation_euler = (math.radians(-8), math.radians(17), math.radians(8))
    rear.root.location = (3, 0, -4)
    rear.root.parent = M.root
    rng = random.Random(4)
    for k in range(6):
        M.rock(rng.uniform(0.8, 1.8), (rng.uniform(-2, 12), 0, rng.uniform(-12, 10)), "steel" if k % 2 else "rust", 40 + k, subdiv=1)
    return M


def derelict_ring(i):
    """A third of a station ring with its hub torn open."""
    M = kit.Model("derelict_1")
    M.torus(30, 3.4, (0, 0, 0), "steel", segs=40, arc=150)
    M.torus(30, 3.7, (0, 0, 0), "rust", segs=40, arc=150, squash=0.3)
    M.lathe([(-10, 3.0), (-5, 6.2), (5, 6.2), (9, 4.4), (13, 2.0)], (0, 0, 0), "steel", axis="z", segs=12)
    for a in (30, 110):
        M.tube([(6 * _c(a), 6 * _s(a), 0), (27 * _c(a), 27 * _s(a), 0)], 1.2, "steel_dk")
    M.tube([(6 * _c(200), 6 * _s(200), 0), (15 * _c(205), 15 * _s(205), -3)], 1.2, "steel_dk")
    M.box((14, 0.6, 7), (10, -6, -14), "steel_dk", rot=(0, 24, 10))
    M.box((7, 0.6, 5), (-9, -4, -17), "steel_dk", rot=(20, -38, 0))
    for a in (20, 44, 68, 92, 128):
        M.box((0.6, 1.5, 1.5), (33.4 * _c(a), 33.4 * _s(a), 0.9), "glass", rot=(0, 0, a))
    M.box((0.7, 1.5, 1.5), (33.5 * _c(56), 33.5 * _s(56), 0.9), "e_led_orange", rot=(0, 0, 56))
    rng = random.Random(9)
    for k in range(7):
        a = rng.uniform(160, 240)
        M.rock(rng.uniform(0.9, 2.2), (rng.uniform(20, 31) * _c(a), rng.uniform(20, 31) * _s(a), rng.uniform(-4, 4)), "steel_dk" if k % 2 else "rust", 60 + k, subdiv=1)
    M.root.rotation_euler = (math.radians(38), math.radians(-14), math.radians(150))
    return M


def derelict_ancient(i):
    """An old hulk half swallowed by rock; its core still hums."""
    M = kit.Model("derelict_2")
    M.rock(15, (0, 0, 0), "rock_carbon", 71, (2.0, 0.8, 0.85), subdiv=3, dents=5)
    M.rock(8, (-22, 0, 5), "rock_carbon", 72, (1.5, 0.8, 0.9), subdiv=2)
    M.torus(13.5, 3.4, (6, -6, 1), "violet_dk", rot=(90, 0, 200), segs=26, arc=170, squash=1.5)
    M.torus(13.5, 3.7, (6, -6, 1), "gold", rot=(90, 0, 200), segs=26, arc=170, squash=0.3)
    M.sphere(3.2, (6, -9.5, 1), "e_core")
    for x, z, a, ln in ((-14, 9, 25, 12), (-7, 12, -5, 9), (21, 6, -40, 11), (26, -4, -75, 8)):
        M.shard(2.2, ln, (x, -5, z), "crystal", rot=(-20, -a, 0))
    for x in (-18, -12, -6):
        M.tube([(x, -9.5, -6), (x + 2, -10.5, -12)], 0.6, "steel_dk")
    M.root.rotation_euler = (math.radians(6), math.radians(9), 0)
    return M


# ---------- mining probe ----------------------------------------------------------------------

def probe(i):
    M = kit.Model("probe")
    M.cyl(3.0, 5.5, (0, 0, 2), "bone_dk", axis="z", segs=10)
    M.cyl(3.2, 1.2, (0, 0, 2.6), "orange", axis="z", segs=10)
    M.sphere(3.0, (0, 0, 4.7), "steel_lt", scale=(1, 1, 0.5), segs=10)
    M.lathe([(-7.5, 0.25), (-5, 1.2), (-3.5, 1.2), (-0.8, 2.6)], (0, 0, 0), "steel_lt", axis="z", segs=8)
    for a in (200, 340, 90):
        M.tube([(2.4 * _c(a), 2.4 * _s(a), -0.5), (5.6 * _c(a), 5.6 * _s(a), -5.2)], 0.5, "steel_dk")
    for sx in (-1, 1):
        M.box((4.6, 0.5, 3.2), (sx * 6.0, 0, 3.2), "solar", rot=(0, sx * 14, 0))
        M.box((1.4, 0.6, 0.6), (sx * 3.4, 0, 3.0), "steel_lt")
    M.tube([(1, 0, 6), (1.6, 0, 9.4)], 0.4, "steel_lt")
    M.sphere(0.75, (1.7, 0, 10.0), "e_led_mint" if i == 0 else "teal_dk")
    M.sphere(0.9 if i == 1 else 0.6, (0, -0.5, -7.6), "e_hot")
    M.box((1.4, 0.5, 1.2), (-0.6, -3.0, 1.0), "e_window_cool" if i == 0 else "glass")
    return M


# ---------- registry --------------------------------------------------------------------------

def _g(group, size, build, frames=None, center=(0.0, 0.0)):
    return {"group": group, "size": size, "center": center, "build": build, "frames": frames or [group]}


def groups():
    out = []
    for kind, fn in (("hauler", drone_hauler), ("probe", drone_probe), ("salvager", drone_salvager), ("fixer", drone_fixer)):
        out.append(_g(f"drone_{kind}", (28, 24), fn, [f"drone_{kind}_{i}" for i in range(4)]))
    out.append(_g("station_0", (96, 96), station_ring))
    out.append(_g("station_1", (64, 80), station_lantern))
    out.append(_g("station_2", (96, 72), station_scrap, center=(0, 6)))
    out.append(_g("station_3", (72, 96), station_monolith, center=(0, 4)))
    for n in range(len(ASTEROIDS)):
        side = int(ASTEROIDS[n][0] * 3.4) + 8
        out.append(_g(f"asteroid_{n}", (side, side), asteroid(n)))
    for n in range(4):
        out.append(_g(f"meteor_{n}", (20, 20), meteor(n)))
    out.append(_g("salvage_crate", (24, 24), salvage_crate))
    out.append(_g("salvage_pod", (24, 24), salvage_pod))
    out.append(_g("salvage_wreck", (28, 28), salvage_wreck))
    out.append(_g("salvage_crystal", (24, 28), salvage_crystal, center=(0, 2)))
    out.append(_g("tow", (64, 40), tow, [f"tow_{i}" for i in range(4)], center=(-4, 3)))
    out.append(_g("pirate", (64, 40), pirate, [f"pirate_{i}" for i in range(4)], center=(-2, 1)))
    out.append(_g("derelict_0", (96, 64), derelict_freighter))
    out.append(_g("derelict_1", (96, 80), derelict_ring))
    out.append(_g("derelict_2", (96, 56), derelict_ancient, center=(-2, 2)))
    out.append(_g("probe", (24, 28), probe, [f"probe_{i}" for i in range(2)], center=(0, 1)))
    return out
