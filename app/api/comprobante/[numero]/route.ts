// Comprobante en PDF. Lo puede bajar quien hizo el pedido: con su cuenta (el RLS decide) o, si compró como
// invitado, con la cookie firmada del comprobante en el mismo navegador.
import { getTranslations } from 'next-intl/server'
import { leerPedido } from '@/lib/compra/pedido'
import { armarComprobante, deMinima, type DatosComprobante, type TextosComprobante } from '@/lib/cuenta/comprobante'
import type { PedidoCuenta } from '@/lib/cuenta/pedidos'
import { opcionesTexto } from '@/lib/cuenta/pagina'
import { rpcCuenta, usuarioActual } from '@/lib/cuenta/sesion'
import { esIdioma, LOCALE, type Idioma } from '@/lib/i18n/idiomas'
import { esMoneda } from '@/lib/region'

const CLAVES: (keyof TextosComprobante)[] = ['titulo', 'simulado', 'pedido', 'fecha', 'estado', 'comprador', 'entrega', 'retiro', 'domicilio',
  'producto', 'cantidad', 'unitario', 'impuesto', 'subtotal', 'productos', 'cupon', 'envio', 'gratis', 'total', 'incluye', 'cotizacion', 'pie', 'pagina']

async function datosDeLaCuenta(numero: string, idioma: Idioma): Promise<DatosComprobante | null> {
  if (!(await usuarioActual())) return null
  const p = await rpcCuenta<PedidoCuenta | null>('mi_pedido', { numero })
  if (!p || !esMoneda(p.moneda)) return null
  const m = p.moneda
  const e = p.entrega
  const perfil = await rpcCuenta<{ nombre: string; telefono: string | null }>('mi_cuenta')
  return {
    numero: p.numero, creado: p.creado, estado: p.estado, locale: LOCALE[idioma],
    comprador: { nombre: e.nombre ?? perfil?.nombre ?? '', email: p.email, telefono: e.telefono ?? perfil?.telefono ?? '' },
    entrega: e.modo === 'retiro'
      ? { modo: 'retiro', texto: e.puntos.map((x) => `${x.tienda}: ${x.direccion}, ${x.ciudad}`) }
      : { modo: 'domicilio', texto: [e.direccion] },
    moneda: m, cotizacion: m === 'USD' ? null : Number(p.cotizacion),
    items: p.items.map((x) => ({
      titulo: x.titulo, detalle: [opcionesTexto(x.opciones, idioma), x.tienda].filter(Boolean).join(' · '),
      cantidad: x.cantidad, precio: deMinima(x.precio, m), tasa: Number(x.tasa),
    })),
    productos: deMinima(p.productos, m), descuento: deMinima(p.descuento, m), cupon: p.cupon, envio: deMinima(p.envio, m), total: deMinima(p.total, m),
    impuestos: p.impuestos.map((x) => ({ nombre: x.nombre, monto: deMinima(x.monto, m) })),
  }
}

async function datosDelInvitado(numero: string, idioma: Idioma): Promise<DatosComprobante | null> {
  const p = await leerPedido()
  if (!p || p.numero !== numero || !esMoneda(p.moneda)) return null
  const e = p.entrega
  return {
    numero: p.numero, creado: p.creado, estado: p.estado, locale: LOCALE[idioma],
    comprador: { nombre: p.nombre, email: p.email, telefono: p.telefono },
    entrega: e.modo === 'retiro'
      ? { modo: 'retiro', texto: e.puntos.map((x) => `${x.tienda}: ${x.direccion}, ${x.ciudad}`) }
      : { modo: 'domicilio', texto: [e.direccion] },
    moneda: p.moneda, cotizacion: null,
    items: p.items.map((x) => ({ titulo: x.titulo, detalle: [x.opciones, x.tienda].filter(Boolean).join(' · '), cantidad: x.cantidad, precio: x.precio, tasa: null })),
    productos: p.desglose.productos, descuento: p.desglose.descuento, cupon: p.cupon, envio: p.desglose.envio, total: p.desglose.total,
    impuestos: p.desglose.impuestos.map((x) => ({ nombre: x.nombre, monto: x.monto })),
  }
}

export async function GET(req: Request, { params }: RouteContext<'/api/comprobante/[numero]'>) {
  const { numero } = await params
  const pedido = new URL(req.url).searchParams.get('idioma')
  const idioma: Idioma = esIdioma(pedido) ? pedido : 'es'
  if (!/^TR-[A-Z0-9]{6}$/.test(numero)) return new Response('Número de pedido inválido.', { status: 400 })

  const datos = (await datosDeLaCuenta(numero, idioma)) ?? (await datosDelInvitado(numero, idioma))
  if (!datos) {
    return new Response('No encontramos ese pedido en tu cuenta ni en este navegador. Entrá con la cuenta con la que compraste.', {
      status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  const t = await getTranslations({ locale: idioma, namespace: 'comprobante' })
  const textos = Object.fromEntries(CLAVES.map((k) => [k, t.raw(k) as string])) as TextosComprobante
  textos.estado = t('estado')
  const estados = t.raw('estados') as Record<string, string>
  const pdf = await armarComprobante({ ...datos, estado: estados[datos.estado] ?? datos.estado }, textos)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="triplice-${numero}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
