"""Player hull classes. Each builder fills a kit.Model facing +X; frame i is the roll angle."""
from __future__ import annotations

import math

import kit

DEFAULT_HULLS = ("tug", "hauler", "prospector", "clipper", "bulwark", "ark", "colossus")
ROLL_FRAMES = 16


# ---------- shared greebles -----------------------------------------------------------------

def tape_x(M: kit.Model, cx, cz, half, y, m="tape", width=1.0):
    """Two crossed strips of tape on a camera-facing plate (true diagonals so they survive at 1x)."""
    M.strip((cx - half, cz - half), (cx + half, cz + half), width, m, y)
    M.strip((cx - half, cz + half), (cx + half, cz - half), width, m, y)


def engine_bell(M: kit.Model, loc, r_throat, r_exit, length, m="steel_dk", glow="e_engine", ring="orange_dk", plug=True, core="e_engine_hot"):
    """Rocket bell opening toward -X. loc is the throat (attachment) point."""
    x, y, z = loc
    M.lathe([(0, r_throat * 1.25), (-length * 0.12, r_throat * 1.25), (-length * 0.2, r_throat), (-length * 0.32, r_throat * 1.05),
             (-length, r_exit), (-length - 0.6, r_exit), (-length - 0.6, r_exit * 0.8)], (x, y, z), m)
    if ring:
        M.cyl(r_throat * 1.18, max(1.0, length * 0.09), (x - length * 0.26, y, z), ring)
    M.cyl(r_exit * 0.86 + 0.25, 0.8, (x - length * 0.72, y, z), "steel", r2=r_exit * 0.94 + 0.25)
    if plug:
        M.lathe([(-length - 0.3, r_exit * 0.78), (-length - 1.6, r_exit * 0.55), (-length - 2.6, r_exit * 0.22)], (x, y, z), glow)
        if core:
            M.lathe([(-length - 0.3, r_exit * 0.42), (-length - 2.0, r_exit * 0.3), (-length - 3.4, r_exit * 0.08)], (x, y, z), core)
    else:
        M.cyl(r_exit * 0.78, 0.8, (x - length - 0.4, y, z), glow)


# ---------- S.S. Gaffer ---------------------------------------------------------------------

