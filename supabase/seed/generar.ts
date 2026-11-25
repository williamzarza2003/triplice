// Genera supabase/seed.sql (y la lista de fotos que usa el catálogo) a partir de catalogo.ts, tiendas.ts y textos.ts.
// Es determinista: con los mismos archivos sale siempre el mismo SQL (mismos ids, precios y reseñas).
// Uso: node supabase/seed/generar.ts
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CATALOGO, type Entrada, type Valor } from './catalogo.ts'
import { CATEGORIAS, type Texto } from './categorias.ts'
import { TIENDAS, type Tienda } from './tiendas.ts'
import { CIUDADES, CONDICION, DETALLES, EN_CAJA, NOMBRES, PREGUNTAS, RESENAS, VINETAS } from './textos.ts'
import { valor } from '../../lib/catalogo/valores.ts'

type Idioma = 'es' | 'pt' | 'en'
const IDIOMAS: Idioma[] = ['es', 'pt', 'en']
const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..', '..')
const FOTOS = path.join(raiz, 'herramientas', 'fotos')
const AJUSTES: Record<string, { colores?: string[]; descartado?: boolean }> = JSON.parse(readFileSync(path.join(FOTOS, 'modelos.json'), 'utf8'))
const COLORES: Record<string, Texto & { hex: string }> = JSON.parse(readFileSync(path.join(raiz, 'lib', 'catalogo', 'colores.json'), 'utf8'))

// "Hoy" fijo: así el seed no cambia según el día en que se corre
const HOY = Date.UTC(2026, 10, 25, 12)
const DIA = 86_400_000

