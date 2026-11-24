"""
Fotos de producto de ejemplo para las maquetas: modelos CC0 de Poly Haven en un mismo estudio.

Uso (Blender 5.x):
  blender -b --factory-startup --python herramientas/fotos/fotografiar.py -- [--muestras 64] [--solo boombox,croissant]

Todas las fotos comparten luz, ángulo y fondo transparente con sombra de contacto: así la grilla de
productos se ve pareja, como en un marketplace bien curado (y no como diez fotos de diez vendedores).
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

AQUI = Path(__file__).resolve().parent
MODELOS = AQUI / "modelos"
SALIDA = AQUI / "renders"

# Ajustes por modelo: giro para mostrar el frente, elevación de la cámara (grados) y margen
AJUSTES = {
    "Television_01": {"giro": 20},
    "classic_laptop": {"giro": 20, "elev": 28},
    "boombox": {"giro": 20},
    "Camera_01": {"giro": 210},
    "gaming_console": {"giro": 200, "elev": 30},
    "digital_wrist_watch": {"giro": 180, "elev": 35},
    "ArmChair_01": {"giro": 20},
    "Drill_01": {"giro": 110},
    "adjustable_wrench": {"elev": 55},
    "stationery_supplies": {"elev": 35},
    "food_avocado_01": {"elev": 30},
    "croissant": {"elev": 35},
}


def limpiar():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def estudio(muestras):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = muestras
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 900
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = -0.3
    w = bpy.data.worlds.new("Mundo")
    sc.world = w
    fondo = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    fondo.inputs["Color"].default_value = (0.85, 0.88, 0.88, 1)
    fondo.inputs["Strength"].default_value = 0.55
    # piso que solo recibe la sombra
    bpy.ops.mesh.primitive_plane_add(size=30)
    bpy.context.object.is_shadow_catcher = True
    # luz principal grande arriba a la izquierda + recorte detrás a la derecha
    for nombre, pos, energia, tam in (("Clave", (-2.2, -2.6, 3.2), 900, 2.6), ("Recorte", (2.6, 2.4, 2.4), 450, 1.6), ("Relleno", (2.8, -2.2, 0.8), 120, 3.0)):
        li = bpy.data.lights.new(nombre, "AREA")
        li.energy, li.size = energia, tam
        ob = bpy.data.objects.new(nombre, li)
        sc.collection.objects.link(ob)
        ob.location = pos
        ob.rotation_euler = (Vector((0, 0, 0.5)) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()


def importar(modelo):
    archivo = next((MODELOS / modelo).glob("*.gltf"))
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(archivo))
    nuevos = [o for o in bpy.data.objects if o not in antes]
    mallas = [o for o in nuevos if o.type == "MESH"]
    bpy.context.view_layer.update()
    # caja que envuelve todo, en coordenadas del mundo
    pts = [o.matrix_world @ Vector(c) for o in mallas for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centro = (mn + mx) / 2
    # el centro del producto (y su base) quedan en el origen: así el giro es sobre sí mismo
    for o in nuevos:
        if o.parent is None:
            o.location -= Vector((centro.x, centro.y, mn.z))
    raiz = bpy.data.objects.new("Producto", None)
    bpy.context.scene.collection.objects.link(raiz)
    for o in nuevos:
        if o.parent is None:
            o.parent = raiz
    esc = 1.0 / max(mx - mn)
    raiz.scale = (esc, esc, esc)
    return raiz, (mx - mn) * esc


def camara(alto, giro, elev):
    sc = bpy.context.scene
    raiz = bpy.data.objects["Producto"]
    raiz.rotation_euler.z = math.radians(giro)
    cam = bpy.data.cameras.new("Cam")
    cam.lens = 70
    ob = bpy.data.objects.new("Cam", cam)
    sc.collection.objects.link(ob)
    sc.camera = ob
    objetivo = Vector((0, 0, alto * 0.48))
    fov = 2 * math.atan(18 / cam.lens)
    dist = (0.72 / math.tan(fov / 2)) * 1.0
    e = math.radians(elev)
    ob.location = objetivo + Vector((0, -math.cos(e), math.sin(e))) * dist
    ob.rotation_euler = (objetivo - ob.location).to_track_quat("-Z", "Y").to_euler()


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--muestras", type=int, default=64)
    p.add_argument("--solo", default="")
    a = p.parse_args(argv)
    SALIDA.mkdir(exist_ok=True)
    modelos = a.solo.split(",") if a.solo else sorted(d.name for d in MODELOS.iterdir() if d.is_dir())
    creditos = {}
    for m in modelos:
        limpiar()
        estudio(a.muestras)
        _, dims = importar(m)
        aj = AJUSTES.get(m, {})
        camara(dims.z, aj.get("giro", 210), aj.get("elev", 18))
        bpy.context.scene.render.filepath = str(SALIDA / f"{m}.png")
        bpy.ops.render.render(write_still=True)
        creditos[m] = json.loads((MODELOS / m / "credito.json").read_text(encoding="utf-8"))
        print("FOTO", m, flush=True)
    (SALIDA / "creditos.json").write_text(json.dumps(creditos, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
