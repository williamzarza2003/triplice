// Pruebas de la base: corren las migraciones y el seed reales en PGlite (Postgres en WebAssembly),
// como usuario anónimo, igual que la web en producción.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { construirBase } from '@/lib/datos/construir'

let db: PGlite
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

async function rpc(f: string, p: object): Promise<Json> {
  const { rows } = await db.query<{ r: Json }>(`select public.${f}($1::jsonb) as r`, [JSON.stringify(p)])
  return rows[0].r
}

beforeAll(async () => {
  db = await construirBase()
  await db.exec('set role anon')
})
afterAll(() => db.close())

describe('búsqueda', () => {
  it('tolera errores de tipeo y avisa qué buscó', async () => {
    const r = await rpc('buscar', { q: 'pava electirca', idioma: 'es' })
    expect(r.modo).toBe('corregido')
    expect(r.corregido).toBe('pava electrica')
    expect(r.total).toBeGreaterThan(0)
    expect(r.items[0].titulo).toMatch(/^Pava eléctrica/)
  })

  it('corrige palabras sueltas con el vocabulario del catálogo', async () => {
    expect((await rpc('buscar', { q: 'destornilador' })).corregido).toBe('destornillador')
    expect((await rpc('buscar', { q: 'cosina' })).corregido).toBe('cocina')
  })

  it('ignora tildes y mayúsculas', async () => {
    const sin = await rpc('buscar', { q: 'LAMPARA' })
    const con = await rpc('buscar', { q: 'lámpara' })
    expect(sin.total).toBeGreaterThan(0)
    expect(sin.total).toBe(con.total)
    expect(sin.modo).toBe('exacto')
  })

  it('busca en los tres idiomas', async () => {
    const pt = await rpc('buscar', { q: 'chaleira', idioma: 'pt' })
    const en = await rpc('buscar', { q: 'kettle', idioma: 'en' })
    expect(pt.total).toBeGreaterThan(0)
    expect(pt.items[0].titulo).toMatch(/Chaleira/)
    expect(en.items.map((x: Json) => x.id).sort()).toEqual(pt.items.map((x: Json) => x.id).sort())
  })

  it('completa mientras se escribe (prefijos)', async () => {
    const s = await rpc('sugerir', { q: 'tala', idioma: 'es' })
    expect(s.productos.length).toBeGreaterThan(0)
    expect(s.productos.every((p: Json) => /taladro/i.test(p.titulo))).toBe(true)
  })

  it('no inventa resultados para lo que no existe', async () => {
    expect((await rpc('buscar', { q: 'iphnoe' })).total).toBe(0)
  })
})

describe('facetas', () => {
  it('los contadores de marca suman el total', async () => {
    const r = await rpc('buscar', { categoria: 'muebles' })
    const suma = r.facetas.marcas.reduce((s: number, m: Json) => s + Number(m.n), 0)
    expect(suma).toBe(r.total)
  })

  it('filtrar por un atributo deja solo los que lo cumplen y el contador coincide', async () => {
    const todo = await rpc('buscar', { categoria: 'muebles' })
    const madera = todo.facetas.atributos.find((a: Json) => a.clave === 'material').valores.find((v: Json) => v.valor === 'madera')
    const r = await rpc('buscar', { categoria: 'muebles', atributos: { material: ['madera'] }, por_pagina: 60 })
    expect(r.total).toBe(Number(madera.n))
    expect(r.total).toBeLessThan(todo.total)
  })

  it('el rango de precio filtra en centavos de dólar', async () => {
    const r = await rpc('buscar', { categoria: 'herramientas', precio_min: 1000, precio_max: 3000, por_pagina: 60 })
    expect(r.items.length).toBeGreaterThan(0)
    for (const x of r.items) {
      expect(x.precio).toBeGreaterThanOrEqual(1000)
      expect(x.precio).toBeLessThanOrEqual(3000)
    }
  })

  it('ordena por precio', async () => {
    const r = await rpc('buscar', { categoria: 'cocina', orden: 'precio_asc', por_pagina: 60 })
    const precios = r.items.map((x: Json) => Number(x.precio))
    expect(precios).toEqual([...precios].sort((a, b) => a - b))
  })
})

