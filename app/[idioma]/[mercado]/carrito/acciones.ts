'use server'
// Acciones del carrito. Cambian solo la cookie (qué oferta y cuántas); nunca reciben ni guardan un precio.
// Funcionan como formularios comunes, así que el carrito se puede usar sin JavaScript.
import { agregar, cambiarCantidad, conCupon, paraDespues, quitar, unidades, type Carrito } from '@/lib/compra/carrito'
import { buscarCupon, datosOfertas, guardarCookieCarrito, leerCookieCarrito } from '@/lib/compra/servidor'

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/** No deja pedir más de lo que hay. */
async function conStock(c: Carrito, oferta: string): Promise<Carrito> {
  const d = (await datosOfertas([oferta], 'es')).get(oferta)
  const item = c.i.find((x) => x.o === oferta)
  if (!d || !item || item.c <= d.stock) return c
  return cambiarCantidad(c, oferta, Math.max(1, d.stock))
}

/** Desde la ficha: agrega una unidad y devuelve cuántas hay en el carrito (para el contador del encabezado). */
export async function agregarAlCarrito(oferta: string): Promise<{ ok: boolean; unidades: number }> {
  const c = await leerCookieCarrito()
  const d = (await datosOfertas([oferta], 'es')).get(oferta)
  if (!d || d.stock <= 0) return { ok: false, unidades: unidades(c) }
  const nuevo = await conStock(agregar(c, oferta, 1), oferta)
  await guardarCookieCarrito(nuevo)
  return { ok: true, unidades: unidades(nuevo) }
}

export async function cambiarCantidadAccion(f: FormData) {
  const oferta = texto(f, 'oferta')
  await guardarCookieCarrito(await conStock(cambiarCantidad(await leerCookieCarrito(), oferta, Number(texto(f, 'cantidad'))), oferta))
}

export async function quitarAccion(f: FormData) {
  await guardarCookieCarrito(quitar(await leerCookieCarrito(), texto(f, 'oferta')))
}

export async function paraDespuesAccion(f: FormData) {
  await guardarCookieCarrito(paraDespues(await leerCookieCarrito(), texto(f, 'oferta'), texto(f, 'guardar') === '1'))
}

export type EstadoCupon = { error: 'no_existe' | 'vencido' | 'agotado' | 'vacio' | null; codigo: string }

export async function aplicarCuponAccion(_: EstadoCupon, f: FormData): Promise<EstadoCupon> {
  const codigo = texto(f, 'cupon').toUpperCase().replace(/\s+/g, '')
  if (!codigo) return { error: 'vacio', codigo }
  const r = await buscarCupon(codigo, 'es')
  if ('error' in r) return { error: r.error, codigo }
  await guardarCookieCarrito(conCupon(await leerCookieCarrito(), codigo))
  return { error: null, codigo }
}

export async function quitarCuponAccion() {
  await guardarCookieCarrito(conCupon(await leerCookieCarrito(), null))
}
