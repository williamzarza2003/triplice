// Conversión, redondeo y formato por moneda (lib/precios.ts) con los números de docs/arquitectura.md.
import { describe, expect, it } from 'vitest'
import { convertir, descuento, formatear, precioEn, redondear, type Tasas } from '@/lib/precios'

const TASAS: Tasas = { PYG: 7350, BRL: 5.45, ARS: 1180 }

describe('convertir', () => {
  it('pasa centavos de dólar a cada moneda', () => {
    expect(convertir(2900, 'USD', TASAS)).toBe(29)
    expect(convertir(2900, 'PYG', TASAS)).toBe(213150)
    expect(convertir(2900, 'BRL', TASAS)).toBeCloseTo(158.05, 10)
    expect(convertir(2900, 'ARS', TASAS)).toBe(34220)
  })
})

describe('redondear al paso de cada moneda', () => {
  it('guaraníes de a mil, pesos de a cien, reales de a diez centavos', () => {
    expect(redondear(234465, 'PYG')).toBe(234000)
    expect(redondear(234500, 'PYG')).toBe(235000)
    expect(redondear(41406.2, 'ARS')).toBe(41400)
    expect(redondear(197.5625, 'BRL')).toBe(197.6)
    expect(redondear(31.899999, 'USD')).toBe(31.9)
  })

  it('no arrastra errores de coma flotante', () => {
    expect(redondear(0.1 + 0.2, 'USD')).toBe(0.3)
    expect(redondear(158.05, 'BRL')).toBe(158.1)
  })

  it('hacia arriba nunca baja (cuotas)', () => {
    expect(redondear(78000.01, 'PYG', true)).toBe(79000)
    expect(redondear(78000, 'PYG', true)).toBe(78000)
  })

  it('reproduce el ejemplo de la arquitectura (pava eléctrica, sin impuestos)', () => {
    expect(precioEn(2900, 'PYG', TASAS)).toBe(213000)
    expect(precioEn(2900, 'BRL', TASAS)).toBe(158.1)
    expect(precioEn(2900, 'ARS', TASAS)).toBe(34200)
    expect(precioEn(2900, 'USD', TASAS)).toBe(29)
  })
})

describe('formatear', () => {
  it('usa el formato local de cada moneda', () => {
    expect(formatear(234000, 'PYG')).toBe('₲ 234.000')
    expect(formatear(197.6, 'BRL')).toBe('R$ 197,60')
    expect(formatear(41400, 'ARS')).toBe('$ 41.400')
    expect(formatear(31.9, 'USD')).toBe('US$ 31.90')
  })
})

describe('descuento', () => {
  it('redondea hacia abajo para no exagerar la oferta', () => {
    expect(descuento(2900, 3500)).toBe(17)
    expect(descuento(1000, 1000)).toBe(0)
    expect(descuento(1000, null)).toBe(0)
  })
})
