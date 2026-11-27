// Fase 4 contra Postgres real (PGlite) con las mismas migraciones que Supabase: el panel del vendedor.
// Métricas con números exactos sobre pedidos armados a mano, la reputación calculada factor por factor, alta y edición
// de productos con variantes, el pedido que avanza tienda por tienda y el RLS (cada tienda ve y toca solo lo suyo).
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { construirBase } from '@/lib/datos/construir'
import { leerProducto, precioACentavos } from '@/lib/vender/producto'

const ANA = '00000000-0000-4000-8000-0000000a0001' // Tienda A: la de las métricas y la reputación
const BETO = '00000000-0000-4000-8000-0000000a0002' // Tienda B: pedidos que avanzan
const CELE = '00000000-0000-4000-8000-0000000a0003' // Tienda C: comparte un pedido con B
const DORA = '00000000-0000-4000-8000-0000000a0004' // es dueña de una tienda pero su perfil es de compradora
const COMPRADOR = '00000000-0000-4000-8000-0000000a0009'
const LORENA = '00000000-0000-4000-8000-00000000de30'
const TA = '00000000-0000-4000-8000-0000000a00a1'
const TB = '00000000-0000-4000-8000-0000000a00b1'
const TC = '00000000-0000-4000-8000-0000000a00c1'
const TD = '00000000-0000-4000-8000-0000000a00d1'
const FOTO = (t: string) => `subida:${t}/11111111-2222-4333-8444-555555555555`

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

const producto = (tienda: string, extra: object = {}) => ({
  categoria: 'smartphones', marca: 'Ondatec', titulo: { es: 'Celular de prueba con pantalla de 6,1"', pt: 'Celular de teste' },
  descripcion: { es: 'Un celular para las pruebas.' }, atributos: { ram_gb: 8, red: '5G' }, garantia_meses: 6, condicion: 'nuevo',
  envio_gratis: false, preparacion_h: 24, ejes: ['color', 'almacenamiento'],
  variantes: [
    { opciones: { color: 'negro', almacenamiento: '128 GB' }, imagenes: [FOTO(tienda)], precio: 19900, stock: 5 },
    { opciones: { color: 'blanco', almacenamiento: '256 GB' }, imagenes: [], precio: 24900, lista: 27900, stock: 0 },
  ],
  ...extra,
})

/** Un pedido armado a mano (como lo dejaría el webhook), con sus eventos. */
async function pedido(o: {
  numero: string; moneda?: string; cotizacion?: number; estado: string; modo?: 'retiro' | 'domicilio'; hace: string
  items: { oferta: string; tienda: string; cantidad: number; precio: number; prep?: number }[]; eventos?: [string, string, string | null][]
}) {
  const id = crypto.randomUUID()
  const productos = o.items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const entrega = o.modo === 'retiro' ? { modo: 'retiro', puntos: [] } : { modo: 'domicilio', diasMin: 1, diasMax: 2, direccion: 'Calle 1', zona: 'Frontera' }
  await db.query(`insert into pedidos (id, numero, clave, comprador_id, email, region, idioma, moneda, cotizacion, productos, envio, total, entrega,
                  estado, proveedor_pago, creado) values ($1, $2, 'x', $3, 'c@triplice.example', 'PY', 'es', $4, $5, $6, 0, $6, $7, $8, 'simulado', now() - $9::interval)`,
  [id, o.numero, COMPRADOR, o.moneda ?? 'PYG', o.cotizacion ?? 7350, productos, JSON.stringify(entrega), o.estado, o.hace])
  for (const i of o.items) {
    await db.query(`insert into pedido_items (pedido_id, oferta_id, tienda_id, producto_id, titulo, cantidad, precio_unitario, tasa_impuesto, preparacion_h)
                    select $1, o.id, $2, v.producto_id, 'Celular de prueba', $3, $4, 0.1, $5 from ofertas o join variantes v on v.id = o.variante_id where o.id = $6`,
    [id, i.tienda, i.cantidad, i.precio, i.prep ?? 24, i.oferta])
  }
  for (const [estado, desde, tienda] of [['confirmado', '0 minutes', null] as [string, string, string | null], ...(o.eventos ?? [])]) {
    await db.query(`insert into pedido_eventos (pedido_id, estado, tienda_id, creado) values ($1, $2, $3, now() - $4::interval + $5::interval)`,
      [id, estado, tienda, o.hace, desde])
  }
  return id
}

let productoA: { id: string; slug: string }
let ofertasA: { id: string; precio: number }[]

