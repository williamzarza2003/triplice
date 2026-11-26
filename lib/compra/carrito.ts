// Carrito del invitado: vive en una cookie (no hace falta cuenta ni base para comprar). Solo guarda qué
// oferta y cuántas: el precio, el stock y los impuestos se leen de la base cada vez que se muestra o se cobra.
// Con cuenta (fase 3), el mismo contenido se guarda en carritos/carrito_items y al iniciar sesión se fusiona
// con fusionar() (la misma regla que la función SQL fusionar_carrito).

export type ItemCarrito = { o: string; c: number; d?: 1 }
export type Carrito = { v: 1; i: ItemCarrito[]; cupon?: string }

export const COOKIE_CARRITO = 'triplice_carrito'
export const MAX_RENGLONES = 30
export const MAX_CANTIDAD = 10

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const CUPON = /^[A-Z0-9]{3,20}$/

export const vacio = (): Carrito => ({ v: 1, i: [] })

const acotar = (n: number) => Math.min(MAX_CANTIDAD, Math.max(1, Math.floor(n) || 1))

/** Lee la cookie. Cualquier cosa rara (manipulada, de otra versión) se descarta y queda el carrito vacío. */
export function leerCarrito(valor: string | undefined | null): Carrito {
  if (!valor) return vacio()
  try {
    const json = JSON.parse(atob(valor.replace(/-/g, '+').replace(/_/g, '/')))
    if (json?.v !== 1 || !Array.isArray(json.i)) return vacio()
    const vistos = new Set<string>()
    const i: ItemCarrito[] = []
    for (const x of json.i) {
      if (typeof x?.o !== 'string' || !UUID.test(x.o) || vistos.has(x.o)) continue
      vistos.add(x.o)
      i.push(x.d === 1 ? { o: x.o, c: acotar(x.c), d: 1 } : { o: x.o, c: acotar(x.c) })
      if (i.length >= MAX_RENGLONES) break
    }
    const cupon = typeof json.cupon === 'string' && CUPON.test(json.cupon) ? json.cupon : undefined
    return cupon ? { v: 1, i, cupon } : { v: 1, i }
  } catch {
    return vacio()
  }
}

export function escribirCarrito(c: Carrito): string {
  return btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Agrega al carrito (si ya estaba, suma; si estaba guardado para después, vuelve al carrito). */
export function agregar(c: Carrito, oferta: string, cantidad = 1): Carrito {
  if (!UUID.test(oferta)) return c
  const previo = c.i.find((x) => x.o === oferta)
  if (previo) return { ...c, i: c.i.map((x) => (x.o === oferta ? { o: x.o, c: acotar((x.d ? 0 : x.c) + cantidad) } : x)) }
  if (c.i.length >= MAX_RENGLONES) return c
  return { ...c, i: [...c.i, { o: oferta, c: acotar(cantidad) }] }
}

export function cambiarCantidad(c: Carrito, oferta: string, cantidad: number): Carrito {
  return { ...c, i: c.i.map((x) => (x.o === oferta ? { ...x, c: acotar(cantidad) } : x)) }
}

export function quitar(c: Carrito, oferta: string): Carrito {
  return { ...c, i: c.i.filter((x) => x.o !== oferta) }
}

export function paraDespues(c: Carrito, oferta: string, guardar: boolean): Carrito {
  return { ...c, i: c.i.map((x) => (x.o === oferta ? (guardar ? { o: x.o, c: x.c, d: 1 as const } : { o: x.o, c: x.c }) : x)) }
}

export function conCupon(c: Carrito, codigo: string | null): Carrito {
  const { cupon: _, ...resto } = c // eslint-disable-line @typescript-eslint/no-unused-vars
  return codigo && CUPON.test(codigo) ? { ...resto, cupon: codigo } : resto
}

/** Lo que está en el carrito (sin lo guardado para después). */
export const enCarrito = (c: Carrito) => c.i.filter((x) => !x.d)
export const guardados = (c: Carrito) => c.i.filter((x) => x.d)
export const unidades = (c: Carrito) => enCarrito(c).reduce((s, x) => s + x.c, 0)

/**
 * Carrito del invitado + carrito de la cuenta (al iniciar sesión): se suman las cantidades (con tope);
 * lo que está en el carrito en cualquiera de los dos queda en el carrito; el cupón del invitado gana.
 */
export function fusionar(invitado: Carrito, cuenta: Carrito): Carrito {
  let r: Carrito = { v: 1, i: [...cuenta.i] }
  for (const x of invitado.i) {
    const previo = r.i.find((y) => y.o === x.o)
    if (!previo) {
      if (r.i.length < MAX_RENGLONES) r = { ...r, i: [...r.i, x] }
      continue
    }
    const guardado = previo.d === 1 && x.d === 1
    const c = acotar(previo.c + x.c)
    r = { ...r, i: r.i.map((y) => (y.o === x.o ? (guardado ? { o: y.o, c, d: 1 as const } : { o: y.o, c }) : y)) }
  }
  const cupon = invitado.cupon ?? cuenta.cupon
  return cupon ? { ...r, cupon } : r
}
