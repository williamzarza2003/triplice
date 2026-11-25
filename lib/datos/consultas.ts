// Consultas cacheadas ('use cache'). En la fase 1 el catálogo solo se lee, así que se cachea por horas;
// las cotizaciones, por menos tiempo. Cuando lleguen el panel del vendedor y el admin (fases 4 y 5), cada
// cambio va a invalidar su etiqueta con updateTag.
import { cacheLife, cacheTag } from 'next/cache'
import type { Idioma } from '../i18n/idiomas'
import type { Region } from '../region'
import { rpc } from './fuente'
import type { Busqueda, CategoriaArbol, Cotizaciones, Ficha, FiltrosBusqueda, Inicio, Sugerencias, TiendaDatos } from './tipos'

export async function cotizaciones() {
  'use cache'
  cacheLife('minutes')
  cacheTag('cotizaciones')
  const c = await rpc<Cotizaciones>('cotizaciones_vigentes')
  return { ...c, tasas: { PYG: Number(c.tasas.PYG), BRL: Number(c.tasas.BRL), ARS: Number(c.tasas.ARS) } }
}

export async function categorias(idioma: Idioma) {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo')
  return rpc<CategoriaArbol[]>('categorias_arbol', { idioma })
}

export async function inicio(idioma: Idioma, region: Region) {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo')
  return rpc<Inicio>('inicio', { idioma, region })
}

export async function ficha(slug: string, idioma: Idioma) {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo', `producto:${slug}`)
  return rpc<Ficha | null>('ficha', { slug, idioma })
}

export async function tienda(slug: string, idioma: Idioma) {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo', `tienda:${slug}`)
  return rpc<TiendaDatos | null>('tienda', { slug, idioma })
}

export async function buscar(filtros: FiltrosBusqueda, idioma: Idioma) {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo')
  return rpc<Busqueda>('buscar', { ...filtros, idioma })
}

export async function slugsProductos() {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo')
  return rpc<{ slug: string; creado: string }[]>('productos_slugs')
}

export async function slugsTiendas() {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo')
  return rpc<string[]>('tiendas_lista')
}

/** Sin caché: se pide letra por letra desde el buscador. */
export function sugerir(q: string, idioma: Idioma) {
  return rpc<Sugerencias>('sugerir', { q, idioma })
}
