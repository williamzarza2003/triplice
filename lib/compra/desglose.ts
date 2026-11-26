// Desglose de una compra: productos, envío, cupón, total e impuestos incluidos. Módulo puro (sin base ni red):
// el servidor lo llama con los datos de la base al mostrar el carrito y otra vez al cobrar; el navegador nunca
// calcula un monto.
//
// Reglas de redondeo (docs/arquitectura.md, fase 2):
// - Cada renglón se redondea al paso de la moneda y el total es la suma de lo que se ve. Así el total siempre
//   cierra con los precios que el comprador vio en las tarjetas.
// - En Paraguay, Brasil y Argentina los precios llevan los impuestos incluidos; el desglose los informa
//   ("Incluye IVA 10 %: ₲ 21.000") calculados sobre lo que efectivamente se cobra (después del cupón).
// - El envío se cobra por tienda: cada vendedor despacha lo suyo. Si todo lo de una tienda tiene envío gratis,
//   o se retira en el local, esa tienda no cobra envío.
import { convertir, redondear, type Tasas } from '../precios'
import type { Moneda } from '../region'
import { precioFinal, type Regla } from './impuestos'

export type ItemCompra = {
  id: string
  cantidad: number
  /** precio base de la oferta, en centavos de dólar y sin impuestos */
  baseUsdCent: number
  regla: Regla
  tienda: string
  pesoG: number
  envioGratis: boolean
}

export type Cupon = {
  codigo: string
  tipo: 'porcentaje' | 'monto'
  /** porcentaje (10 = 10 %) o monto en centavos de dólar */
  valor: number
  /** compra mínima en centavos de dólar (sobre los productos con impuestos) */
  minimoUsdCent: number
}

export type Zona = { baseUsdCent: number; porKgUsdCent: number }
export type Entrega = { modo: 'retiro' } | { modo: 'domicilio'; zona: Zona }

export type Desglose = {
  moneda: Moneda
  lineas: { id: string; unitario: number; total: number }[]
  productos: number
  envioPorTienda: Record<string, number>
  envio: number
  descuento: number
  total: number
  impuestos: { nombre: string; tasa: number; monto: number }[]
  /** por qué no se aplicó el cupón (si se pidió uno) */
  cuponRechazado: 'minimo' | null
}

/** Kilos que se cobran: se redondea para arriba al medio kilo (como las transportadoras). */
export const kilosCobrables = (gramos: number) => Math.max(0.5, Math.ceil(gramos / 500) / 2)

export function costoEnvio(zona: Zona, gramos: number, moneda: Moneda, tasas: Tasas): number {
  const usdCent = zona.baseUsdCent + zona.porKgUsdCent * kilosCobrables(gramos)
  return redondear(convertir(usdCent, moneda, tasas), moneda)
}

export function desglose({ items, moneda, tasas, cupon = null, entrega = null }: {
  items: ItemCompra[]; moneda: Moneda; tasas: Tasas; cupon?: Cupon | null; entrega?: Entrega | null
}): Desglose {
  const lineas = items.map((it) => {
    const unitario = precioFinal(it.baseUsdCent, it.regla.tasa, moneda, tasas)
    return { id: it.id, unitario, total: unitario * it.cantidad }
  })
  const productos = lineas.reduce((s, l) => s + l.total, 0)

  // envío por tienda
  const envioPorTienda: Record<string, number> = {}
  if (entrega?.modo === 'domicilio') {
    const tiendas = [...new Set(items.map((i) => i.tienda))]
    for (const t of tiendas) {
      const suyos = items.filter((i) => i.tienda === t)
      const gratis = suyos.every((i) => i.envioGratis)
      const gramos = suyos.reduce((s, i) => s + i.pesoG * i.cantidad, 0)
      envioPorTienda[t] = gratis ? 0 : costoEnvio(entrega.zona, gramos, moneda, tasas)
    }
  } else {
    for (const i of items) envioPorTienda[i.tienda] = 0
  }
  const envio = Object.values(envioPorTienda).reduce((s, x) => s + x, 0)

  // cupón: sobre los productos (con impuestos), nunca más que los productos
  let descuento = 0
  let cuponRechazado: Desglose['cuponRechazado'] = null
  if (cupon) {
    const minimo = convertir(cupon.minimoUsdCent, moneda, tasas)
    if (productos < minimo) cuponRechazado = 'minimo'
    else {
      const crudo = cupon.tipo === 'porcentaje' ? (productos * cupon.valor) / 100 : convertir(cupon.valor, moneda, tasas)
      descuento = Math.min(productos, redondear(crudo, moneda))
    }
  }

  // impuestos incluidos, por tasa, sobre lo que se cobra de cada grupo después del cupón
  const proporcion = productos > 0 ? (productos - descuento) / productos : 0
  const grupos = new Map<string, { nombre: string; tasa: number; bruto: number }>()
  items.forEach((it, k) => {
    if (it.regla.tasa <= 0) return
    const clave = `${it.regla.nombre}|${it.regla.tasa}`
    const g = grupos.get(clave) ?? { nombre: it.regla.nombre, tasa: it.regla.tasa, bruto: 0 }
    g.bruto += lineas[k].total
    grupos.set(clave, g)
  })
  const impuestos = [...grupos.values()]
    .sort((a, b) => b.tasa - a.tasa)
    .map((g) => ({ nombre: g.nombre, tasa: g.tasa, monto: redondear((g.bruto * proporcion * g.tasa) / (1 + g.tasa), moneda) }))

  return { moneda, lineas, productos, envioPorTienda, envio, descuento, total: productos - descuento + envio, impuestos, cuponRechazado }
}

/**
 * Monto para Stripe en la unidad mínima de la moneda: PYG no tiene decimales en Stripe; BRL, ARS y USD van
 * en centavos.
 */
export function montoStripe(total: number, moneda: Moneda): number {
  return moneda === 'PYG' ? Math.round(total) : Math.round(total * 100)
}
