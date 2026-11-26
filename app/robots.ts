import type { MetadataRoute } from 'next'
import { SITIO } from '@/lib/sitio'

// El carrito, el pago y los comprobantes son personales: no tienen nada que indexar.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/*/carrito', '/*/pagar', '/*/pedido/'] },
    host: SITIO,
  }
}
