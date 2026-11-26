// Parámetros de la búsqueda en la URL ⇄ filtros de la base. Los filtros viven en la URL (se pueden compartir,
// el botón Atrás funciona y la página se arma en el servidor). El rango de precio se escribe en la moneda
// del comprador y se pasa a centavos de dólar para la base.
import type { FiltrosBusqueda } from './datos/tipos'
import type { Tasas } from './precios'
import type { Moneda } from './region'

export type Parametros = Record<string, string | string[] | undefined>

const ORDENES = ['relevancia', 'precio_asc', 'precio_desc', 'novedades', 'vendidos', 'calificacion'] as const
export type Orden = (typeof ORDENES)[number]

const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => x.slice(0, 80)).slice(0, 20)
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const numero = (v: string | string[] | undefined) => {
  const n = Number(uno(v).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Lee un monto escrito como lo escribe la gente de cada país: "73.500" son setenta y tres mil quinientos
 * guaraníes, "1.299,90" reales con centavos y "1,299.90" dólares.
 */
export function leerMonto(texto: string | string[] | undefined, moneda: Moneda): number | undefined {
  let t = uno(texto).replace(/[^\d.,]/g, '')
  if (moneda === 'PYG' || moneda === 'ARS') t = t.replace(/[.,]/g, '')
  else if (moneda === 'BRL') t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Pasa un monto en la moneda del comprador a centavos de dólar. */
export function aCentavosUsd(monto: number, moneda: Moneda, tasas: Tasas) {
  return Math.round(((moneda === 'USD' ? monto : monto / tasas[moneda]) * 100))
}

export function leerFiltros(p: Parametros, moneda: Moneda, tasas: Tasas, fijos: Partial<FiltrosBusqueda> = {}): FiltrosBusqueda {
  const atributos: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith('a.') && /^a\.[a-z_]+$/.test(k)) atributos[k.slice(2)] = lista(v)
  }
  const pmin = leerMonto(p.pmin, moneda)
  const pmax = leerMonto(p.pmax, moneda)
  const orden = uno(p.orden) as Orden
  const pagina = Math.min(Math.max(1, Math.floor(Number(uno(p.pagina)) || 1)), 50)
  return {
    q: uno(p.q).trim().slice(0, 80) || undefined,
    categoria: uno(p.categoria) || undefined,
    ofertas: uno(p.ofertas) === '1' || undefined,
    marcas: lista(p.marca).length ? lista(p.marca) : undefined,
    precio_min: pmin ? aCentavosUsd(pmin, moneda, tasas) : undefined,
    precio_max: pmax ? aCentavosUsd(pmax, moneda, tasas) : undefined,
    estrellas: numero(p.estrellas),
    envio_gratis: uno(p.envio) === '1' || undefined,
    condicion: lista(p.condicion).length ? lista(p.condicion) : undefined,
    atributos: Object.keys(atributos).length ? atributos : undefined,
    orden: ORDENES.includes(orden) ? orden : undefined,
    pagina,
    por_pagina: 24,
    ...fijos,
  }
}

/** URL con un parámetro cambiado. `valor` null lo saca; en los de varios valores, `alternar` lo agrega o lo quita. */
export function conParametro(base: string, p: Parametros, clave: string, valor: string | null, alternar = false) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (k === 'pagina') continue // cualquier filtro nuevo vuelve a la página 1
    for (const x of lista(v)) u.append(k, x)
  }
  if (alternar && valor !== null) {
    const actuales = u.getAll(clave)
    u.delete(clave)
    const nuevos = actuales.includes(valor) ? actuales.filter((x) => x !== valor) : [...actuales, valor]
    nuevos.forEach((x) => u.append(clave, x))
  } else {
    u.delete(clave)
    if (valor !== null) u.set(clave, valor)
  }
  const s = u.toString()
  return s ? `${base}?${s}` : base
}

export function conPagina(base: string, p: Parametros, pagina: number) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (k !== 'pagina') for (const x of lista(v)) u.append(k, x)
  if (pagina > 1) u.set('pagina', String(pagina))
  const s = u.toString()
  return s ? `${base}?${s}` : base
}

export const tiene = (p: Parametros, clave: string, valor: string) => lista(p[clave]).includes(valor)
export const valorDe = uno
