// Alertas de precio: montos en la unidad mínima de cada moneda (₲ y $ enteros, R$ y US$ en centavos), como los
// guarda la base. Módulo puro: lo usan la ficha (navegador), la Server Action y las pruebas.
import { formatear, REGLAS } from '../precios'
import type { Moneda } from '../region'

const escala = (m: Moneda) => 10 ** REGLAS[m].decimales
/** El paso de redondeo de la moneda en su unidad mínima (₲ 1.000 → 1000; R$ 0,10 → 10). */
export const pasoMinimo = (m: Moneda) => Math.round(REGLAS[m].paso * escala(m))

/** De la unidad de la moneda (234000, 197.6) a la mínima (234000, 19760). */
export const aMinimo = (valor: number, m: Moneda) => Math.round(valor * escala(m))
export const deMinimo = (minimo: number, m: Moneda) => Number(minimo) / escala(m)
export const formatearMinimo = (minimo: number, m: Moneda) => formatear(deMinimo(minimo, m), m)

/**
 * Lee lo que escribió el comprador ("230.000", "₲ 230 000", "197,60", "31.90") en la moneda del mercado y lo pasa a la
 * unidad mínima. Guaraníes y pesos no tienen decimales: los puntos y espacios son separadores de miles. En reales y
 * dólares, la última coma o punto seguida de 1 o 2 cifras son los centavos. Devuelve null si no es un monto.
 */
export function leerMonto(texto: string, m: Moneda): number | null {
  const limpio = texto.replace(/[^\d.,]/g, '')
  if (!/\d/.test(limpio) || limpio.length > 20) return null
  if (REGLAS[m].decimales === 0) {
    const n = Number(limpio.replace(/[.,]/g, ''))
    return Number.isSafeInteger(n) && n > 0 ? n : null
  }
  const centavos = limpio.match(/^(.*)[.,](\d{1,2})$/)
  const enteros = (centavos ? centavos[1] : limpio).replace(/[.,]/g, '')
  const n = Number(enteros || '0') * 100 + (centavos ? Number(centavos[2].padEnd(2, '0')) : 0)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** El objetivo que se sugiere: un 10 % menos que el precio de hoy, redondeado hacia abajo al paso de la moneda. */
export function objetivoSugerido(precioMinimo: number, m: Moneda) {
  const paso = pasoMinimo(m)
  return Math.max(paso, Math.floor((precioMinimo * 0.9) / paso) * paso)
}

/** Cuánto bajó, en %, entre el precio al crear la alerta y el de hoy (redondeado hacia abajo para no exagerar). */
export const bajo = (antes: number, ahora: number) => (antes > ahora ? Math.floor((1 - ahora / antes) * 100) : 0)

/** Para mostrar el monto en el campo del formulario, sin símbolo ("230.000", "197,60"). */
export function montoParaCampo(minimo: number, m: Moneda) {
  const { decimales, locale } = REGLAS[m]
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(deMinimo(minimo, m))
}
