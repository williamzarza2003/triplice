// Contraste WCAG entre dos colores, para elegir el texto que va sobre el color de cada tienda.
function luminancia(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contraste(a: string, b: string) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const TINTA = '#16201f'

/** Blanco o tinta, el que más contraste haga sobre el fondo. */
export function textoSobre(fondo: string) {
  return contraste(fondo, '#ffffff') >= contraste(fondo, TINTA) ? '#ffffff' : TINTA
}

/** El color de la tienda como texto sobre blanco, si se lee (3:1 para texto grande); si no, tinta. */
export function colorSobreBlanco(color: string) {
  return contraste(color, '#ffffff') >= 3 ? color : TINTA
}
