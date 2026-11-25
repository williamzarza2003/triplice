// Lo que toda página necesita saber: idioma, región, moneda y cotizaciones. Sale de los segmentos raíz de la URL
// (/es/py-pyg/...) con next/root-params, nunca de cookies ni encabezados: por eso las páginas se pueden cachear.
import { idioma as idiomaRaiz, mercado as mercadoRaiz } from 'next/root-params'
import { cotizaciones } from './datos/consultas'
import { esIdioma, IDIOMA_PREDETERMINADO, type Idioma } from './i18n/idiomas'
import { formatear, precioEn, type Tasas } from './precios'
import { leerMercado, mercadoPredeterminado, type Moneda, type Region } from './region'

export type Contexto = { idioma: Idioma; region: Region; moneda: Moneda; tasas: Tasas; cotizadoEl: string }
export async function contexto(): Promise<Contexto> {
  const [crudo, segmento] = await Promise.all([idiomaRaiz(), mercadoRaiz()])
  // proxy.ts siempre manda valores válidos; si alguien escribe la URL interna a mano, se usa lo habitual
  const idioma: Idioma = esIdioma(crudo) ? crudo : IDIOMA_PREDETERMINADO
  const mercado = leerMercado(segmento) ?? mercadoPredeterminado(idioma)
  const c = await cotizaciones()
  return { idioma, ...mercado, tasas: c.tasas, cotizadoEl: c.desde }
}

/** Precio en la moneda del contexto, ya formateado ("₲ 213.000"). */
export function precio(ctx: Contexto, usdCent: number) {
  return formatear(precioEn(usdCent, ctx.moneda, ctx.tasas), ctx.moneda)
}

/** Enlace interno con el prefijo de idioma (la región y la moneda las agrega proxy.ts). */
export function ruta(idioma: Idioma, camino = '') {
  return `/${idioma}${camino}`
}