def build_tug(M: kit.Model) -> None:
    # Hull: stubby chamfered block, belly plate, keel.
    M.extrude([(-9, -5.5), (11, -6), (16, -3.5), (17.5, 0.5), (14, 4.5), (-9, 4.5)], 13, (0, 0, 0), "steel", bevel=1.1)
    M.box((19, 11, 1.6), (1.5, 0, -6.2), "steel_dk", bevel=0.4)
    M.box((3, 5, 1.4), (-5, 2.5, 5.2), "steel_dk")  # vent block
    # Wrap of tape holding the hull together, plus a hazard stripe that was once straight.
    M.box((1.7, 13.5, 10.4), (0.6, 0, -0.5), "tape")
    M.strip((4, -3.9), (12.5, -4.4), 1.0, "orange_dk", -6.75)

    # Cab: dirty off-white, offset toward the camera side, slanted windshield.
    M.extrude([(4, 4), (14.6, 4), (15.6, 6), (12.6, 10), (5, 10)], 8.4, (0, -1.6, 0), "bone_dk", bevel=0.7)
    M.strip((7.0, 7.5), (10.0, 7.5), 2.0, "e_window", -6.0)
    M.strip((11.0, 7.5), (14.0, 7.5), 2.0, "e_window", -6.0)
    M.strip((5.0, 5.0), (15.0, 5.0), 1.0, "steel", -6.0)
    M.box((4.4, 6.6, 0.5), (14.35, -1.6, 8.05), "e_window", rot=(0, 53.1, 0))
    M.box((7, 7, 0.6), (8.6, -1.6, 10.2), "steel_dk")  # roof plate

    # One oversized engine, mounted high and slightly off-axis.
    M.box((4.5, 9.5, 8.5), (-10.5, 0.8, 0.6), "steel_dk", bevel=0.6)
    engine_bell(M, (-11.5, 0.8, 0.8), 4.2, 8.8, 13.5)
    M.tube([(-8, 4.5, 6.6), (-11.5, 4.2, 6.9), (-13.4, 3.4, 4.6)], 0.55, "orange_dk")  # fuel line

    # Pressure tank strapped on the far side with tape bands.
    M.cyl(3.0, 11, (-2.5, 3.6, 6.4), "orange_dk")
    M.sphere(3.0, (-8, 3.6, 6.4), "orange_dk", scale=(0.45, 1, 1))
    M.sphere(3.0, (3, 3.6, 6.4), "orange_dk", scale=(0.45, 1, 1))
    for x in (-5.6, -0.4):
        M.cyl(3.25, 1.2, (x, 3.6, 6.4), "tape")

    # Cargo cradle under the belly holding a strapped crate.
    for y in (-6.0, 6.0):
        M.box((14.5, 0.9, 0.9), (3, y, -7.2), "steel_lt")
        for x in (-3.4, 9.4):
            M.box((1.0, 1.0, 6.4), (x, y, -9.9), "steel_lt")
    for x in (-3.4, 9.4):
        M.box((1.0, 13.0, 1.0), (x, 0, -13.1), "steel_lt")
    M.box((9.2, 10.6, 4.8), (3.4, 0, -10.2), "teal", bevel=0.4)
    M.box((1.3, 10.9, 5.1), (1.4, 0, -10.2), "tape")
    M.box((2.6, 0.4, 2.0), (5.4, -5.4, -9.9), "bone")  # shipping label

    # Antenna, visibly bent, splinted with tape at the kink.
    M.tube([(7.6, -1.6, 10.3), (6.9, -1.6, 15.2), (10.3, -1.9, 17.8), (9.7, -1.9, 20.4)], 0.5, "steel_lt")
    M.sphere(1.0, (6.95, -1.62, 15.2), "tape", scale=(1, 1, 1.25))
    M.sphere(0.85, (9.6, -1.9, 21.0), "e_led_red")
    M.cyl(0.4, 1.6, (4.9, -1.6, 12.0), "steel_lt", r2=2.3, rot=(0, -40, 0))  # small dish
    M.tube([(5.4, -1.6, 10.3), (5.2, -1.6, 11.6)], 0.4, "steel_lt")

    # Patches in mismatched paint, on every side so the roll frames stay interesting.
    M.box((5.0, 0.5, 5.0), (-4.5, -6.5, 1.0), "rust")
    tape_x(M, -4.5, 1.0, 2.5, -6.95)
    M.box((4.0, 0.5, 3.0), (5.0, -6.5, 1.0), "bone_dk")
    M.box((3.0, 0.5, 2.0), (10.5, -6.5, 0.5), "cobalt")
    M.box((6.0, 0.5, 4.0), (3.0, 6.5, -0.4), "orange_dk")
    M.box((4.5, 0.5, 3.4), (-4.5, 6.5, 1.0), "bone_dk")
    tape_x(M, -4.5, 1.0, 1.8, 6.95)
    M.box((4.6, 4.2, 0.5), (-4.6, -3.2, 4.6), "rust")
    M.box((6, 5, 0.5), (4, 1, -7.1), "rust")

    # Nose: rubber push bumper, mining laser slung underneath, a stubby side thruster.
    M.box((1.7, 10.5, 5.0), (17.4, 0, -1.3), "steel_dk", bevel=0.5)
    M.box((2.6, 2.6, 1.6), (13.2, -3.0, -6.8), "steel_dk")
    M.cyl(1.05, 5.4, (15.4, -3.0, -7.2), "steel_lt")
    M.cyl(1.35, 1.2, (16.2, -3.0, -7.2), "orange_dk")
    M.sphere(0.9, (18.4, -3.0, -7.2), "e_laser")
    M.cyl(1.9, 5.2, (-6.0, -6.4, -3.8), "steel_dk")
    M.cyl(1.3, 0.7, (-8.8, -6.4, -3.8), "e_engine")
    M.box((0.9, 0.5, 0.9), (13.6, -6.6, 2.9), "e_led_green")


# ---------- other hull classes --------------------------------------------------------------

