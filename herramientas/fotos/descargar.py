"""Baja modelos 3D CC0 de Poly Haven (glTF, texturas 1k) para fotografiar los productos de ejemplo.

Uso: py herramientas/fotos/descargar.py
Licencia de los modelos: CC0 (dominio público). https://polyhaven.com/license
"""
import json
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
DESTINO = AQUI / "modelos"
# id de Poly Haven → producto de ejemplo del marketplace
MODELOS = [
    "boombox", "Camera_01", "gaming_console", "digital_wrist_watch", "Television_01", "classic_laptop",
    "vintage_electric_kettle", "tea_set_01", "ceramic_vase_02", "desk_lamp_arm_01", "pot_enamel_01",
    "ArmChair_01", "Drill_01", "adjustable_wrench", "binoculars", "Ukulele_01",
    "food_avocado_01", "croissant", "potted_plant_02", "stationery_supplies",
]


# Poly Haven pide un User-Agent propio para usar su API
CABECERAS = {"User-Agent": "triplice-maquetas/1.0 (proyecto de portafolio)"}


def abrir(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=CABECERAS))


def bajar(url, archivo):
    archivo.parent.mkdir(parents=True, exist_ok=True)
    if not archivo.exists():
        with abrir(url) as r:
            archivo.write_bytes(r.read())


for m in MODELOS:
    with abrir(f"https://api.polyhaven.com/files/{m}") as r:
        datos = json.load(r)
    g = datos["gltf"]["1k"]["gltf"]
    carpeta = DESTINO / m
    bajar(g["url"], carpeta / Path(g["url"]).name)
    for rel, info in g["include"].items():
        bajar(info["url"], carpeta / rel)
    with abrir(f"https://api.polyhaven.com/info/{m}") as r:
        info = json.load(r)
    (carpeta / "credito.json").write_text(json.dumps({"id": m, "nombre": info.get("name"), "autores": list(info.get("authors", {}))}, ensure_ascii=False), encoding="utf-8")
    print("listo", m, flush=True)
