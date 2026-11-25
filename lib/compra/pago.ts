// Cobro con Stripe, SOLO en modo de prueba. Con STRIPE_SECRET_KEY (sk_test_…) se usa Stripe Checkout en la
// moneda de la región; sin clave, un simulador de pago para poder probar el flujo completo en la vista previa.
// Una clave de producción (sk_live_…) se rechaza: este proyecto nunca cobra plata real.
import 'server-only'
import type Stripe from 'stripe'
import { montoStripe } from './desglose'
import type { Pedido } from './pedido'
import type { Moneda } from '../region'

export type Proveedor = 'stripe' | 'simulado'

function clave() {
  const k = process.env.STRIPE_SECRET_KEY?.trim()
  if (!k) return null
  if (!k.startsWith('sk_test_') && !k.startsWith('rk_test_')) {
    throw new Error('STRIPE_SECRET_KEY no es de prueba. Tríplice solo usa Stripe en modo de prueba: cargá una clave sk_test_….')
  }
  return k
}

export const proveedorDePago = (): Proveedor => (clave() ? 'stripe' : 'simulado')

// El SDK se carga recién al cobrar: al importarlo toca el reloj, y eso no se permite mientras Next prerenderiza
// la página de pago (además, sin claves no hace falta cargarlo nunca).
let cliente: Stripe | null = null
async function stripe() {
  const k = clave()
  if (!k) throw new Error('Stripe no está configurado')
  if (!cliente) {
    const { default: SDK } = await import('stripe')
    cliente = new SDK(k)
  }
  return cliente
}

const LOCALES = { es: 'es-419', pt: 'pt-BR', en: 'en' } as const

/** Crea la sesión de Stripe Checkout con el total ya calculado en el servidor (un solo renglón: el pedido). */
export async function crearSesion(p: Pedido, origen: string): Promise<string> {
  const descripcion = p.items.map((i) => `${i.cantidad} × ${i.titulo}`).join(' · ').slice(0, 480)
  const sesion = await (await stripe()).checkout.sessions.create({
    mode: 'payment',
    client_reference_id: p.numero,
    customer_email: p.email,
    locale: LOCALES[p.idioma as keyof typeof LOCALES] ?? 'auto',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: p.moneda.toLowerCase(),
        unit_amount: montoStripe(p.desglose.total, p.moneda as Moneda),
        product_data: { name: `Pedido ${p.numero} · Tríplice`, description: descripcion },
      },
    }],
    metadata: { numero: p.numero },
    payment_intent_data: { metadata: { numero: p.numero } },
    // vuelve a un Route Handler que verifica el pago con Stripe, confirma y lleva al comprobante
    success_url: `${origen}/api/pago/vuelta?sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origen}/${p.idioma}/pagar?cancelado=1`,
  })
  if (!sesion.url) throw new Error('Stripe no devolvió la dirección de pago')
  return sesion.url
}

/** Lo que dice Stripe de una sesión (para la página de confirmación). */
export async function estadoSesion(id: string): Promise<{ pagada: boolean; numero: string | null; referencia: string | null }> {
  const s = await (await stripe()).checkout.sessions.retrieve(id)
  return {
    pagada: s.payment_status === 'paid',
    numero: s.client_reference_id,
    referencia: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null,
  }
}

/** Verifica la firma del webhook de Stripe y devuelve el evento. */
export async function eventoWebhook(cuerpo: string, firma: string): Promise<Stripe.Event> {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET
  if (!secreto) throw new Error('Falta STRIPE_WEBHOOK_SECRET')
  return (await stripe()).webhooks.constructEvent(cuerpo, firma, secreto)
}