def build_hauler(M: kit.Model) -> None:
    """Long-haul freighter: a spine of mismatched containers between a blocky cab and twin engines."""
    M.box((40, 5, 3), (-3, 0, 0), "steel_dk", bevel=0.5)
    colors = ["orange_dk", "teal", "bone_dk", "rust", "cobalt", "steel_lt", "red", "green"]
    n = 0
    for col in range(4):
        x = -18.5 + col * 9.2
        for side, z in ((1, 4.6), (-1, -4.6)):
            if col == 2 and side == -1:
                # A container went missing; the gap is netted with tape.
                M.strip((x - 4, -2.2), (x + 4, -6.6), 0.8, "tape", -4.2)
                M.strip((x - 4, -6.6), (x + 4, -2.2), 0.8, "tape", -4.2)
                continue
            m = colors[(n * 3 + col) % len(colors)]
            n += 1
            M.box((8.2, 11, 6.2), (x, 0, z), m, bevel=0.5)
            M.box((0.6, 11.3, 6.5), (x - 2.2, 0, z), "steel_dk")
            M.box((0.6, 11.3, 6.5), (x + 2.2, 0, z), "steel_dk")
    M.box((3.4, 0.4, 2.2), (-9.3, -5.6, 5.0), "bone")
    # Cab.
    M.extrude([(18, -5.5), (27, -5.5), (29.5, -2), (29.5, 2.5), (25, 7), (18, 7)], 12, (0, 0, 0), "bone_dk", bevel=0.9)
    M.strip((21.0, 3.5), (27.0, 3.5), 2.0, "e_window_cool", -6.1)
    M.strip((18.5, -1.5), (29.0, -1.5), 1.0, "orange", -6.1)
    M.box((3, 7, 6), (16.5, 0, 0), "steel", bevel=0.5)
    M.box((3.4, 11, 0.5), (27.4, 0, 4.9), "e_window_cool", rot=(0, 45, 0))
    M.tube([(20, 2, 7), (20, 2, 12.5)], 0.5, "steel_lt")
    M.sphere(0.8, (20, 2, 13.1), "e_led_orange")
    # Engine block with two stacked bells.
    M.box((6, 12, 15), (-25.5, 0, 0), "steel", bevel=0.8)
    M.strip((-27.5, 3.0), (-23.5, -1.5), 0.9, "tape", -6.2)
    for z in (4.2, -4.2):
        engine_bell(M, (-28.3, 0, z), 2.2, 4.3, 6.5)


def build_clipper(M: kit.Model) -> None:
    """Fast courier: a slim dart with a dorsal fin, swept wings and twin blue drives."""
    M.lathe([(-22, 3.4), (-16, 5.0), (-2, 5.6), (12, 4.2), (24, 2.0), (31, 0.5)], (0, 0, 0), "steel_lt", squash=(1.3, 0.78))
    M.lathe([(-10, 5.75), (-6, 5.85)], (0, 0, 0), "cobalt", squash=(1.3, 0.78))
    M.lathe([(-4.5, 5.75), (-3.5, 5.75)], (0, 0, 0), "cobalt", squash=(1.3, 0.78))
    M.sphere(4.0, (10, 0, 2.3), "glass", scale=(1.9, 0.8, 0.75))
    M.strip((7, 3.1), (14, 2.5), 1.2, "e_window_blue", -3.3)
    M.extrude([(-21, 3), (-9, 3.5), (-15, 12.5), (-21.5, 12.5)], 1.2, (0, 0, 0), "steel", bevel=0.3)
    M.extrude([(-20, -3), (-12, -3.2), (-17, -8.5), (-21, -8.5)], 1.2, (0, 0, 0), "steel_dk", bevel=0.3)
    M.strip((-19.5, 10.3), (-14.6, 10.3), 1.2, "cobalt", -0.75)
    wing = [(-18, 0), (-2, 0), (-13, 15), (-19, 15)]
    M.extrude(wing, 1.2, (0, -5, -1.2), "steel", rot=(90, 0, 0), bevel=0.3)
    M.extrude(wing, 1.2, (0, 5, -1.2), "steel", rot=(-90, 0, 0), bevel=0.3)
    for y in (-13, 13):
        M.cyl(2.2, 12, (-16, y, -1.2), "steel_dk")
        M.cyl(2.5, 1.2, (-13, y, -1.2), "cobalt")
        M.lathe([(-22.2, 1.8), (-23.6, 1.3), (-24.8, 0.4)], (0, y, -1.2), "e_engine_blue")
    M.lathe([(-22.2, 2.6), (-23.8, 1.9), (-25.2, 0.6)], (0, 0, 0), "e_engine_blue")
    M.cyl(0.7, 9, (24, -2.6, -2.2), "steel_dk")
    M.sphere(0.8, (28.8, -2.6, -2.2), "e_led_red")
    M.box((4.4, 0.5, 2.6), (1.5, -7.1, 0.4), "rust")
    M.strip((-0.8, -0.9), (3.8, 1.7), 0.9, "tape", -7.45)
    M.box((0.9, 0.5, 0.9), (17.5, -4.6, 0.2), "e_led_green")


