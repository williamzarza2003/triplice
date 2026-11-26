# Instancias estáticas (TTF) de las fuentes de la marca para el comprobante en PDF. pdf-lib/fontkit no sabe
# recortar fuentes variables, así que se fija el peso y se deja solo el latín que usamos.
# Uso: py -3.14 herramientas/fuentes-pdf.py   (necesita fonttools y brotli)
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

raiz = Path(__file__).resolve().parent.parent
origen, destino = raiz / 'tokens' / 'fuentes', raiz / 'tokens' / 'fuentes' / 'pdf'
destino.mkdir(exist_ok=True)
LATIN = 'U+0020-007E,U+00A0-00FF,U+0152-0153,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2212'
for archivo, pesos in (('atkinson.woff2', (400,)), ('schibsted.woff2', (400, 700))):
    for peso in pesos:
        f = TTFont(origen / archivo)
        f = instantiateVariableFont(f, {'wght': peso})
        opciones = subset.Options()
        opciones.layout_features = ['kern', 'liga', 'tnum']
        opciones.flavor = None
        s = subset.Subsetter(opciones)
        s.populate(unicodes=subset.parse_unicodes(LATIN))
        s.subset(f)
        f.flavor = None  # el origen es woff2: se guarda como TTF común
        salida = destino / f"{archivo.split('.')[0]}-{peso}.ttf"
        f.save(salida)
        print(salida.name, salida.stat().st_size // 1024, 'KB')
