// Parámetros de la URL ⇄ filtros de la búsqueda, y región y moneda del segmento interno.
import { describe, expect, it } from 'vitest'
import { aCentavosUsd, conPagina, conParametro, leerFiltros, leerMonto } from '@/lib/busqueda'
import type { Tasas } from '@/lib/precios'
import { leerMercado, mercadoPredeterminado, segmentoMercado, TODOS_LOS_MERCADOS } from '@/lib/region'

const TASAS: Tasas = { PYG: 7350, BRL: 5.45, ARS: 1180 }

describe('leerFiltros', () => {
  it('pasa el rango de precio de la moneda del comprador a centavos de dólar', () => {
    const f = leerFiltros({ pmin: '73.500', pmax: '735000' }, 'PYG', TASAS)
    expect(f.precio_min).toBe(1000)
    expect(f.precio_max).toBe(10000)
    expect(aCentavosUsd(54.5, 'BRL', TASAS)).toBe(1000)
    expect(aCentavosUsd(10, 'USD', TASAS)).toBe(1000)
  })

  it('lee los montos con los separadores de cada país', () => {
    expect(leerMonto('73.500', 'PYG')).toBe(73500)
    expect(leerMonto('₲ 1.250.000', 'PYG')).toBe(1250000)
    expect(leerMonto('1.299,90', 'BRL')).toBe(1299.9)
    expect(leerMonto('41.400', 'ARS')).toBe(41400)
    expect(leerMonto('1,299.90', 'USD')).toBe(1299.9)
    expect(leerMonto('cero', 'USD')).toBeUndefined()
  })

  it('arma los filtros de atributos desde a.clave y descarta claves raras', () => {
    const f = leerFiltros({ 'a.material': ['madera', 'hierro'], 'a.DROP TABLE': 'x' }, 'USD', TASAS)
    expect(f.atributos).toEqual({ material: ['madera', 'hierro'] })
  })

  it('ignora un orden desconocido y limita la página', () => {
    const f = leerFiltros({ orden: 'cualquiera', pagina: '9999' }, 'USD', TASAS)
    expect(f.orden).toBeUndefined()
    expect(f.pagina).toBe(50)
  })

  it('los filtros fijos de la página (categoría, tienda) ganan sobre la URL', () => {
    expect(leerFiltros({ categoria: 'otra' }, 'USD', TASAS, { categoria: 'muebles' }).categoria).toBe('muebles')
  })
})

describe('enlaces de filtros', () => {
  it('agrega y quita un valor de un filtro múltiple, y vuelve a la página 1', () => {
    const p = { q: 'silla', marca: ['Siesta'], pagina: '3' }
    expect(conParametro('/es/buscar', p, 'marca', 'Yvyrá', true)).toBe('/es/buscar?q=silla&marca=Siesta&marca=Yvyr%C3%A1')
    expect(conParametro('/es/buscar', p, 'marca', 'Siesta', true)).toBe('/es/buscar?q=silla')
  })

  it('cambia la página conservando los filtros', () => {
    expect(conPagina('/es/c/muebles', { orden: 'precio_asc' }, 2)).toBe('/es/c/muebles?orden=precio_asc&pagina=2')
    expect(conPagina('/es/c/muebles', { orden: 'precio_asc', pagina: '2' }, 1)).toBe('/es/c/muebles?orden=precio_asc')
  })
})

describe('región y moneda', () => {
  it('lee y escribe el segmento interno', () => {
    expect(leerMercado('py-pyg')).toEqual({ region: 'PY', moneda: 'PYG' })
    expect(leerMercado('br-usd')).toEqual({ region: 'BR', moneda: 'USD' })
    expect(leerMercado('fr-eur')).toBeNull()
    expect(segmentoMercado({ region: 'AR', moneda: 'ARS' })).toBe('ar-ars')
  })

  it('cada idioma tiene su combinación habitual y hay 16 combinaciones', () => {
    expect(mercadoPredeterminado('pt')).toEqual({ region: 'BR', moneda: 'BRL' })
    expect(mercadoPredeterminado('en')).toEqual({ region: 'XX', moneda: 'USD' })
    expect(TODOS_LOS_MERCADOS).toHaveLength(16)
  })
})
