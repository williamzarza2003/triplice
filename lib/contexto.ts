// Lo que toda página necesita saber: idioma, región, moneda y cotizaciones. Sale de los segmentos raíz de la URL
// (/es/py-pyg/...) con next/root-params, nunca de cookies ni encabezados: por eso las páginas se pueden cachear.
import { idioma as idiomaRaiz, mercado as mercadoRaiz } from 'next/root-params'
import { reglaDe, precioFinal, type Categoria, type Impuestos, type Regla } from './compra/impuestos'
import { cotizaciones, impuestosVigentes } from './datos/consultas'
import { esIdioma, IDIOMA_PREDETERMINADO, type Idioma } from './i18n/idiomas'
import { formatear, type Tasas } from './precios'
import { leerMercado, mercadoPredeterminado, type Moneda, type Region } from './region'

export type Contexto = {
  idioma: Idioma; region: Region; moneda: Moneda; tasas: Tasas; cotizadoEl: string
  /** reglas de impuesto del país en el que se compra (Internacional: ninguna) */
  impuestos: Impuestos
  /** las de los tres países, para la etiqueta de frontera */
  impuestosPaises: Record<string, Regla[]>
}
export async function contexto(): Promise<Contexto> {
  const [crudo, segmento] = await Promise.all([idiomaRaiz(), mercadoRaiz()])
  return contextoDe(crudo, segmento)
}

/**
 * El mismo contexto a partir de valores explícitos. Lo usan las Server Actions, que no pueden leer los segmentos
 * raíz: la página manda su idioma y su mercado ("py-pyg") en el formulario. No hay riesgo en confiar en ellos:
 * solo eligen en qué moneda y con qué impuesto se calcula, y eso se calcula igual en el servidor.
 */
export async function contextoDe(crudo: string | undefined, segmento: string | undefined): Promise<Contexto> {
  // proxy.ts siempre manda valores válidos; si alguien escribe la URL interna a mano, se usa lo habitual
  const idioma: Idioma = esIdioma(crudo) ? crudo : IDIOMA_PREDETERMINADO
  const mercado = leerMercado(segmento) ?? mercadoPredeterminado(idioma)
  const [c, todos] = await Promise.all([cotizaciones(), impuestosVigentes(idioma)])
  return { idioma, ...mercado, tasas: c.tasas, cotizadoEl: c.desde, impuestos: { reglas: todos[mercado.region] ?? [] }, impuestosPaises: todos }
}

/** La categoría de una tarjeta o de una ficha, para buscar su impuesto. */
export const categoriaDe = (x: { categoria: string; categoria_padre: string | null }): Categoria => ({ sub: x.categoria, padre: x.categoria_padre })

/** Precio final en la moneda del contexto, con el impuesto de la región: el número que se cobra. */
export function precioNumero(ctx: Contexto, usdCent: number, cat?: Categoria | null) {
  return precioFinal(usdCent, reglaDe(ctx.impuestos, cat).tasa, ctx.moneda, ctx.tasas)
}

/** Precio en la moneda del contexto, con el impuesto de la región, ya formateado ("₲ 234.000"). */
export function precio(ctx: Contexto, usdCent: number, cat?: Categoria | null) {
  return formatear(precioNumero(ctx, usdCent, cat), ctx.moneda)
}

/** Enlace interno con el prefijo de idioma (la región y la moneda las agrega proxy.ts). */
export function ruta(idioma: Idioma, camino = '') {
  return `/${idioma}${camino}`
}
