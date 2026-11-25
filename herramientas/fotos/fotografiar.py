"""Fotos de producto del catálogo: modelos CC0 de Poly Haven en un mismo estudio de Blender.

Uso (Blender 5.x):
  blender -b --factory-startup --python herramientas/fotos/fotografiar.py -- --previa
  blender -b --factory-startup --python herramientas/fotos/fotografiar.py -- [--muestras 32] [--solo a,b] [--desde x]

--previa   saca una foto chica y rápida de cada modelo (renders/previa/) para elegir ángulos y colores.
Sin --previa saca, por modelo, las tomas finales en renders/final/:
  {modelo}__frente.png      ángulo principal (el de la tarjeta)
  {modelo}__lado.png        segundo ángulo, para la galería de la ficha
  {modelo}__c-{color}.png   el ángulo principal teñido con cada color de modelos.json

Todas las fotos comparten luz, ángulo y fondo transparente con sombra de contacto: así la grilla de
productos se ve pareja, como en un marketplace bien curado (y no como diez fotos de diez vendedores).
Los ajustes por modelo (giro, elevación, zoom, colores y material a teñir) viven en modelos.json.
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
RENDERS = AQUI / "renders"
AJUSTES = json.loads((AQUI / "modelos.json").read_text(encoding="utf-8"))
# la paleta vive con el código de la web (lib/catalogo/colores.json): la usan las fotos, el seed y los botones de color
COLORES = json.loads((AQUI.parent.parent / "lib" / "catalogo" / "colores.json").read_text(encoding="utf-8"))
LISTA = [l.strip() for l in (AQUI / "modelos.txt").read_text(encoding="utf-8").splitlines()
         if l.strip() and not l.startswith("#")]


def limpiar():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def estudio(muestras, lado):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = muestras
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = lado
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
    for nombre, pos, energia, tam in (("Clave", (-2.2, -2.6, 3.2), 900, 2.6), ("Recorte", (2.6, 2.4, 2.4), 450, 1.6),
                                      ("Relleno", (2.8, -2.2, 0.8), 120, 3.0)):
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
    return raiz, (mx - mn) * esc, mallas


def camara(alto, giro, elev, zoom=1.0):
    sc = bpy.context.scene
    raiz = bpy.data.objects["Producto"]
    raiz.rotation_euler.z = math.radians(giro)
    cam = sc.camera
    if cam is None:
        datos = bpy.data.cameras.new("Cam")
        datos.lens = 70
        cam = bpy.data.objects.new("Cam", datos)
        sc.collection.objects.link(cam)
        sc.camera = cam
    objetivo = Vector((0, 0, alto * 0.48))
    fov = 2 * math.atan(18 / cam.data.lens)
    dist = (0.72 / math.tan(fov / 2)) / zoom
    e = math.radians(elev)
    cam.location = objetivo + Vector((0, -math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (objetivo - cam.location).to_track_quat("-Z", "Y").to_euler()


def material_principal(mallas, nombre=None):
    """El material a teñir: el indicado en modelos.json o el que cubre más superficie."""
    areas = {}
    for o in mallas:
        m = o.matrix_world.to_scale()
        k = abs(m.x * m.y * m.z) ** (2 / 3)
        for p in o.data.polygons:
            if p.material_index < len(o.material_slots):
                mat = o.material_slots[p.material_index].material
                if mat:
                    areas[mat] = areas.get(mat, 0) + p.area * k
    if nombre:
        for mat in areas:
            if nombre.lower() in mat.name.lower():
                return mat
    return max(areas, key=areas.get) if areas else None


def hex_a_lineal(h):
    h = h.lstrip("#")
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb] + [1.0]


def _rango(arbol, valor, de, a, hacia=(0.0, 1.0)):
    n = arbol.nodes.new("ShaderNodeMapRange")
    n.clamp = True
    n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = de, a
    n.inputs["To Min"].default_value, n.inputs["To Max"].default_value = hacia
    arbol.links.new(valor, n.inputs["Value"])
    return n.outputs["Result"]


def _por(arbol, a, b):
    n = arbol.nodes.new("ShaderNodeMath")
    n.operation = "MULTIPLY"
    for i, x in enumerate((a, b)):
        if isinstance(x, float):
            n.inputs[i].default_value = x
        else:
            arbol.links.new(x, n.inputs[i])
    return n.outputs["Value"]


def tenir(mat, hex_color, fuerza=0.9, modo="todo", tono=None, umbral_s=None):
    """Pinta solo la parte que corresponde, manteniendo la luz y la textura del modelo.

    Casi todos los modelos de Poly Haven usan un solo material con un atlas de texturas, así que
    se arma una máscara con el color original:
      claro     superficies claras y poco saturadas (tela blanca, cerámica, plástico blanco) → multiplicar
      saturado  superficies de color (plástico, pintura, cuero); con `tono` se limita a un rango de matiz → mezcla 'Color'
      todo      todo el material → mezcla 'Color'
    Ojo: la textura llega al nodo en espacio lineal (no sRGB), así que los umbrales son lineales.
    umbral_s ajusta la saturación máxima de "claro" (por ejemplo, el acero beige de una pava).
    """
    arbol = mat.node_tree
    bsdf = next((n for n in arbol.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return None
    entrada = bsdf.inputs["Base Color"]
    mezcla = arbol.nodes.new("ShaderNodeMix")
    mezcla.data_type = "RGBA"
    mezcla.blend_type = "MULTIPLY" if modo == "claro" else "COLOR"
    if entrada.links:
        origen = entrada.links[0].from_socket
        arbol.links.new(origen, mezcla.inputs["A"])
    else:
        origen = None
        mezcla.inputs["A"].default_value = entrada.default_value
    mezcla.inputs["B"].default_value = hex_a_lineal(hex_color)
    if modo == "todo" or origen is None:
        mezcla.inputs["Factor"].default_value = fuerza
    else:
        hsv = arbol.nodes.new("ShaderNodeSeparateColor")
        hsv.mode = "HSV"
        arbol.links.new(origen, hsv.inputs["Color"])
        h, sat, val = hsv.outputs["Red"], hsv.outputs["Green"], hsv.outputs["Blue"]
        if modo == "claro":
            lo, hi = umbral_s or (0.20, 0.45)
            m = _por(arbol, _rango(arbol, val, 0.10, 0.30), _rango(arbol, sat, lo, hi, (1.0, 0.0)))
        else:
            # con un matiz elegido alcanza con poca saturación (el verde salvia de un tapizado)
            s_lo, s_hi = (0.08, 0.20) if tono else (0.18, 0.38)
            m = _por(arbol, _rango(arbol, sat, s_lo, s_hi), _rango(arbol, val, 0.02, 0.08))
            if tono:
                centro, ancho = tono
                # distancia circular al matiz elegido
                resta = arbol.nodes.new("ShaderNodeMath")
                resta.operation = "SUBTRACT"
                arbol.links.new(h, resta.inputs[0])
                resta.inputs[1].default_value = centro
                envol = arbol.nodes.new("ShaderNodeMath")
                envol.operation = "PINGPONG"
                arbol.links.new(resta.outputs["Value"], envol.inputs[0])
                envol.inputs[1].default_value = 0.5
                m = _por(arbol, m, _rango(arbol, envol.outputs["Value"], ancho, ancho * 1.6, (1.0, 0.0)))
        arbol.links.new(_por(arbol, m, fuerza), mezcla.inputs["Factor"])
    arbol.links.new(mezcla.outputs["Result"], entrada)
    return mezcla


def sacar(ruta):
    bpy.context.scene.render.filepath = str(ruta)
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--muestras", type=int, default=32)
    p.add_argument("--solo", default="")
    p.add_argument("--desde", default="")
    p.add_argument("--previa", action="store_true")
    p.add_argument("--sin-colores", action="store_true")
    p.add_argument("--sin-lado", action="store_true")
    p.add_argument("--solo-colores", action="store_true", help="solo las tomas de color (frente y lado ya hechos)")
    p.add_argument("--carpeta", default="", help="otra carpeta de salida dentro de renders/ (para pruebas)")
    a = p.parse_args(argv)
    modelos = a.solo.split(",") if a.solo else LISTA
    if a.desde:
        modelos = modelos[modelos.index(a.desde):]
    salida = RENDERS / (a.carpeta or ("previa" if a.previa else "final"))
    salida.mkdir(parents=True, exist_ok=True)
    for m in modelos:
        aj = AJUSTES.get(m, {})
        if aj.get("descartado"):
            continue
        limpiar()
        estudio(6 if a.previa else a.muestras, 320 if a.previa else 800)
        _, dims, mallas = importar(m)
        giro, elev, zoom = aj.get("giro", 210), aj.get("elev", 18), aj.get("zoom", 1.0)
        camara(dims.z, giro, elev, zoom)
        if a.previa:
            sacar(salida / f"{m}.png")
            print("FOTO", m, flush=True)
            continue
        if not a.solo_colores:
            sacar(salida / f"{m}__frente.png")
        if not (aj.get("sin_lado") or a.sin_lado or a.solo_colores):
            camara(dims.z, giro + aj.get("lado_giro", 55), elev + aj.get("lado_elev", 8), zoom)
            sacar(salida / f"{m}__lado.png")
            camara(dims.z, giro, elev, zoom)
        if not a.sin_colores and aj.get("colores"):
            mat = material_principal(mallas, aj.get("material"))
            mezcla = None
            for clave in aj["colores"]:
                if mezcla is None:
                    mezcla = tenir(mat, COLORES[clave]["hex"], aj.get("fuerza", 0.9), aj.get("modo", "todo"), aj.get("tono"), aj.get("umbral_s"))
                else:
                    mezcla.inputs["B"].default_value = hex_a_lineal(COLORES[clave]["hex"])
                sacar(salida / f"{m}__c-{clave}.png")
        print("FOTO", m, flush=True)
    print("FIN", flush=True)


if __name__ == "__main__":
    main()
