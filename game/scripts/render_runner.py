"""Render the licensed runner and barrier as small Phaser sprite sheets."""

import argparse
from array import array
from pathlib import Path
import sys
import tempfile

import bpy
from mathutils import Vector


def setup(width, height):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = 16
    scene.render.film_transparent = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.25, .28, .35, 1)
    return scene


def camera_and_lights(scene, center, offset, scale):
    center = Vector(center)
    bpy.ops.object.camera_add(location=center + Vector(offset))
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = scale
    scene.camera = camera
    for position, power, size in [((-4, -6, 8), 1000, 5), ((5, 0, 5), 750, 4), ((0, 5, 6), 1000, 3)]:
        bpy.ops.object.light_add(type="AREA", location=position)
        light = bpy.context.object
        light.data.energy = power
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()


def render_character(source, output):
    scene = setup(96, 128)
    bpy.ops.import_scene.fbx(filepath=str(source / "Model/characterMedium.fbx"))
    rig = next(o for o in scene.objects if o.type == "ARMATURE")
    mesh = next(o for o in scene.objects if o.type == "MESH")
    actions = {}
    for name in ["idle", "run", "jump"]:
        before = set(scene.objects)
        bpy.ops.import_scene.fbx(filepath=str(source / f"Animations/{name}.fbx"))
        animation_rig = next(o for o in scene.objects if o.type == "ARMATURE" and o not in before)
        animation_rig.animation_data.action = next(a for a in bpy.data.actions if a.name.endswith(f"|{name.title()}"))
        actions[name] = animation_rig
    material = bpy.data.materials.new("Skater")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .85
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(source / "Skins/skaterMaleA.png"))
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    mesh.data.materials.clear()
    mesh.data.materials.append(material)
    camera_and_lights(scene, (0, 0, 1.88), (-8, -6, 1.35), 4.4)
    rig.animation_data_clear()
    bones = sorted(rig.pose.bones, key=lambda b: len(b.parent_recursive))
    width, height, columns = 96, 128, 8
    pixels = array("f", [0]) * (width * columns * height * 3 * 4)
    with tempfile.TemporaryDirectory(prefix="dreamcraft-frames-") as temporary:
        for row, (name, frames) in enumerate([
            ("idle", range(1, 33, 4)),
            ("run", range(1, 17, 2)),
            ("jump", [1, 3, 5, 7, 9, 11, 13, 13]),
        ]):
            for column, frame in enumerate(frames):
                scene.frame_set(frame)
                # The FBX clips have different rest poses. Copy world poses, not local curves.
                for bone in bones:
                    source_bone = actions[name].pose.bones.get(bone.name)
                    if source_bone:
                        bone.matrix = rig.matrix_world.inverted() @ actions[name].matrix_world @ source_bone.matrix
                        bpy.context.view_layer.update()
                scene.render.filepath = str(Path(temporary) / "frame.png")
                bpy.ops.render.render(write_still=True)
                rendered = bpy.data.images.load(scene.render.filepath, check_existing=False)
                frame_pixels = array("f", [0]) * (width * height * 4)
                rendered.pixels.foreach_get(frame_pixels)
                # Blender stores rows from the bottom; Phaser numbers them from the top.
                for y in range(height):
                    start = ((2 - row) * height + y) * width * columns * 4 + column * width * 4
                    pixels[start:start + width * 4] = frame_pixels[y * width * 4:(y + 1) * width * 4]
                bpy.data.images.remove(rendered)
    atlas = bpy.data.images.new("Skater frames", width=width * columns, height=height * 3, alpha=True)
    atlas.pixels.foreach_set(pixels)
    atlas.filepath_raw = str(output / "skater.png")
    atlas.file_format = "PNG"
    atlas.save()


def render_barrier(source, output):
    scene = setup(192, 96)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [o for o in scene.objects if o.type == "MESH"]
    # Raise the low racing divider into a readable runner hurdle.
    for obj in meshes:
        obj.scale.z *= 3
    bpy.context.view_layer.update()
    for material in bpy.data.materials:
        if material.name == "red":
            material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.8, .035, .025, 1)
    points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    low = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    camera_and_lights(scene, (low + high) / 2, (1.2, -4, 1.5), (high.x - low.x) * 1.15)
    for obj in scene.objects:
        if obj.type == "LIGHT":
            obj.data.energy *= .55
    scene.render.filepath = str(output / "barrier.png")
    bpy.ops.render.render(write_still=True)
    # Trim transparent space so the solid hurdle fills the existing collision box.
    image = bpy.data.images.load(scene.render.filepath, check_existing=False)
    width, height = image.size
    pixels = array("f", [0]) * (width * height * 4)
    image.pixels.foreach_get(pixels)
    visible = [(i % width, i // width) for i in range(width * height) if pixels[i * 4 + 3] > .01]
    left, right = min(x for x, _ in visible), max(x for x, _ in visible) + 1
    bottom, top = min(y for _, y in visible), max(y for _, y in visible) + 1
    cropped = array("f")
    for y in range(bottom, top):
        cropped.extend(pixels[(y * width + left) * 4:(y * width + right) * 4])
    trimmed = bpy.data.images.new("Trimmed barrier", width=right - left, height=top - bottom, alpha=True)
    trimmed.pixels.foreach_set(cropped)
    trimmed.filepath_raw = scene.render.filepath
    trimmed.file_format = "PNG"
    trimmed.save()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--character", type=Path, required=True)
    parser.add_argument("--barrier", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.output.mkdir(parents=True, exist_ok=True)
    render_character(args.character, args.output)
    render_barrier(args.barrier, args.output)
