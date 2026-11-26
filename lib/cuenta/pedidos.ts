// Tipos de lo que devuelven las funciones de la cuenta y el trayecto de un pedido (módulo puro: se prueba con Vitest).

export type EstadoPedido = 'pendiente_pago' | 'confirmado' | 'preparando' | 'enviado' | 'listo_retiro' | 'entregado' | 'cancelado' | 'devolucion'
export type Modo = 'retiro' | 'domicilio'

export type PedidoResumen = {
  numero: string; estado: EstadoPedido; moneda: string; total: number; creado: string; modo: Modo
  items: number; fotos: (string | null)[]; devolucion: boolean
}

export type EstadoDevolucion = 'solicitada' | 'aprobada' | 'rechazada' | 'reembolsada'

export type ItemCuenta = {
  id: number; titulo: string; opciones: Record<string, string>; cantidad: number; precio: number; tasa: number; impuesto: string
  tienda: string | null; tienda_slug: string | null; slug: string | null; imagen: string | null
  resena: { id: string; estrellas: number } | null
  devolucion: { estado: EstadoDevolucion; motivo: string; creado: string } | null
}

export type Entrega =
  | { modo: 'retiro'; nombre?: string; telefono?: string; puntos: { tienda: string; nombre: string; direccion: string; ciudad: string; horario: string; lat: number; lng: number; listoEnH: number }[] }
  | { modo: 'domicilio'; nombre?: string; telefono?: string; zona: string; direccion: string; diasMin: number; diasMax: number }

export type PedidoCuenta = {
  numero: string; estado: EstadoPedido; email: string; region: string; idioma: string; moneda: string; cotizacion: number
  productos: number; envio: number; descuento: number; total: number; impuestos: { nombre: string; monto: number }[]
  cupon: string | null; entrega: Entrega; creado: string; proveedor: 'stripe' | 'simulado'; entregado: string | null
  items: ItemCuenta[]; eventos: { estado: string; creado: string }[]
}

export type Parada = { clave: 'confirmado' | 'preparando' | 'enviado' | 'listoRetiro' | 'entregado'; hecho: boolean; fecha: string | null; actual: boolean }

const ORDEN: Record<string, number> = { confirmado: 0, preparando: 1, enviado: 2, listo_retiro: 2, entregado: 3, devolucion: 3 }

/**
 * Las cuatro paradas del pedido (confirmado → preparando → en camino o listo para retirar → entregado), con la
 * fecha de cada una si ya pasó. `actual` marca dónde está el pedido ahora (la última parada cumplida).
 */
export function trayecto(estado: EstadoPedido, modo: Modo, eventos: { estado: string; creado: string }[] = []): Parada[] {
  const llegado = ORDEN[estado] ?? -1
  const fecha = (e: string) => eventos.filter((x) => x.estado === e).map((x) => x.creado).sort().at(-1) ?? null
  const tercera = modo === 'retiro' ? 'listoRetiro' : 'enviado'
  const paradas: Parada[] = [
    { clave: 'confirmado', hecho: llegado >= 0, fecha: fecha('confirmado'), actual: false },
    { clave: 'preparando', hecho: llegado >= 1, fecha: fecha('preparando'), actual: false },
    { clave: tercera, hecho: llegado >= 2, fecha: fecha(modo === 'retiro' ? 'listo_retiro' : 'enviado'), actual: false },
    { clave: 'entregado', hecho: llegado >= 3, fecha: fecha('entregado'), actual: false },
  ]
  if (estado !== 'cancelado' && estado !== 'pendiente_pago') {
    const ultima = paradas.findLastIndex((p) => p.hecho)
    if (ultima !== -1) paradas[ultima].actual = true
  }
  return paradas
}

export const DIAS_DEVOLUCION = 7

/** ¿Todavía se puede pedir la devolución? Hasta 7 días después de la entrega. */
export function plazoDevolucion(entregado: string | null, ahora = Date.now()): { abierto: boolean; hasta: Date | null } {
  if (!entregado) return { abierto: false, hasta: null }
  const hasta = new Date(new Date(entregado).getTime() + DIAS_DEVOLUCION * 864e5)
  return { abierto: hasta.getTime() > ahora, hasta }
}