beforeAll(async () => {
  db = await construirBase()
  const usuarios = [[ANA, 'Ana Ríos'], [BETO, 'Beto Galeano'], [CELE, 'Celeste Ortiz'], [DORA, 'Dora Benítez'], [COMPRADOR, 'Juan Comprador']]
  for (const [id, nombre] of usuarios) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${id.slice(-4)}@triplice.example`, JSON.stringify({ full_name: nombre })])
  }
  await db.query(`update perfiles set rol = 'vendedor' where id in ($1, $2, $3)`, [ANA, BETO, CELE])
  for (const [id, duenio, slug] of [[TA, ANA, 'tienda-a'], [TB, BETO, 'tienda-b'], [TC, CELE, 'tienda-c'], [TD, DORA, 'tienda-d']]) {
    await db.query(`insert into tiendas (id, duenio_id, slug, nombre, pais, ciudad, desde, estado) values ($1, $2, $3, $4, 'PY', 'Ciudad del Este', 2020, 'aprobada')`,
      [id, duenio, slug, `Tienda ${slug.slice(-1).toUpperCase()}`])
  }
  productoA = await como(ANA, 'guardar_producto', producto(TA))
  ofertasA = (await db.query<{ id: string; precio: number }>(
    `select o.id, o.precio_usd_cent::int as precio from ofertas o join variantes v on v.id = o.variante_id where v.producto_id = $1 order by v.orden`, [productoA.id])).rows
}, 180_000)
afterAll(() => db?.close())

describe('entrar al panel', () => {
  it('un comprador no tiene panel: las funciones le dicen que no tiene tienda', async () => {
    expect(await como(LORENA, 'vendedor_resumen', { moneda: 'PYG' })).toEqual({ error: 'sin_tienda' })
    expect(await como(LORENA, 'guardar_producto', producto(TA))).toEqual({ error: 'sin_tienda' })
    expect(await como(LORENA, 'mi_reputacion')).toBeNull()
    // ser dueña de una tienda no alcanza: el perfil tiene que ser de vendedor
    expect(await como(DORA, 'vendedor_pedidos')).toEqual({ error: 'sin_tienda' })
  })

  it('sin cuenta ni siquiera se pueden llamar', async () => {
    await expect(anonimo('vendedor_resumen', { moneda: 'PYG' })).rejects.toThrow(/permission denied/)
    await expect(anonimo('guardar_producto', producto(TA))).rejects.toThrow(/permission denied/)
  })

  it('el vendedor de prueba de la vista previa es el dueño de Casa Nubla', async () => {
    const r = await como<{ tienda: { slug: string }; ventas: { pedidos: number } }>('00000000-0000-4000-8000-0000000ce001', 'vendedor_resumen', { moneda: 'PYG' })
    expect(r.tienda.slug).toBe('casa-nubla')
    expect(r.ventas.pedidos).toBeGreaterThan(30)
  })
})

describe('alta y edición de productos con variantes', () => {
  it('crea el producto con sus dos variantes, mi oferta de cada una y la tienda que lo publica', async () => {
    expect(productoA.slug).toBe('celular-de-prueba-con-pantalla-de-6-1-ondatec')
    const [pr] = await db.query<{ tienda_id: string; titulo: Record<string, string> }>(`select tienda_id, titulo from productos where id = $1`, [productoA.id]).then((x) => x.rows)
    expect(pr).toEqual({ tienda_id: TA, titulo: { es: 'Celular de prueba con pantalla de 6,1"', pt: 'Celular de teste' } })
    const variantes = (await db.query<{ opciones: object; imagenes: string[]; stock: number; precio: string; lista: string | null; sku: string }>(
      `select v.opciones, v.imagenes, o.stock, o.precio_usd_cent as precio, o.precio_lista_usd_cent as lista, v.sku from variantes v
         join ofertas o on o.variante_id = v.id where v.producto_id = $1 order by v.orden`, [productoA.id])).rows
    expect(variantes.map((v) => [v.opciones, v.stock, Number(v.precio), v.lista && Number(v.lista)])).toEqual([
      [{ color: 'negro', almacenamiento: '128 GB' }, 5, 19900, null],
      [{ color: 'blanco', almacenamiento: '256 GB' }, 0, 24900, 27900],
    ])
    // la variante sin fotos usa la portada; el SKU lo arma la base
    expect(variantes[1].imagenes).toEqual([FOTO(TA)])
    expect(variantes[0].sku).toMatch(/^ONDA-[0-9A-F]{6}$/)
  })

  it('aparece en la ficha pública y en las tarjetas con el precio de la variante con stock', async () => {
    const f = await anonimo<{ titulo: string; variantes: { ofertas: { precio: number; stock: number; tienda: { slug: string } }[] }[] }>(
      'ficha', { slug: productoA.slug, idioma: 'pt' })
    expect(f.titulo).toBe('Celular de teste')
    expect(f.variantes.map((v) => v.ofertas[0].precio)).toEqual([19900, 24900])
    expect(f.variantes[0].ofertas[0].tienda.slug).toBe('tienda-a')
    const [t] = (await db.query<{ precio_usd_cent: string; stock: number }>(`select precio_usd_cent, stock from tarjetas where id = $1`, [productoA.id])).rows
    expect([Number(t.precio_usd_cent), t.stock]).toEqual([19900, 5])
  })

  it('valida en la base lo mismo que el servidor, y dice qué campo corregir', async () => {
    const repetida = producto(TA, { variantes: [producto(TA).variantes[0], producto(TA).variantes[0]] })
    expect(await como(ANA, 'guardar_producto', repetida)).toEqual({ error: 'repetida', campo: 'v1.opciones' })
    await expect(como(ANA, 'guardar_producto', producto(TA, { titulo: { es: 'Otro celular de prueba' }, atributos: { ram_gb: 'ocho' } }))).rejects.toThrow(/atributo/)
    await expect(como(ANA, 'guardar_producto', producto(TA, { titulo: { es: 'Otro celular de prueba' }, atributos: { sabor: 'menta' } }))).rejects.toThrow(/atributo/)
    const sinFotos = producto(TA, { variantes: producto(TA).variantes.map((v) => ({ ...v, imagenes: [] })) })
    expect(await como(ANA, 'guardar_producto', sinFotos)).toEqual({ error: 'fotos_faltan', campo: 'v0.fotos' })
    // una foto de la carpeta de otra tienda no se puede usar
    expect(await como(ANA, 'guardar_producto', producto(TB))).toEqual({ error: 'foto_ajena', campo: 'v0.fotos' })
    const lista = producto(TA, { variantes: [{ ...producto(TA).variantes[0], lista: 100 }] })
    expect(await como(ANA, 'guardar_producto', lista)).toEqual({ error: 'lista', campo: 'v0.lista' })
  })

  it('editar cambia el precio que ve el comprador; sacar una variante la borra', async () => {
    const actual = await como<{ variantes: { id: string; opciones: object; imagenes: string[] }[] }>(ANA, 'vendedor_producto', { id: productoA.id })
    const v0 = actual.variantes[0]
    const r = await como<{ id: string; nuevo: boolean }>(ANA, 'guardar_producto', producto(TA, {
      id: productoA.id, variantes: [{ id: v0.id, opciones: v0.opciones, imagenes: v0.imagenes, precio: 18500, stock: 7 }],
    }))
    expect(r).toMatchObject({ id: productoA.id, nuevo: false })
    const f = await anonimo<{ variantes: { id: string; ofertas: { precio: number; stock: number }[] }[] }>('ficha', { slug: productoA.slug })
    expect(f.variantes).toHaveLength(1)
    expect(f.variantes[0]).toMatchObject({ id: v0.id, ofertas: [{ precio: 18500, stock: 7 }] })
    // la vuelvo a dejar como estaba para las pruebas de abajo
    await como(ANA, 'guardar_producto', producto(TA, { id: productoA.id, variantes: [{ ...producto(TA).variantes[0], id: v0.id }, producto(TA).variantes[1]] }))
    ofertasA = (await db.query<{ id: string; precio: number }>(
      `select o.id, o.precio_usd_cent::int as precio from ofertas o join variantes v on v.id = o.variante_id where v.producto_id = $1 order by v.orden`, [productoA.id])).rows
    expect(ofertasA).toHaveLength(2)
  })

  it('pausado deja de ser público, pero sigue en mi lista; el stock rápido cambia solo mis ofertas', async () => {
    expect(await como(ANA, 'pausar_producto', { id: productoA.id, activa: false })).toMatchObject({ ofertas: 2 })
    expect(await anonimo('ficha', { slug: productoA.slug })).toBeNull()
    const lista = await como<{ items: { id: string; estado: string }[]; cuentas: Record<string, number> }>(ANA, 'vendedor_productos', { filtro: 'pausados' })
    expect(lista.items.map((x) => x.id)).toEqual([productoA.id])
    expect(lista.cuentas).toMatchObject({ todos: 1, pausados: 1, activos: 0 })
    await como(ANA, 'pausar_producto', { id: productoA.id, activa: true })
    expect(await como(ANA, 'guardar_stock', { stocks: [{ oferta: ofertasA[1].id, stock: 3 }] })).toMatchObject({ ofertas: 1, slug: productoA.slug })
    const busqueda = await como<{ items: { id: string }[] }>(ANA, 'vendedor_productos', { q: 'ondatec celular' })
    expect(busqueda.items.map((x) => x.id)).toEqual([productoA.id])
    expect(await como(ANA, 'guardar_stock', { stocks: [{ oferta: ofertasA[1].id, stock: -1 }] })).toEqual({ error: 'stock' })
  })
})

describe('métricas del resumen (números exactos)', () => {
  beforeAll(async () => {
    const [negro] = ofertasA
    // tres ventas en los últimos 30 días: dos en guaraníes y una en reales (R$ 109 a 5,45 = US$ 20 = ₲ 147.000 de hoy)
    await pedido({ numero: 'TR-A00001', estado: 'entregado', hace: '2 days', items: [{ oferta: negro.id, tienda: TA, cantidad: 1, precio: 234000 }],
      eventos: [['preparando', '2 hours', TA], ['enviado', '10 hours', TA], ['entregado', '30 hours', null]] })
    await pedido({ numero: 'TR-A00002', estado: 'entregado', hace: '5 days', items: [{ oferta: negro.id, tienda: TA, cantidad: 2, precio: 120000 }],
      eventos: [['enviado', '40 hours', TA], ['entregado', '100 hours', null]] }) // llegó tarde: 24 h + 2 días = 72 h
    await pedido({ numero: 'TR-A00003', moneda: 'BRL', cotizacion: 5.45, estado: 'entregado', modo: 'retiro', hace: '10 days',
      items: [{ oferta: ofertasA[1].id, tienda: TA, cantidad: 1, precio: 10900 }], eventos: [['listo_retiro', '20 hours', TA], ['entregado', '2 days', null]] })
    // no cuentan: cancelado, sin pagar y uno del período anterior (que sí sirve para comparar)
    await pedido({ numero: 'TR-A00004', estado: 'cancelado', hace: '1 day', items: [{ oferta: negro.id, tienda: TA, cantidad: 1, precio: 500000 }] })
    await pedido({ numero: 'TR-A00005', estado: 'pendiente_pago', hace: '1 day', items: [{ oferta: negro.id, tienda: TA, cantidad: 1, precio: 99000 }] })
    await pedido({ numero: 'TR-A00006', estado: 'entregado', hace: '40 days', items: [{ oferta: negro.id, tienda: TA, cantidad: 1, precio: 300000 }],
      eventos: [['enviado', '5 hours', TA], ['entregado', '20 hours', null]] })
    // una devolución del segundo pedido
    await db.query(`insert into devoluciones (pedido_id, item_id, usuario_id, motivo) select i.pedido_id, i.id, $1, 'fallado'
                      from pedido_items i join pedidos p on p.id = i.pedido_id where p.numero = 'TR-A00002'`, [COMPRADOR])
    // dos opiniones (una buena, una mala) y tres preguntas: una respondida en 30 minutos, una sin responder y una de hoy
    for (const e of [5, 2]) {
      await db.query(`insert into resenas (producto_id, autor_nombre, pais, estrellas, titulo, texto, idioma) values ($1, 'X', 'PY', $2, 't', 't', 'es')`, [productoA.id, e])
    }
    const preguntas = [['3 days', true], ['2 days', false], ['1 hour', false]] as const
    for (const [hace, respondida] of preguntas) {
      const { rows } = await db.query<{ id: string }>(`insert into preguntas (producto_id, autor_nombre, texto, idioma, creado)
                                                       values ($1, 'Y', '¿Viene con cargador?', 'es', now() - $2::interval) returning id`, [productoA.id, hace])
      if (respondida) {
        await db.query(`insert into respuestas (pregunta_id, autor_nombre, tienda_id, es_vendedor, texto, creado)
                        values ($1, 'Tienda A', $2, true, 'Sí.', now() - $3::interval + interval '30 minutes')`, [rows[0].id, TA, hace])
      }
    }
    await db.exec('select public.refrescar_catalogo()')
  })

  type Resumen = {
    ventas: { monto: number; pedidos: number; ticket: number; unidades: number }; anterior: { monto: number; pedidos: number }
    serie: { dia: string; monto: number; pedidos: number }[]; top: { slug: string; unidades: number; monto: number }[]
    preguntas: { sin_responder: number }; pedidos: { por_preparar: number }
  }

  it('ventas, pedidos y ticket de los últimos 30 días, en la moneda del mercado', async () => {
    const r = await como<Resumen>(ANA, 'vendedor_resumen', { moneda: 'PYG' })
    expect(r.ventas).toEqual({ monto: 621000, pedidos: 3, ticket: 207000, unidades: 4 })
    expect(r.anterior).toEqual({ monto: 300000, pedidos: 1 })
    expect(r.serie).toHaveLength(30)
    expect(r.serie.reduce((s, d) => s + d.monto, 0)).toBe(621000)
    expect(r.serie.filter((d) => d.pedidos > 0)).toHaveLength(3)
    expect(r.top).toEqual([expect.objectContaining({ slug: productoA.slug, unidades: 4, monto: 621000 })])
    expect(r.preguntas.sin_responder).toBe(2)
  })

  it('en dólares: cada venta se pasa con su cotización congelada a la de hoy', async () => {
    const r = await como<Resumen>(ANA, 'vendedor_resumen', { moneda: 'USD' })
    // (234.000 + 240.000) / 7.350 = US$ 64,49 y R$ 109 / 5,45 = US$ 20 → 8.449 centavos
    expect(r.ventas.monto).toBe(8449)
  })

  it('la reputación sale de los cinco factores, y el panel ve de dónde sale cada uno', async () => {
    const r = await como<Record<string, number | null>>(ANA, 'mi_reputacion')
    expect(r).toMatchObject({
      opiniones_total: 2, opiniones_buenas: 1, p_opiniones: 50,
      // el segundo pedido llegó a las 100 h y el plazo era 24 h de preparación + 2 días de envío = 72 h
      entregas_cerradas: 4, entregas_a_tiempo: 3, p_a_tiempo: 75,
      items_entregados: 4, items_devueltos: 1, p_devoluciones: 75,
      // la pregunta de hace una hora todavía está en plazo: no cuenta
      preguntas_total: 2, preguntas_respondidas: 1, p_respondidas: 50, respuesta_mediana_min: 30, p_respuesta: 100,
      pedidos_12m: 4,
    })
    // 0,35 × 50 + 0,30 × 75 + 0,15 × 75 + 0,10 × 50 + 0,10 × 100 = 66,25
    expect(r.reputacion).toBe(66.3)
    // la ficha y la página de la tienda muestran el mismo número
    const t = await anonimo<{ reputacion: { recomendacion: number; a_tiempo: number; respuesta_min: number } }>('tienda', { slug: 'tienda-a' })
    expect(t.reputacion).toMatchObject({ recomendacion: 66.3, a_tiempo: 75, respuesta_min: 30 })
  })

  it('las otras tiendas no ven las ventas ni la reputación de la tienda A', async () => {
    const r = await como<Resumen>(BETO, 'vendedor_resumen', { moneda: 'PYG' })
    expect(r.ventas).toEqual({ monto: 0, pedidos: 0, ticket: 0, unidades: 0 })
    expect((await como<{ opiniones_total: number }>(BETO, 'mi_reputacion')).opiniones_total).toBe(0)
  })
})

describe('pedidos: cada tienda avanza su parte', () => {
  let ofertaB: string
  let ofertaC: string
  beforeAll(async () => {
    const pb = await como<{ id: string }>(BETO, 'guardar_producto', producto(TB, { titulo: { es: 'Parlante de prueba de la tienda B' }, ejes: [],
      categoria: 'parlantes', atributos: {}, variantes: [{ opciones: {}, imagenes: [FOTO(TB)], precio: 5000, stock: 10 }] }))
    const pc = await como<{ id: string }>(CELE, 'guardar_producto', producto(TC, { titulo: { es: 'Funda de prueba de la tienda C' }, ejes: [],
      categoria: 'accesorios-celular', atributos: {}, variantes: [{ opciones: {}, imagenes: [FOTO(TC)], precio: 900, stock: 10 }] }))
    ofertaB = (await db.query<{ id: string }>(`select o.id from ofertas o join variantes v on v.id = o.variante_id where v.producto_id = $1`, [pb.id])).rows[0].id
    ofertaC = (await db.query<{ id: string }>(`select o.id from ofertas o join variantes v on v.id = o.variante_id where v.producto_id = $1`, [pc.id])).rows[0].id
    await pedido({ numero: 'TR-B00001', estado: 'confirmado', modo: 'retiro', hace: '1 hour', items: [{ oferta: ofertaB, tienda: TB, cantidad: 1, precio: 40000, prep: 4 }] })
    await pedido({ numero: 'TR-BC0001', estado: 'confirmado', hace: '1 hour', items: [
      { oferta: ofertaB, tienda: TB, cantidad: 1, precio: 40000 }, { oferta: ofertaC, tienda: TC, cantidad: 1, precio: 7000 }] })
  })

  it('preparando y después "listo para retirar" (si es retiro): queda en la línea de tiempo del comprador', async () => {
    const antes = await como<{ cuentas: Record<string, number>; items: { numero: string; grupo: string; atrasado: boolean }[] }>(BETO, 'vendedor_pedidos', { filtro: 'por_preparar' })
    expect(antes.items.map((x) => x.numero).sort()).toEqual(['TR-B00001', 'TR-BC0001'])
    expect(antes.cuentas.por_preparar).toBe(2)

    type Tareas = { pedidos: { por_preparar: number; preparando: number; atrasado: boolean } }
    expect((await como<Tareas>(BETO, 'vendedor_resumen', {})).pedidos).toMatchObject({ por_preparar: 2, preparando: 0, atrasado: false })
    expect(await como(BETO, 'avanzar_pedido', { numero: 'TR-B00001', estado: 'preparando' })).toMatchObject({ estado: 'preparando', mia: 1 })
    // el resumen dice "2 pedidos para preparar" (de esos, 1 en preparación): la suma es la misma que antes
    expect((await como<Tareas>(BETO, 'vendedor_resumen', {})).pedidos).toMatchObject({ por_preparar: 1, preparando: 1 })
    await expect(como(BETO, 'avanzar_pedido', { numero: 'TR-B00001', estado: 'preparando' })).rejects.toThrow(/orden/)
    expect(await como(BETO, 'avanzar_pedido', { numero: 'TR-B00001', estado: 'enviado' })).toMatchObject({ estado: 'listo_retiro', mia: 2 })

    const visto = await como<{ estado: string; eventos: { estado: string }[] }>(COMPRADOR, 'mi_pedido', { numero: 'TR-B00001' })
    expect(visto.estado).toBe('listo_retiro')
    expect(visto.eventos.map((e) => e.estado)).toEqual(['confirmado', 'preparando', 'listo_retiro'])
    const [ev] = await db.query<{ tienda_id: string }>(`select e.tienda_id from pedido_eventos e join pedidos p on p.id = e.pedido_id
                                                         where p.numero = 'TR-B00001' and e.estado = 'listo_retiro'`).then((x) => x.rows)
    expect(ev.tienda_id).toBe(TB)
  })

  it('un pedido con dos tiendas está en camino recién cuando salieron los dos paquetes', async () => {
    expect(await como(BETO, 'avanzar_pedido', { numero: 'TR-BC0001', estado: 'enviado' })).toMatchObject({ estado: 'confirmado', mia: 2 })
    expect(await como(CELE, 'avanzar_pedido', { numero: 'TR-BC0001', estado: 'preparando' })).toMatchObject({ estado: 'preparando' })
    expect(await como(CELE, 'avanzar_pedido', { numero: 'TR-BC0001', estado: 'enviado' })).toMatchObject({ estado: 'enviado' })
    // cada tienda ve solo sus renglones del pedido
    const deCele = await como<{ items: { numero: string; items: { precio: number }[]; otras_tiendas: boolean }[] }>(CELE, 'vendedor_pedidos', { filtro: 'todos' })
    expect(deCele.items).toEqual([expect.objectContaining({ numero: 'TR-BC0001', items: [expect.objectContaining({ precio: 7000 })], otras_tiendas: true })])
    expect((await sql<{ tienda_id: string }>(CELE, 'select tienda_id from pedido_items')).map((x) => x.tienda_id)).toEqual([TC])
  })
})

describe('RLS: una tienda no ve ni toca lo de otra', () => {
  it('productos y ofertas', async () => {
    expect(await como(BETO, 'vendedor_producto', { id: productoA.id })).toBeNull()
    expect(await como(BETO, 'guardar_producto', producto(TB, { id: productoA.id }))).toEqual({ error: 'no_existe' })
    expect(await como(BETO, 'pausar_producto', { id: productoA.id, activa: false })).toEqual({ error: 'no_existe' })
    expect(await como(BETO, 'guardar_stock', { stocks: [{ oferta: ofertasA[0].id, stock: 0 }] })).toEqual({ error: 'no_existe' })
    // ni escribiendo directo en las tablas
    await sql(BETO, `update ofertas set precio_usd_cent = 1, stock = 0 where id = $1`, [ofertasA[0].id])
    await sql(BETO, `update productos set marca = 'Robada' where id = $1`, [productoA.id])
    await sql(BETO, `delete from variantes where producto_id = $1`, [productoA.id])
    const [o] = (await db.query<{ precio: number; stock: number }>(`select precio_usd_cent::int as precio, stock from ofertas where id = $1`, [ofertasA[0].id])).rows
    expect(o).toEqual({ precio: 19900, stock: 5 })
    expect((await db.query<{ marca: string }>(`select marca from productos where id = $1`, [productoA.id])).rows[0].marca).toBe('Ondatec')
    expect((await db.query(`select 1 from variantes where producto_id = $1`, [productoA.id])).rows).toHaveLength(2)
    // y no puede publicar a nombre de otra tienda
    await expect(sql(BETO, `insert into productos (slug, categoria_id, marca, titulo, tienda_id) select 'x-falso', id, 'Falsa', '{"es":"Producto falso de prueba"}', $1 from categorias limit 1`, [TA]))
      .rejects.toThrow(/row-level security/)
  })

  it('pedidos', async () => {
    const deBeto = await como<{ items: { numero: string }[] }>(BETO, 'vendedor_pedidos', { filtro: 'todos' })
    expect(deBeto.items.map((x) => x.numero)).not.toContain('TR-A00001')
    expect(await como(BETO, 'avanzar_pedido', { numero: 'TR-A00001', estado: 'enviado' })).toEqual({ error: 'no_existe' })
    // ni con el id del pedido en la mano, ni firmando como la tienda A
    const [{ id }] = (await db.query<{ id: string }>(`select id from pedidos where numero = 'TR-A00001'`)).rows
    await expect(sql(BETO, `insert into pedido_eventos (pedido_id, estado, tienda_id) values ($1, 'enviado', $2)`, [id, TB])).rejects.toThrow(/no_existe/)
    await expect(sql(BETO, `insert into pedido_eventos (pedido_id, estado, tienda_id) values ($1, 'enviado', $2)`, [id, TA])).rejects.toThrow()
    // un comprador tampoco escribe en la línea de tiempo
    await expect(sql(COMPRADOR, `insert into pedido_eventos (pedido_id, estado, tienda_id) values ($1, 'entregado', null)`, [id])).rejects.toThrow()
  })

  it('preguntas', async () => {
    const deBeto = await como<{ items: { slug: string }[] }>(BETO, 'vendedor_preguntas', { filtro: 'todas' })
    expect(deBeto.items.map((x) => x.slug)).not.toContain(productoA.slug)
    const [q] = (await db.query<{ id: string }>(`select id from preguntas where producto_id = $1 order by creado desc limit 1`, [productoA.id])).rows
    expect(await como(BETO, 'vendedor_responder', { pregunta: q.id, texto: 'Respondo por otra tienda' })).toEqual({ error: 'no_existe' })
    // la tienda A sí, y la respuesta lleva el sello de vendedor
    expect(await como(ANA, 'vendedor_responder', { pregunta: q.id, texto: 'Sí, trae cargador de 20 W.' })).toEqual({ slug: productoA.slug })
    const [a] = (await db.query<{ es_vendedor: boolean; autor_nombre: string }>(`select es_vendedor, autor_nombre from respuestas where pregunta_id = $1`, [q.id])).rows
    expect(a).toEqual({ es_vendedor: true, autor_nombre: 'Tienda A' })
    const sin = await como<{ cuentas: { sin_responder: number } }>(ANA, 'vendedor_preguntas', {})
    expect(sin.cuentas.sin_responder).toBe(1)
  })
})

// Lo que encontró la revisión de seguridad de la fase 4 (etapa 13 del informe). Todo escrito como lo haría alguien
// con la clave pública de Supabase: directo en las tablas, sin pasar por el servidor de la web.
describe('revisión de seguridad: escrituras directas y casos borde', () => {
  it('todas las tablas del esquema public tienen RLS', async () => {
    const { rows } = await db.query<{ tabla: string }>(`select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                                         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
    expect(rows).toEqual([])
  })

  it('la tienda no toca las columnas que mantiene la base (ventas, búsqueda) ni muda una oferta de variante', async () => {
    await expect(sql(ANA, `update productos set ventas_30d = 99999 where id = $1`, [productoA.id])).rejects.toThrow(/permission denied/)
    await expect(sql(ANA, `update ofertas set variante_id = variante_id where id = $1`, [ofertasA[0].id])).rejects.toThrow(/permission denied/)
    await expect(sql(ANA, `update ofertas set preparacion_h = 0 where id = $1`, [ofertasA[0].id])).rejects.toThrow(/ofertas_preparacion/)
  })

  it('lo que el servidor valida también lo valida la base', async () => {
    const larga = JSON.stringify({ es: 'x'.repeat(2001) })
    await expect(sql(ANA, `update productos set descripcion = $2::jsonb where id = $1`, [productoA.id, larga])).rejects.toThrow(/descripcion/)
    await expect(sql(ANA, `update productos set titulo = '{"es":"Corto"}' where id = $1`, [productoA.id])).rejects.toThrow(/titulo/)
  })

  it('las fotos de otra tienda no se usan: ni escribiendo en la tabla ni con el id de una variante ajena', async () => {
    const deBeto = await como<{ id: string }>(BETO, 'guardar_producto', producto(TB, { titulo: { es: 'Celular de la tienda B con fotos propias' } }))
    const [vb] = (await db.query<{ id: string }>(`select id from variantes where producto_id = $1 order by orden limit 1`, [deBeto.id])).rows
    await expect(sql(ANA, `update variantes set imagenes = array[$2] where producto_id = $1`, [productoA.id, FOTO(TB)])).rejects.toThrow(/foto_ajena/)
    const base = producto(TA, { titulo: { es: 'Celular con las fotos de la tienda B' } })
    const intento = { ...base, variantes: [{ ...base.variantes[0], id: vb.id, imagenes: [FOTO(TB)] }, base.variantes[1]] }
    expect(await como(ANA, 'guardar_producto', intento)).toMatchObject({ error: 'foto_ajena' })
  })

  it('ser dueña de una tienda con perfil de compradora no alcanza para escribir directo', async () => {
    const [v] = (await db.query<{ id: string }>(`select id from variantes where producto_id = $1 limit 1`, [productoA.id])).rows
    await expect(sql(DORA, `insert into ofertas (variante_id, tienda_id, precio_usd_cent, stock) values ($1, $2, 100, 1)`, [v.id, TD]))
      .rejects.toThrow(/row-level security/)
    await expect(sql(DORA, `insert into storage.objects (bucket_id, name) values ('productos', $1)`, [`${TD}/foto.webp`]))
      .rejects.toThrow(/row-level security/)
  })

  it('una tienda suspendida no publica ni sube fotos, pero sigue con sus ofertas', async () => {
    await db.query(`update tiendas set estado = 'suspendida' where id = $1`, [TA])
    try {
      expect(await como(ANA, 'guardar_producto', producto(TA, { titulo: { es: 'Producto nuevo de una tienda suspendida' } }))).toEqual({ error: 'suspendida' })
      expect(await como(ANA, 'guardar_producto', producto(TA, { id: productoA.id }))).toEqual({ error: 'suspendida' })
      await expect(sql(ANA, `insert into storage.objects (bucket_id, name) values ('productos', $1)`, [`${TA}/foto.webp`])).rejects.toThrow(/row-level security/)
      expect(await como(ANA, 'guardar_stock', { stocks: [{ oferta: ofertasA[0].id, stock: 5 }] })).toMatchObject({ ofertas: 1 })
    } finally {
      await db.query(`update tiendas set estado = 'aprobada' where id = $1`, [TA])
    }
    await sql(ANA, `insert into storage.objects (bucket_id, name) values ('productos', $1)`, [`${TA}/foto.webp`])
    await expect(sql(ANA, `insert into storage.objects (bucket_id, name) values ('productos', $1)`, [`${TB}/foto.webp`])).rejects.toThrow(/row-level security/)
  })

  it('la tienda ve los pedidos con lo suyo, pero no la clave de invitado que abre el comprobante entero', async () => {
    expect((await sql(BETO, `select numero from pedidos`)).length).toBeGreaterThan(0)
    await expect(sql(BETO, `select clave from pedidos`)).rejects.toThrow(/permission denied/)
    await expect(sql(BETO, `select * from pedidos`)).rejects.toThrow(/permission denied/)
  })
})

