// Precio, moneda y redondeo. Módulo puro (sin base ni red): recibe las cotizaciones como parámetro,
// así se prueba con números exactos y lo usan igual las páginas del servidor y, en la fase 2, el pago.
// En la fase 1 todavía no se suman impuestos: se convierte el precio base (USD sin impuestos).
import type { Idioma } from './i18n/idiomas'
import { LOCALE } from './i18n/idiomas'
import type { Moneda } from './region'

/** Unidades de cada moneda por 1 USD (lo que guarda la tabla cotizaciones). */
export type Tasas = Record<Exclude<Moneda, 'USD'>, number>

type Regla = { simbolo: string; decimales: number; paso: number; locale: string }

/** Cómo se muestra cada moneda. `paso` es el redondeo en listados (en unidades de la moneda). */
export const REGLAS: Record<Moneda, Regla> = {
  PYG: { simbolo: '₲', decimales: 0, paso: 1000, locale: 'es-PY' },
  BRL: { simbolo: 'R$', decimales: 2, paso: 0.1, locale: 'pt-BR' },
  ARS: { simbolo: '$', decimales: 0, paso: 100, locale: 'es-AR' },
  USD: { simbolo: 'US$', decimales: 2, paso: 0.01, locale: 'en-US' },
}

/** Convierte centavos de dólar a la moneda pedida, sin redondear (en unidades de esa moneda). */
export function convertir(usdCent: number, moneda: Moneda, tasas: Tasas): number {
  const usd = usdCent / 100
  return moneda === 'USD' ? usd : usd * tasas[moneda]
}

/**
 * Redondea al paso de la moneda trabajando en enteros de la unidad mínima, para no arrastrar errores de
 * coma flotante (0,1 + 0,2 ≠ 0,3). Con `haciaArriba`, nunca baja (para cuotas).
 */
export function redondear(valor: number, moneda: Moneda, haciaArriba = false): number {
  const { paso, decimales } = REGLAS[moneda]
  const escala = 10 ** decimales
  const pasoMinimo = Math.round(paso * escala)
  const minimo = Math.round(valor * escala * 1e6) / 1e6 // limpia el ruido de la multiplicación
  const unidades = haciaArriba ? Math.ceil(minimo / pasoMinimo) : Math.round(minimo / pasoMinimo)
  return (unidades * pasoMinimo) / escala
}

/** Precio que ve el comprador en un listado: convertido y redondeado al paso de su moneda. */
export function precioEn(usdCent: number, moneda: Moneda, tasas: Tasas): number {
  return redondear(convertir(usdCent, moneda, tasas), moneda)
}

/** "₲ 234.000", "R$ 197,60", "$ 41.400", "US$ 31.90": el formato local de cada moneda, sin importar el idioma. */
export function formatear(valor: number, moneda: Moneda): string {
  const { simbolo, decimales, locale } = REGLAS[moneda]
  const numero = new Intl.NumberFormat(locale, { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor)
  return `${simbolo} ${numero}`
}

/** Descuento entero en %, como lo calcula la tarjeta (redondeado hacia abajo para no exagerar). */
export function descuento(precioCent: number, listaCent: number | null | undefined): number {
  if (!listaCent || listaCent <= precioCent) return 0
  return Math.floor((1 - precioCent / listaCent) * 100)
}

/** Monto en palabras para lectores de pantalla ("234 000 guaraníes"), según el idioma de la interfaz. */
export function precioAccesible(valor: number, moneda: Moneda, idioma: Idioma): string {
  return new Intl.NumberFormat(LOCALE[idioma], { style: 'currency', currency: moneda, currencyDisplay: 'name',
    maximumFractionDigits: REGLAS[moneda].decimales }).format(valor)
}
