"""Modelos propios para el catálogo: lo que más se busca en Ciudad del Este y no existe en CC0.

Poly Haven no tiene celulares, notebooks, auriculares, perfumes ni relojes modernos, y bajar de Sketchfab
pide una cuenta. Por eso estos productos se modelan acá, con primitivas, biseles y materiales de Blender,
y después se fotografían en el mismo estudio que el resto (fotografiar.py los abre desde modelo.blend).
Todo es genérico y de marcas ficticias: ningún diseño copia un producto real.

Uso (Blender 5.x):
  blender -b --factory-startup --python herramientas/fotos/modelar.py -- [--solo tp_celular_media,tp_tws]

Cada modelo queda en modelos/<id>/modelo.blend con su credito.json (medidas reales en mm).
Orientación: el frente mira a -Y (hacia la cámara con giro 0) y la base apoya en z = 0.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Vector

AQUI = Path(__file__).resolve().parent
MODELOS = AQUI / "modelos"
R = math.radians


# ------------------------------------------------------------------------------------------ escena

def escena_vacia():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def enlazar(o):
    bpy.context.scene.collection.objects.link(o)
    return o


def lineal(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# ------------------------------------------------------------------------------------------ materiales

_MATS = {}


def mat(nombre, color="#808080", rug=0.4, metal=0.0, **x):
    """Material Principled con nombre fijo (fotografiar.py tiñe por nombre: Pintura, Esfera, Correa…)."""
    if nombre in _MATS:
        return _MATS[nombre]
    m = bpy.data.materials.new(nombre)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = lineal(color)
    b.inputs["Roughness"].default_value = rug
    b.inputs["Metallic"].default_value = metal
    claves = {"vidrio": "Transmission Weight", "ior": "IOR", "capa": "Coat Weight", "capa_rug": "Coat Roughness",
              "aniso": "Anisotropic", "brillo_tela": "Sheen Weight", "emision": "Emission Strength", "sss": "Subsurface Weight"}
    for k, v in x.items():
        if k in claves:
            b.inputs[claves[k]].default_value = v
    if "emision_color" in x:
        b.inputs["Emission Color"].default_value = lineal(x["emision_color"])
    if "relieve" in x:
        # relieve fino (cuero, tela, plástico texturado) con ruido sobre coordenadas del objeto
        escala, fuerza = x["relieve"]
        nt = m.node_tree
        tc = nt.nodes.new("ShaderNodeTexCoord")
        tex = nt.nodes.new("ShaderNodeTexChecker" if x.get("trama") else "ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = escala
        nt.links.new(tc.outputs["Object"], tex.inputs["Vector"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = fuerza
        nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _MATS[nombre] = m
    return m


def mat_pantalla(nombre, colores, escala=2.0, fuerza=0.85, tipo="manchas", distorsion=0.4, tam=None):
    """Pantalla encendida: un fondo de pantalla procedural que emite luz, con poco reflejo para que se lea
    (en una foto de producto la pantalla se muestra encendida y limpia, no espejando el estudio)."""
    m = mat(nombre, "#050607", 0.22)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    # casi sin reflejo: en una pantalla grande el reflejo de la luz principal tapa la imagen
    b.inputs["Specular IOR Level"].default_value = 0.02
    tc = nt.nodes.new("ShaderNodeTexCoord")
    if tipo == "manchas":
        # degradé de abajo hacia arriba (y un poco en diagonal) deformado por ruido suave:
        # manchas de color como los fondos de pantalla de los celulares actuales
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        coords = tc.outputs["Generated"]
        if tam:
            # en pantallas grandes, coordenadas del objeto llevadas a 0..1 con el tamaño de la pantalla
            mapa = nt.nodes.new("ShaderNodeMapping")
            mapa.inputs["Location"].default_value = (0.5, 0.5, 0.5)
            mapa.inputs["Scale"].default_value = (1 / tam[0], 1, 1 / tam[1])
            nt.links.new(tc.outputs["Object"], mapa.inputs["Vector"])
            coords = mapa.outputs["Vector"]
        nt.links.new(coords, sep.inputs["Vector"])
        ruido = nt.nodes.new("ShaderNodeTexNoise")
        ruido.inputs["Scale"].default_value = escala
        ruido.inputs["Detail"].default_value = 1.0
        ruido.inputs["Distortion"].default_value = distorsion
        nt.links.new(coords, ruido.inputs["Vector"])

        def operar(op, a, b, c=None):
            n = nt.nodes.new("ShaderNodeMath")
            n.operation = op
            for k, x in enumerate((a, b, c)):
                if x is None:
                    continue
                if isinstance(x, (int, float)):
                    n.inputs[k].default_value = x
                else:
                    nt.links.new(x, n.inputs[k])
            return n.outputs["Value"]
        base = operar("MULTIPLY_ADD", sep.outputs["Z"], 0.72, operar("MULTIPLY", sep.outputs["X"], 0.22))
        fac = operar("MULTIPLY_ADD", operar("SUBTRACT", ruido.outputs["Fac"], 0.5), 0.9, base)
        fac.node.use_clamp = True
    else:  # radial (relojes inteligentes): oscuro al centro y luz en el borde
        largo = nt.nodes.new("ShaderNodeVectorMath")
        largo.operation = "LENGTH"
        nt.links.new(tc.outputs["Object"], largo.inputs[0])
        por = nt.nodes.new("ShaderNodeMath")
        por.operation = "MULTIPLY"
        por.inputs[1].default_value = escala
        nt.links.new(largo.outputs["Value"], por.inputs[0])
        fac = por.outputs["Value"]
    rampa = nt.nodes.new("ShaderNodeValToRGB")
    rampa.color_ramp.interpolation = "EASE"
    # los elementos se crean en orden (new() los inserta ordenados); mover la posición de uno ya creado
    # desde Python no reordena la lista y la rampa se evalúa mal
    el = rampa.color_ramp.elements
    for i in range(1, len(colores) - 1):
        el.new(i / (len(colores) - 1))
    for e, c in zip(el, colores):
        e.color = lineal(c)
    nt.links.new(fac, rampa.inputs["Fac"])
    nt.links.new(rampa.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = fuerza
    return m


def materiales_base():
    return {
        "vidrio_negro": mat("VidrioNegro", "#060708", 0.05, capa=1.0, capa_rug=0.02),
        "goma": mat("Goma", "#1c1d1f", 0.7, relieve=(900, 0.08)),
        "metal": mat("Metal", "#c9cccd", 0.22, 1.0, aniso=0.5),
        "metal_oscuro": mat("MetalOscuro", "#3a3c3f", 0.3, 1.0, aniso=0.4),
        "dorado": mat("Dorado", "#d8b46a", 0.2, 1.0),
        "lente": mat("Lente", "#0b0d12", 0.02, capa=1.0, capa_rug=0.0, ior=1.6),
        "blanco_luz": mat("LuzBlanca", "#ffffff", 0.3, emision=6.0, emision_color="#ffffff"),
        "vidrio": mat("Vidrio", "#ffffff", 0.01, vidrio=1.0, ior=1.47),
        "plastico_negro": mat("PlasticoNegro", "#17181a", 0.45),
    }


# ------------------------------------------------------------------------------------------ geometría

def _objeto(nombre, bm, material=None, suave=True, angulo=35):
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    o = enlazar(bpy.data.objects.new(nombre, me))
    if material:
        o.data.materials.append(material)
    if suave:
        o.data.shade_smooth()
        o.data.set_sharp_from_angle(angle=R(angulo))
    return o


def aplicar(o):
    """Aplica los modificadores (bisel) sin operadores: copia la malla evaluada."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    vieja = o.data
    o.data = me
    bpy.data.meshes.remove(vieja)
    o.data.shade_smooth()
    o.data.set_sharp_from_angle(angle=R(35))
    return o


def biselar(o, ancho, segs=3, angulo=30):
    if ancho <= 0:
        return o
    m = o.modifiers.new("Bisel", "BEVEL")
    m.width = ancho
    m.segments = segs
    m.limit_method = "ANGLE"
    m.angle_limit = R(angulo)
    return aplicar(o)


def colocar(o, pos=(0, 0, 0), rot=(0, 0, 0), padre=None):
    o.location = pos
    o.rotation_euler = Euler([R(a) for a in rot])
    if padre:
        o.parent = padre
    return o


