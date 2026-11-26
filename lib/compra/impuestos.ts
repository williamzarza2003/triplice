// Impuestos por país y categoría (simulación aproximada, configurable en la tabla reglas_impuesto).
// Módulo puro: recibe las reglas como parámetro. Lo usan igual los listados, el carrito y el pago.
import { convertir, redondear, type Tasas } from '../precios'
import type { Moneda } from '../region'

/** Una regla vigente: `categoria` nulo = tasa general del país. `nombre` ya viene en el idioma de la página. */
export type Regla = { categoria: string | null; nombre: string; tasa: number }

/** Las reglas de la región en la que se compra. Sin reglas (Internacional), no hay impuestos locales. */
export type Impuestos = { reglas: Regla[] }

export type Categoria = { sub: string; padre: string | null }

const SIN_IMPUESTO: Regla = { categoria: null, nombre: '', tasa: 0 }

/** La regla que aplica: la de la subcategoría, si no la de la categoría principal, si no la general. */
export function reglaDe(impuestos: Impuestos, cat: Categoria | null | undefined): Regla {
  const r = impuestos.reglas
  return (cat && (r.find((x) => x.categoria === cat.sub) ?? (cat.padre ? r.find((x) => x.categoria === cat.padre) : undefined)))
    ?? r.find((x) => x.categoria === null) ?? SIN_IMPUESTO
}

/**
 * Precio que ve el comprador: base en USD sin impuestos → con el impuesto de su país → en su moneda,
 * redondeado al paso de la moneda. Es el mismo número en la tarjeta, la ficha, el carrito y el pago.
 */
export function precioFinal(baseUsdCent: number, tasa: number, moneda: Moneda, tasas: Tasas): number {
  return redondear(convertir(baseUsdCent, moneda, tasas) * (1 + tasa), moneda)
}
