// Vuelta de Stripe Checkout: verifica con Stripe que la sesión esté pagada y sea la de este comprador,
// confirma el pedido y lleva al comprobante. Si todavía no está pagada, el comprobante lo dice.
import { NextResponse, type NextRequest } from 'next/server'
import { confirmarPedido } from '@/lib/compra/confirmar'
import { estadoSesion } from '@/lib/compra/pago'
import { leerPedido } from '@/lib/compra/pedido'

export async function GET(req: NextRequest) {
  const sesion = req.nextUrl.searchParams.get('sesion') ?? ''
  const pedido = await leerPedido()
  if (!pedido || !sesion.startsWith('cs_')) return NextResponse.redirect(new URL('/', req.url))
  const e = await estadoSesion(sesion)
  if (e.pagada && e.numero === pedido.numero) await confirmarPedido(e.referencia)
  return NextResponse.redirect(new URL(`/${pedido.idioma}/pedido/${pedido.numero}`, req.url))
}