def rect_redondeado(ancho, alto, radio, segs=8):
    r = min(radio, ancho / 2 - 1e-5, alto / 2 - 1e-5)
    if r <= 1e-6:
        return [(ancho / 2, alto / 2), (-ancho / 2, alto / 2), (-ancho / 2, -alto / 2), (ancho / 2, -alto / 2)]
    pts = []
    for cx, cz, a0 in ((ancho / 2 - r, alto / 2 - r, 0), (-ancho / 2 + r, alto / 2 - r, 90),
                       (-ancho / 2 + r, -alto / 2 + r, 180), (ancho / 2 - r, -alto / 2 + r, 270)):
        for i in range(segs + 1):
            a = R(a0 + 90 * i / segs)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def losa(nombre, ancho, alto, grosor, radio, bisel=0.0, material=None, pos=(0, 0, 0), rot=(0, 0, 0), padre=None, segs=8, perfil=None):
    """Rectángulo redondeado en el plano XZ, con espesor en Y y centrado en el origen (pantallas, cuerpos, tapas)."""
    bm = bmesh.new()
    pts = perfil or rect_redondeado(ancho, alto, radio, segs)
    frente = [bm.verts.new((x, -grosor / 2, z)) for x, z in pts]
    atras = [bm.verts.new((x, grosor / 2, z)) for x, z in pts]
    bm.faces.new(frente)
    bm.faces.new(atras[::-1])
    n = len(pts)
    for i in range(n):
        bm.faces.new((frente[i], atras[i], atras[(i + 1) % n], frente[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = _objeto(nombre, bm, material)
    biselar(o, bisel)
    return colocar(o, pos, rot, padre)


def caja(nombre, tam, material=None, pos=(0, 0, 0), rot=(0, 0, 0), bisel=0.0, segs=3, padre=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=tam, verts=bm.verts[:])
    o = _objeto(nombre, bm, material)
    if bisel:
        m = o.modifiers.new("Bisel", "BEVEL")
        m.width = bisel
        m.segments = segs
        aplicar(o)
    return colocar(o, pos, rot, padre)


def cilindro(nombre, radio, alto, material=None, pos=(0, 0, 0), rot=(0, 0, 0), bisel=0.0, segs=64, radio2=None, padre=None):
    """Cilindro (o cono si radio2) a lo largo de Z, centrado."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=radio,
                          radius2=radio if radio2 is None else radio2, depth=alto)
    o = _objeto(nombre, bm, material)
    biselar(o, bisel)
    return colocar(o, pos, rot, padre)


def esfera(nombre, radio, material=None, pos=(0, 0, 0), escala=(1, 1, 1), rot=(0, 0, 0), padre=None, corte=None):
    """Esfera o elipsoide. Con `corte`, se rebana por debajo de esa altura (local) y se tapa: base plana."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=radio)
    bmesh.ops.scale(bm, vec=escala, verts=bm.verts[:])
    if corte is not None:
        geo = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geo, plane_co=(0, 0, corte), plane_no=(0, 0, 1), clear_inner=True)
        bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
    o = _objeto(nombre, bm, material, angulo=80)
    return colocar(o, pos, rot, padre)


def toro(nombre, radio, grosor, material=None, pos=(0, 0, 0), rot=(0, 0, 0), escala=(1, 1, 1), padre=None, n=96, m=24):
    bm = bmesh.new()
    filas = []
    for i in range(n):
        a = 2 * math.pi * i / n
        fila = []
        for j in range(m):
            b = 2 * math.pi * j / m
            rr = radio + grosor * math.cos(b)
            fila.append(bm.verts.new((rr * math.cos(a) * escala[0], rr * math.sin(a) * escala[1], grosor * math.sin(b) * escala[2])))
        filas.append(fila)
    for i in range(n):
        for j in range(m):
            bm.faces.new((filas[i][j], filas[(i + 1) % n][j], filas[(i + 1) % n][(j + 1) % m], filas[i][(j + 1) % m]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = _objeto(nombre, bm, material, angulo=80)
    return colocar(o, pos, rot, padre)


def tubo(nombre, puntos, radio, material=None, padre=None, lados=20, cerrado=False, ancho=None, eje=(1, 0, 0)):
    """Tubo a lo largo de una polilínea (vincha, cable, correa). Con `ancho`, la sección es una cinta plana
    de ese ancho en la dirección `eje` (proyectada para quedar perpendicular al recorrido) y espesor 2·radio."""
    bm = bmesh.new()
    anillos = []
    n = len(puntos)
    eje = Vector(eje)
    for i, p in enumerate(puntos):
        p = Vector(p)
        a = Vector(puntos[(i + 1) % n] if cerrado else puntos[min(i + 1, n - 1)])
        b = Vector(puntos[(i - 1) % n] if cerrado else puntos[max(i - 1, 0)])
        t = (a - b).normalized()
        if ancho:
            u = (eje - t * eje.dot(t)).normalized()
        else:
            ref = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 0, 1))
            u = t.cross(ref).normalized()
        v = t.cross(u).normalized()
        anillo = []
        for k in range(lados):
            ang = 2 * math.pi * k / lados
            c, s_ = math.cos(ang), math.sin(ang)
            if ancho:
                off = u * (ancho / 2) * max(-1, min(1, c * 1.5)) + v * radio * max(-1, min(1, s_ * 1.5))
            else:
                off = (u * c + v * s_) * radio
            anillo.append(bm.verts.new(p + off))
        anillos.append(anillo)
    tramos = n if cerrado else n - 1
    for i in range(tramos):
        a, b = anillos[i], anillos[(i + 1) % n]
        for k in range(lados):
            bm.faces.new((a[k], b[k], b[(k + 1) % lados], a[(k + 1) % lados]))
    if not cerrado:
        bm.faces.new(anillos[0][::-1])
        bm.faces.new(anillos[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = _objeto(nombre, bm, material, angulo=70)
    if padre:
        o.parent = padre
    return o


def texto(nombre, cuerpo, tam, material, pos=(0, 0, 0), rot=(90, 0, 0), padre=None, espesor=0.0, negrita=False):
    """Texto convertido a malla. Con rot=(90,0,0) queda parado y mirando a -Y."""
    cu = bpy.data.curves.new(nombre, "FONT")
    cu.body = cuerpo
    cu.size = tam
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = espesor
    if negrita:
        cu.offset = tam * 0.012
    tmp = enlazar(bpy.data.objects.new(nombre + "_c", cu))
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    o = enlazar(bpy.data.objects.new(nombre, me))
    o.data.materials.clear()
    o.data.materials.append(material)
    return colocar(o, pos, rot, padre)


def vacio(nombre, pos=(0, 0, 0), rot=(0, 0, 0), padre=None):
    e = enlazar(bpy.data.objects.new(nombre, None))
    return colocar(e, pos, rot, padre)


def arco(radio, desde, hasta, n=48, plano="XZ", centro=(0, 0, 0)):
    cx, cy, cz = centro
    pts = []
    for i in range(n + 1):
        a = R(desde + (hasta - desde) * i / n)
        if plano == "XZ":
            pts.append((cx + radio * math.cos(a), cy, cz + radio * math.sin(a)))
        else:  # YZ
            pts.append((cx, cy + radio * math.cos(a), cz + radio * math.sin(a)))
    return pts


# ------------------------------------------------------------------------------------------ celulares y tablets

def telefono(p, cuerpo, pantalla, padre, w=0.076, h=0.164, t=0.0082, radio=0.010, modulo="doble", reloj="10:24"):
    """Un celular parado, pantalla hacia -Y. `modulo`: doble, triple o simple (el bloque de cámaras de atrás)."""
    losa("cuerpo", w, h, t, radio, 0.0022, cuerpo, padre=padre)
    losa("vidrio", w - 0.0012, h - 0.0012, 0.0006, radio - 0.0006, 0.0002, p["vidrio_negro"], pos=(0, -t / 2 - 0.0001, 0), padre=padre)
    losa("pantalla", w - 0.0050, h - 0.0050, 0.0003, radio - 0.0024, 0, pantalla, pos=(0, -t / 2 - 0.00042, 0), padre=padre)
    cilindro("frontal", 0.0016, 0.0004, p["lente"], pos=(0, -t / 2 - 0.0006, h / 2 - 0.0075), rot=(90, 0, 0), padre=padre)
    if reloj:
        texto("hora", reloj, 0.0125, p["blanco_luz"], pos=(0, -t / 2 - 0.0006, h * 0.27), padre=padre)
    # botones del costado derecho
    for z, largo in ((0.035, 0.024), (0.005, 0.012)):
        caja("boton", (0.0012, 0.0028, largo), cuerpo, pos=(w / 2 + 0.0003, 0, z), bisel=0.0005, padre=padre)
    # cámaras de atrás (+Y)
    y = t / 2
    if modulo == "triple":
        losa("modulo", 0.038, 0.040, 0.0018, 0.010, 0.0006, cuerpo, pos=(-w / 2 + 0.024, y + 0.0009, h / 2 - 0.026), padre=padre)
        lentes = ((-0.0085, 0.0095), (-0.0085, -0.0095), (0.0095, 0))
        r_lente = 0.0072
        base = (-w / 2 + 0.024, h / 2 - 0.026)
    elif modulo == "doble":
        losa("modulo", 0.022, 0.040, 0.0015, 0.0105, 0.0006, cuerpo, pos=(-w / 2 + 0.017, y + 0.0008, h / 2 - 0.026), padre=padre)
        lentes = ((0, 0.0092), (0, -0.0092))
        r_lente = 0.0068
        base = (-w / 2 + 0.017, h / 2 - 0.026)
    else:
        lentes = ((0, 0),)
        r_lente = 0.0055
        base = (-w / 2 + 0.014, h / 2 - 0.016)
    for i, (dx, dz) in enumerate(lentes):
        cilindro("aro", r_lente, 0.0016, p["metal_oscuro"], pos=(base[0] + dx, y + 0.0022, base[1] + dz), rot=(90, 0, 0), bisel=0.0003, padre=padre)
        cilindro("lente", r_lente * 0.72, 0.0006, p["lente"], pos=(base[0] + dx, y + 0.0031, base[1] + dz), rot=(90, 0, 0), padre=padre)
    cilindro("flash", 0.0022, 0.0006, mat("Flash", "#f4efe2", 0.2), pos=(base[0] + 0.011, y + 0.001, base[1] + (0.012 if modulo != "simple" else 0)), rot=(90, 0, 0), padre=padre)


def par_de_celulares(p, cuerpo, pantalla, **kw):
    """La foto clásica de marketplace: uno de frente y otro de espaldas, un poco atrás."""
    frente = vacio("frente", pos=(-0.024, -0.012, 0), rot=(0, 0, -8))
    atras = vacio("atras", pos=(0.03, 0.035, 0), rot=(0, 0, 180 + 14))
    h = kw.get("h", 0.164)
    for e in (frente, atras):
        g = vacio("tel", pos=(0, 0, h / 2), padre=e)
        telefono(p, cuerpo, pantalla, g, **kw)


def m_celular_media(p):
    par_de_celulares(p, mat("Pintura", "#4a4f52", 0.28, capa=0.6, capa_rug=0.1),
                     mat_pantalla("Pantalla", ["#081a2e", "#14496b", "#2e8f86", "#a8dcc8"], 1.8), modulo="doble")


def m_celular_pro(p):
    par_de_celulares(p, mat("Pintura", "#b9bcbd", 0.18, 0.6, capa=0.8, capa_rug=0.05),
                     mat_pantalla("Pantalla", ["#1a1033", "#3b2d6b", "#8a6cc0", "#f2a7bb"], 1.6), modulo="triple", w=0.078, h=0.165, radio=0.012)


def m_celular_entrada(p):
    par_de_celulares(p, mat("Pintura", "#22345a", 0.35, capa=0.3),
                     mat_pantalla("Pantalla", ["#0d2615", "#2f6b3a", "#7fc08f", "#e4f2c8"], 2.2), modulo="simple", w=0.077, h=0.166, t=0.0091, radio=0.008)


def m_celular_basico(p):
    """Celular de teclas: pantalla chica arriba y teclado numérico."""
    g = vacio("tel", pos=(0, 0, 0.065), rot=(0, 0, 0))
    cuerpo = mat("Pintura", "#232526", 0.4)
    w, h, t = 0.050, 0.124, 0.013
    losa("cuerpo", w, h, t, 0.008, 0.003, cuerpo, padre=g)
    losa("marco_pantalla", w - 0.006, 0.050, 0.0008, 0.004, 0.0002, p["vidrio_negro"], pos=(0, -t / 2 - 0.0002, 0.028), padre=g)
    losa("pantalla", w - 0.014, 0.036, 0.0004, 0.0015, 0, mat_pantalla("Pantalla", ["#2e6f70", "#9cc9b0", "#e9eae6"], 2.5, 1.4), pos=(0, -t / 2 - 0.0007, 0.030), padre=g)
    texto("hora", "10:24", 0.008, p["blanco_luz"], pos=(0, -t / 2 - 0.0010, 0.034), padre=g)
    tecla = mat("Teclas", "#3a3d40", 0.35)
    for f in range(4):
        for c in range(3):
            losa("tecla", 0.011, 0.0068, 0.0016, 0.0025, 0.0006, tecla, pos=(-0.013 + c * 0.013, -t / 2 - 0.0004, -0.012 - f * 0.0095), padre=g)
    losa("navegador", 0.026, 0.0085, 0.0018, 0.004, 0.0006, tecla, pos=(0, -t / 2 - 0.0004, -0.002 + 0.0005), padre=g)
    cilindro("aro", 0.0036, 0.0012, p["metal_oscuro"], pos=(0.0, t / 2 + 0.0005, 0.044), rot=(90, 0, 0), padre=g)
    cilindro("lente", 0.0024, 0.0006, p["lente"], pos=(0.0, t / 2 + 0.0011, 0.044), rot=(90, 0, 0), padre=g)


def m_tablet(p):
    """Tablet de 10" apaisada: una de frente y otra de espaldas."""
    cuerpo = mat("Pintura", "#4a4f52", 0.3, 0.5, aniso=0.3)
    pantalla = mat_pantalla("Pantalla", ["#081a2e", "#22345a", "#5b8fb9", "#d6e6f2"], 1.6)
    frente = vacio("frente", pos=(-0.03, -0.02, 0), rot=(0, 0, -6))
    atras = vacio("atras", pos=(0.045, 0.05, 0), rot=(0, 0, 180 + 12))
    for e in (frente, atras):
        g = vacio("tab", pos=(0, 0, 0.0805), padre=e)
        telefono(p, cuerpo, pantalla, g, w=0.245, h=0.161, t=0.0068, radio=0.014, modulo="simple")


def m_powerbank(p):
    g = vacio("pb", pos=(0, 0, 0))
    cuerpo = mat("Pintura", "#232526", 0.5, relieve=(500, 0.04))
    losa("cuerpo", 0.072, 0.148, 0.027, 0.012, 0.009, cuerpo, pos=(0, 0, 0.074), rot=(0, 0, 0), padre=g)
    caja("puerto", (0.009, 0.004, 0.0032), p["plastico_negro"], pos=(-0.012, -0.0, 0.1485), bisel=0.0012, padre=g)
    caja("puerto2", (0.012, 0.005, 0.004), p["plastico_negro"], pos=(0.012, 0.0, 0.1485), bisel=0.0005, padre=g)
    for i in range(4):
        cilindro("led", 0.0011, 0.0006, mat("Led", "#ffffff", 0.3, emision=4, emision_color="#7fe0c4"), pos=(-0.0075 + i * 0.005, -0.0137, 0.128), rot=(90, 0, 0), padre=g)
    texto("marca", "20 000 mAh", 0.0062, mat("Rotulo", "#c9cccd", 0.4), pos=(0, -0.01355, 0.03), padre=g)


def m_cargador(p):
    """Cargador rápido de 65 W con dos USB-C y uno USB-A, y su cable enrollado."""
    cuerpo = mat("Pintura", "#e9eae6", 0.35, capa=0.3)
    losa("cuerpo", 0.052, 0.052, 0.030, 0.010, 0.006, cuerpo, pos=(0, 0, 0.026))
    for i, (x, z) in enumerate(((-0.010, 0.034), (0.010, 0.034), (0.0, 0.018))):
        tam = (0.0092, 0.004, 0.0032) if i < 2 else (0.0125, 0.004, 0.0048)
        caja("puerto", tam, p["plastico_negro"], pos=(x, -0.0151, z), bisel=0.0012 if i < 2 else 0.0004)
    for x in (-0.0063, 0.0063):
        caja("pata", (0.0016, 0.016, 0.0065), p["metal"], pos=(x, 0.022, 0.026), bisel=0.0004)
    texto("w", "65W", 0.0065, mat("Rotulo", "#4a4f52", 0.4), pos=(0, -0.0151, 0.006))
    puntos = [(0.085 + 0.045 * math.cos(R(a)), 0.02 + 0.045 * math.sin(R(a)), 0.0024 + 0.0048 * (a / 360)) for a in range(0, 720 + 1, 8)]
    tubo("cable", puntos, 0.0022, cuerpo)
    caja("ficha", (0.008, 0.022, 0.006), cuerpo, pos=(0.130, 0.0, 0.0105), bisel=0.002)


# ------------------------------------------------------------------------------------------ computación

def teclado_de_notebook(p, padre, ancho, prof, z, retro=False):
    tecla = mat("Teclas", "#1c1d1f", 0.5)
    filas, cols, paso = 5, 14, ancho / 14.6
    for f in range(filas):
        for c in range(cols):
            x = -ancho / 2 + paso * (c + 0.8)
            y = 0.024 - prof / 2 + paso * (f + 0.6)
            caja("tecla", (paso * 0.84, paso * 0.84, 0.0016), tecla, pos=(x, y, z), bisel=0.0007, padre=padre)
    if retro:
        luz = mat("Retroiluminacion", "#ffffff", 0.5, emision=3.5, emision_color="#2be0c0")
        caja("bajo_teclas", (ancho, prof * 1.02, 0.0004), luz, pos=(0, 0, z - 0.0009), padre=padre)


def notebook(p, cuerpo, pantalla, w=0.357, d=0.236, t=0.018, apertura=108, gamer=False):
    base = vacio("base", pos=(0, 0, t / 2))
    losa("base", w, d, t, 0.010, 0.003, cuerpo, rot=(90, 0, 0), padre=base)
    zona = mat("Hundido", "#111214", 0.5) if gamer else cuerpo
    teclado_de_notebook(p, base, w * 0.86, d * 0.38, t / 2 + 0.0004, retro=gamer)
    losa("touchpad", 0.12, 0.075, 0.0006, 0.006, 0.0002, mat("Touchpad", "#808487" if not gamer else "#1c1d1f", 0.25, 0.3 if not gamer else 0),
         pos=(0, -d / 2 + 0.050, t / 2 + 0.0001), rot=(90, 0, 0), padre=base)
    # bisagra en el borde de atrás; la tapa se abre hacia atrás
    bisagra = vacio("bisagra", pos=(0, d / 2 - 0.004, t), rot=(-apertura, 0, 0))
    tapa = vacio("tapa", pos=(0, 0, 0), padre=bisagra)
    losa("tapa", w, d, 0.006, 0.010, 0.0022, cuerpo, pos=(0, -d / 2, 0.003), rot=(90, 0, 0), padre=tapa)
    losa("marco", w - 0.003, d - 0.003, 0.0006, 0.009, 0.0002, p["vidrio_negro"], pos=(0, -d / 2, -0.0002), rot=(90, 0, 0), padre=tapa)
    losa("pantalla", w - 0.016, d - 0.026, 0.0003, 0.002, 0, pantalla, pos=(0, -d / 2 - 0.004, -0.0006), rot=(90, 0, 0), padre=tapa)
    cilindro("camara", 0.0013, 0.0003, p["lente"], pos=(0, -d + 0.0045, -0.0007), padre=tapa)
    if gamer:
        for x in (-w / 2 + 0.03, w / 2 - 0.03):
            caja("rejilla", (0.05, 0.004, 0.006), mat("Rejilla", "#0b0c0d", 0.6), pos=(x, d / 2 + 0.0015, t / 2), padre=base)
        caja("franja", (w * 0.5, 0.0012, 0.0015), mat("LuzGamer", "#ffffff", 0.4, emision=2.5, emision_color="#14d9b0"), pos=(0, -d / 2 - 0.0002, t / 2 - 0.004), padre=base)


def m_notebook(p):
    notebook(p, mat("Pintura", "#4a4f52", 0.32, 0.6, aniso=0.4), mat_pantalla("Pantalla", ["#081a2e", "#14496b", "#2e8f86", "#a8dcc8"], 2.0))


def m_notebook_ultra(p):
    notebook(p, mat("Pintura", "#b9bcbd", 0.24, 1.0, aniso=0.6), mat_pantalla("Pantalla", ["#1a1033", "#3b2d6b", "#a88bc7", "#f6c9d4"], 1.8),
             w=0.312, d=0.221, t=0.0145, apertura=112)


def m_notebook_gamer(p):
    notebook(p, mat("Pintura", "#1c1d1f", 0.45), mat_pantalla("Pantalla", ["#050607", "#0b1430", "#118a74", "#2be0c0"], 2.2),
             w=0.360, d=0.268, t=0.026, apertura=104, gamer=True)


def m_monitor(p):
    cuerpo = mat("Pintura", "#232526", 0.4)
    w, h = 0.615, 0.365
    g = vacio("monitor", pos=(0, 0, 0.115 + h / 2), rot=(-4, 0, 0))
    losa("panel", w, h, 0.012, 0.004, 0.002, cuerpo, padre=g)
    losa("marco", w - 0.002, h - 0.002, 0.0006, 0.003, 0.0002, p["vidrio_negro"], pos=(0, -0.0062, 0), padre=g)
    losa("pantalla", w - 0.012, h - 0.024, 0.0003, 0.001, 0, mat_pantalla("Pantalla", ["#0d2615", "#2f6b3a", "#7fc08f", "#e4f2c8"], 2.0),
         pos=(0, -0.0066, 0.005), padre=g)
    losa("espalda", w * 0.5, h * 0.55, 0.025, 0.02, 0.008, cuerpo, pos=(0, 0.016, 0), padre=g)
    caja("cuello", (0.05, 0.022, 0.17), cuerpo, pos=(0, 0.036, 0.095), bisel=0.006)
    losa("pie", 0.24, 0.17, 0.010, 0.03, 0.003, cuerpo, pos=(0, 0.035, 0.005), rot=(90, 0, 0))


def m_teclado(p):
    """Teclado mecánico compacto con teclas de perfil alto y luz de abajo."""
    cuerpo = mat("Pintura", "#232526", 0.45)
    losa("chasis", 0.32, 0.115, 0.022, 0.008, 0.003, cuerpo, pos=(0, 0, 0.011), rot=(90 + 6, 0, 0))
    g = vacio("teclas", pos=(0, 0, 0.0235), rot=(6, 0, 0))
    tecla = mat("Teclas", "#e9eae6", 0.55)
    acento = mat("Acento", "#d9772b", 0.5)
    paso = 0.019
    for f in range(5):
        for c in range(15):
            x = -0.140 + c * paso
            y = -0.040 + f * paso
            especial = (f == 0 and c == 14) or (f == 4 and c == 0)
            cilindro("t", paso * 0.48, 0.008, acento if especial else tecla, pos=(x, y, 0.002), segs=4, radio2=paso * 0.36,
                     rot=(0, 0, 45), bisel=0.0012, padre=g)
    luz = mat("LuzTeclado", "#ffffff", 0.4, emision=2.5, emision_color="#2be0c0")
    caja("luz", (0.30, 0.10, 0.0008), luz, pos=(0, 0, -0.002), padre=g)


def m_mouse(p):
    cuerpo = mat("Pintura", "#232526", 0.3, capa=0.7)
    esfera("cuerpo", 0.031, cuerpo, pos=(0, 0, 0.0), escala=(1.0, 1.95, 0.95), corte=-0.006)
    cilindro("rueda", 0.0068, 0.0042, p["goma"], pos=(0, -0.024, 0.0245), rot=(0, 90, 0), bisel=0.001)
    caja("raya", (0.0007, 0.040, 0.006), p["plastico_negro"], pos=(0, -0.046, 0.0195), rot=(-24, 0, 0))
    caja("pie", (0.050, 0.096, 0.002), p["plastico_negro"], pos=(0, 0, -0.006), bisel=0.0008)


def m_ssd(p):
    cuerpo = mat("Pintura", "#4a4f52", 0.4, 0.4, relieve=(400, 0.05))
    g = vacio("ssd", rot=(0, 0, 0))
    losa("cuerpo", 0.058, 0.098, 0.011, 0.012, 0.004, cuerpo, pos=(0, 0, 0.049), padre=g)
    losa("goma", 0.062, 0.102, 0.008, 0.014, 0.003, p["goma"], pos=(0, 0.0005, 0.049), padre=g)
    cilindro("agujero", 0.004, 0.012, p["plastico_negro"], pos=(0.019, 0, 0.088), rot=(90, 0, 0), padre=g)
    texto("cap", "1 TB", 0.010, mat("Rotulo", "#e9eae6", 0.4), pos=(0, -0.0057, 0.04), padre=g)
    caja("usbc", (0.0092, 0.004, 0.0032), p["plastico_negro"], pos=(0, 0, 0.0005), rot=(90, 0, 0), bisel=0.001, padre=g)


def m_router(p):
    cuerpo = mat("Pintura", "#232526", 0.35, capa=0.4)
    losa("cuerpo", 0.24, 0.15, 0.036, 0.02, 0.008, cuerpo, pos=(0, 0, 0.018), rot=(90, 0, 0))
    for i in range(7):
        cilindro("led", 0.0016, 0.0006, mat("Led", "#ffffff", 0.3, emision=4, emision_color="#7fe0c4"), pos=(-0.045 + i * 0.015, -0.0755, 0.020), rot=(90, 0, 0))
    for i, x in enumerate((-0.09, -0.03, 0.03, 0.09)):
        e = vacio("antena", pos=(x, 0.07, 0.03), rot=(-12 if i % 2 else 8, (i - 1.5) * 6, 0))
        losa("antena", 0.018, 0.16, 0.007, 0.0089, 0.0025, cuerpo, pos=(0, 0, 0.08), padre=e)


# ------------------------------------------------------------------------------------------ audio

def m_tws(p):
    """Auriculares inalámbricos: el estuche cerrado y los dos auriculares delante, apoyados."""
    cuerpo = mat("Pintura", "#232526", 0.2, capa=0.8, capa_rug=0.05)
    goma = mat("Almohadilla", "#3a3c3f", 0.6)
    losa("base", 0.062, 0.030, 0.027, 0.012, 0.008, cuerpo, pos=(0, 0.02, 0.015))
    losa("tapa", 0.062, 0.018, 0.027, 0.009, 0.008, cuerpo, pos=(0, 0.02, 0.0395))
    caja("costura", (0.0625, 0.0275, 0.0009), mat("Costura", "#0b0c0d", 0.6), pos=(0, 0.02, 0.0303))
    cilindro("led", 0.0011, 0.0005, mat("Led", "#ffffff", 0.3, emision=3, emision_color="#14d9b0"), pos=(0, 0.0063, 0.022), rot=(90, 0, 0))
    texto("marca", "PIRA", 0.0045, mat("Rotulo", "#b9bcbd", 0.3, 0.8), pos=(0, 0.0063, 0.038))
    for lado, x in ((1, -0.026), (-1, 0.030)):
        g = vacio("aur", pos=(x, -0.032, 0.0), rot=(0, 0, 35 * lado))
        esfera("cabeza", 0.0105, cuerpo, pos=(0, 0, 0.0105), escala=(1.0, 0.95, 1.0), padre=g)
        esfera("goma", 0.0062, goma, pos=(0, -0.0105, 0.0115), escala=(1, 0.8, 1), padre=g)
        cilindro("palito", 0.0040, 0.024, cuerpo, pos=(0, 0.017, 0.006), rot=(-80, 0, 0), radio2=0.0034, bisel=0.001, padre=g)
        cilindro("micro", 0.0035, 0.0006, p["metal"], pos=(0, 0.0288, 0.0039), rot=(-80, 0, 0), padre=g)


def vincha(p, cuerpo, almohadilla, gamer=False):
    radio = 0.092
    centro = (0, 0, 0.125)
    tubo("vincha", arco(radio, 5, 175, 64, "XZ", centro), 0.0055, cuerpo, ancho=0.030, eje=(0, 1, 0))
    tubo("acolchado", arco(radio - 0.0085, 32, 148, 50, "XZ", centro), 0.0045, almohadilla, ancho=0.026, eje=(0, 1, 0))
    for lado in (1, -1):
        x = lado * 0.094
        tubo("horquilla", [(lado * 0.0915, 0, 0.134), (lado * 0.0935, 0, 0.126), (x, 0, 0.118)], 0.0042, p["metal_oscuro"] if not gamer else cuerpo)
        g = vacio("copa", pos=(x, 0, 0.075))
        cilindro("copa", 0.043, 0.030, cuerpo, rot=(0, 90, 0), bisel=0.008, padre=g).scale = (1.25, 1, 1)
        toro("almohadilla", 0.029, 0.011, almohadilla, pos=(-lado * 0.019, 0, 0), rot=(0, 90, 0), escala=(1.25, 1.0, 1.0), padre=g)
        cilindro("tela", 0.030, 0.002, mat("TelaInterior", "#111213", 0.9, brillo_tela=0.4), pos=(-lado * 0.016, 0, 0), rot=(0, 90, 0), padre=g).scale = (1.25, 1, 1)
        if gamer:
            toro("luz", 0.032, 0.0018, mat("LuzGamer", "#ffffff", 0.3, emision=2.5, emision_color="#14d9b0"), pos=(lado * 0.0155, 0, 0), rot=(0, 90, 0),
                 escala=(1.25, 1, 1), padre=g)
        else:
            texto("marca", "PIRA", 0.009, mat("Rotulo", "#b9bcbd", 0.3, 0.8), pos=(lado * 0.0152, 0, 0), rot=(90, 0, 90 * lado), padre=g)
    if gamer:
        tubo("microfono", [(-0.104, -0.012, 0.062), (-0.10, -0.05, 0.045), (-0.085, -0.08, 0.032), (-0.062, -0.096, 0.028)], 0.0032, cuerpo)
        esfera("capsula", 0.0065, mat("Espuma", "#1a1b1c", 0.95, relieve=(1500, 0.2)), pos=(-0.059, -0.098, 0.028))


def m_vincha(p):
    vincha(p, mat("Pintura", "#232526", 0.55, relieve=(600, 0.03)), mat("Almohadilla", "#2a2b2d", 0.75, relieve=(1200, 0.05)))


def m_gamer(p):
    vincha(p, mat("Pintura", "#17181a", 0.45), mat("Almohadilla", "#202123", 0.8, relieve=(1400, 0.08)), gamer=True)


def m_parlante(p):
    """Parlante Bluetooth cilíndrico con tela, tapas de goma y correa."""
    tela = mat("Pintura", "#22345a", 0.85, brillo_tela=0.6, relieve=(1600, 0.25), trama=True)
    g = vacio("parlante", pos=(0, 0, 0.042), rot=(0, 90, 0))
    cilindro("cuerpo", 0.040, 0.165, tela, padre=g, bisel=0.004)
    for z in (-0.088, 0.088):
        cilindro("tapa", 0.042, 0.014, p["goma"], pos=(0, 0, z), padre=g, bisel=0.005)
        cilindro("radiador", 0.028, 0.002, mat("Pasivo", "#2b2d30", 0.4), pos=(0, 0, z * 1.085), padre=g)
    for i, s in enumerate(("−", "▶", "+")):
        cilindro("tecla", 0.0045, 0.002, p["goma"], pos=(-0.0405, 0, -0.012 + i * 0.012), rot=(0, 90, 0), padre=g)
    texto("logo", "PIRA", 0.012, mat("Rotulo", "#e9eae6", 0.4), pos=(0, -0.0408, 0), rot=(90, -90, 0), padre=g)
    tubo("correa", arco(0.013, 180, 0, 24, "XZ", (0.083, 0, 0.074)), 0.0016, p["goma"], ancho=0.012, eje=(0, 1, 0))


def m_parlante_fiesta(p):
    cuerpo = mat("Pintura", "#17181a", 0.6, relieve=(500, 0.05))
    w, d, h = 0.30, 0.27, 0.56
    losa("caja", w, h, d, 0.02, 0.008, cuerpo, pos=(0, 0, h / 2))
    rejilla = mat("Rejilla", "#0b0c0d", 0.6, relieve=(900, 0.3), trama=True)
    for z, r in ((0.17, 0.105), (0.40, 0.07)):
        cilindro("woofer", r, 0.006, rejilla, pos=(0, -d / 2 - 0.002, z), rot=(90, 0, 0), bisel=0.002)
        toro("luz", r + 0.006, 0.003, mat("LuzFiesta", "#ffffff", 0.3, emision=2.5, emision_color="#ff3d7f"), pos=(0, -d / 2 - 0.004, z), rot=(90, 0, 0))
    caja("panel", (0.20, 0.004, 0.04), p["vidrio_negro"], pos=(0, -d / 2 - 0.002, 0.515), bisel=0.002)
    for i in range(5):
        cilindro("perilla", 0.0065, 0.008, p["metal"], pos=(-0.06 + i * 0.03, -d / 2 - 0.006, 0.515), rot=(90, 0, 0), bisel=0.001)
    tubo("manija", [(-0.06, 0, h), (-0.05, 0, h + 0.035), (0.05, 0, h + 0.035), (0.06, 0, h)], 0.008, p["goma"])


# ------------------------------------------------------------------------------------------ perfumes y cuidado personal

def perfume(p, forma, liquido_hex, tapa, caja_hex=None, alto=0.115, rotulo="EAU DE PARFUM", marca="JASY"):
    """Frasco de vidrio grueso con el líquido adentro, tapa y, si se pide, su caja al lado."""
    vidrio = p["vidrio"]
    liquido = mat("Liquido", liquido_hex, 0.02, vidrio=1.0, ior=1.33)
    if forma == "bloque":
        losa("frasco", 0.066, alto * 0.78, 0.040, 0.004, 0.004, vidrio, pos=(0, 0, alto * 0.39))
        losa("liquido", 0.054, alto * 0.62, 0.029, 0.003, 0.002, liquido, pos=(0, 0, alto * 0.39 + 0.003))
        z_cuello = alto * 0.78
    elif forma == "redondo":
        cilindro("frasco", 0.040, 0.026, vidrio, pos=(0, 0, 0.042), rot=(90, 0, 0), bisel=0.008, segs=96).scale = (1, 1, 1)
        cilindro("liquido", 0.033, 0.018, liquido, pos=(0, 0, 0.042), rot=(90, 0, 0), bisel=0.005, segs=96)
        z_cuello = 0.082
    elif forma == "torre":
        cilindro("frasco", 0.024, alto * 0.82, vidrio, pos=(0, 0, alto * 0.41), bisel=0.003, segs=96)
        cilindro("liquido", 0.0195, alto * 0.70, liquido, pos=(0, 0, alto * 0.41 + 0.004), bisel=0.002, segs=96)
        z_cuello = alto * 0.82
    else:  # gema: facetas
        cilindro("frasco", 0.040, 0.075, vidrio, pos=(0, 0, 0.0375), segs=8, radio2=0.030, bisel=0.0015)
        cilindro("liquido", 0.033, 0.060, liquido, pos=(0, 0, 0.040), segs=8, radio2=0.025, bisel=0.001)
        z_cuello = 0.075
    cilindro("cuello", 0.0085, 0.010, p["dorado"] if tapa != "negra" else p["metal"], pos=(0, 0, z_cuello + 0.004), bisel=0.001)
    if tapa == "negra":
        caja("tapa", (0.036, 0.036, 0.034), mat("Resina", "#111214", 0.12, capa=1.0), pos=(0, 0, z_cuello + 0.026), bisel=0.0025)
    elif tapa == "dorada":
        cilindro("tapa", 0.016, 0.030, p["dorado"], pos=(0, 0, z_cuello + 0.024), bisel=0.002, segs=96)
    elif tapa == "cristal":
        cilindro("tapa", 0.020, 0.028, vidrio, pos=(0, 0, z_cuello + 0.023), segs=8, radio2=0.010, bisel=0.001)
    else:  # esfera
        esfera("tapa", 0.020, mat("Resina", "#111214", 0.12, capa=1.0), pos=(0, 0, z_cuello + 0.027))
    if forma in ("bloque", "torre"):
        texto("marca", marca, 0.0085, p["dorado"] if tapa != "negra" else mat("Rotulo", "#e9eae6", 0.4),
              pos=(0, -0.0205 if forma == "bloque" else -0.0243, z_cuello * 0.55), negrita=True)
    if caja_hex:
        c = mat("Pintura", caja_hex, 0.55, relieve=(300, 0.03))
        g = vacio("caja", pos=(0.085, 0.06, 0), rot=(0, 0, -18))
        caja("caja", (0.072, 0.048, alto * 1.12), c, pos=(0, 0, alto * 0.56), bisel=0.0012, padre=g)
        texto("marca", marca, 0.012, p["dorado"], pos=(0, -0.0242, alto * 0.70), padre=g, negrita=True)
        texto("rotulo", rotulo, 0.0042, p["dorado"], pos=(0, -0.0242, alto * 0.62), padre=g)


def m_perfume_bloque(p):
    perfume(p, "bloque", "#c58b3a", "negra", "#17181a", marca="YVÁ", rotulo="POUR HOMME · EAU DE PARFUM")


def m_perfume_redondo(p):
    perfume(p, "redondo", "#e2a3b3", "dorada", "#f1dfe2", marca="JASY", rotulo="EAU DE PARFUM")


def m_perfume_torre(p):
    perfume(p, "torre", "#9fc5e0", "negra", "#22345a", alto=0.13, marca="PARANÁ", rotulo="EAU DE TOILETTE")


def m_perfume_gema(p):
    perfume(p, "gema", "#b0306a", "cristal", None, marca="YVOTY")


def m_perfume_esfera(p):
    perfume(p, "bloque", "#e3c25a", "esfera", "#e9eae6", alto=0.10, marca="ARA", rotulo="EAU DE PARFUM · 100 ML")


def m_secador(p):
    cuerpo = mat("Pintura", "#232526", 0.3, capa=0.6)
    g = vacio("secador", pos=(0, 0, 0.0), rot=(0, 0, 0))
    cilindro("cuerpo", 0.042, 0.15, cuerpo, pos=(0, 0, 0.195), rot=(90, 0, 0), bisel=0.01, padre=g)
    cilindro("boca", 0.03, 0.05, cuerpo, pos=(0, -0.095, 0.195), rot=(90, 0, 0), radio2=0.036, bisel=0.004, padre=g)
    cilindro("rejilla", 0.035, 0.004, mat("Rejilla", "#0b0c0d", 0.6, relieve=(700, 0.4), trama=True), pos=(0, 0.076, 0.195), rot=(90, 0, 0), padre=g)
    cilindro("mango", 0.019, 0.16, cuerpo, pos=(0, 0.015, 0.095), rot=(-14, 0, 0), bisel=0.008, padre=g)
    caja("tecla", (0.012, 0.008, 0.03), mat("Acento", "#b9bcbd", 0.3, 0.8), pos=(0, -0.006, 0.12), rot=(-14, 0, 0), bisel=0.003, padre=g)
    tubo("cable", [(0, 0.03, 0.01), (0.03, 0.06, 0.004), (0.09, 0.07, 0.004), (0.13, 0.03, 0.004), (0.12, -0.03, 0.004)], 0.003, p["goma"])


def m_planchita(p):
    cuerpo = mat("Pintura", "#232526", 0.3, capa=0.5)
    ceramica = mat("Ceramica", "#d9cfc0", 0.35)
    for lado in (1, -1):
        e = vacio("brazo", pos=(0, 0, 0.012), rot=(0, 6 * lado, 0))
        losa("brazo", 0.032, 0.26, 0.018, 0.012, 0.005, cuerpo, pos=(lado * 0.018, 0, 0.13), rot=(0, 0, 90), padre=e)
        losa("placa", 0.024, 0.09, 0.003, 0.003, 0.001, ceramica, pos=(lado * 0.009, 0, 0.215), rot=(0, 0, 90), padre=e)
    caja("pantallita", (0.004, 0.016, 0.010), mat("Display", "#ffffff", 0.3, emision=3, emision_color="#e3b22c"), pos=(0.0275, 0, 0.11))
    tubo("cable", [(0, 0, 0.0), (0.02, 0.02, 0.003), (0.08, 0.04, 0.003), (0.12, 0.0, 0.003)], 0.003, p["goma"])


def m_afeitadora(p):
    cuerpo = mat("Pintura", "#232526", 0.35, capa=0.4)
    g = vacio("afeitadora", rot=(0, 0, 0))
    losa("cuerpo", 0.052, 0.13, 0.042, 0.022, 0.012, cuerpo, pos=(0, 0, 0.065), padre=g)
    losa("agarre", 0.044, 0.07, 0.044, 0.018, 0.01, p["goma"], pos=(0, 0.0005, 0.045), padre=g)
    cilindro("boton", 0.006, 0.003, mat("Acento", "#b9bcbd", 0.3, 0.8), pos=(0, -0.0225, 0.085), rot=(90, 0, 0), padre=g)
    cab = vacio("cabezal", pos=(0, 0, 0.135), rot=(14, 0, 0), padre=g)
    caja("base", (0.075, 0.05, 0.014), cuerpo, pos=(0, 0, 0.004), bisel=0.006, padre=cab)
    for x, y in ((-0.022, 0.008), (0.022, 0.008), (0, -0.012)):
        cilindro("cabeza", 0.0145, 0.010, p["metal"], pos=(x, y, 0.016), bisel=0.002, padre=cab)
        toro("ranura", 0.009, 0.0009, p["metal_oscuro"], pos=(x, y, 0.0212), padre=cab)


# ------------------------------------------------------------------------------------------ relojes

def correa_en_aro(nombre, material, yc, zc, medio_alto, ancho, grosor, radio=0.032, eslabones=False):
    """La correa forma un aro parado (plano YZ) detrás de la caja, como en las vidrieras de relojes.
    Sale de las asas de arriba y de abajo de la caja (centro en yc, zc) y da la vuelta por detrás."""
    y_asa = yc + 0.004
    cy = y_asa + math.sqrt(max(radio ** 2 - medio_alto ** 2, 1e-6))
    ang = math.degrees(math.atan2(medio_alto, y_asa - cy))  # ~135° (asa de arriba)
    pts = arco(radio, ang, -ang, 80, "YZ", (0, cy, zc))
    if eslabones:
        for i in range(0, len(pts) - 1):
            a, b = Vector(pts[i]), Vector(pts[i + 1])
            m = (a + b) / 2
            giro = math.degrees(math.atan2(b.z - a.z, b.y - a.y))
            largo = (b - a).length * 0.92
            caja("eslabon", (ancho * 0.34, largo, grosor), material, pos=tuple(m), rot=(giro, 0, 0), bisel=grosor * 0.3)
            for s_ in (-1, 1):
                caja("eslabon", (ancho * 0.30, largo, grosor * 0.86), material, pos=(s_ * ancho * 0.33, m.y, m.z), rot=(giro, 0, 0), bisel=grosor * 0.28)
    else:
        tubo(nombre, pts, grosor / 2, material, ancho=ancho, eje=(1, 0, 0))
    return cy


def reloj(p, caja_mat, esfera_hex, correa="malla", crono=False, dorado=False, radio_caja=0.021):
    esf = mat("Esfera", esfera_hex, 0.35, relieve=(2500, 0.02))
    marcas = p["dorado"] if dorado else p["metal"]
    R_aro = 0.032
    zc = R_aro + 0.0015
    yc = -0.008
    g = vacio("caja", pos=(0, yc, zc))
    cilindro("caja", radio_caja, 0.011, caja_mat, rot=(90, 0, 0), bisel=0.0025, segs=96, padre=g)
    cilindro("bisel", radio_caja * 0.93, 0.0014, caja_mat, pos=(0, -0.0058, 0), rot=(90, 0, 0), bisel=0.0005, segs=96, padre=g)
    cilindro("esfera", radio_caja * 0.82, 0.0006, esf, pos=(0, -0.0062, 0), rot=(90, 0, 0), segs=96, padre=g)
    for i in range(12):
        a = R(i * 30)
        rr = radio_caja * 0.70
        largo = 0.0042 if i % 3 == 0 else 0.0026
        caja("indice", (0.0011 if i % 3 else 0.0016, 0.0008, largo), marcas, pos=(rr * math.sin(a), -0.0067, rr * math.cos(a)),
             rot=(0, math.degrees(a), 0), bisel=0.0002, padre=g)
    if crono:
        for ang in (90, 210, 330):
            a = R(ang)
            cilindro("subesfera", 0.0042, 0.0004, mat("Subesfera", "#2a2c2f", 0.5), pos=(0.0075 * math.sin(a), -0.0066, 0.0075 * math.cos(a)),
                     rot=(90, 0, 0), padre=g)
            toro("aro_sub", 0.0042, 0.00028, marcas, pos=(0.0075 * math.sin(a), -0.0066, 0.0075 * math.cos(a)), rot=(90, 0, 0), padre=g)
        for z in (0.010, -0.010):
            caja("pulsador", (0.004, 0.003, 0.0026), caja_mat, pos=(radio_caja + 0.0016, 0, z), bisel=0.0006, padre=g)
    # agujas a las 10:10
    for ang, largo, ancho_ in ((-60, 0.0105, 0.0013), (60, 0.0150, 0.0010)):
        e = vacio("aguja", pos=(0, -0.0072, 0), rot=(0, ang, 0), padre=g)
        caja("aguja", (ancho_, 0.0004, largo), marcas, pos=(0, 0, largo / 2 - 0.0015), bisel=0.0002, padre=e)
    e = vacio("segundero", pos=(0, -0.0075, 0), rot=(0, 160, 0), padre=g)
    caja("segundero", (0.0004, 0.0003, 0.018), mat("Segundero", "#d9772b", 0.3), pos=(0, 0, 0.006), padre=e)
    cilindro("eje", 0.0009, 0.0008, marcas, pos=(0, -0.0076, 0), rot=(90, 0, 0), padre=g)
    cilindro("cristal", radio_caja * 0.88, 0.0016, p["vidrio"], pos=(0, -0.0072, 0), rot=(90, 0, 0), bisel=0.0005, segs=96, padre=g)
    cilindro("corona", 0.0024, 0.0035, caja_mat, pos=(radio_caja + 0.0016, 0, 0), rot=(0, 90, 0), bisel=0.0005, padre=g)
    for z in (radio_caja * 0.85, -radio_caja * 0.85):
        caja("asa", (0.022, 0.006, 0.008), caja_mat, pos=(0, 0.003, z * 1.12), bisel=0.002, padre=g)
    texto("marca", "ARA", 0.0028, marcas, pos=(0, -0.0067, 0.0085 if not crono else 0.0125), padre=g)
    medio = radio_caja * 0.95 + 0.004
    if correa == "malla":
        correa_en_aro("correa", caja_mat, yc, zc, medio, 0.020, 0.0035, R_aro, eslabones=True)
    elif correa == "cuero":
        cy = correa_en_aro("correa", mat("Correa", "#5c3b23", 0.55, relieve=(900, 0.15)), yc, zc, medio, 0.019, 0.0032, R_aro)
        caja("hebilla", (0.023, 0.0024, 0.014), caja_mat, pos=(0, cy + R_aro + 0.0018, zc), bisel=0.001)
    else:
        correa_en_aro("correa", mat("Correa", "#17181a", 0.6, relieve=(1200, 0.05)), yc, zc, medio, 0.021, 0.0036, R_aro)


def m_reloj_acero(p):
    reloj(p, mat("Caja", "#c9cccd", 0.18, 1.0, aniso=0.5), "#22345a", "malla")


def m_reloj_crono(p):
    reloj(p, mat("Caja", "#2a2c2f", 0.3, 1.0), "#111214", "silicona", crono=True, radio_caja=0.0225)


def m_reloj_cuero(p):
    reloj(p, mat("Caja", "#d8b46a", 0.18, 1.0), "#e9e3d6", "cuero", dorado=True, radio_caja=0.020)


def m_smartwatch(p):
    correa = mat("Pintura", "#232526", 0.6, relieve=(1200, 0.04))
    R_aro = 0.032
    zc = R_aro + 0.0015
    g = vacio("caja", pos=(0, -0.010, zc))
    losa("caja", 0.040, 0.046, 0.011, 0.011, 0.003, mat("Caja", "#3a3c3f", 0.25, 1.0, aniso=0.4), padre=g)
    losa("vidrio", 0.0385, 0.0445, 0.0010, 0.0105, 0.0006, p["vidrio_negro"], pos=(0, -0.0057, 0), padre=g)
    losa("pantalla", 0.034, 0.040, 0.0003, 0.008, 0, mat_pantalla("Pantalla", ["#050607", "#050607", "#0f3d3e", "#2be0c0"], 55, tipo="radial", fuerza=1.2),
         pos=(0, -0.0063, 0), padre=g)
    texto("hora", "10:24", 0.0098, p["blanco_luz"], pos=(0, -0.0066, 0.002), padre=g)
    texto("pasos", "8.204 pasos", 0.0028, mat("Dato", "#ffffff", 0.3, emision=3, emision_color="#e3b22c"), pos=(0, -0.0066, -0.009), padre=g)
    cilindro("corona", 0.0028, 0.004, mat("Caja", "#3a3c3f", 0.25, 1.0), pos=(0.0215, 0, 0.007), rot=(0, 90, 0), bisel=0.0006, padre=g)
    correa_en_aro("correa", correa, -0.010, zc, 0.021, 0.022, 0.0034, R_aro)


def m_smartband(p):
    correa = mat("Pintura", "#232526", 0.6, relieve=(1200, 0.04))
    R_aro = 0.028
    zc = R_aro + 0.0015
    g = vacio("caja", pos=(0, -0.006, zc))
    losa("caja", 0.019, 0.042, 0.010, 0.0094, 0.0035, mat("Caja", "#1c1d1f", 0.2, capa=0.8), padre=g)
    losa("pantalla", 0.0145, 0.034, 0.0003, 0.007, 0, mat_pantalla("Pantalla", ["#050607", "#22345a", "#d56a8c"], 60, tipo="radial", fuerza=1.1),
         pos=(0, -0.0051, 0), padre=g)
    texto("hora", "10:24", 0.0055, p["blanco_luz"], pos=(0, -0.0054, 0.004), padre=g)
    correa_en_aro("correa", correa, -0.006, zc, 0.019, 0.017, 0.003, R_aro)


# ------------------------------------------------------------------------------------------ TV, consolas y cámaras

def m_tv(p):
    """Smart TV de 55": panel finito con bordes mínimos sobre dos patas."""
    cuerpo = mat("Pintura", "#1c1d1f", 0.35, 0.3)
    w, h = 1.232, 0.712
    g = vacio("tv", pos=(0, 0, 0.075 + h / 2))
    losa("panel", w, h, 0.012, 0.003, 0.0015, cuerpo, padre=g)
    losa("marco", w - 0.002, h - 0.002, 0.0006, 0.002, 0.0002, p["vidrio_negro"], pos=(0, -0.0063, 0), padre=g)
    losa("pantalla", w - 0.012, h - 0.020, 0.0003, 0.001, 0, mat_pantalla("Pantalla", ["#04121c", "#0f3d3e", "#2e8f86", "#5b8fb9", "#bfe3f0"], 2.4, 0.9, tam=(w - 0.012, h - 0.020)),
         pos=(0, -0.0067, 0.004), padre=g)
    losa("espalda", w * 0.62, h * 0.55, 0.05, 0.03, 0.01, cuerpo, pos=(0, 0.03, -0.05), padre=g)
    for x in (-0.50, 0.50):
        e = vacio("pata", pos=(x, 0.01, 0))
        tubo("pata", [(-0.03, -0.11, 0.004), (0, -0.0, 0.08), (0.03, 0.09, 0.004)], 0.006, p["metal_oscuro"], padre=e, ancho=0.03)


def joystick(p, cuerpo, padre, acento):
    esfera("cuerpo", 0.052, cuerpo, pos=(0, 0, 0.0), escala=(1.0, 0.62, 0.34), padre=padre)
    for lado in (1, -1):
        esfera("agarre", 0.027, cuerpo, pos=(lado * 0.040, 0.030, -0.012), escala=(1.0, 1.45, 0.9), rot=(-30, 0, lado * -18), padre=padre)
        cilindro("palanca", 0.0072, 0.008, p["goma"], pos=(lado * 0.022 if lado < 0 else lado * 0.016, (-0.006 if lado < 0 else 0.012), 0.020), bisel=0.002, padre=padre)
        cilindro("base_palanca", 0.0105, 0.004, p["plastico_negro"], pos=(lado * 0.022 if lado < 0 else lado * 0.016, (-0.006 if lado < 0 else 0.012), 0.016), padre=padre)
        caja("gatillo", (0.022, 0.012, 0.010), cuerpo, pos=(lado * 0.036, -0.030, 0.006), bisel=0.004, padre=padre)
    for dx, dy in ((0, -0.009), (0, 0.009), (-0.009, 0), (0.009, 0)):
        cilindro("boton", 0.0035, 0.004, acento, pos=(0.035 + dx, -0.006 + dy, 0.016), bisel=0.0008, padre=padre)
    caja("cruz", (0.016, 0.005, 0.003), p["plastico_negro"], pos=(-0.016, 0.012, 0.016), bisel=0.001, padre=padre)
    caja("cruz", (0.005, 0.016, 0.003), p["plastico_negro"], pos=(-0.016, 0.012, 0.016), bisel=0.001, padre=padre)
    caja("luz", (0.022, 0.003, 0.0015), mat("LuzJoystick", "#ffffff", 0.3, emision=2.5, emision_color="#14d9b0"), pos=(0, -0.031, 0.009), padre=padre)


def m_consola(p):
    cuerpo = mat("Pintura", "#1c1d1f", 0.35, capa=0.5)
    g0 = vacio("consola", pos=(0.03, 0.06, 0.15))
    losa("consola", 0.24, 0.30, 0.075, 0.03, 0.009, cuerpo, rot=(0, 0, 90), padre=g0)
    losa("centro", 0.242, 0.302, 0.026, 0.03, 0.004, mat("CentroNegro", "#17181a", 0.3), rot=(0, 0, 90), padre=g0)
    caja("franja", (0.0014, 0.004, 0.24), mat("LuzConsola", "#ffffff", 0.4, emision=2.5, emision_color="#14d9b0"), pos=(-0.0, -0.1205, 0.0), padre=g0)
    caja("pie", (0.11, 0.16, 0.012), mat("CentroNegro", "#17181a", 0.3), pos=(0.03, 0.06, 0.006), bisel=0.004)
    g = vacio("joy", pos=(-0.07, -0.14, 0.022), rot=(4, 0, 18))
    joystick(p, mat("Joystick", "#2a2c2f", 0.4, capa=0.3), g, mat("Botones", "#6b7073", 0.35))


def m_joystick(p):
    g = vacio("joy", pos=(0, 0, 0.026), rot=(12, 0, 0))
    joystick(p, mat("Pintura", "#2a2c2f", 0.4, capa=0.3), g, mat("Botones", "#6b7073", 0.35))


def m_drone(p):
    cuerpo = mat("Pintura", "#4a4f52", 0.4)
    losa("cuerpo", 0.08, 0.18, 0.045, 0.03, 0.012, cuerpo, pos=(0, 0, 0.05), rot=(90, 0, 0))
    for x, y in ((0.11, 0.09), (-0.11, 0.09), (0.11, -0.08), (-0.11, -0.08)):
        tubo("brazo", [(0, y * 0.25, 0.055), (x, y, 0.06)], 0.007, cuerpo)
        cilindro("motor", 0.013, 0.02, p["metal_oscuro"], pos=(x, y, 0.07), bisel=0.002)
        for a in (0, 180):
            caja("helice", (0.11, 0.012, 0.0016), mat("Helice", "#202123", 0.4), pos=(x, y, 0.082), rot=(0, 3, a + (30 if x > 0 else -20)), bisel=0.0006)
        tubo("pata", [(x * 0.6, y * 0.55, 0.035), (x * 0.62, y * 0.57, 0.002)], 0.0035, p["goma"])
    esfera("gimbal", 0.018, p["plastico_negro"], pos=(0, -0.095, 0.035))
    cilindro("lente", 0.0085, 0.006, p["lente"], pos=(0, -0.112, 0.035), rot=(90, 0, 0))
    toro("aro", 0.0088, 0.0012, p["metal"], pos=(0, -0.114, 0.035), rot=(90, 0, 0))
    caja("led", (0.01, 0.002, 0.002), mat("LedRojo", "#ffffff", 0.3, emision=6, emision_color="#ff4a3a"), pos=(0.03, -0.075, 0.05))


def m_camara_accion(p):
    cuerpo = mat("Pintura", "#232526", 0.55, relieve=(700, 0.06))
    losa("cuerpo", 0.071, 0.050, 0.034, 0.008, 0.004, cuerpo, pos=(0, 0, 0.025))
    losa("frente", 0.067, 0.046, 0.002, 0.007, 0.0006, p["vidrio_negro"], pos=(0, -0.0172, 0.025))
    losa("pantallita", 0.024, 0.024, 0.0004, 0.004, 0, mat_pantalla("Pantalla", ["#0f3d3e", "#9cc9b0"], 2, 1.2), pos=(0.017, -0.0183, 0.025))
    cilindro("aro", 0.0125, 0.008, p["metal_oscuro"], pos=(-0.014, -0.020, 0.025), rot=(90, 0, 0), bisel=0.0015)
    cilindro("lente", 0.0090, 0.004, p["lente"], pos=(-0.014, -0.0235, 0.025), rot=(90, 0, 0))
    caja("boton", (0.012, 0.006, 0.003), mat("Acento", "#b3302a", 0.4), pos=(0.022, 0, 0.0505), bisel=0.001)


def m_mirrorless(p):
    cuerpo = mat("Pintura", "#1c1d1f", 0.6, relieve=(900, 0.08))
    losa("cuerpo", 0.126, 0.072, 0.040, 0.008, 0.004, cuerpo, pos=(0, 0, 0.040))
    losa("agarre", 0.030, 0.072, 0.024, 0.010, 0.008, cuerpo, pos=(-0.048, -0.022, 0.040))
    caja("visor", (0.040, 0.034, 0.020), cuerpo, pos=(0.012, 0.004, 0.086), bisel=0.004)
    for x in (-0.032, -0.048):
        cilindro("dial", 0.0085, 0.006, p["metal_oscuro"], pos=(x, 0.0, 0.079), bisel=0.001)
    cilindro("bayoneta", 0.026, 0.006, p["metal"], pos=(0.008, -0.023, 0.040), rot=(90, 0, 0), bisel=0.001)
    cilindro("objetivo", 0.028, 0.052, cuerpo, pos=(0.008, -0.050, 0.040), rot=(90, 0, 0), bisel=0.002)
    cilindro("anillo", 0.0295, 0.016, p["goma"], pos=(0.008, -0.056, 0.040), rot=(90, 0, 0), bisel=0.001)
    cilindro("vidrio", 0.021, 0.004, p["lente"], pos=(0.008, -0.075, 0.040), rot=(90, 0, 0))
    toro("aro", 0.0235, 0.0012, p["metal"], pos=(0.008, -0.0765, 0.040), rot=(90, 0, 0))
    cilindro("disparador", 0.005, 0.004, p["metal"], pos=(-0.046, -0.024, 0.078), bisel=0.001)


# ------------------------------------------------------------------------------------------ catálogo de modelos

MODELOS_PROPIOS = {
    "tp_celular_media": ("Celular gama media", m_celular_media),
    "tp_celular_pro": ("Celular gama alta", m_celular_pro),
    "tp_celular_entrada": ("Celular de entrada", m_celular_entrada),
    "tp_celular_basico": ("Celular de teclas", m_celular_basico),
    "tp_tablet": ("Tablet con funda", m_tablet),
    "tp_powerbank": ("Batería externa", m_powerbank),
    "tp_cargador": ("Cargador rápido", m_cargador),
    "tp_notebook": ("Notebook 15,6", m_notebook),
    "tp_notebook_ultra": ("Notebook ultrafina", m_notebook_ultra),
    "tp_notebook_gamer": ("Notebook gamer", m_notebook_gamer),
    "tp_monitor": ("Monitor 27", m_monitor),
    "tp_teclado": ("Teclado mecánico", m_teclado),
    "tp_mouse": ("Mouse inalámbrico", m_mouse),
    "tp_ssd": ("Disco SSD externo", m_ssd),
    "tp_router": ("Router Wi-Fi", m_router),
    "tp_tws": ("Auriculares inalámbricos", m_tws),
    "tp_vincha": ("Auriculares de vincha", m_vincha),
    "tp_gamer": ("Auriculares gamer", m_gamer),
    "tp_parlante": ("Parlante Bluetooth", m_parlante),
    "tp_parlante_fiesta": ("Parlante de fiesta", m_parlante_fiesta),
    "tp_perfume_bloque": ("Perfume frasco bloque", m_perfume_bloque),
    "tp_perfume_redondo": ("Perfume frasco redondo", m_perfume_redondo),
    "tp_perfume_torre": ("Perfume frasco alto", m_perfume_torre),
    "tp_perfume_gema": ("Perfume frasco facetado", m_perfume_gema),
    "tp_perfume_esfera": ("Perfume tapa esfera", m_perfume_esfera),
    "tp_secador": ("Secador de pelo", m_secador),
    "tp_planchita": ("Planchita de pelo", m_planchita),
    "tp_afeitadora": ("Afeitadora", m_afeitadora),
    "tp_reloj_acero": ("Reloj de acero", m_reloj_acero),
    "tp_reloj_crono": ("Reloj cronógrafo", m_reloj_crono),
    "tp_reloj_cuero": ("Reloj de cuero", m_reloj_cuero),
    "tp_smartwatch": ("Reloj inteligente", m_smartwatch),
    "tp_smartband": ("Pulsera inteligente", m_smartband),
    "tp_tv": ("Smart TV 55", m_tv),
    "tp_consola": ("Consola", m_consola),
    "tp_joystick": ("Joystick inalámbrico", m_joystick),
    "tp_drone": ("Drone", m_drone),
    "tp_camara_accion": ("Cámara de acción", m_camara_accion),
    "tp_mirrorless": ("Cámara mirrorless", m_mirrorless),
}


def medidas_mm():
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in bpy.context.scene.objects if o.type == "MESH" for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return [round(v * 1000, 1) for v in (mx - mn)]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", default="")
    a = ap.parse_args(argv)
    ids = a.solo.split(",") if a.solo else list(MODELOS_PROPIOS)
    for mid in ids:
        nombre, fn = MODELOS_PROPIOS[mid]
        escena_vacia()
        _MATS.clear()
        fn(materiales_base())
        carpeta = MODELOS / mid
        carpeta.mkdir(parents=True, exist_ok=True)
        dims = medidas_mm()
        (carpeta / "credito.json").write_text(json.dumps({"id": mid, "nombre": nombre, "autores": ["Tríplice (modelo propio en Blender)"],
                                                          "propio": True, "dimensiones_mm": dims}, ensure_ascii=False), encoding="utf-8")
        bpy.ops.wm.save_as_mainfile(filepath=str(carpeta / "modelo.blend"), compress=True)
        print("MODELO", mid, dims, flush=True)
    print("FIN", flush=True)


if __name__ == "__main__":
    main()
