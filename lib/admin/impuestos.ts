// Vista previa de un cambio de impuesto: cómo queda el precio final de un producto de ejemplo en los tres países,
// antes y después. Módulo puro: usa el MISMO cálculo que la tienda (reglaDe y precioFinal de lib/compra/impuestos.ts),
// así lo que ve el admin es lo que va a ver el comprador.
import { precioFinal, reglaDe, type Categoria, type Regla } from '../compra/impuestos'
import type { Tasas } from '../precios'
import { MONEDA_DE, type Moneda } from '../region'

export const PAISES = ['PY', 'BR', 'AR'] as const
export type Pais = (typeof PAISES)[number]

/** El cambio que se quiere probar: la regla de un país para una categoría (null = la general), con su tasa nueva. */
export type CambioImpuesto = { pais: Pais; categoria: string | null; tasa: number; nombre: string; quitar?: boolean }

export type FilaVistaPrevia = {
  pais: Pais; moneda: Moneda
  antes: { precio: number; tasa: number; nombre: string }
  despues: { precio: number; tasa: number; nombre: string }
  cambia: boolean
}

/** Las reglas de un país con el cambio aplicado (reemplaza la de esa categoría, la agrega o la quita). */
export function aplicarCambio(reglas: Regla[], cambio: CambioImpuesto): Regla[] {
  const sin = reglas.filter((r) => r.categoria !== cambio.categoria)
  return cambio.quitar ? sin : [...sin, { categoria: cambio.categoria, nombre: cambio.nombre, tasa: cambio.tasa }]
}

export function vistaPreviaImpuesto(o: {
  reglas: Partial<Record<Pais, Regla[]>>; cambio: CambioImpuesto; precioUsdCent: number; categoria: Categoria; tasas: Tasas
}): FilaVistaPrevia[] {
  return PAISES.map((pais) => {
    const moneda = MONEDA_DE[pais]
    const actuales = o.reglas[pais] ?? []
    const nuevas = pais === o.cambio.pais ? aplicarCambio(actuales, o.cambio) : actuales
    const ra = reglaDe({ reglas: actuales }, o.categoria)
    const rd = reglaDe({ reglas: nuevas }, o.categoria)
    const antes = { precio: precioFinal(o.precioUsdCent, ra.tasa, moneda, o.tasas), tasa: ra.tasa, nombre: ra.nombre }
    const despues = { precio: precioFinal(o.precioUsdCent, rd.tasa, moneda, o.tasas), tasa: rd.tasa, nombre: rd.nombre }
    return { pais, moneda, antes, despues, cambia: antes.precio !== despues.precio }
  })
}

/** "10,5" o "10.5" (por ciento) → 0,105. Null si no es un porcentaje entre 0 y 60 con hasta dos decimales. */
export function leerPorcentaje(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(',', '.').trim()
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n >= 0 && n <= 60 ? Math.round(n * 100) / 10000 : null
}
