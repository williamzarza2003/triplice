'use server'
// Pagar: valida los datos, recalcula TODO en el servidor (precios, impuestos, envío y cupón con la base de este
// momento), registra el pedido congelado y manda a Stripe (modo de prueba) o al simulador.
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { direccionEnUnaLinea, validarDatos, type Campo, type Error as ErrorCampo, type Modo } from '@/lib/compra/direccion'
import { crearSesion, proveedorDePago } from '@/lib/compra/pago'
import { confirmarPedido } from '@/lib/compra/confirmar'
import { guardarPedido, leerPedido, nuevaClave, nuevoNumero, type Pedido } from '@/lib/compra/pedido'
import { aZona, cotizar, leerCookieCarrito, zonaPara, zonasEnvio } from '@/lib/compra/servidor'
import COLORES from '@/lib/catalogo/colores.json'
import { contextoDe } from '@/lib/contexto'
import { rpcServicio } from '@/lib/datos/fuente'
import { REGLAS } from '@/lib/precios'
import type { Moneda } from '@/lib/region'
import { SITIO } from '@/lib/sitio'
import { usuarioActual } from '@/lib/cuenta/sesion'

export type EstadoPago = { errores: Partial<Record<Campo, ErrorCampo>>; general: 'sin_items' | 'cambio' | 'pago' | null; valores: Record<string, string> } | null

const texto = (f: FormData, k: string) => String(f.get(k) ?? '')
const NOMBRE_COLOR = COLORES as Record<string, Record<string, string>>

/** Unidad mínima de la moneda (lo que guarda la base): ₲ y $ enteros, R$ y US$ en centavos. */
const minima = (n: number, m: Moneda) => Math.round(n * 10 ** REGLAS[m].decimales)

export async function pagarAccion(_: EstadoPago, f: FormData): Promise<EstadoPago> {
  const ctx = await contextoDe(texto(f, 'idioma'), texto(f, 'mercado'))
  const modo: Modo = texto(f, 'modo') === 'domicilio' ? 'domicilio' : 'retiro'
  const valores = Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]))
  const v = validarDatos(ctx.region, modo, valores)
  if (!v.ok) return { errores: v.errores, general: null, valores }

  const carrito = await leerCookieCarrito()
  const zonas = await zonasEnvio(ctx.idioma)
  const zona = modo === 'domicilio' ? zonaPara(zonas, ctx.region, v.datos.ciudad) : null
  const cot = await cotizar(ctx, carrito, zona ? { modo: 'domicilio', zona: aZona(zona) } : { modo: 'retiro' })
  if (cot.items.length === 0) return { errores: {}, general: 'sin_items', valores }
  // el total que vio la persona tiene que ser el mismo que se va a cobrar (si cambió un precio o el stock, se avisa)
  if (texto(f, 'total') !== String(cot.desglose.total)) return { errores: {}, general: 'cambio', valores }

  const comprables = cot.renglones.filter((r) => r.dato && r.cantidadCobrable > 0)
  const tiendas = [...new Map(comprables.map((r) => [r.dato!.tienda.slug, r.dato!])).values()]
  const opciones = (o: Record<string, string>) => Object.entries(o).map(([k, x]) => (k === 'color' ? NOMBRE_COLOR[x]?.[ctx.idioma] ?? x : x)).join(' · ')

  const pedido: Pedido = {
    numero: nuevoNumero(), clave: nuevaClave(), estado: 'pendiente_pago', proveedor: proveedorDePago(),
    region: ctx.region, moneda: ctx.moneda, idioma: ctx.idioma, creado: new Date().toISOString(),
    nombre: v.datos.nombre!, email: v.datos.email!, telefono: v.datos.telefono!,
    entrega: modo === 'retiro'
      ? { modo: 'retiro', puntos: tiendas.map((d) => ({ tienda: d.tienda.nombre, ...d.tienda.puntos[0],
          listoEnH: Math.max(...comprables.filter((r) => r.dato!.tienda.slug === d.tienda.slug).map((r) => r.dato!.preparacion_h)) })) }
      : { modo: 'domicilio', zona: zona!.nombre, direccion: direccionEnUnaLinea(ctx.region, v.datos), diasMin: zona!.dias_min, diasMax: zona!.dias_max },
    items: comprables.slice(0, 12).map((r) => ({ titulo: r.dato!.producto.titulo, opciones: opciones(r.dato!.variante.opciones), cantidad: r.cantidadCobrable,
      precio: r.unitario, tienda: r.dato!.tienda.nombre, imagen: r.dato!.variante.imagen })),
    desglose: { productos: cot.desglose.productos, envio: cot.desglose.envio, descuento: cot.desglose.descuento, total: cot.desglose.total, impuestos: cot.desglose.impuestos },
    cupon: cot.cupon && !('error' in cot.cupon) ? cot.cupon.codigo : null,
  }

  // en la base (si hay rol de servicio): congelado, con los montos en la unidad mínima de la moneda
  const m = ctx.moneda
  // con sesión, el pedido queda en la cuenta (Mis pedidos); el nombre y el teléfono van con la entrega
  const comprador = await usuarioActual()
  await rpcServicio('registrar_pedido', {
    numero: pedido.numero, clave: pedido.clave, comprador_id: comprador?.id ?? '', email: pedido.email, region: ctx.region, idioma: ctx.idioma, moneda: m,
    cotizacion: m === 'USD' ? 1 : ctx.tasas[m], productos: minima(cot.desglose.productos, m), envio: minima(cot.desglose.envio, m),
    descuento: minima(cot.desglose.descuento, m), total: minima(cot.desglose.total, m),
    impuestos: cot.desglose.impuestos.map((x) => ({ ...x, monto: minima(x.monto, m) })), cupon: pedido.cupon,
    entrega: { ...pedido.entrega, nombre: pedido.nombre, telefono: pedido.telefono }, proveedor: pedido.proveedor,
    items: comprables.map((r) => ({ oferta: r.o, tienda_id: r.dato!.tienda.id, producto_id: r.dato!.producto.id, titulo: r.dato!.producto.titulo,
      opciones: r.dato!.variante.opciones, cantidad: r.cantidadCobrable, precio: minima(r.unitario, m),
      tasa: cot.items.find((i) => i.id === r.o)!.regla.tasa, impuesto: cot.items.find((i) => i.id === r.o)!.regla.nombre })),
  }).catch((e) => console.error('No se pudo registrar el pedido en la base', e))
  await guardarPedido(pedido)

  let destino: string
  if (pedido.proveedor === 'stripe') {
    try {
      const h = await headers()
      const origen = h.get('origin') ?? SITIO
      destino = await crearSesion(pedido, origen)
    } catch (e) {
      console.error('Stripe no creó la sesión de pago', e)
      return { errores: {}, general: 'pago', valores }
    }
  } else {
    destino = `/${ctx.idioma}/pagar/simulador`
  }
  redirect(destino)
}

export type EstadoSimulador = { rechazada: boolean } | null

/** Simulador de pago (solo sin claves de Stripe): no pide datos de tarjeta, se elige el resultado de la prueba. */
export async function simularPagoAccion(_: EstadoSimulador, f: FormData): Promise<EstadoSimulador> {
  if (proveedorDePago() !== 'simulado') return null
  const p = await leerPedido()
  if (!p) redirect('/')
  if (texto(f, 'resultado') === 'rechazada') return { rechazada: true }
  await confirmarPedido(`sim_${p.numero}`)
  redirect(`/${p.idioma}/pedido/${p.numero}`)
}
