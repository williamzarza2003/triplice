"""Baja modelos 3D CC0 de Poly Haven (glTF, texturas 1k) para fotografiar los productos del catálogo.

Uso: py herramientas/fotos/descargar.py
La lista sale de modelos.txt. Lo que ya está bajado no se vuelve a bajar.
Licencia de los modelos: CC0 (dominio público). https://polyhaven.com/license
"""
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

AQUI = Path(__file__).resolve().parent
DESTINO = AQUI / "modelos"
MODELOS = [l.strip() for l in (AQUI / "modelos.txt").read_text(encoding="utf-8").splitlines()
           if l.strip() and not l.startswith("#")]

# Poly Haven pide un User-Agent propio para usar su API
CABECERAS = {"User-Agent": "triplice-catalogo/1.0 (proyecto de portafolio)"}


def abrir(url, intentos=4):
    for i in range(intentos):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=CABECERAS), timeout=60)
        except Exception:
            if i == intentos - 1:
                raise
            time.sleep(2 * (i + 1))


def bajar(url, archivo):
    archivo.parent.mkdir(parents=True, exist_ok=True)
    if not archivo.exists():
        with abrir(url) as r:
            datos = r.read()
        archivo.write_bytes(datos)


def modelo(m):
    carpeta = DESTINO / m
    if (carpeta / "credito.json").exists():
        return m, "ya estaba"
    with abrir(f"https://api.polyhaven.com/files/{m}") as r:
        datos = json.load(r)
    g = datos["gltf"]["1k"]["gltf"]
    bajar(g["url"], carpeta / Path(g["url"]).name)
    for rel, info in g["include"].items():
        bajar(info["url"], carpeta / rel)
    with abrir(f"https://api.polyhaven.com/info/{m}") as r:
        info = json.load(r)
    credito = {"id": m, "nombre": info.get("name"), "autores": list(info.get("authors", {})),
               "dimensiones_mm": info.get("dimensions")}
    (carpeta / "credito.json").write_text(json.dumps(credito, ensure_ascii=False), encoding="utf-8")
    return m, "listo"


def _seguro(m):
    try:
        return modelo(m)
    except Exception as e:  # noqa: BLE001 — se informa y se sigue con los demás
        return m, f"ERROR {e}"


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=6) as ex:
        for m, estado in ex.map(_seguro, MODELOS):
            print(estado, m, flush=True)
