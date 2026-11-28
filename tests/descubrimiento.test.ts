// Fase 5 (descubrimiento) contra Postgres real (PGlite) con las mismas migraciones y permisos que Supabase:
// listas, favoritos, vistos y alertas son de cada uno (ni otro usuario ni un anónimo los leen o tocan, ni con las
// funciones ni escribiendo directo), la lista compartida se abre solo con su token, "comprados juntos" cuenta bien,
// la alerta se cumple una sola vez y en la moneda elegida, y el comparador alinea los atributos.
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { precioFinal } from '@/lib/compra/impuestos'
import { aMinimo, leerMonto, objetivoSugerido } from '@/lib/descubrir/alertas'
import { alinear, cuantasCambian, soloLoQueCambia, type Comparacion } from '@/lib/descubrir/comparar'
import { agregarVisto, alternarComparar, leerComparar, leerVistos, slugsDeTexto } from '@/lib/descubrir/cookies'
import { construirBase } from '@/lib/datos/construir'

const LORENA = '00000000-0000-4000-8000-00000000de30'
const CARLOS = '00000000-0000-4000-8000-0000000000c5'
const NUEVA = '00000000-0000-4000-8000-0000000000d7'
let db: PGlite

async function como<T>(uid: string, funcion: string, p: object = {}): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
    const { rows } = await tx.query<{ r: T }>(`select public.${funcion}($1::jsonb) as r`, [JSON.stringify(p)])
    return rows[0].r
  })
}
async function sql<T>(uid: string, consulta: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
    return (await tx.query<T>(consulta, params)).rows
  })
}
async function anonimo<T>(funcion: string, p: object = {}): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon')
    const { rows } = await tx.query<{ r: T }>(`select public.${funcion}($1::jsonb) as r`, [JSON.stringify(p)])
    return rows[0].r
  })
}
async function anonimoSql<T>(consulta: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon')
    return (await tx.query<T>(consulta)).rows
  })
}
const uno = async <T>(consulta: string, params: unknown[] = []) => (await db.query<T>(consulta, params)).rows[0]

type MiLista = { id: string; nombre: string; favoritos: boolean; token: string | null; n: number }
type Alerta = { id: string; slug: string; objetivo: number; precio_inicial: number; base_usd_cent: number; activa: boolean; cumplida: string | null; precio_cumplida: number | null; leida: boolean; moneda: string }