describe('lectura del formulario en el servidor (módulo puro)', () => {
  const base = () => {
    const f = new FormData()
    for (const [k, v] of Object.entries({
      categoria: 'smartphones', marca: 'Ondatec', titulo_es: 'Celular de prueba 6,1"', variantes: '0,3', ejes: 'color', preparacion_h: '24',
      'v0.op.color': 'negro', 'v0.precio': '199,90', 'v0.stock': '5', 'v0.imagen': FOTO(TA),
      'v3.op.color': 'blanco', 'v3.precio': '1.249,50', 'v3.stock': '0', 'a.ram_gb': '8', 'a.red': '5G', 'a.cancelacion_ruido': '',
    })) f.append(k, v)
    return f
  }
  const atributos = [{ clave: 'ram_gb', tipo: 'numero' }, { clave: 'red', tipo: 'opcion' }, { clave: 'cancelacion_ruido', tipo: 'booleano' }] as const

  it('pasa el precio en dólares a centavos (con coma o con punto)', () => {
    expect(precioACentavos('199,90')).toBe(19990)
    expect(precioACentavos('1.249,50')).toBe(124950)
    expect(precioACentavos('1,249.50')).toBe(124950)
    expect(precioACentavos('29')).toBe(2900)
    expect(precioACentavos('29.9')).toBe(2990)
    expect(precioACentavos('dos')).toBeNull()
    expect(precioACentavos('-3')).toBeNull()
  })

  it('arma el producto para la base y no deja pasar errores', () => {
    const r = leerProducto(base(), [...atributos])
    expect(r.errores).toEqual({})
    expect(r.datos.variantes.map((v) => [v.opciones, v.precio, v.stock, v.imagenes])).toEqual([
      [{ color: 'negro' }, 19990, 5, [FOTO(TA)]], [{ color: 'blanco' }, 124950, 0, []],
    ])
    expect(r.datos.atributos).toEqual({ ram_gb: 8, red: '5G' })

    const mal = base()
    mal.set('titulo_es', 'Corto')
    mal.set('v3.precio', 'gratis')
    mal.set('v3.op.color', 'negro')
    mal.set('v0.stock', '2,5')
    mal.set('a.ram_gb', 'mucha')
    expect(leerProducto(mal, [...atributos]).errores).toEqual({
      titulo_es: 'titulo', 'v3.precio': 'precio', 'v3.opciones': 'repetida', 'v0.stock': 'stock', 'a.ram_gb': 'numero',
    })
  })
})