describe('ficha y tienda', () => {
  it('la ficha trae variantes con ofertas, especificaciones y un resumen de reseñas que cierra', async () => {
    const { items } = await rpc('buscar', { q: 'silla monobloc' })
    const f = await rpc('ficha', { slug: items[0].slug, idioma: 'es' })
    expect(f.variantes.length).toBeGreaterThan(0)
    expect(f.variantes[0].ofertas[0].tienda.slug).toBeTruthy()
    expect(f.atributos.length).toBeGreaterThan(0)
    const suma = f.resumen.distribucion.reduce((s: number, n: number) => s + Number(n), 0)
    expect(suma).toBe(Number(f.resumen.cantidad))
  })

  it('un producto que no existe devuelve null', async () => {
    expect(await rpc('ficha', { slug: 'no-existe' })).toBeNull()
  })

  it('la tienda trae su reputación', async () => {
    const t = await rpc('tienda', { slug: 'casa-nubla', idioma: 'es' })
    expect(t.nombre).toBe('Casa Nubla')
    expect(Number(t.reputacion.recomendacion)).toBeGreaterThan(90)
    expect(t.productos).toBeGreaterThan(0)
  })
})

describe('RLS', () => {
  it('el público no puede escribir', async () => {
    await expect(db.exec("insert into public.cotizaciones (moneda, por_usd) values ('PYG', 1)")).rejects.toThrow(/permission denied/)
    await expect(db.exec('update public.ofertas set precio_usd_cent = 1')).rejects.toThrow()
  })

  it('no se ven los productos de una tienda que todavía no aprobó el admin', async () => {
    await db.exec('reset role')
    await db.exec(`
      insert into public.tiendas (slug, nombre, pais, ciudad, desde, estado) values ('tienda-pendiente', 'Pendiente', 'PY', 'CDE', 2026, 'pendiente');
      insert into public.productos (slug, categoria_id, marca, titulo) values ('producto-oculto', (select id from public.categorias where slug = 'audio'), 'X', '{"es":"Parlante oculto"}');
      insert into public.variantes (producto_id, sku) values ((select id from public.productos where slug = 'producto-oculto'), 'OCULTO-1');
      insert into public.ofertas (variante_id, tienda_id, precio_usd_cent, stock) values
        ((select id from public.variantes where sku = 'OCULTO-1'), (select id from public.tiendas where slug = 'tienda-pendiente'), 1000, 5);
      select public.refrescar_catalogo();`)
    await db.exec('set role anon')
    const { rows } = await db.query("select count(*)::int as n from public.productos where slug = 'producto-oculto'")
    expect(rows[0]).toEqual({ n: 0 })
    expect(await rpc('ficha', { slug: 'producto-oculto' })).toBeNull()
    const busqueda = await rpc('buscar', { q: 'parlante oculto' })
    expect(busqueda.items.some((x: Json) => x.slug === 'producto-oculto')).toBe(false)
    // la palabra "oculto" solo existe en el producto oculto: no puede aparecer como corrección
    expect(busqueda.corregido ?? '').not.toMatch(/oculto/)
    const { rows: palabras } = await db.query("select count(*)::int as n from public.vocabulario where palabra = 'oculto'")
    expect(palabras[0]).toEqual({ n: 0 })
  })

  it('el público no puede refrescar el catálogo', async () => {
    await expect(db.exec('select public.refrescar_catalogo()')).rejects.toThrow(/permission denied/)
  })
})

describe('página de tienda', () => {
  it('las tarjetas muestran la oferta de esa tienda, no la más barata de otra', async () => {
    const r = await rpc('buscar', { tienda: 'casa-nubla', por_pagina: 60 })
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.items.every((x: Json) => x.tienda.slug === 'casa-nubla')).toBe(true)
  })
})
