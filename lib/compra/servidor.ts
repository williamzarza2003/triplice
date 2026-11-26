// Carrito y cotización del lado del servidor: lee la cookie, trae precio, stock, peso, categoría y tienda de
// cada oferta desde la base (como anon: el RLS decide qué se puede comprar) y arma el desglose con
// lib/compra/desglose.ts. Es lo único que calcula montos: el navegador solo los muestra.
import 'server-only'
import { cookies } from 'next/headers'
import type { Contexto } from '../contexto'
import { rpc } from '../datos/fuente'
import { normalizar } from '../texto'
import { COOKIE_CARRITO, enCarrito, escribirCarrito, guardados, leerCarrito, type Carrito, type ItemCarrito } from './carrito'
import { desglose, type Cupon, type Desglose, type Entrega, type ItemCompra, type Zona } from './desglose'
import { reglaDe, precioFinal } from './impuestos'

export type DatoOferta = {
  oferta: string
  precio: number
  stock: number
  envio_gratis: boolean
  preparacion_h: number
  variante: { sku: string; opciones: Record<string, string>; imagen: string | null }
  producto: { id: string; slug: string; titulo: string; peso_g: number; categoria: string; categoria_padre: string | null }
  tienda: {
    id: string; slug: string; nombre: string; color: string; pais: 'PY' | 'BR' | 'AR'; ciudad: string
    puntos: { nombre: string; direccion: string; ciudad: string; lat: number; lng: number; horario: string }[]
  }
}

/** Un renglón listo para mostrar: lo que hay en la cookie + lo que dice la base. */
export type Renglon = ItemCarrito & {
  dato: DatoOferta | null
  /** precio unitario con impuesto, en la moneda del comprador */
  unitario: number
  agotado: boolean
  /** se pidió más de lo que hay: la cantidad que se cobra se baja al stock */
  cantidadCobrable: number
}

export type ZonaEnvio = { pais: string; ambito: 'frontera' | 'pais' | 'mundo'; nombre: string; ciudades: string[]; base: number; kg: number; dias_min: number; dias_max: number }

const UN_MES = 60 * 60 * 24 * 30

export async function leerCookieCarrito(): Promise<Carrito> {
  return leerCarrito((await cookies()).get(COOKIE_CARRITO)?.value)
}

export async function guardarCookieCarrito(c: Carrito) {
  // no es httpOnly: el contador del encabezado la lee en el navegador. Solo guarda ids y cantidades;
  // los precios se vuelven a leer de la base cada vez.
  ;(await cookies()).set(COOKIE_CARRITO, escribirCarrito(c), {
    path: '/', maxAge: UN_MES, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  })
}

export async function datosOfertas(ids: string[], idioma: string): Promise<Map<string, DatoOferta>> {
  if (ids.length === 0) return new Map()
  const filas = await rpc<DatoOferta[]>('compra_datos', { ofertas: ids, idioma })
  return new Map(filas.map((f) => [f.oferta, { ...f, precio: Number(f.precio),
    tienda: { ...f.tienda, puntos: f.tienda.puntos.map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) })) } }]))
}

export async function zonasEnvio(idioma: string): Promise<ZonaEnvio[]> {
  return rpc<ZonaEnvio[]>('zonas_envio_lista', { idioma })
}

/** La zona de envío que corresponde a una ciudad del país del comprador (la frontera es más barata). */
export function zonaPara(zonas: ZonaEnvio[], region: string, ciudad: string | null | undefined): ZonaEnvio | null {
  if (region === 'XX') return zonas.find((z) => z.pais === 'XX') ?? null
  const delPais = zonas.filter((z) => z.pais === region)
  const c = normalizar(ciudad ?? '')
  return delPais.find((z) => z.ambito === 'frontera' && z.ciudades.includes(c)) ?? delPais.find((z) => z.ambito === 'pais') ?? null
}

export const aZona = (z: ZonaEnvio): Zona => ({ baseUsdCent: z.base, porKgUsdCent: z.kg })

export type ResultadoCupon = { cupon: Cupon; descripcion: string } | { error: 'no_existe' | 'vencido' | 'agotado' }

export async function buscarCupon(codigo: string, idioma: string): Promise<ResultadoCupon> {
  const r = await rpc<{ error?: 'no_existe' | 'vencido' | 'agotado'; codigo: string; tipo: 'porcentaje' | 'monto'; valor: number; minimo: number; descripcion: string }>(
    'validar_cupon', { codigo, idioma })
  if (r.error) return { error: r.error }
  return { cupon: { codigo: r.codigo, tipo: r.tipo, valor: Number(r.valor), minimoUsdCent: Number(r.minimo) }, descripcion: r.descripcion }
}

export type Cotizacion = {
  renglones: Renglon[]
  guardados: Renglon[]
  items: ItemCompra[]
  desglose: Desglose
  cupon: { codigo: string; descripcion: string } | { codigo: string; error: 'no_existe' | 'vencido' | 'agotado' | 'minimo' } | null
}

/** Arma la cotización completa de un carrito para un comprador (región, moneda e idioma del contexto). */
export async function cotizar(ctx: Contexto, carrito: Carrito, entrega: Entrega | null = null): Promise<Cotizacion> {
  const datos = await datosOfertas(carrito.i.map((x) => x.o), ctx.idioma)
  const armar = (x: ItemCarrito): Renglon => {
    const dato = datos.get(x.o) ?? null
    const cat = dato ? { sub: dato.producto.categoria, padre: dato.producto.categoria_padre } : null
    const unitario = dato ? precioFinal(dato.precio, reglaDe(ctx.impuestos, cat).tasa, ctx.moneda, ctx.tasas) : 0
    const agotado = !dato || dato.stock <= 0
    return { ...x, dato, unitario, agotado, cantidadCobrable: agotado ? 0 : Math.min(x.c, dato.stock) }
  }
  const renglones = enCarrito(carrito).map(armar)
  const items: ItemCompra[] = renglones.filter((r) => r.dato && r.cantidadCobrable > 0).map((r) => ({
    id: r.o, cantidad: r.cantidadCobrable, baseUsdCent: r.dato!.precio,
    regla: reglaDe(ctx.impuestos, { sub: r.dato!.producto.categoria, padre: r.dato!.producto.categoria_padre }),
    tienda: r.dato!.tienda.slug, pesoG: r.dato!.producto.peso_g, envioGratis: r.dato!.envio_gratis,
  }))

  let cupon: Cotizacion['cupon'] = null
  let cuponValido: Cupon | null = null
  if (carrito.cupon) {
    const c = await buscarCupon(carrito.cupon, ctx.idioma)
    if ('error' in c) cupon = { codigo: carrito.cupon, error: c.error }
    else { cuponValido = c.cupon; cupon = { codigo: c.cupon.codigo, descripcion: c.descripcion } }
  }
  const d = desglose({ items, moneda: ctx.moneda, tasas: ctx.tasas, cupon: cuponValido, entrega })
  if (cuponValido && d.cuponRechazado) cupon = { codigo: cuponValido.codigo, error: d.cuponRechazado }
  return { renglones, guardados: guardados(carrito).map(armar), items, desglose: d, cupon }
}