beforeAll(async () => {
  db = await construirBase()
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'carlos@triplice.example', '{"full_name":"Carlos Duarte"}'),
    ($2, 'nueva@triplice.example', '{"full_name":"Nadia Vera"}')`, [CARLOS, NUEVA])
}, 180_000)
afterAll(() => db?.close())

// ------------------------------------------------------------------------------------------------- cookies y montos
describe('lo que viene de una cookie se valida', () => {
  it('el comparador guarda hasta 4 de la misma familia y descarta lo raro', () => {
    expect(leerComparar('a~celulares.b~celulares.<script>~x.a~celulares.c~celulares.d~celulares.e~celulares')).toEqual([
      { slug: 'a', familia: 'celulares' }, { slug: 'b', familia: 'celulares' }, { slug: 'c', familia: 'celulares' }, { slug: 'd', familia: 'celulares' }])
    const dos = [{ slug: 'a', familia: 'celulares' }, { slug: 'b', familia: 'celulares' }]
    expect(alternarComparar(dos, { slug: 'termo', familia: 'cocina' })).toEqual({ items: dos, error: 'otra_familia' })
    expect(alternarComparar(dos, { slug: 'termo', familia: 'cocina' }, true).items).toEqual([{ slug: 'termo', familia: 'cocina' }])
    expect(alternarComparar(dos, { slug: 'a', familia: 'celulares' }).items).toEqual([{ slug: 'b', familia: 'celulares' }])
    const cuatro = ['a', 'b', 'c', 'd'].map((slug) => ({ slug, familia: 'celulares' }))
    expect(alternarComparar(cuatro, { slug: 'e', familia: 'celulares' }).error).toBe('lleno')
  })

  it('vistos: el último adelante, sin repetir, hasta 12', () => {
    let v = leerVistos('x.y.Y.../etc.z')
    expect(v).toEqual(['x', 'y', 'z'])
    v = agregarVisto(v, 'z')
    expect(v).toEqual(['z', 'x', 'y'])
    for (let i = 0; i < 20; i++) v = agregarVisto(v, `p${i}`)
    expect(v).toHaveLength(12)
    expect(v[0]).toBe('p19')
    expect(slugsDeTexto("a,b,<x>,../c,c,a,'d',d,e")).toEqual(['a', 'b', 'c', 'd'])
  })

  it('los montos del formulario de la alerta se leen en la moneda del mercado', () => {
    expect(leerMonto('₲ 230.000', 'PYG')).toBe(230000)
    expect(leerMonto('230 000', 'PYG')).toBe(230000)
    expect(leerMonto('197,60', 'BRL')).toBe(19760)
    expect(leerMonto('R$ 1.234,5', 'BRL')).toBe(123450)
    expect(leerMonto('31.90', 'USD')).toBe(3190)
    expect(leerMonto('41.400', 'ARS')).toBe(41400)
    expect(leerMonto('abc', 'PYG')).toBeNull()
    expect(objetivoSugerido(234000, 'PYG')).toBe(210000)
    expect(objetivoSugerido(19760, 'BRL')).toBe(17780)
  })
})

// ------------------------------------------------------------------------------------------------- listas y favoritos
describe('listas y favoritos: cada uno lo suyo', () => {
  it('Lorena ve sus listas de prueba; Carlos y un anónimo, nada', async () => {
    const listas = await como<MiLista[]>(LORENA, 'mis_listas')
    expect(listas.map((l) => [l.nombre, Number(l.n)])).toEqual(expect.arrayContaining([['Favoritos', 3], ['Para el viaje a Foz', 4], ['Regalos de Navidad', 2]]))
    expect(listas[0].favoritos).toBe(true)
    expect(await como<MiLista[]>(CARLOS, 'mis_listas')).toEqual([])
    expect(await sql(CARLOS, 'select * from listas')).toHaveLength(0)
    expect(await sql(CARLOS, 'select * from lista_items')).toHaveLength(0)
    await expect(anonimoSql('select * from listas')).rejects.toThrow(/permission denied/)
    await expect(anonimo('mis_listas')).rejects.toThrow(/permission denied/)
  })

  it('Carlos no lee, no cambia, no borra ni agrega en una lista de Lorena (ni con funciones ni directo)', async () => {
    const viaje = (await como<MiLista[]>(LORENA, 'mis_listas')).find((l) => l.nombre === 'Para el viaje a Foz')!
    expect(await como(CARLOS, 'mi_lista', { id: viaje.id })).toBeNull()
    expect(await como(CARLOS, 'guardar_lista', { id: viaje.id, nombre: 'Mía' })).toEqual({ error: 'no_existe' })
    expect(await como(CARLOS, 'borrar_lista', { id: viaje.id })).toEqual({ ok: false })
    expect(await como(CARLOS, 'lista_agregar', { lista: viaje.id, slug: 'termo-de-acero-1-l-con-manija-tacuru' })).toEqual({ error: 'no_existe' })
    expect(await como(CARLOS, 'compartir_lista', { id: viaje.id })).toEqual({ error: 'no_existe' })
    // escribiendo directo: el RLS no deja ver la fila, así que no la cambia ni la borra
    await sql(CARLOS, `update listas set nombre = 'Hackeada' where id = $1`, [viaje.id])
    await sql(CARLOS, `delete from lista_items where lista_id = $1`, [viaje.id])
    await expect(sql(CARLOS, `insert into lista_items (lista_id, producto_id) select $1, id from productos limit 1`, [viaje.id])).rejects.toThrow(/row-level security/)
    // ni puede crear una lista a nombre de ella
    await expect(sql(CARLOS, `insert into listas (usuario_id, nombre) values ($1, 'Falsa')`, [LORENA])).rejects.toThrow(/permission denied/)
    const igual = await como<{ nombre: string; items: unknown[] }>(LORENA, 'mi_lista', { id: viaje.id })
    expect(igual.nombre).toBe('Para el viaje a Foz')
    expect(igual.items).toHaveLength(4)
  })

  it('el corazón agrega y saca de favoritos (la lista se crea la primera vez)', async () => {
    const slug = 'termo-de-acero-1-l-con-manija-tacuru'
    expect(await como(NUEVA, 'alternar_favorito', { slug })).toEqual({ favorito: true })
    expect((await como<{ favoritos: string[] }>(NUEVA, 'estado_descubrir')).favoritos).toEqual([slug])
    expect(await como(NUEVA, 'alternar_favorito', { slug })).toEqual({ favorito: false })
    expect(await como(NUEVA, 'alternar_favorito', { slug, favorito: true })).toEqual({ favorito: true })
    expect(await como(NUEVA, 'alternar_favorito', { slug, favorito: true })).toEqual({ favorito: true }) // idempotente
    const [fav] = await como<MiLista[]>(NUEVA, 'mis_listas')
    expect(fav).toMatchObject({ favoritos: true, n: 1 })
    // favoritos no se borra ni se renombra
    expect(await como(NUEVA, 'borrar_lista', { id: fav.id })).toEqual({ ok: false })
    expect(await como(NUEVA, 'guardar_lista', { id: fav.id, nombre: 'Otra' })).toEqual({ error: 'favoritos' })
    // un slug inventado no se guarda
    expect(await como(NUEVA, 'alternar_favorito', { slug: "x' or 1=1" })).toEqual({ error: 'producto' })
  })

  it('crear, renombrar, mover y borrar, con nombres únicos y límites en la base', async () => {
    const a = await como<{ id: string }>(NUEVA, 'guardar_lista', { nombre: '  Para el   viaje a Foz ' })
    const [fila] = await sql<{ nombre: string }>(NUEVA, 'select nombre from listas where id = $1', [a.id])
    expect(fila.nombre).toBe('Para el viaje a Foz')
    expect(await como(NUEVA, 'guardar_lista', { nombre: 'para el viaje a foz' })).toEqual({ error: 'repetido' })
    expect(await como(NUEVA, 'guardar_lista', { nombre: 'x'.repeat(61) })).toEqual({ error: 'nombre' })
    await expect(sql(NUEVA, `insert into listas (nombre) values ($1)`, ['y'.repeat(61)])).rejects.toThrow(/check/)
    const b = await como<{ id: string }>(NUEVA, 'guardar_lista', { nombre: 'Regalos de Navidad' })
    expect(await como(NUEVA, 'guardar_lista', { id: b.id, nombre: 'Regalos para mamá' })).toEqual({ id: b.id })
    await como(NUEVA, 'lista_agregar', { lista: a.id, slug: 'termo-de-acero-1-3-l-con-vaso-aregua' })
    expect(await como(NUEVA, 'lista_mover', { de: a.id, a: b.id, slug: 'termo-de-acero-1-3-l-con-vaso-aregua' })).toEqual({ ok: true, lista: b.id })
    const enB = await como<{ items: { slug: string }[] }>(NUEVA, 'mi_lista', { id: b.id })
    expect(enB.items.map((x) => x.slug)).toEqual(['termo-de-acero-1-3-l-con-vaso-aregua'])
    expect((await como<{ items: unknown[] }>(NUEVA, 'mi_lista', { id: a.id })).items).toHaveLength(0)
    expect(await como(NUEVA, 'borrar_lista', { id: a.id })).toEqual({ ok: true })
    // hasta 20 listas por cuenta (favoritos cuenta)
    const hay = (await como<MiLista[]>(NUEVA, 'mis_listas')).length
    for (let i = hay; i < 20; i++) expect(await como<{ id?: string }>(NUEVA, 'guardar_lista', { nombre: `Lista ${i}` })).toHaveProperty('id')
    expect(await como(NUEVA, 'guardar_lista', { nombre: 'Una más' })).toEqual({ error: 'limite_listas' })
    await expect(sql(NUEVA, `insert into listas (nombre) values ('Directo')`)).rejects.toThrow(/limite_listas/)
  })

  it('una lista guarda hasta 100 productos (también escribiendo directo)', async () => {
    const { id } = await como<{ id: string }>(CARLOS, 'guardar_lista', { nombre: 'Todo' })
    await sql(CARLOS, `insert into lista_items (lista_id, producto_id) select $1, id from tarjetas order by id limit 100`, [id])
    await expect(sql(CARLOS, `insert into lista_items (lista_id, producto_id) select $1, id from tarjetas order by id desc limit 1`, [id])).rejects.toThrow(/limite_items/)
    expect(await como(CARLOS, 'lista_agregar', { lista: id, slug: 'termo-de-acero-1-l-con-manija-tacuru' })).toMatchObject({ error: expect.stringMatching(/limite_items|^$/) })
    await como(CARLOS, 'borrar_lista', { id })
  })
})

describe('lista compartida por enlace', () => {
  it('el token lo genera la base (aunque se mande uno), se abre sin cuenta y deja de funcionar al revocarlo', async () => {
    const { id } = await como<{ id: string }>(CARLOS, 'guardar_lista', { nombre: 'Para el asado' })
    await como(CARLOS, 'lista_agregar', { lista: id, slug: 'termo-de-acero-1-l-con-manija-tacuru' })
    // escribir un token elegido no sirve: el disparador lo reemplaza por uno al azar
    await sql(CARLOS, `update listas set token = $2 where id = $1`, [id, 'a'.repeat(64)])
    const [{ token }] = await sql<{ token: string }>(CARLOS, 'select token from listas where id = $1', [id])
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(token).not.toBe('a'.repeat(64))
    expect(await anonimo('lista_compartida', { token: 'a'.repeat(64) })).toBeNull()

    const abierta = await anonimo<Record<string, unknown> & { items: { slug: string }[] }>('lista_compartida', { token })
    expect(abierta.nombre).toBe('Para el asado')
    expect(abierta.de).toBe('Carlos D.')
    expect(abierta.items.map((x) => x.slug)).toEqual(['termo-de-acero-1-l-con-manija-tacuru'])
    // lo mínimo: nada del dueño más allá de su firma
    expect(Object.keys(abierta).sort()).toEqual(['de', 'desde', 'favoritos', 'items', 'nombre'])
    expect(JSON.stringify(abierta)).not.toContain(CARLOS)
    expect(JSON.stringify(abierta)).not.toContain('carlos@')
    // otro usuario con el token ve lo mismo, pero no puede tocarla
    expect(await como(LORENA, 'lista_compartida', { token })).toMatchObject({ nombre: 'Para el asado' })
    expect(await como(LORENA, 'lista_agregar', { lista: id, slug: 'termo-de-acero-1-3-l-con-vaso-aregua' })).toEqual({ error: 'no_existe' })
    // sin token o con algo raro, nada
    expect(await anonimo('lista_compartida', {})).toBeNull()
    expect(await anonimo('lista_compartida', { token: "' or '1'='1" })).toBeNull()

    expect(await como(CARLOS, 'compartir_lista', { id, compartir: false })).toEqual({ token: null })
    expect(await anonimo('lista_compartida', { token })).toBeNull()
    // compartir de nuevo da otro enlace: el viejo sigue sin funcionar
    const otro = await como<{ token: string }>(CARLOS, 'compartir_lista', { id })
    expect(otro.token).toMatch(/^[0-9a-f]{64}$/)
    expect(otro.token).not.toBe(token)
    expect(await anonimo('lista_compartida', { token })).toBeNull()
    expect(await anonimo('lista_compartida', { token: otro.token })).toMatchObject({ nombre: 'Para el asado' })
  })

  it('la lista de viaje de Lorena ya está compartida en la vista previa', async () => {
    const viaje = (await como<MiLista[]>(LORENA, 'mis_listas')).find((l) => l.nombre === 'Para el viaje a Foz')!
    expect(viaje.token).toMatch(/^[0-9a-f]{64}$/)
    expect(await anonimo('lista_compartida', { token: viaje.token })).toMatchObject({ de: 'Lorena B.' })
  })
})

// ------------------------------------------------------------------------------------------------- vistos
describe('vistos recientemente', () => {
  it('con cuenta se guardan en la base (los 12 últimos) y al entrar se suman los de la cookie', async () => {
    const vistos = await como<{ slug: string }[]>(LORENA, 'mis_vistos')
    expect(vistos[0].slug).toBe('celular-6-7-de-gama-alta-con-triple-ondatec')
    expect(vistos).toHaveLength(6)
    // lo de la cookie (el más reciente primero) pasa adelante; los slugs inventados se ignoran
    const r = await como<{ slug: string }[]>(LORENA, 'registrar_vistos', { slugs: ['termo-de-acero-1-l-con-manija-tacuru', 'no-existe', '../x', 'parlante-de-fiesta-de-120-w-con-kape'] })
    expect(r.slice(0, 2).map((x) => x.slug)).toEqual(['termo-de-acero-1-l-con-manija-tacuru', 'parlante-de-fiesta-de-120-w-con-kape'])
    expect(r).toHaveLength(7)
    const muchos = (await db.query<{ slug: string }>('select slug from tarjetas order by slug limit 30')).rows.map((x) => x.slug)
    await como(LORENA, 'registrar_vistos', { slugs: muchos.slice(0, 12) })
    await como(LORENA, 'registrar_vistos', { slugs: muchos.slice(12, 20) })
    const [{ n }] = await sql<{ n: number }>(LORENA, 'select count(*)::int as n from vistos')
    expect(n).toBe(12)
    expect((await como<{ slug: string }[]>(LORENA, 'mis_vistos', { excepto: muchos[12] })).map((x) => x.slug)).not.toContain(muchos[12])
  })

  it('nadie más los lee ni los borra, y un anónimo no puede ni llamar', async () => {
    expect(await como<unknown[]>(CARLOS, 'mis_vistos')).toEqual([])
    await sql(CARLOS, `delete from vistos where usuario_id = $1`, [LORENA])
    expect(await sql(CARLOS, 'select * from vistos')).toHaveLength(0)
    await expect(sql(CARLOS, `insert into vistos (usuario_id, producto_id) select $1, id from productos limit 1`, [LORENA])).rejects.toThrow(/permission denied/)
    await expect(anonimo('registrar_vistos', { slugs: ['x'] })).rejects.toThrow(/permission denied/)
    await expect(anonimoSql('select * from vistos')).rejects.toThrow(/permission denied/)
    const [{ n }] = await sql<{ n: number }>(LORENA, 'select count(*)::int as n from vistos')
    expect(n).toBe(12)
  })

  it('sin cuenta, las tarjetas de la cookie se leen en su orden, como mucho 12 y solo slugs válidos', async () => {
    const r = await anonimo<{ slug: string }[]>('tarjetas_slugs', {
      slugs: ['parlante-de-fiesta-de-120-w-con-kape', "x'); drop table listas; --", 'termo-de-acero-1-l-con-manija-tacuru'], excepto: 'termo-de-acero-1-l-con-manija-tacuru' })
    expect(r.map((x) => x.slug)).toEqual(['parlante-de-fiesta-de-120-w-con-kape'])
    expect(await anonimo<unknown[]>('tarjetas_slugs', { slugs: 'no es una lista' })).toEqual([])
  })
})

// ------------------------------------------------------------------------------------------------- comprados juntos
describe('comprados juntos', () => {
  let A: string, B: string, C: string
  const slug = { A: '', B: '', C: '' }

  async function pedido(numero: string, estado: string, productos: string[]) {
    const id = (await uno<{ id: string }>(`insert into pedidos (numero, clave, email, region, idioma, moneda, cotizacion, productos, envio, total, entrega, estado, proveedor_pago)
      values ($1, 'x', 'test@triplice.example', 'PY', 'es', 'PYG', 7350, 100000, 0, 100000, '{"modo":"retiro"}', $2, 'simulado') returning id`, [numero, estado]))!.id
    for (const p of productos) {
      await db.query(`insert into pedido_items (pedido_id, producto_id, titulo, cantidad, precio_unitario, tasa_impuesto) values ($1, $2, 'x', 2, 50000, 0.1)`, [id, p])
    }
  }
  const veces = async (a: string, b: string) => (await uno<{ veces: number }>('select veces from comprados_juntos where producto_a = $1 and producto_b = $2', [a, b]))?.veces ?? null

  beforeAll(async () => {
    // tres floreros: ninguna canasta del seed los junta
    const fs = (await db.query<{ id: string; slug: string }>(`select t.id, t.slug from tarjetas t join categorias c on c.id = t.categoria_id
      where c.slug = 'floreros' order by t.slug limit 3`)).rows
    ;[A, B, C] = fs.map((x) => x.id)
    ;[slug.A, slug.B, slug.C] = fs.map((x) => x.slug)
    expect(await anonimo<{ fuente: string }>('comprados_juntos', { slug: slug.A })).toMatchObject({ fuente: 'categoria' })
    await pedido('TR-JT0001', 'entregado', [A, B])
    await pedido('TR-JT0002', 'entregado', [A, B])
    await pedido('TR-JT0003', 'enviado', [A, B, C])
    await pedido('TR-JT0004', 'cancelado', [A, C]) // no cuenta
    await pedido('TR-JT0005', 'entregado', [A, C])
    await pedido('TR-JT0006', 'pendiente_pago', [B, C]) // no cuenta
    await db.exec('select public.refrescar_catalogo()')
  }, 60_000)

  it('cuenta pedidos distintos (no unidades), en las dos direcciones, y exige 3 como mínimo', async () => {
    expect(await veces(A, B)).toBe(3)
    expect(await veces(B, A)).toBe(3)
    expect(await veces(A, C)).toBeNull() // 2: con el cancelado serían 3
    expect(await veces(B, C)).toBeNull() // 1: con el pendiente serían 2
    const r = await anonimo<{ fuente: string; items: { slug: string }[]; veces: Record<string, number> }>('comprados_juntos', { slug: slug.A })
    expect(r.fuente).toBe('pedidos')
    expect(r.items.map((x) => x.slug)).toEqual([slug.B])
    expect(r.veces).toEqual({ [slug.B]: 3 })
  })

  it('un pedido más llega al mínimo, y el orden es por cantidad de pedidos', async () => {
    await pedido('TR-JT0007', 'entregado', [A, C])
    await pedido('TR-JT0008', 'entregado', [A, C])
    await db.exec('select public.refrescar_catalogo()')
    expect(await veces(A, C)).toBe(4)
    const r = await anonimo<{ items: { slug: string }[]; veces: Record<string, number> }>('comprados_juntos', { slug: slug.A })
    expect(r.items.map((x) => x.slug)).toEqual([slug.C, slug.B])
    expect(r.veces).toEqual({ [slug.C]: 4, [slug.B]: 3 })
  })

  it('las canastas del seed arman pares fuertes (el celular y su cargador)', async () => {
    const r = await anonimo<{ fuente: string; items: { categoria: string }[] }>('comprados_juntos', { slug: 'celular-6-6-con-8-gb-de-ram-tesai' })
    expect(r.fuente).toBe('pedidos')
    expect(r.items.length).toBeGreaterThan(0)
  })

  it('sin datos, lo más vendido de las categorías hermanas; la vista no tiene compradores y no se refresca desde una sesión', async () => {
    // una pelota: ninguna canasta del seed tiene pelotas
    const pelota = (await uno<{ slug: string }>(`select t.slug from tarjetas t join categorias c on c.id = t.categoria_id where c.slug = 'pelotas' limit 1`))!.slug
    const r = await anonimo<{ fuente: string; items: { categoria_padre: string; categoria: string }[] }>('comprados_juntos', { slug: pelota })
    expect(r.fuente).toBe('categoria')
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.items.every((x) => x.categoria_padre === 'deportes' && x.categoria !== 'pelotas')).toBe(true)
    const cols = (await db.query<{ attname: string }>(`select attname from pg_attribute where attrelid = 'public.comprados_juntos'::regclass and attnum > 0`)).rows.map((x) => x.attname)
    expect(cols.sort()).toEqual(['producto_a', 'producto_b', 'veces'])
    await expect(anonimoSql('select public.refrescar_catalogo()')).rejects.toThrow(/permission denied/)
    await expect(sql(CARLOS, 'select public.refrescar_catalogo()')).rejects.toThrow(/permission denied/)
  })

  it('"Agregar los dos" recibe slugs y la base elige la oferta más barata con stock', async () => {
    const r = await anonimo<{ slug: string; oferta: string }[]>('ofertas_baratas', { slugs: [slug.A, slug.B, 'no-existe'] })
    expect(r.map((x) => x.slug)).toEqual([slug.A, slug.B])
    const [esperada] = (await db.query<{ id: string }>(`select o.id from ofertas o join variantes v on v.id = o.variante_id join tiendas t on t.id = o.tienda_id
      where v.producto_id = $1 and o.activa and o.stock > 0 and t.estado = 'aprobada' order by o.precio_usd_cent, o.preparacion_h, o.id limit 1`, [A])).rows
    expect(r[0].oferta).toBe(esperada.id)
  })
})

// ------------------------------------------------------------------------------------------------- alertas
describe('alertas de precio (simuladas)', () => {
  const SLUG = 'parlante-bluetooth-sumergible-de-20-w-pira-sound'
  let pid: string
  let base: number
  let tasas: { PYG: number; BRL: number; ARS: number }

  beforeAll(async () => {
    const t = (await uno<{ id: string; precio: number }>('select id, precio_usd_cent::int as precio from tarjetas where slug = $1', [SLUG]))!
    pid = t.id; base = t.precio
    const c = (await db.query<{ moneda: 'PYG' | 'BRL' | 'ARS'; por_usd: string }>(`select distinct on (moneda) moneda, por_usd from cotizaciones order by moneda, vigente_desde desc`)).rows
    tasas = Object.fromEntries(c.map((x) => [x.moneda, Number(x.por_usd)])) as typeof tasas
  })

  /** baja (o sube) la oferta más barata del producto y rehace las tarjetas, como cuando una tienda cambia el precio */
  async function cambiarPrecio(usdCent: number) {
    await db.query(`update ofertas set precio_usd_cent = $2 where id = (select o.id from ofertas o join variantes v on v.id = o.variante_id
      where v.producto_id = $1 and o.activa and o.stock > 0 order by o.precio_usd_cent limit 1)`, [pid, usdCent])
    await db.exec('select public.refrescar_catalogo()')
  }

  it('la base pone el precio de hoy en la moneda elegida (igual que la web) y el base en USD; no deja un objetivo mayor', async () => {
    const hoyBRL = aMinimo(precioFinal(base, 0.25, 'BRL', tasas), 'BRL') // Brasil: impuestos estimados 25 %
    const alto = await como<{ error: string; precio: number }>(CARLOS, 'crear_alerta', { slug: SLUG, region: 'BR', moneda: 'BRL', objetivo: hoyBRL })
    expect(alto).toEqual({ error: 'objetivo_alto', precio: hoyBRL })
    expect(await como(CARLOS, 'crear_alerta', { slug: SLUG, region: 'BR', moneda: 'BRL', objetivo: 5 })).toMatchObject({ error: 'objetivo_bajo' })
    const a = await como<{ precio_inicial: number; moneda: string }>(CARLOS, 'crear_alerta', { slug: SLUG, region: 'BR', moneda: 'BRL', objetivo: hoyBRL - 500 })
    expect(a).toMatchObject({ precio_inicial: hoyBRL, moneda: 'BRL' })
    const [fila] = await sql<{ base_usd_cent: number }>(CARLOS, 'select base_usd_cent::int as base_usd_cent from alertas_precio where producto_id = $1', [pid])
    expect(fila.base_usd_cent).toBe(base)
  })

  it('se cumple cuando baja el precio, una sola vez, y queda el aviso sin leer', async () => {
    const hoy = aMinimo(precioFinal(base, 0.1, 'PYG', tasas), 'PYG')
    await como(LORENA, 'revisar_alertas') // la de la cámara de la cuenta de prueba ya estaba cumplida
    await como(LORENA, 'crear_alerta', { slug: SLUG, region: 'PY', moneda: 'PYG', objetivo: hoy - 1000 })
    const antes = await como<{ nuevas: number }>(LORENA, 'revisar_alertas')
    const avisosAntes = Number((await como<{ avisos: number }>(LORENA, 'estado_descubrir')).avisos)
    expect(antes.nuevas).toBe(0)

    await cambiarPrecio(Math.round(base * 0.9)) // baja 10 % en dólares
    const r1 = await como<{ nuevas: number; avisos: number }>(LORENA, 'revisar_alertas')
    expect(r1.nuevas).toBe(1)
    expect(Number(r1.avisos)).toBe(avisosAntes + 1)
    const r2 = await como<{ nuevas: number }>(LORENA, 'revisar_alertas')
    expect(r2.nuevas).toBe(0) // no se dispara dos veces
    const a = (await como<Alerta[]>(LORENA, 'mis_alertas')).find((x) => x.slug === SLUG)!
    expect(a).toMatchObject({ activa: false, leida: false, precio_cumplida: aMinimo(precioFinal(Math.round(base * 0.9), 0.1, 'PYG', tasas), 'PYG') })
    // la de Carlos en reales también bajó (es el mismo producto): se cumple para él, no para Lorena
    expect((await como<{ nuevas: number }>(CARLOS, 'revisar_alertas')).nuevas).toBe(1)
    // leer los avisos los apaga
    await como(LORENA, 'leer_avisos')
    expect(Number((await como<{ avisos: number }>(LORENA, 'estado_descubrir')).avisos)).toBe(0)
    await cambiarPrecio(base)
  })

  it('no se puede marcar cumplida a mano, ni reactivarla, ni cambiarle el precio guardado', async () => {
    const hoy = aMinimo(precioFinal(base, 0.1, 'PYG', tasas), 'PYG')
    const { id } = await como<{ id: string }>(NUEVA, 'crear_alerta', { slug: SLUG, region: 'PY', moneda: 'PYG', objetivo: hoy - 50000 })
    await expect(sql(NUEVA, `update alertas_precio set cumplida = now() where id = $1`, [id])).rejects.toThrow(/no_bajo/)
    await expect(sql(NUEVA, `update alertas_precio set precio_cumplida = 1 where id = $1`, [id])).rejects.toThrow(/permission denied/)
    await expect(sql(NUEVA, `update alertas_precio set objetivo = 99999999 where id = $1`, [id])).rejects.toThrow(/permission denied/)
    await expect(sql(NUEVA, `insert into alertas_precio (producto_id, region, moneda, objetivo, base_usd_cent, precio_inicial) values ($1, 'PY', 'PYG', 1000, 1, 1)`, [pid])).rejects.toThrow(/permission denied/)
    // insertando directo, la base calcula igual el precio de hoy
    await sql(NUEVA, `delete from alertas_precio where id = $1`, [id])
    await sql(NUEVA, `insert into alertas_precio (producto_id, region, moneda, objetivo) values ($1, 'PY', 'PYG', $2)`, [pid, hoy - 2000])
    const [a] = await sql<{ precio_inicial: number }>(NUEVA, 'select precio_inicial::int as precio_inicial from alertas_precio where producto_id = $1', [pid])
    expect(a.precio_inicial).toBe(hoy)
  })

  it('nadie ve ni borra las alertas de otro, y un anónimo no puede ni llamar', async () => {
    const deLorena = await como<Alerta[]>(LORENA, 'mis_alertas')
    expect(deLorena.length).toBeGreaterThan(0)
    expect((await como<Alerta[]>(CARLOS, 'mis_alertas')).every((a) => !deLorena.some((x) => x.id === a.id))).toBe(true)
    await como(CARLOS, 'borrar_alerta', { id: deLorena[0].id })
    await sql(CARLOS, `update alertas_precio set leida = true where usuario_id = $1`, [LORENA])
    expect(await como<Alerta[]>(LORENA, 'mis_alertas')).toHaveLength(deLorena.length)
    await expect(anonimo('mis_alertas')).rejects.toThrow(/permission denied/)
    await expect(anonimo('crear_alerta', { slug: SLUG, region: 'PY', moneda: 'PYG', objetivo: 1000 })).rejects.toThrow(/permission denied/)
    await expect(anonimoSql('select * from alertas_precio')).rejects.toThrow(/permission denied/)
    await expect(sql(CARLOS, 'select public.revisar_alertas_todas()')).rejects.toThrow(/permission denied/)
  })

  it('Lorena tiene en la vista previa una alerta cumplida (la cámara) y una que todavía no (los auriculares)', async () => {
    const db2 = await construirBase()
    try {
      const r = await db2.transaction(async (tx) => {
        await tx.exec('set local role authenticated')
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [LORENA])
        await tx.query(`select public.revisar_alertas('{}')`)
        return (await tx.query<{ r: Alerta[] }>(`select public.mis_alertas('{}') as r`)).rows[0].r
      })
      const camara = r.find((a) => a.slug === 'camara-de-accion-4k-sumergible-con-carcasa-yvaga')!
      const auris = r.find((a) => a.slug === 'auriculares-de-vincha-con-cancelacion-de-ruido-pira-sound')!
      expect(camara.cumplida).not.toBeNull()
      expect(Number(camara.precio_cumplida)).toBeLessThanOrEqual(Number(camara.objetivo))
      expect(Number(camara.precio_inicial)).toBeGreaterThan(Number(camara.objetivo))
      expect(auris).toMatchObject({ cumplida: null, activa: true })
    } finally {
      await db2.close()
    }
  }, 120_000)
})

// ------------------------------------------------------------------------------------------------- comparador
describe('comparador', () => {
  const CELUS = ['celular-6-7-de-gama-alta-con-triple-ondatec', 'celular-6-6-con-8-gb-de-ram-tesai', 'celular-6-5-con-bateria-de-6-000-mah-ondatec']

  it('trae los productos en el orden pedido y deja afuera los de otra familia', async () => {
    const c = await anonimo<Comparacion>('comparar', { slugs: [...CELUS, 'auriculares-gamer-con-microfono-y-luz-ne-e-audio', 'inexistente'] })
    expect(c.familia?.slug).toBe('celulares')
    expect(c.productos.map((p) => p.slug)).toEqual(CELUS)
    expect(c.fuera.map((x) => x.slug)).toEqual(['auriculares-gamer-con-microfono-y-luz-ne-e-audio'])
    // la quinta ya pasa el máximo de 4 (no llega a la base)
    expect(c.no_disponibles).toEqual([])
    expect(c.productos[0].tienda.recomendacion).not.toBeNull()
  })

  it('alinea los atributos de la categoría y marca lo que cambia', async () => {
    const c = await anonimo<Comparacion>('comparar', { slugs: CELUS })
    const filas = alinear(c.productos, c.atributos, 'es')
    const fila = (k: string) => filas.find((f) => f.clave === k)!
    expect(fila('ram_gb').celdas.map((x) => x.texto)).toEqual(['12 GB', '8 GB', '4 GB'])
    expect(fila('ram_gb').escala).toBe(12)
    expect(fila('pantalla_pulgadas').celdas.map((x) => x.texto)).toEqual(['6,7"', '6,6"', '6,5"'])
    expect(fila('sim')).toMatchObject({ iguales: true }) // los tres son doble chip
    expect(fila('sim').celdas[0].texto).toBe('Doble chip')
    expect(fila('red').celdas.map((x) => x.texto)).toEqual(['5G', '4G', '4G'])
    expect(fila('red').iguales).toBe(false)
    // las filas que nadie tiene no aparecen; "solo lo que cambia" saca las iguales
    expect(filas.some((f) => f.celdas.every((x) => x.texto === null))).toBe(false)
    expect(soloLoQueCambia(filas).every((f) => !f.iguales)).toBe(true)
    expect(cuantasCambian(filas)).toBe(filas.length - filas.filter((f) => f.iguales).length)
  })

  it('con productos de categorías hermanas, la fila de un atributo que solo tiene uno queda vacía en los otros', () => {
    const p = (slug: string, atributos: Record<string, unknown>) => ({ slug, atributos } as unknown as Comparacion['productos'][number])
    const filas = alinear([p('a', { bateria_h: 30, cancelacion_ruido: true }), p('b', { bateria_h: 30 })],
      [{ clave: 'bateria_h', nombre: 'Batería', unidad: 'h', tipo: 'numero' }, { clave: 'cancelacion_ruido', nombre: 'Cancelación', unidad: null, tipo: 'booleano' },
       { clave: 'red', nombre: 'Red', unidad: null, tipo: 'opcion' }], 'es')
    expect(filas.map((f) => [f.clave, f.iguales, f.celdas.map((c) => c.texto)])).toEqual([
      ['bateria_h', true, ['30 h', '30 h']], ['cancelacion_ruido', false, ['Sí', null]]])
  })
})
