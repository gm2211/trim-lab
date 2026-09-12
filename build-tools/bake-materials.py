"""Bake original, tileable marine materials with Blender Cycles (no downloads).

Run: Blender --background --factory-startup --python build-tools/bake-materials.py
The optional -- --save-blend /tmp/trim-materials.blend retains editable nodes.
Normal maps use OpenGL +Y; roughness PNGs are linear grayscale in RGB channels.
"""
import math
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "materials"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_plane_add(size=1)
plane = bpy.context.object
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 8
scene.render.bake.margin = 0  # UV fills the tile; every edge is periodic.
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.image_settings.color_depth = "8"


def material(name, frequency, depth, rough_min, rough_max, diagonal=False):
    mat = bpy.data.materials.new(name)
    mat.use_fake_user = True  # Keep every editable material in optional .blend.
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    def node(kind):
        return nodes.new(kind)
    def math_node(op, a, b=None):
        n = node("ShaderNodeMath")
        n.operation = op
        for i, value in enumerate([a, b]):
            if value is None:
                continue
            if isinstance(value, (int, float)):
                n.inputs[i].default_value = value
            else:
                links.new(value, n.inputs[i])
        return n.outputs[0]
    uv = node("ShaderNodeTexCoord")
    sep = node("ShaderNodeSeparateXYZ")
    links.new(uv.outputs["UV"], sep.inputs[0])
    x, y = sep.outputs["X"], sep.outputs["Y"]
    if diagonal:
        x, y = math_node("ADD", x, y), math_node("SUBTRACT", x, y)
    sx = math_node("COSINE", math_node("MULTIPLY", x, 2 * math.pi * frequency))
    sy = math_node("COSINE", math_node("MULTIPLY", y, 2 * math.pi * frequency))
    height = math_node("MULTIPLY", math_node("ADD", sx, sy), .25)
    height = math_node("ADD", height, .5)
    bump = node("ShaderNodeBump")
    bump.inputs["Distance"].default_value = depth
    links.new(height, bump.inputs["Height"])
    shader = node("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = (.72, .72, .69, 1)
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    rough = math_node("ADD", rough_min,
                      math_node("MULTIPLY", height, rough_max - rough_min))
    links.new(rough, shader.inputs["Roughness"])
    output = node("ShaderNodeOutputMaterial")
    links.new(shader.outputs[0], output.inputs["Surface"])
    plane.data.materials.clear()
    plane.data.materials.append(mat)
    target = node("ShaderNodeTexImage")
    nodes.active = target
    for kind in ["NORMAL", "ROUGHNESS"]:
        image = bpy.data.images.new(f"{name}-{kind.lower()}", width=256, height=256, alpha=False)
        image.colorspace_settings.name = "Non-Color"
        target.image = image
        bpy.ops.object.bake(type=kind, normal_space="TANGENT")
        image.filepath_raw = str(OUT / f"{name}-{kind.lower()}.png")
        image.file_format = "PNG"
        image.save()
    return mat


material("gelcoat", 24, .00016, .23, .31)
material("sailcloth", 32, .0018, .70, .86)
material("nonskid", 16, .006, .83, .97, diagonal=True)
material("braid", 8, .010, .65, .83, diagonal=True)
if "--save-blend" in sys.argv:
    path = sys.argv[sys.argv.index("--save-blend") + 1]
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(path).resolve()))
print(f"Baked 8 marine material maps to {OUT}")
