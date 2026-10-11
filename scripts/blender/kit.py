"""Shared Blender (bpy) toolkit for the sprite pipeline: scene setup, toon materials, primitives.

Conventions: 1 Blender unit = 1 sprite pixel at 1x. X is right (ships face +X), Z is up, the
orthographic camera sits on -Y looking toward +Y. The key light comes from the upper left front,
the rim term from the lower right. Materials are palette ramps resolved by a constant color ramp,
so the 4x render already consists of palette colors (plus anti-aliased edges).

Two passes per frame: "color" (lights off: emissive surfaces show their unlit color) and "emit"
(only emissive surfaces, everything else is a holdout so occlusion stays correct).
"""
from __future__ import annotations

import json
import math
import random
import warnings
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
PAL = {k: v for k, v in json.loads((ROOT / "assets" / "palette.json").read_text())["colors"].items()}

KEY_DIR = Vector((-0.45, -0.50, 0.74)).normalized()  # surface -> key light
RIM_DIR = Vector((0.45, 0.15, -0.88)).normalized()  # surface -> rim light
THRESH = (0.05, 0.36, 0.64, 0.86)  # shadow | dark | mid | light | hi
RIM_THRESH = 0.80

# name: (shadow, dark, mid, light, hi) palette keys, optionally a 6th entry for the rim color.
RAMPS = {
    "steel": ("void2", "steel0", "steel1", "steel2", "steel3"),
    "steel_dk": ("void1", "void3", "steel0", "steel1", "steel2"),
    "steel_lt": ("steel0", "steel1", "steel2", "steel3", "bone0"),
    "iron": ("void0", "void2", "void3", "steel0", "steel1"),
    "bone": ("steel0", "steel2", "bone0", "bone1", "bone2"),
    "bone_dk": ("steel0", "steel1", "steel3", "bone0", "bone1"),
    "tape": ("steel1", "steel2", "steel3", "bone0", "bone1"),
    "orange": ("rust0", "rust1", "orange", "amber", "yellow"),
    "orange_dk": ("void2", "rust0", "rust1", "orange", "amber"),
    "rust": ("void2", "rust0", "rust1", "rust1", "orange"),
    "yellow": ("rust0", "rust1", "amber", "yellow", "bone2"),
    "red": ("void2", "red0", "red1", "red1", "amber"),
    "red_dk": ("void1", "rust0", "red0", "red0", "red1"),
    "cobalt": ("void2", "cobalt0", "cobalt1", "cobalt1", "cobalt2"),
    "cobalt_dk": ("void1", "void3", "cobalt0", "cobalt0", "cobalt1"),
    "teal": ("void2", "teal0", "teal1", "teal2", "mint"),
    "teal_dk": ("void1", "void3", "teal0", "teal1", "teal2"),
    "violet": ("void2", "violet0", "violet1", "violet2", "violet3"),
    "violet_dk": ("void1", "void3", "violet0", "violet1", "violet2"),
    "green": ("void2", "green0", "green1", "green1", "lime"),
    "green_dk": ("void1", "void3", "green0", "green0", "green1"),
    "glass": ("void0", "void2", "void3", "cobalt0", "cobalt2"),
    "solar": ("void1", "void3", "cobalt0", "cobalt1", "cobalt2"),
    "rock": ("void2", "void3", "steel0", "steel1", "steel2"),
    "rock_rust": ("void1", "rust0", "rust1", "steel1", "steel2"),
    "rock_ice": ("void3", "teal0", "teal1", "steel3", "bone1"),
    "rock_violet": ("void1", "violet0", "violet1", "steel1", "violet2"),
    "rock_carbon": ("void1", "void2", "void3", "steel0", "steel1"),
    "crystal": ("violet0", "violet1", "violet2", "violet3", "bone2"),
    "crystal_teal": ("teal0", "teal1", "teal2", "mint", "bone2"),
    "gold": ("rust0", "rust1", "amber", "yellow", "bone2"),
}

# Emissive materials: lit color in the "emit" pass, unlit color in the "color" pass.
EMITS = {
    "e_window": ("amber", "void3"),
    "e_window_cool": ("mint", "void3"),
    "e_window_blue": ("cobalt2", "void3"),
    "e_engine": ("amber", "rust0"),
    "e_engine_hot": ("yellow", "rust1"),
    "e_engine_blue": ("cobalt2", "cobalt0"),
    "e_engine_violet": ("violet3", "violet0"),
    "e_led_red": ("red1", "red0"),
    "e_led_green": ("lime", "green0"),
    "e_led_orange": ("orange", "rust1"),
    "e_led_yellow": ("yellow", "rust1"),
    "e_led_mint": ("mint", "teal1"),
    "e_led_blue": ("cobalt2", "cobalt0"),
    "e_led_white": ("bone2", "steel1"),
    "e_laser": ("mint", "teal0"),
    "e_crystal": ("violet3", "violet1"),
    "e_crystal_teal": ("mint", "teal1"),
    "e_hot": ("orange", "rust1"),
    "e_core": ("violet3", "violet0"),
}