def build_colossus(M: kit.Model) -> None:
    """The big one: a flat-topped slab with a lit hangar slot, an island tower, a reactor dome and cargo racks."""
    M.extrude([(-30, -6), (25, -6), (33, -2.5), (34, 1), (29, 4), (-30, 4)], 20, (0, 0, 0), "steel", bevel=1.2)
    M.box((60, 22, 1.2), (-0.5, 0, 4.6), "steel_dk", bevel=0.3)
    for x in range(-24, 26, 8):
        M.box((4, 1, 0.3), (x, 0, 5.3), "yellow")
    # Hangar slot with warm work lights.
    M.box((22, 0.6, 5), (4, -9.9, -1.2), "iron")
    for x in (-3, 2, 7, 12):
        M.box((1.4, 0.5, 1.2), (x, -10.2, 0.3), "e_window")
    M.strip((-7, -3.9), (15, -3.9), 0.8, "yellow", -10.25)
    # Island.
    M.box((11, 6, 7), (-21, -5.5, 8.5), "bone_dk", bevel=0.7)
    M.strip((-25, 10.0), (-17, 10.0), 2.0, "e_window_cool", -8.6)
    M.box((6, 4, 3), (-22, -5.5, 13.5), "steel_dk", bevel=0.4)
    M.tube([(-23, -5.5, 15), (-23, -5.5, 21)], 0.6, "steel_lt")
    M.cyl(0.4, 1.8, (-21.4, -5.5, 19.0), "steel_lt", r2=2.8, rot=(0, -25, 0))
    M.sphere(0.9, (-23, -5.5, 21.6), "e_led_red")
    M.box((2, 14, 6), (30, 0, 7.5), "steel_dk", bevel=0.4)  # bow blast shield
    M.tube([(8, 6, 5), (8, 6, 10)], 0.6, "steel_lt")
    M.sphere(0.9, (8, 6, 10.6), "e_led_green")
    # Belly: keel, docking arm, patched plates.
    M.extrude([(-20, -6), (10, -6), (4, -10), (-16, -10)], 8, (0, 0, 0), "steel_dk", bevel=0.6)
    M.box((1.2, 1.2, 5), (18, -7, -8.5), "steel_lt")
    M.box((6, 1.2, 1.2), (20.5, -7, -11), "steel_lt")
    M.box((7, 0.5, 4), (-22, -10.0, -1), "rust")
    tape_x(M, -22, -1, 2.0, -10.4)
    M.box((5, 0.5, 3), (24, -10.0, -1.5), "orange_dk")
    M.box((5, 0.5, 3.2), (-2.5, -4.05, -8.0), "teal_dk")
    # Reactor dome on the deck and a cargo rack under the bow.
    M.sphere(5.0, (-2, 2, 5.0), "teal_dk", scale=(1, 1, 0.8))
    M.sphere(2.6, (-2.4, -2.2, 6.2), "e_led_mint", scale=(1, 0.5, 0.8))
    M.cyl(5.4, 1.0, (-2, 2, 5.2), "steel", axis="z")
    for n, x in enumerate((14, 20, 26)):
        M.box((5, 7, 3.6), (x, -5, -8.0), ("orange_dk", "bone_dk", "teal")[n], bevel=0.3)
    M.box((19, 8, 0.8), (20, -5, -6.0), "steel_lt")
    # Engine bank.
    M.box((6, 18, 9), (-32, 0, -1), "steel_dk", bevel=0.7)
    for y in (-6, 0, 6):
        engine_bell(M, (-34.5, y, -1), 1.9, 3.6, 5.5)


