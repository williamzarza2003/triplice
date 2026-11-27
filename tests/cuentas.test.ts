// Fase 3 contra Postgres real (PGlite) con las mismas migraciones que Supabase: cada usuario ve solo lo suyo,
// solo opina quien compró y recibió, los votos y los sellos los pone la base, y las devoluciones tienen plazo.
// También el trayecto del pedido, el plazo de devolución y el comprobante en PDF (módulos puros).
import type { PGlite } from '@electric-sql/pglite'
import { PDFDocument } from 'pdf-lib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { armarComprobante, montoPdf, type TextosComprobante } from '@/lib/cuenta/comprobante'
import { plazoDevolucion, trayecto } from '@/lib/cuenta/pedidos'
import { construirBase } from '@/lib/datos/construir'

const LORENA = '00000000-0000-4000-8000-00000000de30'
const OTRO = '00000000-0000-4000-8000-0000000000b2'
let db: PGlite

/** Corre una función de la cuenta como un usuario (igual que Supabase con su JWT). */
async function como<T>(uid: string, funcion: string, p: object = {}): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
    const { rows } = await tx.query<{ r: T }>(`select public.${funcion}($1::jsonb) as r`, [JSON.stringify(p)])
    return rows[0].r
  })
}

async function sql<T>(uid: string, consulta: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
    return (await tx.query<T>(consulta)).rows
  })
}

type Item = { id: number; slug: string; resena: unknown; devolucion: unknown }

