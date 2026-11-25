// Webhook de Stripe (modo de prueba): confirma el pedido en la base aunque el comprador cierre la pestaña antes
// de volver. Necesita STRIPE_WEBHOOK_SECRET y, para escribir en Supabase, SUPABASE_SERVICE_ROLE_KEY.
import { NextResponse } from 'next/server'
import { eventoWebhook } from '@/lib/compra/pago'
import { rpcServicio } from '@/lib/datos/fuente'

export async function POST(req: Request) {
  const firma = req.headers.get('stripe-signature')
  if (!firma) return NextResponse.json({ error: 'Falta la firma de Stripe' }, { status: 400 })
  let evento
  try {
    evento = await eventoWebhook(await req.text(), firma)
  } catch (e) {
    return NextResponse.json({ error: `Firma inválida: ${(e as Error).message}` }, { status: 400 })
  }
  if (evento.type === 'checkout.session.completed' || evento.type === 'checkout.session.async_payment_succeeded') {
    const s = evento.data.object
    if (s.payment_status === 'paid' && s.client_reference_id) {
      const referencia = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null
      await rpcServicio('confirmar_pago', { numero: s.client_reference_id, referencia })
    }
  }
  return NextResponse.json({ recibido: true })
}
