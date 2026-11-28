// Fase 5 contra Postgres real (PGlite) con las mismas migraciones que Supabase: la administración.
// Permisos (un comprador, un vendedor y un anónimo no pueden nada, ni llamando funciones ni escribiendo directo en las
// tablas; la admin sí), tiendas que se aprueban y se suspenden, moderación que cambia lo que ve el público, denuncias,
// categorías en uso, impuestos, cotizaciones y el registro. Además, los módulos puros: la conversión de Cambio CDE con
// números exactos (fetch simulado) y la vista previa de impuestos.
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { traerDeCambioCde } from '@/lib/admin/cambio-cde'
import { convertirCambioCde, esCambioGrande, leerCotizacion, variacionPorcentual } from '@/lib/admin/conversion'
import { aplicarCambio, leerPorcentaje, vistaPreviaImpuesto } from '@/lib/admin/impuestos'
import { construirBase } from '@/lib/datos/construir'

const MIRTA = '00000000-0000-4000-8000-0000000ad001' // admin de prueba (supabase/pglite/92_admin_demo.sql)
const LORENA = '00000000-0000-4000-8000-00000000de30' // compradora de prueba
const RUBEN = '00000000-0000-4000-8000-0000000ce001' // vendedor de prueba, dueño de Casa Nubla
const OTRA_ADMIN = '00000000-0000-4000-8000-0000000ad0f1'
const NUEVO = '00000000-0000-4000-8000-0000000ad0f2' // una cuenta común que pasa a vender
const MATE = '00000000-0000-4000-8000-0000000ad101' // tienda pendiente con dos productos
const OTICA = '00000000-0000-4000-8000-0000000ad102' // tienda pendiente sin productos ni dueño
const SPAM = '00000000-0000-4000-8000-0000000ad201' // reseña que es publicidad, con dos denuncias
const SPAM_PT = '00000000-0000-4000-8000-0000000ad202'
const INJUSTA = '00000000-0000-4000-8000-0000000ad203' // reseña denunciada sin razón
const PREGUNTA_TEL = '00000000-0000-4000-8000-0000000ad301'
const TERMO = 'termo-de-acero-1-l-con-manija-tacuru'

let db: PGlite

async function como<T>(uid: string, funcion: string, p: object = {}): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
    const { rows } = await tx.query<{ r: T }>(`select public.${funcion}($1::jsonb) as r`, [JSON.stringify(p)])
    return rows[0].r
  })
}

async function sql<T = Record<string, unknown>>(uid: string | null, consulta: string, params: unknown[] = []): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(uid ? 'set local role authenticated' : 'set local role anon')
    if (uid) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
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

/** Cuántas filas cambió una escritura directa (0 = el RLS no la dejó ver). */
async function filas(uid: string, consulta: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
    return (await tx.query(consulta, params)).affectedRows ?? 0
  })
}