beforeAll(async () => {
  db = await construirBase()
  // otra persona que se registra (el disparador le crea el perfil)
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'carlos@triplice.example', '{"full_name":"Carlos Duarte Ruiz"}')`, [OTRO])
}, 120_000)
afterAll(() => db?.close())

describe('perfil', () => {
  it('se crea solo al registrarse, y la firma pública es nombre e inicial', async () => {
    const p = await como<{ nombre: string; firma: string; pedidos: number }>(OTRO, 'mi_cuenta')
    expect(p).toMatchObject({ nombre: 'Carlos Duarte Ruiz', firma: 'Carlos D.', pedidos: 0 })
  })

  it('no se puede ascender a admin desde la cuenta', async () => {
    await expect(sql(OTRO, `update perfiles set rol = 'admin' where id = '${OTRO}'`)).rejects.toThrow()
    expect((await como<{ rol: string }>(OTRO, 'mi_cuenta')).rol).toBe('comprador')
  })
})

describe('RLS: cada uno ve lo suyo', () => {
  it('Lorena ve sus 4 pedidos; Carlos, ninguno, ni pidiéndolo por número', async () => {
    expect(await como<unknown[]>(LORENA, 'mis_pedidos')).toHaveLength(4)
    expect(await como<unknown[]>(OTRO, 'mis_pedidos')).toHaveLength(0)
    expect(await como(OTRO, 'mi_pedido', { numero: 'TR-K7M2QA' })).toBeNull()
    expect(await sql(OTRO, 'select id, numero from pedidos')).toHaveLength(0)
    // la clave de invitado no se lee ni del pedido propio (abre el comprobante sin cuenta)
    await expect(sql(LORENA, 'select clave from pedidos')).rejects.toThrow(/permission denied/)
  })

  it('las direcciones de otro no se leen, no se editan y no se borran', async () => {
    expect(await como<unknown[]>(OTRO, 'mis_direcciones')).toHaveLength(0)
    const [casa] = await como<{ id: string }[]>(LORENA, 'mis_direcciones')
    const r = await como<{ error?: string }>(OTRO, 'guardar_direccion', { id: casa.id, alias: 'Mía', region: 'PY', nombre: 'X', telefono: '0', datos: {} })
    expect(r.error).toBe('no_existe')
    await como(OTRO, 'borrar_direccion', { id: casa.id })
    expect(await como<unknown[]>(LORENA, 'mis_direcciones')).toHaveLength(2)
  })

  it('una sola dirección predeterminada, y al borrarla pasa a otra', async () => {
    const nueva = await como<{ id: string }>(OTRO, 'guardar_direccion', { alias: 'Casa', region: 'BR', nombre: 'Carlos', telefono: '45 99999 0000', datos: { ciudad: 'Foz do Iguaçu' } })
    await como(OTRO, 'guardar_direccion', { alias: 'Oficina', region: 'BR', nombre: 'Carlos', telefono: '45 99999 0000', datos: {}, predeterminada: true })
    let lista = await como<{ id: string; alias: string; predeterminada: boolean }[]>(OTRO, 'mis_direcciones')
    expect(lista.filter((d) => d.predeterminada).map((d) => d.alias)).toEqual(['Oficina'])
    await como(OTRO, 'borrar_direccion', { id: lista.find((d) => d.alias === 'Oficina')!.id })
    lista = await como(OTRO, 'mis_direcciones')
    expect(lista).toEqual([expect.objectContaining({ id: nueva.id, predeterminada: true })])
  })

  it('nadie inserta un pedido ni una devolución directo en la tabla', async () => {
    await expect(sql(LORENA, `insert into devoluciones (pedido_id, item_id, usuario_id, motivo) select pedido_id, id, '${LORENA}', 'otro' from pedido_items limit 1`)).rejects.toThrow()
    await expect(sql(LORENA, `insert into pedidos (numero, clave, email, region, idioma, moneda, cotizacion, productos, envio, total, entrega, proveedor_pago) values ('TR-AAAAAA', 'x', 'a@b.c', 'PY', 'es', 'PYG', 1, 0, 0, 0, '{}', 'simulado')`)).rejects.toThrow()
  })
})

describe('opiniones', () => {
  it('solo opina quien compró y recibió; una por producto; la firma y el sello los pone la base', async () => {
    const pedido = await como<{ items: Item[] }>(LORENA, 'mi_pedido', { numero: 'TR-K7M2QA' })
    const celular = pedido.items[0]
    // Carlos no lo compró
    expect(await como(OTRO, 'escribir_resena', { item: celular.id, estrellas: 5, titulo: 'Genial', texto: 'Un texto de prueba bastante largo.', idioma: 'es' }))
      .toEqual({ error: 'no_verificada' })
    // un pedido en camino todavía no se puede opinar
    const enCamino = await como<{ items: Item[] }>(LORENA, 'mi_pedido', { numero: 'TR-W3N8TB' })
    expect(await como(LORENA, 'escribir_resena', { item: enCamino.items[0].id, estrellas: 4, titulo: 'Bien', texto: 'Todavía no llegó, pero bueno.', idioma: 'es' }))
      .toEqual({ error: 'no_verificada' })

    const r = await como<{ id: string; slug: string }>(LORENA, 'escribir_resena', {
      item: celular.id, estrellas: 4, titulo: 'Buena batería', texto: 'Me dura todo el día con el GPS prendido.', idioma: 'es', fotos: [`${LORENA}/a.webp`],
    })
    expect(r.slug).toBe(celular.slug)
    const [fila] = await db.query<{ autor_nombre: string; compra_verificada: boolean; pais: string; variante: string; fotos: string[] }>(
      `select autor_nombre, compra_verificada, pais, variante, fotos from resenas where id = $1`, [r.id]).then((x) => x.rows)
    expect(fila).toMatchObject({ autor_nombre: 'Lorena B.', compra_verificada: true, pais: 'PY', variante: 'grafito · 128 GB', fotos: [`${LORENA}/a.webp`] })

    expect(await como(LORENA, 'escribir_resena', { item: celular.id, estrellas: 1, titulo: 'Otra', texto: 'Intento opinar dos veces lo mismo.', idioma: 'es' }))
      .toEqual({ error: 'ya_opinaste' })
    expect(await como<unknown[]>(LORENA, 'por_opinar')).toHaveLength(2) // auriculares y perfume
  })

  it('no se puede escribir directo como otro autor ni sin compra', async () => {
    await expect(sql(OTRO, `insert into resenas (producto_id, autor_nombre, pais, estrellas, titulo, texto, idioma) select id, 'Falso', 'PY', 5, 'x', 'x', 'es' from productos limit 1`)).rejects.toThrow()
  })

  it('"Me fue útil": un voto por persona, se quita tocando de nuevo y nunca a la propia', async () => {
    const [ajena] = await db.query<{ id: string; util_si: number }>(`select id, util_si from resenas where autor_id is null order by id limit 1`).then((x) => x.rows)
    const voto = await como<{ util_si: number; mio: boolean }>(OTRO, 'votar_resena', { resena: ajena.id, util: true })
    expect(voto).toMatchObject({ util_si: ajena.util_si + 1, mio: true })
    const [{ slug }] = await db.query<{ slug: string }>(`select pr.slug from resenas r join productos pr on pr.id = r.producto_id where r.id = $1`, [ajena.id]).then((x) => x.rows)
    expect((await como<{ votos: Record<string, boolean> }>(OTRO, 'ficha_usuario', { slug })).votos).toEqual({ [ajena.id]: true })
    const otraVez = await como<{ util_si: number; mio: boolean | null }>(OTRO, 'votar_resena', { resena: ajena.id, util: true })
    expect(otraVez).toMatchObject({ util_si: ajena.util_si, mio: null })
    const [propia] = await db.query<{ id: string }>(`select id from resenas where autor_id = $1 limit 1`, [LORENA]).then((x) => x.rows)
    expect(await como(LORENA, 'votar_resena', { resena: propia.id })).toEqual({ error: 'propia' })
  })

  it('la ficha sabe si quien la mira puede opinar', async () => {
    const f = await como<{ item_para_opinar: number | null; opino: boolean }>(LORENA, 'ficha_usuario', { slug: 'perfume-floral-para-mujer-jasy' })
    expect(f.item_para_opinar).toBeTypeOf('number')
    const termo = await como<{ item_para_opinar: number | null; opino: boolean }>(LORENA, 'ficha_usuario', { slug: 'termo-de-acero-1-l-con-manija-tacuru' })
    expect(termo).toMatchObject({ item_para_opinar: null, opino: true })
  })
})

describe('preguntas y respuestas', () => {
  it('pregunta con cuenta; la tienda que lo vende responde con su sello y el comprador con el suyo', async () => {
    const slug = 'celular-6-6-con-8-gb-de-ram-tesai'
    const q = await como<{ id: string }>(OTRO, 'preguntar', { slug, texto: '¿Trae cargador en la caja?', idioma: 'es' })
    const [p] = await db.query<{ autor_nombre: string; estado: string }>(`select autor_nombre, estado from preguntas where id = $1`, [q.id]).then((x) => x.rows)
    expect(p).toEqual({ autor_nombre: 'Carlos D.', estado: 'publicada' })

    const r = await como<{ es_vendedor: boolean }>(LORENA, 'responder', { pregunta: q.id, texto: 'Sí, trae cargador de 25 W.' })
    expect(r.es_vendedor).toBe(false)
    const [a] = await db.query<{ compro: boolean; autor_nombre: string }>(`select compro, autor_nombre from respuestas where pregunta_id = $1`, [q.id]).then((x) => x.rows)
    expect(a).toEqual({ compro: true, autor_nombre: 'Lorena B.' })

    // la dueña de una tienda que lo vende responde como la tienda
    const [t] = await db.query<{ id: string; nombre: string }>(`select t.id, t.nombre from tiendas t join ofertas o on o.tienda_id = t.id join variantes v on v.id = o.variante_id join productos pr on pr.id = v.producto_id where pr.slug = $1 limit 1`, [slug]).then((x) => x.rows)
    await db.query(`update tiendas set duenio_id = $1 where id = $2`, [OTRO, t.id])
    // ser dueño no alcanza: con perfil de comprador responde como cliente
    expect(await como<{ es_vendedor: boolean }>(OTRO, 'responder', { pregunta: q.id, texto: 'Sí, el original de 25 W.' })).toMatchObject({ es_vendedor: false })
    await db.query(`update perfiles set rol = 'vendedor' where id = $1`, [OTRO])
    expect(await como<{ es_vendedor: boolean }>(OTRO, 'responder', { pregunta: q.id, texto: 'Sí, el original de 25 W.' })).toMatchObject({ es_vendedor: true })
    await db.query(`update perfiles set rol = 'comprador' where id = $1`, [OTRO])
    await db.query(`update tiendas set duenio_id = null where id = $1`, [t.id])
  })

  it('una pregunta muy corta se rechaza con un mensaje para mostrar', async () => {
    await expect(como(OTRO, 'preguntar', { slug: 'celular-6-6-con-8-gb-de-ram-tesai', texto: '¿Y?', idioma: 'es' })).rejects.toThrow(/largo/)
  })
})

describe('devoluciones', () => {
  it('hasta 7 días después de la entrega, una por producto, y queda en la línea de tiempo', async () => {
    const reciente = await como<{ items: Item[] }>(LORENA, 'mi_pedido', { numero: 'TR-K7M2QA' })
    const auriculares = reciente.items[1]
    expect(await como(OTRO, 'solicitar_devolucion', { item: auriculares.id, motivo: 'fallado' })).toEqual({ error: 'no_existe' })
    expect(await como(LORENA, 'solicitar_devolucion', { item: auriculares.id, motivo: 'cualquiera' })).toEqual({ error: 'motivo' })
    expect(await como(LORENA, 'solicitar_devolucion', { item: auriculares.id, motivo: 'fallado', detalle: 'El izquierdo no suena.' })).toEqual({ ok: true })
    expect(await como(LORENA, 'solicitar_devolucion', { item: auriculares.id, motivo: 'fallado' })).toEqual({ error: 'ya_pedida' })
    const despues = await como<{ items: Item[]; eventos: { estado: string }[] }>(LORENA, 'mi_pedido', { numero: 'TR-K7M2QA' })
    expect(despues.items[1].devolucion).toMatchObject({ estado: 'solicitada', motivo: 'fallado' })
    expect(despues.eventos.at(-1)!.estado).toBe('devolucion_solicitada')

    const viejo = await como<{ items: Item[] }>(LORENA, 'mi_pedido', { numero: 'TR-P9X4HD' })
    expect(await como(LORENA, 'solicitar_devolucion', { item: viejo.items[0].id, motivo: 'arrepentido' })).toEqual({ error: 'vencido' })
    const enCamino = await como<{ items: Item[] }>(LORENA, 'mi_pedido', { numero: 'TR-W3N8TB' })
    expect(await como(LORENA, 'solicitar_devolucion', { item: enCamino.items[0].id, motivo: 'fallado' })).toEqual({ error: 'no_entregado' })
  })
})

describe('trayecto y plazo (módulo puro)', () => {
  it('marca dónde está el pedido: la última parada cumplida', () => {
    const p = trayecto('enviado', 'domicilio', [{ estado: 'confirmado', creado: '2026-11-24T10:00:00Z' }])
    expect(p.map((x) => [x.clave, x.hecho, x.actual])).toEqual([
      ['confirmado', true, false], ['preparando', true, false], ['enviado', true, true], ['entregado', false, false],
    ])
    expect(p[0].fecha).toBe('2026-11-24T10:00:00Z')
    expect(trayecto('confirmado', 'retiro').map((x) => x.clave)).toEqual(['confirmado', 'preparando', 'listoRetiro', 'entregado'])
    expect(trayecto('entregado', 'retiro').at(-1)).toMatchObject({ hecho: true, actual: true })
  })

  it('la devolución se puede pedir durante 7 días desde la entrega', () => {
    const entregado = '2026-11-20T12:00:00Z'
    expect(plazoDevolucion(entregado, Date.parse('2026-11-27T11:59:00Z')).abierto).toBe(true)
    expect(plazoDevolucion(entregado, Date.parse('2026-11-27T12:01:00Z')).abierto).toBe(false)
    expect(plazoDevolucion(null).abierto).toBe(false)
  })
})

describe('comprobante PDF', () => {
  it('usa "Gs." (las fuentes no tienen ₲) y arma un PDF de una página con los datos del pedido', async () => {
    expect(montoPdf(1528000, 'PYG')).toBe('Gs. 1.528.000')
    const t = Object.fromEntries(['titulo', 'simulado', 'pedido', 'fecha', 'estado', 'comprador', 'entrega', 'retiro', 'domicilio', 'producto', 'cantidad',
      'unitario', 'impuesto', 'subtotal', 'productos', 'cupon', 'envio', 'gratis', 'total', 'incluye', 'cotizacion', 'pie', 'pagina']
      .map((k) => [k, k === 'pagina' ? 'Página {n} de {total}' : k])) as TextosComprobante
    const bytes = await armarComprobante({
      numero: 'TR-K7M2QA', creado: '2026-11-20T12:00:00Z', estado: 'Entregado', locale: 'es-PY',
      comprador: { nombre: 'Lorena Benítez', email: 'lorena@triplice.example', telefono: '0983 412 557' },
      entrega: { modo: 'retiro', texto: ['Arandu Electrónica: Avda. San Blas 120, Ciudad del Este'] },
      moneda: 'PYG', cotizacion: 7350,
      items: [{ titulo: 'Celular 6,6" con 8 GB de RAM', detalle: 'Grafito · 128 GB', cantidad: 1, precio: 1528000, tasa: 0.1 }],
      productos: 1528000, descuento: 0, cupon: null, envio: 0, total: 1528000, impuestos: [{ nombre: 'IVA 10 %', monto: 138909 }],
    }, t)
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toBe('titulo TR-K7M2QA')
  })
})
