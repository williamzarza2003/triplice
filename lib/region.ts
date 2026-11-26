// Región (dónde comprás) y moneda (en qué ves los precios). Viajan en una cookie y, por dentro,
// en un segmento oculto de la URL ("py-pyg") que agrega proxy.ts: así cada combinación se cachea aparte
// y la URL que ve la gente sigue siendo /es/p/pava-electrica.
import type { Idioma } from './i18n/idiomas'

export const REGIONES = ['PY', 'BR', 'AR', 'XX'] as const
export type Region = (typeof REGIONES)[number]
export const MONEDAS = ['PYG', 'BRL', 'ARS', 'USD'] as const
export type Moneda = (typeof MONEDAS)[number]

export const MONEDA_DE: Record<Region, Moneda> = { PY: 'PYG', BR: 'BRL', AR: 'ARS', XX: 'USD' }
export const REGION_DE_IDIOMA: Record<Idioma, Region> = { es: 'PY', pt: 'BR', en: 'XX' }

export const COOKIE_REGION = 'triplice_region'
export const COOKIE_MONEDA = 'triplice_moneda'
export const COOKIE_IDIOMA = 'triplice_idioma'

export type Mercado = { region: Region; moneda: Moneda }

export function esRegion(x: unknown): x is Region {
  return typeof x === 'string' && (REGIONES as readonly string[]).includes(x)
}
export function esMoneda(x: unknown): x is Moneda {
  return typeof x === 'string' && (MONEDAS as readonly string[]).includes(x)
}

/** "py-pyg" ⇄ { region: 'PY', moneda: 'PYG' } */
export function leerMercado(segmento: string | undefined): Mercado | null {
  const [r, m] = (segmento ?? '').toUpperCase().split('-')
  return esRegion(r) && esMoneda(m) ? { region: r, moneda: m } : null
}
export function segmentoMercado({ region, moneda }: Mercado) {
  return `${region}-${moneda}`.toLowerCase()
}

export function mercadoPredeterminado(idioma: Idioma): Mercado {
  const region = REGION_DE_IDIOMA[idioma]
  return { region, moneda: MONEDA_DE[region] }
}

/** Todas las combinaciones válidas (para generateStaticParams y las pruebas). */
export const TODOS_LOS_MERCADOS = REGIONES.flatMap((region) => MONEDAS.map((moneda) => segmentoMercado({ region, moneda })))

/** Ciudad de referencia para los textos de entrega de cada región. */
export const CIUDAD_REFERENCIA: Record<Region, string | null> = {
  PY: 'Ciudad del Este', BR: 'Foz do Iguaçu', AR: 'Puerto Iguazú', XX: null,
}
