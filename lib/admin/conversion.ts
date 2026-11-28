// Cotizaciones de Cambio CDE → cotizaciones de Tríplice. Módulo puro (sin red ni base): se prueba con números exactos.
//
// Cambio CDE (otro proyecto, una casa de cambios de Ciudad del Este) guarda cuántos guaraníes valen 1 unidad de cada
// moneda, con su compra y su venta (vista `cotizaciones_actuales`). Tríplice guarda cuántas unidades de cada moneda
// vale 1 dólar (`cotizaciones.por_usd`). Con el promedio entre compra y venta de cada una:
//   PYG = guaraníes por 1 USD
//   BRL = (guaraníes por 1 USD) / (guaraníes por 1 BRL)
//   ARS = (guaraníes por 1 USD) / (guaraníes por 1 ARS)      (en Cambio CDE el peso se cotiza por 1 unidad)

export const MONEDAS_COTIZADAS = ['PYG', 'BRL', 'ARS'] as const
export type MonedaCotizada = (typeof MONEDAS_COTIZADAS)[number]
export type TasasParciales = Partial<Record<MonedaCotizada, number>>

/** Una fila de `cotizaciones_actuales` de Cambio CDE (numeric llega como texto desde PostgREST). */
export type FilaCambioCde = { moneda: string; compra: number | string | null; venta: number | string | null; created_at: string | null }

export type Conversion = {
  tasas: TasasParciales
  /** la hora de la cotización más vieja que se usó (la que manda: "de qué hora es") */
  desde: string | null
  /** monedas que no se pudieron calcular (Cambio CDE no las tiene o vienen en cero) */
  faltan: MonedaCotizada[]
}

/** 4 decimales, como la columna numeric(14, 4) */
export const cuatroDecimales = (x: number) => Math.round(x * 1e4) / 1e4

function medio(f: FilaCambioCde | undefined): number | null {
  if (!f) return null
  const compra = Number(f.compra)
  const venta = Number(f.venta)
  if (!Number.isFinite(compra) || !Number.isFinite(venta) || compra <= 0 || venta <= 0) return null
  return (compra + venta) / 2
}

export function convertirCambioCde(filas: FilaCambioCde[]): Conversion {
  const de = (m: string) => filas.find((f) => f.moneda?.toUpperCase() === m)
  const usd = medio(de('USD'))
  if (usd === null) return { tasas: {}, desde: null, faltan: [...MONEDAS_COTIZADAS] }
  const tasas: TasasParciales = { PYG: cuatroDecimales(usd) }
  const usadas = [de('USD')!]
  const faltan: MonedaCotizada[] = []
  for (const m of ['BRL', 'ARS'] as const) {
    const g = medio(de(m))
    if (g === null) { faltan.push(m); continue }
    tasas[m] = cuatroDecimales(usd / g)
    usadas.push(de(m)!)
  }
  const fechas = usadas.map((f) => f.created_at).filter((x): x is string => !!x && !Number.isNaN(Date.parse(x)))
  const desde = fechas.length ? fechas.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b)) : null
  return { tasas, desde, faltan }
}

/** Variación en % con dos decimales (null si no hay valor anterior). */
export function variacionPorcentual(actual: number | null | undefined, nuevo: number): number | null {
  if (!actual) return null
  return Math.round(((nuevo - actual) / actual) * 10000) / 100
}

/** Más de 5 % de diferencia con la vigente: probable error de tipeo (un cero de más, una coma corrida). */
export const UMBRAL_AVISO = 5
export const esCambioGrande = (v: number | null) => v !== null && Math.abs(v) > UMBRAL_AVISO

/**
 * Lee lo que escribió el admin ("7.350", "7350", "5,45", "1.180,5") como número. En Paraguay y Argentina el punto
 * separa miles y la coma, decimales. Devuelve null si no es un número.
 */
export function leerCotizacion(texto: string): number | null {
  let t = texto.trim().replace(/\s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? cuatroDecimales(n) : null
}