def build_prospector(M: kit.Model) -> None:
    """A ship built around a laser: one long finned barrel, an ore hopper and grabber arms."""
    M.cyl(2.6, 38, (11, 0, 1.5), "steel_dk")
    for x in range(2, 26, 4):
        M.cyl(4.2, 1.0, (x, 0, 1.5), "steel_lt", segs=10)
    M.cyl(3.4, 3.0, (28.5, 0, 1.5), "orange_dk", r2=2.2)
    M.sphere(1.5, (31.2, 0, 1.5), "e_laser")
    M.cyl(1.0, 2.0, (27.0, -3.2, 1.5), "e_laser", axis="y")
    # Body wrapped around the breech.
    M.extrude([(-17, -6), (-2, -6), (2, -3), (2, 6), (-3, 8), (-17, 8)], 14, (0, 0, 0), "steel", bevel=1.1)
    M.extrude([(-13, 8), (-4, 8), (-3, 10), (-6, 13), (-12, 13)], 8, (0, -2, 0), "yellow", bevel=0.7)
    M.strip((-10.5, 10.5), (-5.5, 10.5), 2.0, "e_window", -6.2)
    M.strip((-16, -2.5), (1, -2.5), 1.0, "yellow", -7.1)
    M.box((5, 0.5, 4), (-11, -7.0, 3.5), "rust")
    tape_x(M, -11, 3.5, 2.0, -7.4)
    M.box((3, 0.5, 3), (-4, -7.0, 2.5), "bone_dk")
    M.tube([(-9, -2, 13), (-10.5, -2, 18), (-8.5, -2, 21)], 0.5, "steel_lt")
    M.sphere(0.8, (-8.4, -2, 21.6), "e_led_red")
    # Ore hopper with a few rocks, and two grabber arms reaching forward.
    M.extrude([(-14, -6), (0, -6), (-2, -12), (-12, -12)], 11, (0, 0, 0), "steel_dk", bevel=0.5)
    for k, (x, y) in enumerate(((-10, -3), (-6, 1), (-3.5, -3.5))):
        M.rock(1.9, (x, y, -6.0), "rock_rust" if k % 2 else "rock", 200 + k, subdiv=1)
    for y in (-5, 5):
        M.tube([(2, y, -3), (11, y, -7.5), (17, y, -5.5)], 0.8, "yellow")
        M.tube([(17, y, -5.5), (19.5, y, -8.5)], 0.6, "steel_lt")
        M.tube([(17, y, -5.5), (20.5, y, -4.5)], 0.6, "steel_lt")
    M.box((5, 11, 9), (-18.5, 0, 1), "steel_dk", bevel=0.6)
    engine_bell(M, (-20.5, 0, 1), 2.8, 5.6, 8.5)


def build_bulwark(M: kit.Model) -> None:
    """Armour first, everything else second: layered plates, a ram prow and shield emitters."""
    M.extrude([(-20, -8), (14, -8), (24, -3), (25, 2), (16, 8), (-20, 8)], 18, (0, 0, 0), "steel", bevel=1.4)
    # Layered armour slabs on the flanks and the glacis.
    for y in (-9.4, 9.4):
        M.extrude([(-17, -5), (6, -5), (9, -1), (6, 5), (-17, 5)], 1.6, (0, y, 0), "steel_lt", bevel=0.4)
        M.extrude([(-13, -2.5), (2, -2.5), (4, 0), (2, 2.5), (-13, 2.5)], 1.0, (0, y * 1.1, 0), "cobalt_dk", bevel=0.3)
    M.box((12, 19.5, 1.6), (18.8, 0, 5.0), "steel_lt", rot=(0, 34, 0))
    M.box((3.0, 16, 9), (25.5, 0, -1), "steel_dk", bevel=0.8)  # ram prow
    for z in (-3.5, 0, 3.5):
        M.box((0.6, 16.4, 1.0), (27.1, 0, z - 1), "yellow")
    M.box((16, 12, 3), (-6, 0, 9), "steel_dk", bevel=0.8)
    M.strip((-2, 9.2), (3, 9.2), 1.4, "e_window_blue", -6.1)
    # Turret and shield emitters.
    M.cyl(3.4, 2.4, (-9, 0, 11.4), "steel_lt", axis="z", segs=10)
    M.cyl(0.8, 9, (-3.5, 0, 12.0), "steel_dk")
    for x, z in ((-16, 9.2), (10, 8.8), (-16, -9.2), (8, -9.2)):
        M.sphere(1.8, (x, -5, z), "steel_dk")
        M.sphere(1.1, (x, -6.3, z + (0.5 if z > 0 else -0.5)), "e_led_blue", scale=(1, 0.6, 1))
    M.box((6, 0.5, 4), (12, -9.1, -3), "rust")
    tape_x(M, 12, -3, 2.0, -9.5)
    M.box((4, 0.5, 3), (-18, -9.1, 6.0), "bone_dk")
    # Shrouded twin engines.
    M.box((7, 17, 13), (-22.5, 0, 0), "steel_dk", bevel=0.9)
    for z in (3.6, -3.6):
        engine_bell(M, (-25.5, 0, z), 2.2, 4.0, 5.5, glow="e_engine_blue", ring="cobalt", core=None)