_mats: dict[str, bpy.types.Material] = {}
_pass = "color"


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(key: str) -> tuple[float, float, float, float]:
    h = PAL[key].lstrip("#")
    return tuple(srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def _new_material(name: str) -> bpy.types.Material:
    m = bpy.data.materials.new(name)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        m.use_nodes = True
    m.node_tree.nodes.clear()
    return m


def _toon_material(name: str, ramp: tuple[str, ...]) -> bpy.types.Material:
    m = _new_material(name)
    nt = m.node_tree
    n, link = nt.nodes, nt.links.new
    diffuse = n.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = n.new("ShaderNodeShaderToRGB")
    link(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    cr = n.new("ShaderNodeValToRGB")
    cr.color_ramp.interpolation = "CONSTANT"
    els = cr.color_ramp.elements
    els[0].position, els[0].color = 0.0, rgba(ramp[0])
    els[1].position, els[1].color = THRESH[0], rgba(ramp[1])
    for pos, key in zip(THRESH[1:], ramp[2:5]):
        e = els.new(pos)
        e.color = rgba(key)
    link(to_rgb.outputs["Color"], cr.inputs["Factor"])
    # Rim: only inside the key light's shadow band, on normals facing the rim light.
    geo = n.new("ShaderNodeNewGeometry")
    dot = n.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    link(geo.outputs["Normal"], dot.inputs[0])
    dot.inputs[1].default_value = RIM_DIR
    rim_on = n.new("ShaderNodeMath")
    rim_on.operation = "GREATER_THAN"
    link(dot.outputs["Value"], rim_on.inputs[0])
    rim_on.inputs[1].default_value = RIM_THRESH
    in_shadow = n.new("ShaderNodeMath")
    in_shadow.operation = "LESS_THAN"
    link(to_rgb.outputs["Color"], in_shadow.inputs[0])
    in_shadow.inputs[1].default_value = THRESH[1]
    both = n.new("ShaderNodeMath")
    both.operation = "MULTIPLY"
    link(rim_on.outputs[0], both.inputs[0])
    link(in_shadow.outputs[0], both.inputs[1])
    mix = n.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    link(both.outputs[0], mix.inputs[0])
    link(cr.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = rgba(ramp[5] if len(ramp) > 5 else ramp[2])
    emission = n.new("ShaderNodeEmission")
    link(mix.outputs[2], emission.inputs["Color"])
    holdout = n.new("ShaderNodeHoldout")
    out = n.new("ShaderNodeOutputMaterial")
    m["_color"] = emission.name
    m["_emit"] = holdout.name
    m["_out"] = out.name
    link(emission.outputs[0], out.inputs["Surface"])
    return m


def _emit_material(name: str, lit: str, unlit: str) -> bpy.types.Material:
    m = _new_material(name)
    nt = m.node_tree
    n = nt.nodes
    off = n.new("ShaderNodeEmission")
    off.inputs["Color"].default_value = rgba(unlit)
    on = n.new("ShaderNodeEmission")
    on.inputs["Color"].default_value = rgba(lit)
    out = n.new("ShaderNodeOutputMaterial")
    m["_color"] = off.name
    m["_emit"] = on.name
    m["_out"] = out.name
    nt.links.new(off.outputs[0], out.inputs["Surface"])
    return m


def mat(name: str) -> bpy.types.Material:
    """Material by ramp name (RAMPS) or emissive name (EMITS)."""
    if name not in _mats:
        if name in RAMPS:
            _mats[name] = _toon_material(name, RAMPS[name])
        elif name in EMITS:
            _mats[name] = _emit_material(name, *EMITS[name])
        else:
            raise KeyError(f"unknown material {name}")
        _apply_pass(_mats[name])
    return _mats[name]


def _apply_pass(m: bpy.types.Material) -> None:
    nt = m.node_tree
    src = nt.nodes[m["_emit" if _pass == "emit" else "_color"]]
    out = nt.nodes[m["_out"]]
    for l in list(out.inputs["Surface"].links):
        nt.links.remove(l)
    nt.links.new(src.outputs[0], out.inputs["Surface"])


def set_pass(name: str) -> None:
    global _pass
    _pass = name
    for m in _mats.values():
        _apply_pass(m)


# ---------- scene ---------------------------------------------------------------------------

def setup_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    s.render.film_transparent = True
    s.render.dither_intensity = 0.0
    s.render.filter_size = 0.01
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.render.image_settings.color_depth = "8"
    s.render.image_settings.compression = 60
    s.render.resolution_percentage = 100
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.view_settings.exposure = 0.0
    s.view_settings.gamma = 1.0
    s.eevee.taa_render_samples = 8
    s.eevee.use_shadows = True
    s.eevee.use_raytracing = False
    world = bpy.data.worlds.new("w")
    world.color = (0, 0, 0)
    s.world = world

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.clip_start = 1.0
    cam_data.clip_end = 2000.0
    cam = bpy.data.objects.new("cam", cam_data)
    cam.rotation_euler = Euler((math.radians(90), 0, 0))
    s.collection.objects.link(cam)
    s.camera = cam

    sun_data = bpy.data.lights.new("key", "SUN")
    sun_data.energy = math.pi  # white diffuse facing the sun then shades to exactly 1.0
    sun_data.angle = math.radians(1.0)
    sun_data.use_shadow = True
    sun = bpy.data.objects.new("key", sun_data)
    sun.rotation_euler = KEY_DIR.to_track_quat("Z", "Y").to_euler()
    s.collection.objects.link(sun)


def frame_camera(w: int, h: int, ss: int, center=(0.0, 0.0)) -> None:
    s = bpy.context.scene
    s.render.resolution_x = w * ss
    s.render.resolution_y = h * ss
    s.camera.data.ortho_scale = max(w, h)
    s.camera.location = (center[0], -600.0, center[1])


def clear_objects() -> None:
    for o in list(bpy.data.objects):
        if o.type in ("MESH", "EMPTY"):
            bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)


def render(path: str) -> None:
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------- model builder -------------------------------------------------------------------

def _rot(rot) -> Euler:
    return Euler(tuple(math.radians(a) for a in rot), "XYZ")


class Model:
    """Collects primitives under one root empty. All angles in degrees, all sizes in pixels."""

    def __init__(self, name: str = "model"):
        self.root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(self.root)
        self.rng = random.Random(name)

    # -- internals --
    def _add(self, bm: bmesh.types.BMesh, material: str, loc, rot, smooth: float | None, scale=(1, 1, 1)):
        me = bpy.data.meshes.new("m")
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat(material))
        if smooth is not None:
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(smooth))
        ob = bpy.data.objects.new("p", me)
        ob.location = loc
        ob.rotation_euler = _rot(rot)
        ob.scale = scale
        ob.parent = self.root
        bpy.context.scene.collection.objects.link(ob)
        return ob

    # -- primitives --
    def box(self, size, loc=(0, 0, 0), m="steel", rot=(0, 0, 0), bevel=0.0):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=size, verts=bm.verts)
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, profile=0.5, affect="EDGES")
        return self._add(bm, m, loc, rot, None)

    def cyl(self, r, length, loc=(0, 0, 0), m="steel", axis="x", r2=None, segs=14, rot=(0, 0, 0), smooth=40.0):
        """Cylinder or cone frustum centered at loc. r is the radius at the -axis end, r2 at the + end."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=length)
        if axis == "x":
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, "Y"))
        elif axis == "y":
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(-90), 3, "X"))
        return self._add(bm, m, loc, rot, smooth)

    def lathe(self, profile, loc=(0, 0, 0), m="steel", axis="x", segs=16, rot=(0, 0, 0), smooth=35.0, squash=(1, 1)):
        """Surface of revolution. profile = [(pos along axis, radius), ...]; ends are capped."""
        bm = bmesh.new()
        rings = []
        for pos, rad in profile:
            ring = []
            for i in range(segs):
                a = 2 * math.pi * i / segs
                ring.append(bm.verts.new((pos, math.cos(a) * rad * squash[0], math.sin(a) * rad * squash[1])))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        if axis == "z":
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(-90), 3, "Y"))
        elif axis == "y":
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, "Z"))
        return self._add(bm, m, loc, rot, smooth)

    def sphere(self, r, loc=(0, 0, 0), m="steel", scale=(1, 1, 1), segs=14, rings=8, rot=(0, 0, 0), smooth=60.0):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
        return self._add(bm, m, loc, rot, smooth, scale)

    def rock(self, r, loc=(0, 0, 0), m="rock", seed=0, scale=(1, 1, 1), rough=0.28, subdiv=2, rot=(0, 0, 0), dents=3):
        """Lumpy low-poly rock: displaced icosphere with a few crater-like dents, faceted shading."""
        rng = random.Random(seed)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
        lumps = [(Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized(), rng.uniform(-1, 1)) for _ in range(7)]
        pits = [Vector((rng.uniform(-1, 1), rng.uniform(-1, 0.2), rng.uniform(-1, 1))).normalized() for _ in range(dents)]
        for v in bm.verts:
            d = v.co.normalized()
            k = 1.0
            for axis, amp in lumps:
                k += rough * 0.5 * amp * max(0.0, d.dot(axis)) ** 2
            for p in pits:
                k -= 0.22 * max(0.0, d.dot(p) - 0.8) / 0.2
            k += rng.uniform(-rough, rough) * 0.35
            v.co = d * r * k
        return self._add(bm, m, loc, rot, None, scale)

    def extrude(self, profile, width, loc=(0, 0, 0), m="steel", rot=(0, 0, 0), bevel=0.0, taper=1.0):
        """Polygon in the XZ plane (side view silhouette) extruded along Y, centered on loc.y.

        taper scales the far (+Y) side profile toward its centroid; use for asymmetric hulls.
        """
        bm = bmesh.new()
        cx = sum(p[0] for p in profile) / len(profile)
        cz = sum(p[1] for p in profile) / len(profile)
        near = [bm.verts.new((x, -width / 2, z)) for x, z in profile]
        far = [bm.verts.new((cx + (x - cx) * taper, width / 2, cz + (z - cz) * taper)) for x, z in profile]
        bm.faces.new(near)
        bm.faces.new(list(reversed(far)))
        k = len(profile)
        for i in range(k):
            j = (i + 1) % k
            bm.faces.new((near[j], near[i], far[i], far[j]))
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, profile=0.5, affect="EDGES")
        return self._add(bm, m, loc, rot, None)

    def tube(self, pts, r, m="steel", segs=6):
        """Chain of thin cylinders through the given points (antennas, pipes, struts)."""
        obs = []
        for a, b in zip(pts, pts[1:]):
            a, b = Vector(a), Vector(b)
            d = b - a
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=d.length)
            ob = self._add(bm, m, (a + b) / 2, (0, 0, 0), 50.0)
            ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
            obs.append(ob)
        return obs

    def torus(self, R, r, loc=(0, 0, 0), m="steel", rot=(0, 0, 0), segs=28, rsegs=8, arc=360.0, squash=1.0):
        """Torus around the local Z axis (use rot to stand it up). arc < 360 leaves a gap."""
        bm = bmesh.new()
        n = segs if arc >= 360 else max(2, int(segs * arc / 360))
        rings = []
        count = n if arc >= 360 else n + 1
        for i in range(count):
            a = math.radians(arc) * i / n
            ring = []
            for j in range(rsegs):
                b = 2 * math.pi * j / rsegs
                rad = R + math.cos(b) * r
                ring.append(bm.verts.new((math.cos(a) * rad, math.sin(a) * rad, math.sin(b) * r * squash)))
            rings.append(ring)
        pairs = list(zip(rings, rings[1:]))
        if arc >= 360:
            pairs.append((rings[-1], rings[0]))
        else:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
        for a, b in pairs:
            for j in range(rsegs):
                k = (j + 1) % rsegs
                bm.faces.new((a[j], b[j], b[k], a[k]))
        return self._add(bm, m, loc, rot, 50.0)

    def shard(self, r, length, loc=(0, 0, 0), m="crystal", rot=(0, 0, 0), segs=5, tip=0.35):
        """Crystal: prism along local Z with pointed ends."""
        return self.lathe([(-length * 0.5, 0.01), (-length * (0.5 - tip * 0.5), r), (length * (0.5 - tip), r * 0.9), (length * 0.5, 0.01)],
                          loc, m, axis="z", segs=segs, rot=rot, smooth=None)

    def strip(self, a, b, width, m="tape", y=0.0, thick=0.3):
        """Flat strip facing the camera between two XZ points at depth y (tape, stripes, decals)."""
        ax, az = a
        bx, bz = b
        length = math.hypot(bx - ax, bz - az)
        ang = math.degrees(math.atan2(bz - az, bx - ax))
        return self.box((length, thick, width), ((ax + bx) / 2, y, (az + bz) / 2), m, rot=(0, -ang, 0))