beforeAll(async () => {
  db = await construirBase()
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'otra-admin@triplice.example', '{"full_name":"Olga Admin"}'),
                  ($2, 'nuevo@triplice.example', '{"full_name":"Néstor Nuevo"}')`, [OTRA_ADMIN, NUEVO])
}, 180_000)
afterAll(() => db?.close())

const FUNCIONES_ADMIN: [string, object][] = [
  ['admin_resumen', {}], ['admin_tiendas', {}], ['admin_estado_tienda', { tienda: MATE, estado: 'aprobada' }],
  ['admin_buscar_cuenta', { email: 'lorena@triplice.example' }], ['admin_alta_vendedor', { email: 'lorena@triplice.example', tienda: 'otica-iguacu' }],
  ['admin_moderacion', {}], ['admin_moderar', { tipo: 'resena', id: SPAM, accion: 'ocultar', motivo: 'Publicidad' }],
  ['admin_categorias', {}], ['admin_categoria', { id: 1 }], ['admin_guardar_categoria', { slug: 'x-y', nombre: { es: 'Xy', pt: 'Xy', en: 'Xy' } }],
  ['admin_ordenar', { id: 1, mover: 'abajo' }], ['admin_borrar_categoria', { id: 1 }],
  ['admin_guardar_atributo', { categoria: 1, clave: 'peso', nombre: { es: 'Peso', pt: 'Peso', en: 'Weight' }, tipo: 'numero' }],
  ['admin_borrar_atributo', { id: 1 }], ['admin_impuestos', {}], ['admin_ejemplo', {}],
  ['admin_guardar_impuesto', { pais: 'PY', categoria: 2, tasa: 0.2, nombre: { es: 'IVA', pt: 'IVA', en: 'VAT' } }],
  ['admin_borrar_impuesto', { id: 2 }], ['admin_cotizaciones', {}], ['admin_guardar_cotizacion', { tasas: { PYG: 7351 } }],
  ['admin_registro', {}],
]

describe('permisos: solo la admin', () => {
  it('a un comprador y a un vendedor todas las funciones de admin les dicen que no', async () => {
    for (const uid of [LORENA, RUBEN]) {
      for (const [f, p] of FUNCIONES_ADMIN) expect(await como(uid, f, p), `${f} como ${uid}`).toEqual({ error: 'no_admin' })
    }
    // y no cambió nada
    expect((await db.query(`select estado from tiendas where id = $1`, [MATE])).rows[0]).toEqual({ estado: 'pendiente' })
    expect((await db.query(`select estado from resenas where id = $1`, [SPAM])).rows[0]).toEqual({ estado: 'publicada' })
  })

  it('sin cuenta ni siquiera se pueden llamar', async () => {
    for (const [f, p] of FUNCIONES_ADMIN) await expect(anonimo(f, p), f).rejects.toThrow(/permission denied/)
    await expect(anonimo('denunciar', { tipo: 'resena', id: SPAM, motivo: 'spam' })).rejects.toThrow(/permission denied/)
    await expect(sql(null, `select public.admin_refrescar('todo')`)).rejects.toThrow(/permission denied/)
  })

  it('las ayudas security definer también comprueban que sea admin', async () => {
    await expect(sql(LORENA, `select public.admin_refrescar('todo')`)).rejects.toThrow(/no_admin/)
    expect((await sql<{ r: object }>(LORENA, `select public.admin_reputaciones() as r`))[0].r).toEqual({})
    expect(await como(RUBEN, 'admin_buscar_cuenta', { email: 'admin@triplice.example' })).toEqual({ error: 'no_admin' })
    await expect(sql(MIRTA, `select public.auditar()`)).rejects.toThrow(/permission denied/)
  })

  it('escribiendo directo en las tablas: un comprador no modera, no aprueba, no cambia roles, impuestos ni cotizaciones', async () => {
    expect(await filas(LORENA, `update tiendas set estado = 'aprobada' where id = $1`, [MATE])).toBe(0) // ni la ve
    expect(await filas(LORENA, `update resenas set estado = 'oculta', moderacion_motivo = 'no me gusta' where id = $1`, [SPAM])).toBe(0)
    expect(await filas(LORENA, `update perfiles set rol = 'comprador' where id = $1`, [RUBEN])).toBe(0)
    await expect(sql(LORENA, `update perfiles set rol = 'admin' where id = $1`, [LORENA])).rejects.toThrow(/solo_admin/)
    await expect(sql(LORENA, `insert into cotizaciones (moneda, por_usd) values ('PYG', 7350)`)).rejects.toThrow(/row-level security/)
    await expect(sql(LORENA, `insert into reglas_impuesto (pais, nombre, tasa, categoria_id) values ('PY', '{"es":"IVA 0","pt":"IVA 0","en":"VAT 0"}', 0, 2)`))
      .rejects.toThrow(/row-level security/)
    expect(await filas(LORENA, `update reglas_impuesto set tasa = 0`)).toBe(0)
    await expect(sql(LORENA, `insert into categorias (slug, nombre) values ('truco', '{"es":"Truco","pt":"Truco","en":"Trick"}')`)).rejects.toThrow(/row-level security/)
    expect(await filas(LORENA, `delete from atributos`)).toBe(0)
    await expect(sql(LORENA, `insert into tiendas (slug, nombre, pais, ciudad, desde) values ('mia', 'Mía', 'PY', 'CDE', 2020)`)).rejects.toThrow(/solo_admin|row-level security/)
  })

  it('su propia reseña: el autor edita el texto pero no la oculta ni la vuelve a publicar', async () => {
    const [r] = await db.query<{ id: string }>(`select id from resenas where autor_id = $1 limit 1`, [LORENA]).then((x) => x.rows)
    await expect(sql(LORENA, `update resenas set estado = 'oculta', moderacion_motivo = 'me arrepentí' where id = $1`, [r.id])).rejects.toThrow(/solo_admin/)
  })

  it('un vendedor no cambia el estado, el motivo ni el dueño de su propia tienda', async () => {
    const casa = (await db.query<{ id: string }>(`select id from tiendas where slug = 'casa-nubla'`)).rows[0].id
    await expect(sql(RUBEN, `update tiendas set estado = 'aprobada', estado_motivo = 'yo' where id = $1`, [casa])).rejects.toThrow(/solo_admin/)
    await expect(sql(RUBEN, `update tiendas set estado_motivo = 'nada' where id = $1`, [casa])).rejects.toThrow(/solo_admin/)
    await expect(sql(RUBEN, `update tiendas set duenio_id = $2 where id = $1`, [casa, LORENA])).rejects.toThrow(/solo_admin|row-level/)
    // sus datos sí los edita
    expect(await filas(RUBEN, `update tiendas set lema = '{"es":"Todo para la casa"}' where id = $1`, [casa])).toBe(1)
  })

  it('el registro y las denuncias ajenas no se leen; el registro no lo escribe nadie, ni la admin', async () => {
    expect(await sql(LORENA, `select * from moderacion`)).toEqual([])
    await expect(sql(null, `select * from moderacion`)).rejects.toThrow(/permission denied/)
    expect(await sql(LORENA, `select * from denuncias`)).toEqual([])
    await expect(sql(MIRTA, `insert into moderacion (admin_nombre, accion, objeto_tipo, objeto_id) values ('x', 'x', 'x', 'x')`)).rejects.toThrow(/permission denied/)
    await expect(sql(MIRTA, `delete from moderacion`)).rejects.toThrow(/permission denied/)
    await expect(sql(MIRTA, `update moderacion set motivo = 'otro'`)).rejects.toThrow(/permission denied/)
  })

  it('una admin no se saca el rol a sí misma ni cambia los datos personales de otra cuenta', async () => {
    await expect(sql(MIRTA, `update perfiles set rol = 'comprador' where id = $1`, [MIRTA])).rejects.toThrow(/rol_propio/)
    await expect(sql(MIRTA, `update perfiles set nombre = 'Otro nombre' where id = $1`, [LORENA])).rejects.toThrow(/solo_rol/)
    // con otra admin, una le puede sacar el rol a la otra, y el sitio nunca queda sin admins
    await db.query(`update perfiles set rol = 'admin' where id = $1`, [OTRA_ADMIN])
    expect(await filas(MIRTA, `update perfiles set rol = 'comprador' where id = $1`, [OTRA_ADMIN])).toBe(1)
    await expect(sql(OTRA_ADMIN, `update perfiles set rol = 'admin' where id = $1`, [OTRA_ADMIN])).rejects.toThrow(/solo_admin/)
    expect((await db.query(`select count(*)::int as n from perfiles where rol = 'admin'`)).rows[0]).toEqual({ n: 1 })
    const [ultimo] = await sql<{ accion: string; admin_id: string }>(MIRTA, `select accion, admin_id from moderacion order by id desc limit 1`)
    expect(ultimo).toEqual({ accion: 'rol_comprador', admin_id: MIRTA })
  })
})

describe('tiendas', () => {
  it('el resumen tiene lo pendiente de la demo', async () => {
    const r = await como<{ tiendas: { pendientes: number; nombres: string[] }; denuncias: { contenidos: number; total: number } }>(MIRTA, 'admin_resumen')
    expect(r.tiendas.pendientes).toBe(2)
    expect(r.tiendas.nombres).toEqual(['Mate y Guampa', 'Ótica Iguaçu'])
    expect(r.denuncias).toMatchObject({ contenidos: 4, total: 5 })
  })

  it('aprobar una tienda cambia lo que ve el público, y queda en el registro', async () => {
    expect(await anonimo('tienda', { slug: 'mate-y-guampa' })).toBeNull()
    expect(await anonimo('ficha', { slug: 'termo-de-acero-1-l-con-pico-cebador-mate-y-guampa' })).toBeNull()
    const lista = await como<{ items: { id: string; productos: number }[] }>(MIRTA, 'admin_tiendas', { estado: 'pendiente' })
    expect(lista.items.map((t) => [t.id, t.productos])).toEqual([[MATE, 2], [OTICA, 0]])
    const r = await como<{ slug: string; productos: string[] }>(MIRTA, 'admin_estado_tienda', { tienda: MATE, estado: 'aprobada' })
    expect(r.slug).toBe('mate-y-guampa')
    expect(r.productos).toHaveLength(2)
    expect(await anonimo('tienda', { slug: 'mate-y-guampa' })).not.toBeNull()
    expect(await anonimo('ficha', { slug: 'termo-de-acero-1-l-con-pico-cebador-mate-y-guampa' })).not.toBeNull()
    expect((await sql(null, `select 1 from tarjetas where slug = 'termo-de-acero-1-l-con-pico-cebador-mate-y-guampa'`))).toHaveLength(1)
    const [log] = await sql<{ accion: string; objeto_nombre: string; admin_nombre: string }>(MIRTA, `select accion, objeto_nombre, admin_nombre from moderacion order by id desc limit 1`)
    expect(log).toEqual({ accion: 'tienda_aprobada', objeto_nombre: 'Mate y Guampa', admin_nombre: 'Mirta Giménez' })
  })

  it('suspender pide motivo; la tienda lo ve en su panel y deja de verse en el sitio; reactivarla la vuelve a mostrar', async () => {
    expect(await como(MIRTA, 'admin_estado_tienda', { tienda: MATE, estado: 'suspendida', motivo: 'corto' })).toEqual({ error: 'motivo' })
    // escribiendo directo tampoco: lo frena el disparador
    await expect(sql(MIRTA, `update tiendas set estado = 'suspendida' where id = $1`, [MATE])).rejects.toThrow(/motivo/)
    const motivo = 'Fotos de otra tienda en dos productos: cambialas por fotos propias.'
    await como(MIRTA, 'admin_estado_tienda', { tienda: MATE, estado: 'suspendida', motivo })
    expect(await anonimo('tienda', { slug: 'mate-y-guampa' })).toBeNull()
    expect((await sql(null, `select 1 from tarjetas where slug like '%mate-y-guampa'`))).toHaveLength(0)
    expect(await como(NUEVO_DUENIO, 'mi_tienda_datos')).toMatchObject({ estado: 'suspendida', estado_motivo: motivo })
    await como(MIRTA, 'admin_estado_tienda', { tienda: MATE, estado: 'aprobada' })
    expect(await anonimo('tienda', { slug: 'mate-y-guampa' })).not.toBeNull()
    const acciones = (await sql<{ accion: string; motivo: string | null }>(MIRTA, `select accion, motivo from moderacion where objeto_id = $1 order by id`, [MATE]))
    expect(acciones.map((a) => a.accion)).toEqual(['tienda_aprobada', 'tienda_suspendida', 'tienda_aprobada'])
    expect(acciones[1].motivo).toBe(motivo)
  })

  it('alta de un vendedor: la cuenta por email pasa a vender con una tienda nueva o una sin dueño', async () => {
    expect(await como(MIRTA, 'admin_alta_vendedor', { email: 'nadie@triplice.example', tienda: 'otica-iguacu' })).toMatchObject({ error: 'sin_cuenta' })
    expect(await como(MIRTA, 'admin_alta_vendedor', { email: 'casa-nubla@triplice.example', tienda: 'otica-iguacu' })).toMatchObject({ error: 'ya_tiene_tienda' })
    expect(await como(MIRTA, 'admin_alta_vendedor', { email: 'lorena@triplice.example', tienda: 'casa-nubla' })).toMatchObject({ error: 'tienda_con_duenio' })
    expect(await como(MIRTA, 'admin_alta_vendedor', { email: 'nuevo@triplice.example', nueva: { slug: 'casa-nubla', nombre: 'X', pais: 'PY', ciudad: 'CDE' } }))
      .toMatchObject({ error: 'slug_usado' })
    const r = await como(MIRTA, 'admin_alta_vendedor', { email: 'NUEVO@triplice.example', nueva: { slug: 'nestor-repuestos', nombre: 'Néstor Repuestos', pais: 'PY', ciudad: 'Minga Guazú' } })
    expect(r).toEqual({ slug: 'nestor-repuestos', nombre: 'Néstor Repuestos', cuenta: 'Néstor Nuevo' })
    expect((await db.query(`select rol from perfiles where id = $1`, [NUEVO])).rows[0]).toEqual({ rol: 'vendedor' })
    expect(await como(NUEVO, 'mi_tienda_datos')).toMatchObject({ slug: 'nestor-repuestos', estado: 'aprobada' })
    // Lorena pasa a ser dueña de la óptica (que no tenía dueño)
    expect(await como(MIRTA, 'admin_alta_vendedor', { email: 'lorena@triplice.example', tienda: 'otica-iguacu' })).toMatchObject({ slug: 'otica-iguacu' })
    expect(await como(LORENA, 'mi_tienda_datos')).toMatchObject({ slug: 'otica-iguacu', estado: 'pendiente' })
    // el dueño nuevo tiene que tener perfil de vendedor (escribiendo directo, sin pasar por la función)
    await expect(sql(MIRTA, `update tiendas set duenio_id = $1 where slug = 'importadora-parana-sur'`, [OTRA_ADMIN])).rejects.toThrow(/duenio_rol/)
    await db.query(`update perfiles set rol = 'comprador' where id = $1`, [LORENA])
  })
})
const NUEVO_DUENIO = '00000000-0000-4000-8000-0000000ad002' // Celso, dueño de Mate y Guampa

describe('moderación', () => {
  it('ocultar una reseña la saca de la ficha y del promedio (también en las tarjetas)', async () => {
    type F = { resumen: { promedio: number; cantidad: number }; resenas: { id: string }[] }
    const antes = await anonimo<F>('ficha', { slug: TERMO })
    expect(antes.resenas.map((r) => r.id)).toContain(SPAM)
    const [{ promedio: sinSpam, n }] = (await db.query<{ promedio: string; n: number }>(
      `select round(avg(estrellas), 1)::text as promedio, count(*)::int as n from resenas
        where producto_id = (select id from productos where slug = $1) and estado = 'publicada' and id <> $2`, [TERMO, SPAM])).rows
    expect(Number(antes.resumen.cantidad)).toBe(n + 1)
    expect(await como(MIRTA, 'admin_moderar', { tipo: 'resena', id: SPAM, accion: 'ocultar', motivo: 'xx' })).toEqual({ error: 'motivo' })
    expect(await como(MIRTA, 'admin_moderar', { tipo: 'resena', id: SPAM, accion: 'ocultar', motivo: 'Publicidad o spam: teléfono y otra página' }))
      .toEqual({ slug: TERMO })
    const despues = await anonimo<F>('ficha', { slug: TERMO })
    expect(despues.resenas.map((r) => r.id)).not.toContain(SPAM)
    expect(Number(despues.resumen.cantidad)).toBe(n)
    expect(Number(despues.resumen.promedio)).toBe(Number(sinSpam))
    expect(Number(despues.resumen.promedio)).toBeGreaterThan(Number(antes.resumen.promedio))
    const [tarjeta] = await sql<{ promedio: string; resenas: number }>(null, `select promedio::text, resenas from tarjetas where slug = $1`, [TERMO])
    expect([Number(tarjeta.promedio), tarjeta.resenas]).toEqual([Number(sinSpam), n])
    // sus dos denuncias quedaron resueltas
    expect((await db.query(`select resolucion from denuncias where objeto_id = $1`, [SPAM])).rows).toEqual([{ resolucion: 'oculta' }, { resolucion: 'oculta' }])
    // y se puede volver a publicar (con motivo)
    await como(MIRTA, 'admin_moderar', { tipo: 'resena', id: SPAM, accion: 'publicar', motivo: 'Me equivoqué de reseña' })
    expect((await anonimo<F>('ficha', { slug: TERMO })).resenas.map((r) => r.id)).toContain(SPAM)
    await como(MIRTA, 'admin_moderar', { tipo: 'resena', id: SPAM, accion: 'ocultar', motivo: 'Publicidad o spam' })
  })

  it('dejar publicada descarta las denuncias con un solo renglón en el registro', async () => {
    expect(await como(MIRTA, 'admin_moderar', { tipo: 'resena', id: INJUSTA, accion: 'descartar', motivo: 'Es una opinión válida' })).toMatchObject({ slug: expect.any(String) })
    expect((await db.query(`select estado from resenas where id = $1`, [INJUSTA])).rows[0]).toEqual({ estado: 'publicada' })
    const log = await sql<{ accion: string; motivo: string }>(MIRTA, `select accion, motivo from moderacion where objeto_id = $1`, [INJUSTA])
    expect(log).toEqual([{ accion: 'denuncias_descartadas', motivo: 'Es una opinión válida' }])
    expect(await como(MIRTA, 'admin_moderar', { tipo: 'resena', id: INJUSTA, accion: 'descartar', motivo: 'De nuevo' })).toEqual({ error: 'sin_denuncias' })
  })

  it('ocultar una pregunta oculta también sus respuestas', async () => {
    await db.query(`insert into respuestas (pregunta_id, autor_nombre, texto) values ($1, 'Alguien', 'Te escribo')`, [PREGUNTA_TEL])
    await como(MIRTA, 'admin_moderar', { tipo: 'pregunta', id: PREGUNTA_TEL, accion: 'ocultar', motivo: 'Datos personales' })
    expect(await sql(null, `select 1 from preguntas where id = $1`, [PREGUNTA_TEL])).toHaveLength(0)
    expect(await sql(null, `select 1 from respuestas where pregunta_id = $1`, [PREGUNTA_TEL])).toHaveLength(0)
  })

  it('la cola muestra primero lo más denunciado; las ocultas aparecen en su filtro', async () => {
    const r = await como<{ items: { id: string; denuncias: unknown[] }[]; cuentas: { denunciadas: number } }>(MIRTA, 'admin_moderacion', {})
    expect(r.items.map((x) => x.id)).toEqual([SPAM_PT])
    expect(r.cuentas.denunciadas).toBe(1)
    const ocultas = await como<{ items: { id: string; motivo: string }[] }>(MIRTA, 'admin_moderacion', { filtro: 'ocultas' })
    expect(ocultas.items.map((x) => x.id)).toEqual(expect.arrayContaining([SPAM, PREGUNTA_TEL]))
  })

  it('denunciar: una por cuenta, no lo propio, hasta 10 por hora', async () => {
    expect(await como(LORENA, 'denunciar', { tipo: 'resena', id: SPAM_PT, motivo: 'spam' })).toEqual({ ok: true })
    expect(await como(LORENA, 'denunciar', { tipo: 'resena', id: SPAM_PT, motivo: 'otro' })).toEqual({ error: 'ya' })
    expect(await como(LORENA, 'denunciar', { tipo: 'resena', id: SPAM_PT, motivo: 'porque sí' })).toEqual({ error: 'motivo' })
    expect(await como(LORENA, 'denunciar', { tipo: 'resena', id: SPAM, motivo: 'spam' })).toEqual({ error: 'no_existe' }) // ya oculta
    const [mia] = await db.query<{ id: string }>(`select id from resenas where autor_id = $1 and estado = 'publicada' limit 1`, [LORENA]).then((x) => x.rows)
    expect(await como(LORENA, 'denunciar', { tipo: 'resena', id: mia.id, motivo: 'spam' })).toEqual({ error: 'propia' })
    // la base pone quién y cuándo, no el cliente
    await expect(sql(LORENA, `insert into denuncias (tipo, objeto_id, motivo, autor_id) values ('resena', $1, 'spam', $2)`, [INJUSTA, RUBEN]))
      .rejects.toThrow(/permission denied/)
    const otras = (await db.query<{ id: string }>(`select id from resenas where estado = 'publicada' and autor_id is distinct from $1
        and id::text not like '00000000-0000-4000-8000-0000000ad2%' order by id limit 12`, [LORENA])).rows
    const resultados = []
    for (const o of otras) resultados.push(await como<{ ok?: boolean; error?: string }>(LORENA, 'denunciar', { tipo: 'resena', id: o.id, motivo: 'otro' }))
    expect(resultados.filter((x) => x.ok)).toHaveLength(9) // 1 de antes + 9 = 10 en la hora
    expect(resultados.at(-1)).toEqual({ error: 'limite' })
  })
})

describe('categorías y atributos', () => {
  it('no se borra lo que está en uso y dice por qué', async () => {
    expect(await como(MIRTA, 'admin_borrar_categoria', { id: 1 })).toEqual({ error: 'en_uso', productos: 0, subcategorias: 4, reglas: 1 })
    const smart = (await db.query<{ id: number }>(`select id from categorias where slug = 'smartphones'`)).rows[0].id
    expect(await como(MIRTA, 'admin_borrar_categoria', { id: smart })).toMatchObject({ error: 'en_uso', subcategorias: 0 })
    // escribiendo directo, el disparador frena igual
    await expect(sql(MIRTA, `delete from categorias where id = $1`, [smart])).rejects.toThrow(/en_uso/)
    const [attr] = (await db.query<{ id: number }>(`select a.id from atributos a where atributo_en_uso(a.categoria_id, a.clave) > 0 order by a.id limit 1`)).rows
    expect(await como(MIRTA, 'admin_borrar_atributo', { id: attr.id })).toMatchObject({ error: 'en_uso', productos: expect.any(Number) })
    await expect(sql(MIRTA, `update atributos set tipo = 'booleano' where id = $1`, [attr.id])).rejects.toThrow(/en_uso/)
    await expect(sql(MIRTA, `delete from atributos where id = $1`, [attr.id])).rejects.toThrow(/en_uso/)
  })

  it('crear, ordenar y borrar una subcategoría con su atributo', async () => {
    const r = await como<{ id: number }>(MIRTA, 'admin_guardar_categoria', { slug: 'mates-y-bombillas', nombre: { es: 'Mates y bombillas', pt: 'Cuias e bombas', en: 'Gourds & straws' }, padre: 1 })
    expect(r.id).toBeGreaterThan(0)
    expect(await como(MIRTA, 'admin_guardar_categoria', { slug: 'mates-y-bombillas', nombre: { es: 'Otra', pt: 'Outra', en: 'Other' } })).toMatchObject({ error: 'slug_usado' })
    expect(await como(MIRTA, 'admin_guardar_categoria', { slug: 'sin-pt', nombre: { es: 'Sin portugués', en: 'No pt' } })).toMatchObject({ error: 'nombre' })
    // tres niveles no: el padre tiene que ser una principal
    expect(await como(MIRTA, 'admin_guardar_categoria', { slug: 'nieta', nombre: { es: 'Nieta', pt: 'Neta', en: 'Grandchild' }, padre: r.id })).toMatchObject({ error: 'padre' })
    const a = await como<{ id: number }>(MIRTA, 'admin_guardar_atributo', { categoria: r.id, clave: 'material', nombre: { es: 'Material', pt: 'Material', en: 'Material' },
      tipo: 'opcion', opciones: ['calabaza', 'palo santo', 'acero'], filtrable: true })
    expect(await como(MIRTA, 'admin_guardar_atributo', { categoria: r.id, clave: 'Material Raro', nombre: { es: 'X1', pt: 'X1', en: 'X1' }, tipo: 'texto' })).toMatchObject({ error: 'clave' })
    expect(await como(MIRTA, 'admin_guardar_atributo', { categoria: r.id, clave: 'forma', nombre: { es: 'Forma', pt: 'Forma', en: 'Shape' }, tipo: 'opcion', opciones: ['una'] }))
      .toMatchObject({ error: 'opciones' })
    const antes = (await db.query<{ slug: string }>(`select slug from categorias where padre_id = 1 order by orden, id`)).rows.map((x) => x.slug)
    expect(antes.at(-1)).toBe('mates-y-bombillas')
    await como(MIRTA, 'admin_ordenar', { id: r.id, mover: 'arriba' })
    const despues = (await db.query<{ slug: string }>(`select slug from categorias where padre_id = 1 order by orden, id`)).rows.map((x) => x.slug)
    expect(despues.at(-2)).toBe('mates-y-bombillas')
    expect(await como(MIRTA, 'admin_borrar_atributo', { id: a.id })).toEqual({ ok: true })
    expect(await como(MIRTA, 'admin_borrar_categoria', { id: r.id })).toEqual({ ok: true })
    const acciones = (await sql<{ accion: string }>(MIRTA, `select accion from moderacion where objeto_tipo in ('categoria', 'atributo') order by id`)).map((x) => x.accion)
    expect(acciones).toEqual(expect.arrayContaining(['categoria_creada', 'atributo_creado', 'categoria_ordenada', 'atributo_borrado', 'categoria_borrada']))
  })
})

describe('impuestos y cotizaciones', () => {
  it('cambiar una tasa cambia el impuesto que usa el sitio; la general no se borra', async () => {
    const [general] = (await db.query<{ id: number }>(`select id from reglas_impuesto where pais = 'PY' and categoria_id is null`)).rows
    expect(await como(MIRTA, 'admin_guardar_impuesto', { id: general.id, tasa: 0.7, nombre: { es: 'IVA', pt: 'IVA', en: 'VAT' } })).toMatchObject({ error: 'tasa' })
    await como(MIRTA, 'admin_guardar_impuesto', { id: general.id, tasa: 0.12, nombre: { es: 'IVA 12 %', pt: 'IVA 12 %', en: 'VAT 12%' } })
    expect((await anonimo<Record<string, { categoria: string | null; tasa: number }[]>>('impuestos_vigentes', {})).PY.find((r) => r.categoria === null)?.tasa).toBe(0.12)
    expect(await como(MIRTA, 'admin_borrar_impuesto', { id: general.id })).toEqual({ error: 'general' })
    await expect(sql(MIRTA, `delete from reglas_impuesto where id = $1`, [general.id])).rejects.toThrow(/general/)
    // una regla nueva para una categoría, y no dos para la misma
    const smart = (await db.query<{ id: number }>(`select id from categorias where slug = 'smartphones'`)).rows[0].id
    const nueva = await como<{ id: number }>(MIRTA, 'admin_guardar_impuesto', { pais: 'PY', categoria: smart, tasa: 0.05, nombre: { es: 'IVA 5 %', pt: 'IVA 5 %', en: 'VAT 5%' } })
    expect(await como(MIRTA, 'admin_guardar_impuesto', { pais: 'PY', categoria: smart, tasa: 0.05, nombre: { es: 'IVA 5 %', pt: 'IVA 5 %', en: 'VAT 5%' } }))
      .toMatchObject({ error: 'regla_repetida' })
    expect((await sql<{ t: string }>(null, `select tasa_impuesto('PY', $1::smallint, 1::smallint)::text as t`, [smart]))[0].t).toBe('0.0500')
    expect(await como(MIRTA, 'admin_borrar_impuesto', { id: nueva.id })).toEqual({ ok: true })
    await como(MIRTA, 'admin_guardar_impuesto', { id: general.id, tasa: 0.1, nombre: { es: 'IVA 10 %', pt: 'IVA 10 %', en: 'VAT 10%' } })
    const log = await sql<{ accion: string; antes: { tasa: number }; despues: { tasa: number } }>(MIRTA,
      `select accion, antes, despues from moderacion where accion = 'impuesto_editado' and (despues->>'tasa')::numeric = 0.12`)
    expect(log[0]).toEqual({ accion: 'impuesto_editado', antes: { tasa: 0.1, nombre: expect.anything() }, despues: { tasa: 0.12, nombre: expect.anything() } })
  })

  it('una cotización con más de 5 % de diferencia pide confirmación; fuera de rango no se guarda nunca', async () => {
    const vigente = async () => Number((await anonimo<{ tasas: Record<string, number> }>('cotizaciones_vigentes')).tasas.PYG)
    const actual = await vigente()
    expect(await como(MIRTA, 'admin_guardar_cotizacion', { tasas: { PYG: 735000 } })).toEqual({ error: 'rango', moneda: 'PYG' })
    expect(await como(MIRTA, 'admin_guardar_cotizacion', { tasas: { PYG: actual * 1.08 } })).toMatchObject({ aviso: 'variacion' })
    expect(await vigente()).toBe(actual) // no guardó nada
    expect(await como(MIRTA, 'admin_guardar_cotizacion', { tasas: { PYG: 7400, BRL: 5.5, ARS: 1190 }, confirmar: true })).toMatchObject({ ok: true })
    expect(await vigente()).toBe(7400)
    // escribiendo directo también se frena (un cero de más) y la fecha la pone la base
    await expect(sql(MIRTA, `insert into cotizaciones (moneda, por_usd) values ('BRL', 545)`)).rejects.toThrow(/rango/)
    await sql(MIRTA, `insert into cotizaciones (moneda, por_usd, vigente_desde) values ('BRL', 5.51, '2020-01-01')`)
    const h = await como<{ historial: { moneda: string; por_usd: number; quien: string | null; desde: string }[] }>(MIRTA, 'admin_cotizaciones')
    const brl = h.historial.find((x) => x.moneda === 'BRL')!
    expect([Number(brl.por_usd), brl.quien]).toEqual([5.51, 'Mirta Giménez'])
    expect(Date.parse(brl.desde)).toBeGreaterThan(Date.now() - 60_000)
    const resumen = await como<{ cotizacion_vieja: boolean }>(MIRTA, 'admin_resumen')
    expect(resumen.cotizacion_vieja).toBe(false)
  })
})

describe('Cambio CDE → por_usd (módulo puro)', () => {
  const FILAS = [
    { moneda: 'USD', compra: '7300', venta: '7400', created_at: '2026-11-27T11:30:00+00:00' },
    { moneda: 'BRL', compra: '1340', venta: '1360', created_at: '2026-11-27T11:00:00+00:00' },
    { moneda: 'ARS', compra: '6.10', venta: '6.40', created_at: '2026-11-27T11:45:00+00:00' },
    { moneda: 'EUR', compra: '7900', venta: '8100', created_at: '2026-11-27T11:30:00+00:00' },
    { moneda: 'PYG', compra: '1', venta: '1', created_at: '2026-11-27T08:00:00+00:00' },
  ]

  it('convierte con el promedio entre compra y venta, con 4 decimales', () => {
    // USD: (7300 + 7400) / 2 = 7350 · BRL: 7350 / 1350 = 5,44444… · ARS: 7350 / 6,25 = 1176
    expect(convertirCambioCde(FILAS)).toEqual({ tasas: { PYG: 7350, BRL: 5.4444, ARS: 1176 }, desde: '2026-11-27T11:00:00+00:00', faltan: [] })
  })

  it('sin dólar no hay nada; sin una moneda, la marca como faltante', () => {
    expect(convertirCambioCde(FILAS.filter((f) => f.moneda !== 'USD'))).toEqual({ tasas: {}, desde: null, faltan: ['PYG', 'BRL', 'ARS'] })
    expect(convertirCambioCde([FILAS[0], { ...FILAS[2], venta: '0' }])).toEqual({ tasas: { PYG: 7350 }, desde: FILAS[0].created_at, faltan: ['BRL', 'ARS'] })
  })

  it('variación y aviso de más de 5 %', () => {
    expect(variacionPorcentual(7350, 7400)).toBe(0.68)
    expect(variacionPorcentual(5.45, 5.4444)).toBe(-0.1)
    expect(variacionPorcentual(null, 7400)).toBeNull()
    expect(esCambioGrande(variacionPorcentual(7350, 73500))).toBe(true)
    expect(esCambioGrande(variacionPorcentual(1180, 1239))).toBe(false)
    expect(esCambioGrande(-5.01)).toBe(true)
  })

  it('lee lo que escribe el admin con puntos de miles y coma decimal', () => {
    expect(leerCotizacion('7.350')).toBe(7350)
    expect(leerCotizacion('7350')).toBe(7350)
    expect(leerCotizacion('5,45')).toBe(5.45)
    expect(leerCotizacion('5.45')).toBe(5.45)
    expect(leerCotizacion('1.180,5')).toBe(1180.5)
    expect(leerCotizacion('siete')).toBeNull()
    expect(leerCotizacion('-3')).toBeNull()
  })
})

describe('Cambio CDE por REST (fetch simulado)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const ENTORNO = { CAMBIO_CDE_SUPABASE_URL: 'https://cambio.supabase.co', CAMBIO_CDE_ANON_KEY: 'clave-anon-de-prueba' }

  it('sin las variables explica cuáles faltan y no llama a nadie', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await traerDeCambioCde({})).toEqual({ ok: false, error: 'sin_config', faltan: ['CAMBIO_CDE_SUPABASE_URL', 'CAMBIO_CDE_ANON_KEY'] })
    expect(await traerDeCambioCde({ CAMBIO_CDE_SUPABASE_URL: 'http://otro.com', CAMBIO_CDE_ANON_KEY: 'x' })).toMatchObject({ error: 'sin_config' })
    expect(f).not.toHaveBeenCalled()
  })

  it('pide la vista con la clave anónima, sin caché, y convierte', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([
      { moneda: 'USD', compra: 7300, venta: 7400, created_at: '2026-11-27T11:30:00+00:00' },
      { moneda: 'BRL', compra: 1340, venta: 1360, created_at: '2026-11-27T11:00:00+00:00' },
      { moneda: 'ARS', compra: 6.1, venta: 6.4, created_at: '2026-11-27T11:45:00+00:00' },
    ]), { status: 200 }))
    vi.stubGlobal('fetch', f)
    expect(await traerDeCambioCde(ENTORNO)).toEqual({ ok: true, tasas: { PYG: 7350, BRL: 5.4444, ARS: 1176 }, desde: '2026-11-27T11:00:00+00:00', faltan: [] })
    const [url, opciones] = f.mock.calls[0] as unknown as [URL, RequestInit & { headers: Record<string, string> }]
    expect(String(url)).toBe('https://cambio.supabase.co/rest/v1/cotizaciones_actuales?select=moneda%2Ccompra%2Cventa%2Ccreated_at')
    expect(opciones.headers).toMatchObject({ apikey: 'clave-anon-de-prueba', Authorization: 'Bearer clave-anon-de-prueba' })
    expect(opciones.cache).toBe('no-store')
    expect(opciones.signal).toBeInstanceOf(AbortSignal)
  })

  it('si Cambio CDE no responde o responde mal, lo dice (el admin carga a mano)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout') }))
    expect(await traerDeCambioCde(ENTORNO)).toEqual({ ok: false, error: 'red' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"JWT expired"}', { status: 401 })))
    expect(await traerDeCambioCde(ENTORNO)).toEqual({ ok: false, error: 'respuesta' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })))
    expect(await traerDeCambioCde(ENTORNO)).toEqual({ ok: false, error: 'vacia' })
  })
})

describe('vista previa de impuestos (mismo cálculo que la tienda)', () => {
  const REGLAS = {
    PY: [{ categoria: null, nombre: 'IVA 10 %', tasa: 0.1 }, { categoria: 'supermercado', nombre: 'IVA 5 %', tasa: 0.05 }],
    BR: [{ categoria: null, nombre: 'Impuestos estimados 25 %', tasa: 0.25 }],
    AR: [{ categoria: null, nombre: 'IVA 21 %', tasa: 0.21 }],
  }
  const TASAS = { PYG: 7350, BRL: 5.45, ARS: 1180 }
  const PAVA = { precioUsdCent: 2900, categoria: { sub: 'pequenos-de-cocina', padre: 'electrodomesticos' }, tasas: TASAS, reglas: REGLAS }

  it('la pava de US$ 29 con el IVA de Paraguay al 12 %: ₲ 234.000 → ₲ 239.000; Brasil y Argentina no cambian', () => {
    const v = vistaPreviaImpuesto({ ...PAVA, cambio: { pais: 'PY', categoria: null, tasa: 0.12, nombre: 'IVA 12 %' } })
    expect(v.map((x) => [x.pais, x.antes.precio, x.despues.precio, x.cambia])).toEqual([
      ['PY', 234000, 239000, true], ['BR', 197.6, 197.6, false], ['AR', 41400, 41400, false],
    ])
  })

  it('una regla nueva para la categoría pisa a la general; quitarla vuelve a la general', () => {
    const v = vistaPreviaImpuesto({ ...PAVA, cambio: { pais: 'BR', categoria: 'electrodomesticos', tasa: 0.35, nombre: 'Estimados 35 %' } })
    expect(v[1]).toMatchObject({ antes: { precio: 197.6, tasa: 0.25 }, despues: { precio: 213.4, tasa: 0.35, nombre: 'Estimados 35 %' }, cambia: true })
    expect(aplicarCambio(REGLAS.PY, { pais: 'PY', categoria: 'supermercado', tasa: 0, nombre: '', quitar: true })).toEqual([REGLAS.PY[0]])
  })

  it('lee porcentajes con coma o punto', () => {
    expect(leerPorcentaje('10,5')).toBe(0.105)
    expect(leerPorcentaje('12 %')).toBe(0.12)
    expect(leerPorcentaje('61')).toBeNull()
    expect(leerPorcentaje('diez')).toBeNull()
  })
})