def build_ark(M: kit.Model) -> None:
    """Generation ship: a spine with a habitat ring, greenhouse domes and wide solar wings."""
    M.lathe([(-30, 3.5), (-27, 5.6), (18, 5.6), (27, 4.2), (33, 1.6)], (0, 0, 0), "bone_dk")
    for x in (-20, -10, 8):
        M.cyl(5.9, 1.3, (x, 0, 0), "steel")
    # Habitat ring seen edge-on, with spokes.
    M.torus(17.5, 2.8, (-2, 0, 0), "steel_lt", rot=(0, 90, 0), segs=32)
    M.torus(17.5, 3.0, (-2, 0, 0), "orange_dk", rot=(0, 90, 0), segs=32, squash=0.35)
    for a in range(0, 360, 60):
        y, z = math.cos(math.radians(a)) * 16, math.sin(math.radians(a)) * 16
        M.tube([(-2, 0, 0), (-2, y, z)], 0.8, "steel")
    for a in range(0, 360, 30):
        y, z = math.cos(math.radians(a)) * 17.5, math.sin(math.radians(a)) * 17.5
        M.box((0.5, 1.4, 1.4), (-5.0, y, z), "e_window", rot=(a, 0, 0))
        M.box((0.5, 1.4, 1.4), (1.0, y, z), "e_window", rot=(a, 0, 0))
    # Greenhouse domes.
    for x, r in ((14, 6.2), (24, 4.2)):
        M.sphere(r, (x, 0, 3.6), "green", scale=(1, 1, 0.9))
        M.sphere(r * 0.62, (x - 0.5, -r * 0.55, 4.6), "e_led_green", scale=(1, 0.5, 0.7))
        M.cyl(r + 0.3, 1.0, (x, 0, 3.4), "steel", axis="z")
    # Solar wings at the stern.
    for z in (1, -1):
        M.box((14, 0.6, 11), (-20, 0, z * 12.5), "solar")
        M.box((14.4, 0.8, 0.8), (-20, 0, z * 7.0), "steel_lt")
        M.box((0.8, 0.8, 11), (-20, -0.1, z * 12.5), "steel_lt")
    M.box((5, 0.5, 3.2), (6, -5.5, -1.5), "rust")
    M.strip((3.4, -2.6), (8.6, -0.2), 0.9, "tape", -5.9)
    M.strip((28, 2.2), (31.5, 1.2), 1.4, "e_window_cool", -3.2)
    for y, z in ((0, 2.6), (-2.6, -1.8), (2.6, -1.8)):
        engine_bell(M, (-30, y, z), 1.6, 3.0, 5.0, core=None)


def build_relic(M: kit.Model) -> None:
    """Something old that nobody built: an open crescent around a lit core, with one modern repair."""
    M.torus(13.5, 3.6, (0, 0, 0), "violet_dk", rot=(90, 0, 28), segs=30, arc=304, squash=1.6)
    M.torus(13.5, 3.9, (0, 0, 0), "gold", rot=(90, 0, 28), segs=30, arc=304, squash=0.3)
    M.sphere(4.6, (0, 0, 0), "e_core")
    M.torus(6.6, 0.7, (0, 0, 0), "gold", rot=(70, 20, 0), segs=20)
    for sz in (1, -1):
        M.shard(2.6, 15, (17, 0, sz * 8.2), "crystal", rot=(0, 90 - sz * 12, 0))
        M.shard(1.5, 8, (9.5, 0, sz * 13.6), "crystal", rot=(0, 90 - sz * 30, 0), segs=4)
    M.shard(3.2, 14, (-19, 0, 0), "violet", rot=(0, -90, 0), segs=6)
    M.lathe([(-25.5, 2.2), (-27.5, 1.5), (-29.5, 0.4)], (0, 0, 0), "e_engine_violet")
    for a in (60, 120, 180, 240, 300):
        x, z = math.cos(math.radians(a)) * 13.5, math.sin(math.radians(a)) * 13.5
        M.box((1.4, 0.6, 1.4), (x, -5.9, z), "e_crystal_teal")
    M.box((5, 0.5, 4), (-7.5, -5.8, 10.6), "steel_lt", rot=(0, 35, 0))
    M.strip((-10.5, 9.6), (-4.5, 11.6), 1.0, "tape", -6.3)
    M.strip((-9, 12.8), (-6, 8.6), 1.0, "tape", -6.3)