// ------------------------------------------------------------------ utilidades deterministas
function hash(s: string) {
  return createHash('md5').update(s).digest()
}
function uuid(s: string) {
  const h = hash(s).toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
function azar(semilla: string) {
  let a = hash(semilla).readUInt32LE(0)
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const elegir = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
const entre = (r: () => number, a: number, b: number) => a + r() * (b - a)
function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const j = (x: unknown) => `${q(JSON.stringify(x))}::jsonb`
const fecha = (ms: number) => q(new Date(ms).toISOString())

// ------------------------------------------------------------------ categorías
const PRINCIPAL: Record<string, string> = {}
for (const c of CATEGORIAS) for (const h of c.hijas) PRINCIPAL[h.slug] = c.slug
const ATRIBUTOS: Record<string, Record<string, { nombre: Texto; unidad?: string }>> = {}
for (const c of CATEGORIAS) ATRIBUTOS[c.slug] = Object.fromEntries(c.atributos.map((a) => [a.clave, a]))

// ------------------------------------------------------------------ marcas ficticias por rubro
const MARCAS: Record<string, string[]> = {
  celulares: ['Ondatec', 'Yvága', 'Tesãi', 'Mbyja'],
  informatica: ['Arandu', 'Visora', 'Kapé', 'Ondatec'],
  audio: ['Pirá Sound', "Ñe'ẽ Audio", 'Kapé', 'Yvága'],
  perfumeria: ['Jasy', 'Yvoty', 'Maison Paraná', 'Ara'],
  relojeria: ['Ara', 'Tiempo Sur', 'Kuarepoti', 'Mbyja'],
  electronica: ['Arandu', 'Kapé', 'Ondatec', 'Pirá Sound', 'Visora', 'Yvága'],
  electrodomesticos: ['Moranga', 'Tibia', 'Ventura', 'Calor Paraná', 'Ñandutí Hogar'],
  cocina: ['Tacurú', 'Mesa Larga', 'Puchero', 'Ñandutí Hogar', 'Areguá'],
  muebles: ['Yvyrá', 'Siesta', 'Casa Ombú', 'Lapacho Muebles', 'Nórdica Sur'],
  decoracion: ['Taller Itá', 'Ka\'i', 'Monday Deco', 'Ñandú', 'Areguá'],
  iluminacion: ['Lumen', 'Farol Sur', 'Tata', 'Luzia'],
  herramientas: ['Tatu', 'Forja Sur', 'Paranã Pro', 'Ruta 7'],
  jardin: ['Ka\'aguy', 'Yvoty', 'Huerta Sur', 'Rocío'],
  supermercado: ['Granja Ñu', 'Doña Ramona', 'Sabor da Terra', 'Panadería del Puente'],
  limpieza: ['Limpito', 'Brilho', 'Pyahu', 'Casa Limpia'],
  deportes: ['Mirador', 'Iguazú Sport', 'Dorado Outdoor'],
  juegos: ['Toca', 'Tablero Sur', 'Arandu Kids'],
  libreria: ['Kuatia', 'Pluma Sur', 'Tres Fronteras'],
  moda: ['Yvy', 'Ponte', 'Cuero Sur', 'Sol de Foz'],
  auto: ['Ruta 7', 'Motor Sur', 'Tatu'],
}
const GARANTIA: Record<string, number> = { celulares: 6, informatica: 12, audio: 6, relojeria: 12, electronica: 6, electrodomesticos: 12, herramientas: 6, iluminacion: 6, muebles: 6 }
// Lo que la gente va a buscar a Ciudad del Este: se vende más, tiene más ofertas y más vendedores, y es lo nuevo.
// Así la portada (ofertas, más vendidos y novedades) muestra celulares, notebooks, perfumes y relojes.
const DEMANDA = new Set(['celulares', 'informatica', 'audio', 'perfumeria', 'relojeria', 'electronica'])
const esDemanda = (e: Entrada, cat: string) => DEMANDA.has(cat) && e.m.startsWith('tp_')

const GRAMOS_POR_LITRO: Record<string, number> = {
  muebles: 60, celulares: 300, informatica: 200, audio: 150, perfumeria: 400, relojeria: 300, electronica: 150, electrodomesticos: 120, cocina: 250, decoracion: 300, iluminacion: 80, herramientas: 400,
  jardin: 120, supermercado: 300, limpieza: 400, deportes: 120, juegos: 150, libreria: 300, moda: 100, auto: 250,
}

// ------------------------------------------------------------------ armar productos
type Variante = { id: string; sku: string; opciones: Record<string, string>; imagenes: string[]; recargo: number }
type Producto = {
  id: string; slug: string; sub: string; cat: string; marca: string; titulo: Texto; vinetas: Record<Idioma, string[]>
  descripcion: Texto; atributos: Record<string, Valor>; peso_g: number | null; medidas_mm: number[] | null; garantia: number
  condicion: string; pais_origen: string; en_caja: Record<Idioma, string[]>; ventas_30d: number; creado: number
  usd: number; variantes: Variante[]; popularidad: number; calidad: number; modelo: string; demanda: boolean
}

const imagenes = new Set<string>()
const slugs = new Set<string>()

function dimensiones(m: string) {
  const archivo = path.join(FOTOS, 'modelos', m, 'credito.json')
  if (!existsSync(archivo)) return null
  const d = JSON.parse(readFileSync(archivo, 'utf8')).dimensiones_mm as number[] | undefined
  return d ? d.map((x) => Math.max(5, Math.round(x / 5) * 5)) : null
}

function texto(n: [string, string, string]): Texto {
  return { es: n[0], pt: n[1], en: n[2] }
}

function nombreAtributo(cat: string, clave: string, idioma: Idioma) {
  return ATRIBUTOS[cat]?.[clave]?.nombre[idioma] ?? clave
}

function vinetas(cat: string, a: Record<string, Valor>, cond: string, garantia: number): Record<Idioma, string[]> {
  const r = {} as Record<Idioma, string[]>
  for (const i of IDIOMAS) {
    const v: string[] = []
    for (const [k, x] of Object.entries(a).slice(0, 3)) {
      const unidad = ATRIBUTOS[cat]?.[k]?.unidad
      v.push(`${nombreAtributo(cat, k, i)}: ${valor(x, i)}${unidad && typeof x !== 'boolean' ? ` ${unidad}` : ''}`)
    }
    v.push(...(VINETAS[cat]?.[i] ?? []))
    if (cond !== 'nuevo') v.push(CONDICION[cond as 'usado'][i])
    if (garantia > 0) v.push({ es: `Garantía de ${garantia} meses en la tienda`, pt: `Garantia de ${garantia} meses na loja`, en: `${garantia}-month store warranty` }[i])
    r[i] = v.slice(0, 5)
  }
  return r
}

function descripcion(titulo: Texto, marca: string, cond: string, cat: string): Texto {
  const r = {} as Texto
  for (const i of IDIOMAS) {
    const base = { es: `${titulo.es}, de ${marca}.`, pt: `${titulo.pt}, da ${marca}.`, en: `${titulo.en} by ${marca}.` }[i]
    const extra = VINETAS[cat]?.[i]?.[0] ?? ''
    r[i] = [base, CONDICION[cond as 'nuevo'][i] + '.', extra ? extra + '.' : ''].filter(Boolean).join(' ')
  }
  return r
}

function nombreColor(clave: string): Texto {
  const c = COLORES[clave]
  return { es: c.es.toLowerCase(), pt: c.pt.toLowerCase(), en: c.en.toLowerCase() }
}

const PRODUCTOS: Producto[] = []

function crear(e: Entrada, linea: 0 | 1 | 2, colores: (string | null)[]) {
  const r = azar(`${e.m}#${linea}`)
  const cat = PRINCIPAL[e.sub]
  if (!cat) throw new Error(`Subcategoría desconocida: ${e.sub} (${e.m})`)
  const pool = MARCAS[cat]
  const base = hash(e.m).readUInt16LE(0)
  const marca = linea === 0 && e.marca ? e.marca : pool[(base + linea) % pool.length]
  let titulo = texto(linea === 1 && e.b?.n ? e.b.n : e.n)
  if (linea > 0 && !(linea === 1 && e.b?.n)) {
    const nombres = colores.filter((c): c is string => !!c).map(nombreColor)
    titulo = Object.fromEntries(IDIOMAS.map((i) => [i, `${titulo[i]}, ${nombres.map((n) => n[i]).join(' / ')}`])) as Texto
  }
  const usd = linea === 0 ? e.usd : linea === 1 && e.b ? e.b.usd : Math.round(e.usd * entre(r, 0.86, 1.22) * 100) / 100
  const a = linea === 1 && e.b?.a ? e.b.a : e.a
  const cond = e.cond ?? 'nuevo'
  const garantia = e.g ?? GARANTIA[cat] ?? 0
  // el nombre hasta la primera coma seguida de espacio ("1,7 L" no corta) y la marca
  let s = slug(`${titulo.es.split(', ')[0].split(' ').slice(0, 7).join(' ')} ${marca}`)
  while (slugs.has(s)) s += '-' + Math.floor(r() * 90 + 10)
  slugs.add(s)
  const id = uuid(`producto:${s}`)

  const variantes: Variante[] = []
  const tallas = linea === 0 ? e.tallas : undefined
  colores.forEach((c, ci) => {
    const fotos: string[] = []
    if (c === null || (linea === 0 && ci === 0)) fotos.push(`${e.m}__frente`, `${e.m}__lado`, `${e.m}__frente--detalle`)
    else fotos.push(`${e.m}__c-${c}`, `${e.m}__c-${c}--detalle`)
    fotos.forEach((f) => imagenes.add(f))
    const opcionColor: Record<string, string> = c === null ? {} : { color: c }
    const medidas = tallas?.valores ?? [null]
    medidas.forEach((t, ti) => {
      const opciones: Record<string, string> = { ...opcionColor, ...(t ? { [tallas!.clave]: t } : {}) }
      const sku = `${slug(marca).slice(0, 4).toUpperCase()}-${hash(id).toString('hex').slice(0, 5).toUpperCase()}-${ci}${ti}`
      const recargo = tallas?.recargos?.[ti] ?? (tallas?.clave === 'medida' ? ti * 0.12 : 0)
      variantes.push({ id: uuid(`variante:${id}:${ci}:${ti}`), sku, opciones, imagenes: fotos, recargo })
    })
  })

  const dims = e.mm ?? dimensiones(e.m)
  const litros = dims ? (dims[0] * dims[1] * dims[2]) / 1e6 : 0
  const demanda = esDemanda(e, cat)
  const popularidad = demanda ? 0.5 + 0.5 * Math.pow(r(), 0.7) : 0.85 * Math.pow(r(), 1.6)
  PRODUCTOS.push({
    id, slug: s, sub: e.sub, cat, marca, titulo, vinetas: vinetas(cat, a, cond, garantia), descripcion: descripcion(titulo, marca, cond, cat),
    atributos: a, peso_g: e.peso ?? (dims ? Math.max(40, Math.round((litros * (GRAMOS_POR_LITRO[cat] ?? 150)) / 10) * 10) : null),
    medidas_mm: dims, garantia, condicion: cond,
    pais_origen: a.origen ? ({ py: 'PY', br: 'BR', ar: 'AR', importado: 'CN' } as Record<string, string>)[String(a.origen)] ?? 'PY'
      : a.hecho_a_mano ? 'PY' : elegir(r, ['PY', 'BR', 'AR', 'CN', 'CN', 'BR']),
    en_caja: Object.fromEntries(IDIOMAS.map((i) => [i, EN_CAJA[cat]?.[i] ?? []])) as Record<Idioma, string[]>,
    ventas_30d: Math.round(popularidad * popularidad * 900 + r() * 6),
    creado: HOY - (demanda ? Math.floor(r() * 75) : 90 + Math.floor(r() * 360)) * DIA,
    usd, variantes, popularidad, calidad: entre(r, 3.9, 4.9), modelo: e.m, demanda,
  })
}

for (const e of CATALOGO) {
  const aj = AJUSTES[e.m] ?? {}
  if (aj.descartado) continue
  const cs = aj.colores ?? []
  const original = e.co ?? null
  if (cs.length === 0) crear(e, 0, [original])
  else if (e.juntos) {
    // un solo producto con todos sus colores (un celular no cambia de marca por ser lila)
    if (!original) throw new Error(`Falta el color original (co) de ${e.m}`)
    crear(e, 0, [original, ...cs.filter((c) => c !== original)])
  }
  else {
    if (!original) throw new Error(`Falta el color original (co) de ${e.m}`)
    crear(e, 0, [original, cs[0]].filter((x, i, xs) => xs.indexOf(x) === i))
    if (cs.length >= 2) crear(e, 1, [cs[1]])
    if (cs.length >= 3) crear(e, 2, cs.slice(2))
  }
}

// ------------------------------------------------------------------ ofertas, reseñas y preguntas
type Oferta = { id: string; variante: string; tienda: string; precio: number; lista: number | null; stock: number; envio: boolean; prep: number }
const OFERTAS: Oferta[] = []
const tiendaPrincipal = new Map<string, Tienda>()

for (const p of PRODUCTOS) {
  const r = azar(`ofertas:${p.id}`)
  const usadoOVintage = p.condicion !== 'nuevo'
  const candidatas = TIENDAS.filter((t) => t.rubros.includes(p.cat))
  const fuertes = candidatas.filter((t) => t.rubros[0] === p.cat)
  // lo usado o reacondicionado: los muebles y la decoración van al anticuario; la electrónica, al taller de Arandu
  let principal = usadoOVintage && ['muebles', 'decoracion'].includes(p.cat)
    ? TIENDAS.find((t) => t.slug === 'antiquario-parana')!
    : usadoOVintage && p.cat === 'electronica' ? TIENDAS.find((t) => t.slug === 'arandu-electronica')!
    : elegir(r, fuertes.length && r() < 0.7 ? fuertes : candidatas.length ? candidatas : TIENDAS.filter((t) => t.generalista))
  if (!principal) principal = TIENDAS[0]
  tiendaPrincipal.set(p.id, principal)
  const otras = [...candidatas, ...TIENDAS.filter((t) => t.generalista)].filter((t, i, xs) => t !== principal && xs.indexOf(t) === i)
  const extra = Math.min(otras.length, elegir(r, p.demanda ? [1, 2, 2, 3, 3] : [0, 0, 1, 1, 1, 2, 2, 3]))
  const elegidas = [principal]
  while (elegidas.length < extra + 1) {
    const t = elegir(r, otras)
    if (!elegidas.includes(t)) elegidas.push(t)
  }
  // las rebajas grandes son de lo que más se busca; el resto tiene descuentos chicos y menos seguido
  const conLista = r() < (p.demanda ? 0.6 : 0.16)
  const [rebajaMin, rebajaMax] = p.demanda ? [1.14, 1.4] : [1.06, 1.2]
  elegidas.forEach((t, ti) => {
    const factor = ti === 0 ? 1 : entre(r, 0.94, 1.14)
    for (const v of p.variantes) {
      const precio = Math.max(50, Math.round(p.usd * factor * (1 + v.recargo) * 100))
      const stock = r() < 0.06 ? 0 : r() < 0.15 ? Math.ceil(r() * 3) : Math.ceil(r() * 60)
      OFERTAS.push({
        id: uuid(`oferta:${v.id}:${t.slug}`), variante: v.id, tienda: t.slug, precio,
        lista: conLista && ti === 0 ? Math.round(precio * entre(r, rebajaMin, rebajaMax)) : null,
        stock, envio: precio / 100 >= t.envioGratisDesde, prep: Math.max(1, Math.round(t.preparacionH * entre(r, 0.7, 1.4))),
      })
    }
  })
}

type Resena = { id: string; producto: string; autor: string; pais: string; verificada: boolean; variante: string | null; estrellas: number; titulo: string; texto: string; idioma: Idioma; util: number; creado: number }
const RESENAS_GEN: Resena[] = []
type Pregunta = { id: string; producto: string; autor: string; texto: string; idioma: Idioma; creado: number; respuestas: { autor: string; tienda: string | null; vendedor: boolean; texto: string; creado: number }[] }
const PREGUNTAS_GEN: Pregunta[] = []

function estrellas(r: () => number, calidad: number) {
  const x = calidad + (r() - 0.5) * 1.8 + (r() < 0.05 ? -2 : 0)
  return Math.min(5, Math.max(1, Math.round(x))) as 1 | 2 | 3 | 4 | 5
}

for (const p of PRODUCTOS) {
  const r = azar(`resenas:${p.id}`)
  const n = r() < 0.12 ? 0 : Math.round(p.popularidad * 42 + r() * 6)
  for (let k = 0; k < n; k++) {
    const turista = r() < 0.05
    const pais = turista ? elegir(r, ['US', 'DE', 'GB']) : elegir(r, ['PY', 'PY', 'PY', 'BR', 'BR', 'AR'] as const)
    const idioma: Idioma = turista ? 'en' : pais === 'BR' ? (r() < 0.9 ? 'pt' : 'es') : 'es'
    const e = estrellas(r, p.calidad)
    const banco = RESENAS[e]
    let cuerpo = elegir(r, banco.textos[idioma])
    if (e >= 4 && r() < 0.6) cuerpo += ' ' + elegir(r, DETALLES[p.cat]?.[idioma] ?? [''])
    const origen = (pais === 'PY' || pais === 'BR' || pais === 'AR') ? pais : 'PY'
    cuerpo = cuerpo.replace('{ciudad}', elegir(r, CIUDADES[origen])).replace('{dias}', String(1 + Math.floor(r() * 4)))
    const variante = p.variantes.length > 1 ? elegir(r, p.variantes) : null
    const desc = variante ? Object.values(variante.opciones).map((x) => COLORES[x]?.[idioma] ?? x).join(', ') : null
    RESENAS_GEN.push({
      id: uuid(`resena:${p.id}:${k}`), producto: p.id,
      autor: turista ? elegir(r, ['Emily R.', 'Jonas K.', 'Oliver P.', 'Sarah M.']) : elegir(r, NOMBRES[origen]),
      pais, verificada: r() < 0.82, variante: desc, estrellas: e, titulo: elegir(r, banco.titulos[idioma]), texto: cuerpo.trim(), idioma,
      util: Math.floor(Math.pow(r(), 3) * 40), creado: Math.min(HOY, p.creado + Math.floor(r() * 380) * DIA),
    })
  }
  const nq = r() < 0.3 ? 0 : 1 + Math.floor(r() * 3)
  const usadas = new Set<string>()
  for (let k = 0; k < nq; k++) {
    const bloque = elegir(r, PREGUNTAS.filter((x) => x.rubros === '*' || x.rubros.includes(p.cat)))
    const idioma: Idioma = r() < 0.65 ? 'es' : r() < 0.85 ? 'pt' : 'en'
    const iq = Math.floor(r() * bloque.q[idioma].length)
    const texto = bloque.q[idioma][iq]
    if (usadas.has(texto)) continue
    usadas.add(texto)
    const resp = bloque.r[idioma][Math.min(iq, bloque.r[idioma].length - 1)]
    const tienda = tiendaPrincipal.get(p.id)!
    const creado = Math.min(HOY - DIA, p.creado + Math.floor(r() * 300) * DIA)
    const pais = idioma === 'pt' ? 'BR' : r() < 0.7 ? 'PY' : 'AR'
    PREGUNTAS_GEN.push({
      id: uuid(`pregunta:${p.id}:${k}`), producto: p.id, autor: elegir(r, NOMBRES[pais]), texto, idioma, creado,
      respuestas: r() < 0.9 ? [{ autor: tienda.nombre, tienda: tienda.slug, vendedor: true, texto: resp, creado: creado + Math.ceil(r() * 8) * 3_600_000 }] : [],
    })
  }
}

// ------------------------------------------------------------------ escribir el SQL
const L: string[] = []
L.push('-- Tríplice · datos de ejemplo (generado por supabase/seed/generar.ts: no editar a mano).')
L.push('-- Todo es ficticio: tiendas, marcas, productos, precios, reseñas y preguntas.')
L.push('begin;')
L.push("insert into public.cotizaciones (moneda, por_usd, fuente, vigente_desde) values ('PYG', 7350, 'manual', '2026-11-25T08:00:00Z'), ('BRL', 5.45, 'manual', '2026-11-25T08:00:00Z'), ('ARS', 1180, 'manual', '2026-11-25T08:00:00Z');")

CATEGORIAS.forEach((c, ci) => {
  L.push(`insert into public.categorias (slug, nombre, icono, orden) values (${q(c.slug)}, ${j(c.nombre)}, ${q(c.icono)}, ${ci});`)
  c.hijas.forEach((h, hi) => {
    L.push(`insert into public.categorias (padre_id, slug, nombre, orden) values ((select id from public.categorias where slug = ${q(c.slug)}), ${q(h.slug)}, ${j(h.nombre)}, ${hi});`)
  })
  c.atributos.forEach((a, ai) => {
    L.push(`insert into public.atributos (categoria_id, clave, nombre, tipo, unidad, filtrable, orden) values ((select id from public.categorias where slug = ${q(c.slug)}), ${q(a.clave)}, ${j(a.nombre)}, ${q(a.tipo)}, ${a.unidad ? q(a.unidad) : 'null'}, ${a.filtrable ? 'true' : 'false'}, ${ai});`)
  })
})

for (const t of TIENDAS) {
  const id = uuid(`tienda:${t.slug}`)
  L.push(`insert into public.tiendas (id, slug, nombre, lema, descripcion, color, pais, ciudad, direccion, lat, lng, horario, desde, estado) values (${q(id)}, ${q(t.slug)}, ${q(t.nombre)}, ${j(t.lema)}, ${j(t.descripcion)}, ${q(t.color)}, ${q(t.pais)}, ${q(t.ciudad)}, ${q(t.direccion)}, ${t.lat}, ${t.lng}, ${j(t.horario)}, ${t.desde}, 'aprobada');`)
  const rp = t.reputacion
  L.push(`insert into public.reputacion_tiendas values (${q(id)}, ${rp.recomendacion}, ${rp.opiniones}, ${rp.ventas_12m}, ${rp.respuesta_min}, ${rp.a_tiempo});`)
}

for (const p of PRODUCTOS) {
  L.push(`insert into public.productos (id, slug, categoria_id, marca, titulo, vinetas, descripcion, atributos, peso_g, medidas_mm, garantia_meses, condicion, pais_origen, en_caja, ventas_30d, creado) values (${q(p.id)}, ${q(p.slug)}, (select id from public.categorias where slug = ${q(p.sub)}), ${q(p.marca)}, ${j(p.titulo)}, ${j(p.vinetas)}, ${j(p.descripcion)}, ${j(p.atributos)}, ${p.peso_g ?? 'null'}, ${p.medidas_mm ? `'{${p.medidas_mm.join(',')}}'` : 'null'}, ${p.garantia}, ${q(p.condicion)}, ${q(p.pais_origen)}, ${j(p.en_caja)}, ${p.ventas_30d}, ${fecha(p.creado)});`)
  const filas = p.variantes.map((v, vi) => `(${q(v.id)}, ${q(p.id)}, ${q(v.sku)}, ${j(v.opciones)}, '{${v.imagenes.join(',')}}', ${vi})`)
  L.push(`insert into public.variantes (id, producto_id, sku, opciones, imagenes, orden) values ${filas.join(', ')};`)
}

for (let i = 0; i < OFERTAS.length; i += 200) {
  const filas = OFERTAS.slice(i, i + 200).map((o) => `(${q(o.id)}, ${q(o.variante)}, (select id from public.tiendas where slug = ${q(o.tienda)}), ${o.precio}, ${o.lista ?? 'null'}, ${o.stock}, ${o.envio}, ${o.prep})`)
  L.push(`insert into public.ofertas (id, variante_id, tienda_id, precio_usd_cent, precio_lista_usd_cent, stock, envio_gratis, preparacion_h) values ${filas.join(',\n  ')};`)
}

for (let i = 0; i < RESENAS_GEN.length; i += 300) {
  const filas = RESENAS_GEN.slice(i, i + 300).map((x) => `(${q(x.id)}, ${q(x.producto)}, ${q(x.autor)}, ${q(x.pais)}, ${x.verificada}, ${x.variante ? q(x.variante) : 'null'}, ${x.estrellas}, ${q(x.titulo)}, ${q(x.texto)}, ${q(x.idioma)}, ${x.util}, ${Math.floor(x.util / 6)}, ${fecha(x.creado)})`)
  L.push(`insert into public.resenas (id, producto_id, autor_nombre, pais, compra_verificada, variante, estrellas, titulo, texto, idioma, util_si, util_no, creado) values ${filas.join(',\n  ')};`)
}

for (const x of PREGUNTAS_GEN) {
  L.push(`insert into public.preguntas (id, producto_id, autor_nombre, texto, idioma, creado) values (${q(x.id)}, ${q(x.producto)}, ${q(x.autor)}, ${q(x.texto)}, ${q(x.idioma)}, ${fecha(x.creado)});`)
  for (const a of x.respuestas) {
    L.push(`insert into public.respuestas (pregunta_id, autor_nombre, tienda_id, es_vendedor, texto, creado) values (${q(x.id)}, ${q(a.autor)}, (select id from public.tiendas where slug = ${q(a.tienda ?? '')}), ${a.vendedor}, ${q(a.texto)}, ${fecha(a.creado)});`)
  }
}

L.push('select public.refrescar_catalogo();')
L.push('commit;')

writeFileSync(path.join(raiz, 'supabase', 'seed.sql'), L.join('\n') + '\n', 'utf8')
writeFileSync(path.join(aqui, 'imagenes.json'), JSON.stringify([...imagenes].sort(), null, 0) + '\n', 'utf8')
console.log(`productos ${PRODUCTOS.length} · variantes ${PRODUCTOS.reduce((s, p) => s + p.variantes.length, 0)} · ofertas ${OFERTAS.length} · reseñas ${RESENAS_GEN.length} · preguntas ${PREGUNTAS_GEN.length} · fotos ${imagenes.size}`)
