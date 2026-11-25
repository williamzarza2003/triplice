// Pago confirmado (por el simulador, por la vuelta de Stripe o por su webhook): el pedido pasa a confirmado
// en la base (si hay rol de servicio) y en el comprobante del comprador, y lo comprado sale del carrito.
// Escribe cookies: solo se llama desde Server Actions y Route Handlers.
import 'server-only'
import { rpcServicio } from '../datos/fuente'
import { guardados } from './carrito'
import { guardarPedido, leerPedido, type Pedido } from './pedido'
import { guardarCookieCarrito, leerCookieCarrito } from './servidor'

export async function confirmarPedido(referencia: string | null): Promise<Pedido | null> {
  const p = await leerPedido()
  if (!p) return null
  if (p.estado === 'confirmado') return p
  await rpcServicio('confirmar_pago', { numero: p.numero, referencia }).catch((e) => console.error('No se pudo confirmar en la base', e))
  const confirmado: Pedido = { ...p, estado: 'confirmado' }
  await guardarPedido(confirmado)
  // lo comprado sale del carrito; lo guardado para después se queda
  await guardarCookieCarrito({ v: 1, i: guardados(await leerCookieCarrito()) })
  return confirmado
}