HULLS = {
    "tug": {"build": build_tug, "size": (64, 48), "center": (-4.0, 3.5),
            "anchors": {"engine": (-27.5, 0.8), "laser": (19.0, -7.2), "center": (0.0, 0.0)}},
    "hauler": {"build": build_hauler, "size": (80, 36), "center": (-4.0, 0.0),
               "anchors": {"engine": (-37.5, 0.0), "laser": (30.0, -3.0), "center": (0.0, 0.0)}},
    "prospector": {"build": build_prospector, "size": (72, 52), "center": (2.0, 1.0),
                   "anchors": {"engine": (-31.5, 1.0), "laser": (32.5, 1.5), "center": (0.0, 0.0)}},
    "clipper": {"build": build_clipper, "size": (72, 40), "center": (3.0, 0.0),
                "anchors": {"engine": (-25.5, 0.0), "laser": (29.5, -2.2), "center": (0.0, 0.0)}},
    "bulwark": {"build": build_bulwark, "size": (72, 40), "center": (-2.0, 0.0),
                "anchors": {"engine": (-33.5, 0.0), "laser": (27.5, -1.0), "center": (0.0, 0.0)}},
    "ark": {"build": build_ark, "size": (84, 52), "center": (-1.0, 0.0),
            "anchors": {"engine": (-37.5, 0.0), "laser": (33.5, 0.0), "center": (0.0, 0.0)}},
    "colossus": {"build": build_colossus, "size": (88, 56), "center": (-3.0, 0.0),
                 "anchors": {"engine": (-42.5, -1.0), "laser": (34.5, -1.0), "center": (0.0, 0.0)}},
    "relic": {"build": build_relic, "size": (64, 48), "center": (-3.0, 0.0),
              "anchors": {"engine": (-30.0, 0.0), "laser": (24.5, 0.0), "center": (0.0, 0.0)}},
}
# Names used before the content defined its hull ids.
ALIASES = {"frigate": "clipper", "carrier": "colossus"}


def groups(hull_ids):
    out = []
    designs = list(HULLS.keys())
    spare = [d for d in designs if d not in hull_ids and d not in (ALIASES.get(h) for h in hull_ids)]
    for n, hid in enumerate(hull_ids):
        # Unknown hull ids (content may add classes) borrow an unused design, then cycle.
        key = ALIASES.get(hid, hid)
        if key not in HULLS:
            key = spare.pop(0) if spare else designs[n % len(designs)]
        spec = HULLS[key]

        def build(i, spec=spec, hid=hid):
            M = kit.Model(f"ship_{hid}")
            spec["build"](M)
            M.root.rotation_euler.x = math.radians(360.0 * i / ROLL_FRAMES)
            return M

        out.append({"group": f"ship_{hid}", "size": spec["size"], "center": spec.get("center", (0, 0)), "build": build,
                    "frames": [f"ship_{hid}_{i:02d}" for i in range(ROLL_FRAMES)], "anchors": spec.get("anchors", {})})

    def hero(i):
        # Larger three-quarter render of the tug for the app icon and splash; not packed into atlases.
        M = kit.Model("hero_tug")
        build_tug(M)
        M.root.scale = (2.5, 2.5, 2.5)
        M.root.rotation_euler = (math.radians(-14), math.radians(-6), math.radians(-24))
        return M

    out.append({"group": "hero_tug", "size": (150, 110), "center": (-8.0, 6.0), "build": hero, "frames": ["hero_tug"]})
    return out
