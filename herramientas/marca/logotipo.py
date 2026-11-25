"""
Genera el logotipo de Tríplice (isotipo + nombre) con el texto convertido a trazos,
para que el SVG se vea igual en cualquier máquina sin depender de la fuente instalada.

Uso: py -3.14 herramientas/marca/logotipo.py
Necesita fontTools y herramientas/fuentes/schibsted.ttf (Schibsted Grotesk, OFL; no se versiona).
"""
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

RAIZ = Path(__file__).resolve().parents[2]
FUENTE = RAIZ / "herramientas" / "fuentes" / "schibsted.ttf"
NOMBRE = "Tríplice"   # mismo valor que MARCA.nombre en tokens/marca.ts


def trazos(texto, tam, x0, base, peso=700, espaciado=-0.02):
    f = TTFont(FUENTE)
    if "fvar" in f:
        f = instantiateVariableFont(f, {"wght": peso})
    glifos = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f["head"].unitsPerEm
    esc = tam / upm
    x = x0
    d = []
    for ch in texto:
        g = cmap[ord(ch)]
        pen = SVGPathPen(glifos)
        glifos[g].draw(TransformPen(pen, (esc, 0, 0, -esc, x, base)))
        d.append(pen.getCommands())
        x += glifos[g].width * esc + espaciado * tam
    return " ".join(d), x


iso = (RAIZ / "marca" / "isotipo.svg").read_text(encoding="utf-8")
cuerpo = iso[iso.index("<defs>"):iso.index("</svg>")]

for variante, color in (("logotipo", "#0F3D3E"), ("logotipo-claro", "#FFFFFF")):
    d, ancho = trazos(NOMBRE, 40, 76, 44)
    c = cuerpo if color != "#FFFFFF" else cuerpo.replace('fill="#0F3D3E"', 'fill="#FFFFFF"')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ancho + 4:.0f} 64" role="img" aria-label="{NOMBRE}">\n'
           f'  {c.strip()}\n  <path fill="{color}" d="{d}"/>\n</svg>\n')
    (RAIZ / "marca" / f"{variante}.svg").write_text(svg, encoding="utf-8")
    print(variante, f"{ancho:.0f}px")
