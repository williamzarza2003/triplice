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
  // la reputación ya no se carga a mano: la calcula la base (fase 4) con el historial de pedidos de más abajo
}

for (const p of PRODUCTOS) {
  // tienda_id: la que lo publica (la única que edita sus datos desde el panel); las demás lo venden con su oferta
  L.push(`insert into public.productos (id, slug, categoria_id, marca, titulo, vinetas, descripcion, atributos, peso_g, medidas_mm, garantia_meses, condicion, pais_origen, en_caja, ventas_30d, creado, tienda_id) values (${q(p.id)}, ${q(p.slug)}, (select id from public.categorias where slug = ${q(p.sub)}), ${q(p.marca)}, ${j(p.titulo)}, ${j(p.vinetas)}, ${j(p.descripcion)}, ${j(p.atributos)}, ${p.peso_g ?? 'null'}, ${p.medidas_mm ? `'{${p.medidas_mm.join(',')}}'` : 'null'}, ${p.garantia}, ${q(p.condicion)}, ${q(p.pais_origen)}, ${j(p.en_caja)}, ${p.ventas_30d}, ${fecha(p.creado)}, ${q(uuid(`tienda:${tiendaPrincipal.get(p.id)!.slug}`))});`)
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

// ------------------------------------------------------------------ fase 2: impuestos, envío, retiro y cupones
// Impuestos: simulación aproximada (la interfaz lo aclara). Paraguay: IVA 10 % y 5 % en alimentos.
// Argentina: IVA 21 % y 10,5 % en alimentos y computación. Brasil: un único "impuestos estimados" que
// representa importación + ICMS, más alto en electrónica importada.
const IMPUESTOS: { pais: 'PY' | 'BR' | 'AR'; cat: string | null; nombre: Texto; tasa: number }[] = [
  { pais: 'PY', cat: null, nombre: { es: 'IVA 10 %', pt: 'IVA 10 %', en: 'VAT 10%' }, tasa: 0.1 },
  { pais: 'PY', cat: 'supermercado', nombre: { es: 'IVA 5 %', pt: 'IVA 5 %', en: 'VAT 5%' }, tasa: 0.05 },
  { pais: 'AR', cat: null, nombre: { es: 'IVA 21 %', pt: 'IVA 21 %', en: 'VAT 21%' }, tasa: 0.21 },
  { pais: 'AR', cat: 'supermercado', nombre: { es: 'IVA 10,5 %', pt: 'IVA 10,5 %', en: 'VAT 10.5%' }, tasa: 0.105 },
  { pais: 'AR', cat: 'informatica', nombre: { es: 'IVA 10,5 %', pt: 'IVA 10,5 %', en: 'VAT 10.5%' }, tasa: 0.105 },
  { pais: 'BR', cat: null, nombre: { es: 'Impuestos estimados 25 %', pt: 'Impostos estimados 25 %', en: 'Estimated taxes 25%' }, tasa: 0.25 },
  { pais: 'BR', cat: 'supermercado', nombre: { es: 'Impuestos estimados 12 %', pt: 'Impostos estimados 12 %', en: 'Estimated taxes 12%' }, tasa: 0.12 },
  ...(['celulares', 'informatica', 'electronica'] as const).map((cat) => (
    { pais: 'BR' as const, cat, nombre: { es: 'Impuestos estimados 35 %', pt: 'Impostos estimados 35 %', en: 'Estimated taxes 35%' }, tasa: 0.35 })),
]
for (const r of IMPUESTOS) {
  L.push(`insert into public.reglas_impuesto (pais, categoria_id, nombre, tasa) values (${q(r.pais)}, ${r.cat ? `(select id from public.categorias where slug = ${q(r.cat)})` : 'null'}, ${j(r.nombre)}, ${r.tasa});`)
}

// Envío: base + por kilo (centavos de dólar). La frontera es la zona de las tiendas: sale más barato y más rápido.
const ZONAS = [
  { pais: 'PY', ambito: 'frontera', nombre: { es: 'Ciudad del Este y alrededores', pt: 'Ciudad del Este e região', en: 'Ciudad del Este area' }, ciudades: ['ciudad del este', 'hernandarias', 'minga guazu', 'presidente franco'], base: 300, kg: 50, dias: [1, 2] },
  { pais: 'PY', ambito: 'pais', nombre: { es: 'Resto de Paraguay', pt: 'Resto do Paraguai', en: 'Rest of Paraguay' }, ciudades: [], base: 600, kg: 120, dias: [2, 4] },
  { pais: 'BR', ambito: 'frontera', nombre: { es: 'Foz do Iguaçu', pt: 'Foz do Iguaçu', en: 'Foz do Iguaçu' }, ciudades: ['foz do iguacu'], base: 500, kg: 100, dias: [1, 3] },
  { pais: 'BR', ambito: 'pais', nombre: { es: 'Resto de Brasil', pt: 'Resto do Brasil', en: 'Rest of Brazil' }, ciudades: [], base: 1200, kg: 300, dias: [5, 10] },
  { pais: 'AR', ambito: 'frontera', nombre: { es: 'Puerto Iguazú', pt: 'Puerto Iguazú', en: 'Puerto Iguazú' }, ciudades: ['puerto iguazu'], base: 600, kg: 150, dias: [1, 3] },
  { pais: 'AR', ambito: 'pais', nombre: { es: 'Resto de Argentina', pt: 'Resto da Argentina', en: 'Rest of Argentina' }, ciudades: [], base: 1400, kg: 350, dias: [5, 10] },
  { pais: 'XX', ambito: 'mundo', nombre: { es: 'Envío internacional', pt: 'Envio internacional', en: 'International shipping' }, ciudades: [], base: 3500, kg: 900, dias: [7, 15] },
]
for (const z of ZONAS) {
  L.push(`insert into public.zonas_envio (pais, ambito, nombre, ciudades, costo_base_usd_cent, costo_kg_usd_cent, dias_min, dias_max) values (${q(z.pais)}, ${q(z.ambito)}, ${j(z.nombre)}, '{${z.ciudades.map((c) => `"${c}"`).join(',')}}', ${z.base}, ${z.kg}, ${z.dias[0]}, ${z.dias[1]});`)
}

// Retiro: el local de cada tienda
for (const t of TIENDAS) {
  L.push(`insert into public.puntos_retiro (tienda_id, nombre, direccion, ciudad, lat, lng, horario) values ((select id from public.tiendas where slug = ${q(t.slug)}), ${q(t.nombre)}, ${q(t.direccion)}, ${q(t.ciudad)}, ${t.lat}, ${t.lng}, ${j(t.horario)});`)
}

// Cupones de prueba (el último está vencido, para mostrar el mensaje)
const CUPONES = [
  { codigo: 'BIENVENIDA10', tipo: 'porcentaje', valor: 10, minimo: 2000, vence: null, descripcion: { es: '10 % en tu primera compra, desde US$ 20', pt: '10 % na sua primeira compra, a partir de US$ 20', en: '10% off your first order over US$ 20' } },
  { codigo: 'PUENTE', tipo: 'monto', valor: 1500, minimo: 15000, vence: null, descripcion: { es: 'US$ 15 menos en compras desde US$ 150', pt: 'US$ 15 de desconto a partir de US$ 150', en: 'US$ 15 off orders over US$ 150' } },
  { codigo: 'INVIERNO25', tipo: 'porcentaje', valor: 25, minimo: 0, vence: '2026-08-31T23:59:59Z', descripcion: { es: 'Liquidación de invierno', pt: 'Liquidação de inverno', en: 'Winter sale' } },
]
for (const c of CUPONES) {
  L.push(`insert into public.cupones (codigo, tipo, valor, minimo_usd_cent, descripcion, vence) values (${q(c.codigo)}, ${q(c.tipo)}, ${c.valor}, ${c.minimo}, ${j(c.descripcion)}, ${c.vence ? q(c.vence) : 'null'});`)
}

// ------------------------------------------------------------------ fase 4: historial de pedidos de 12 meses
// De acá salen las métricas del panel del vendedor y la reputación calculada de cada tienda. Se arma en SQL (unos
// 5.700 pedidos con su línea de tiempo y algunas devoluciones), con fechas relativas al momento de cargar el seed y
// el azar con semilla fija. Cada tienda tiene su ritmo y sus costumbres: cuántos pedidos recibe por día, qué parte
// despacha tarde y cuánto le devuelven (sale de su perfil en tiendas.ts). Los compradores son ficticios.
const COMPRADORES = (['PY', 'BR', 'AR'] as const).flatMap((pais) => NOMBRES[pais].map((nombre) => ({ pais, nombre })))
L.push(`insert into auth.users (id, email, raw_user_meta_data) values ${COMPRADORES.map((c, i) => `(${q(uuid(`comprador:${i}`))}, ${q(`cliente-${String(i + 1).padStart(2, '0')}@triplice.example`)}, ${j({ full_name: c.nombre })})`).join(', ')};`)
for (const pais of ['BR', 'AR'] as const) {
  L.push(`update public.perfiles set region = ${q(pais)}, moneda = ${q(pais === 'BR' ? 'BRL' : 'ARS')}, idioma = ${q(pais === 'BR' ? 'pt' : 'es')} where id in (${COMPRADORES.map((c, i) => (c.pais === pais ? q(uuid(`comprador:${i}`)) : null)).filter(Boolean).join(', ')});`)
}
L.push(`create temp table hist_tiendas (slug text, ritmo numeric, tarde numeric, devuelve numeric) on commit drop;`)
L.push(`insert into hist_tiendas values ${TIENDAS.map((t) => `(${q(t.slug)}, ${(t.reputacion.ventas_12m / 365 / 14).toFixed(3)}, ${((100 - t.reputacion.a_tiempo) / 100 * 1.6).toFixed(3)}, ${((100 - t.reputacion.recomendacion) / 100 * 0.6).toFixed(3)})`).join(', ')};`)
L.push(`select setseed(0.2026);
create temp table hist_compradores on commit drop as
  select u.id, u.raw_user_meta_data->>'full_name' as nombre, u.email, pf.region,
         row_number() over (partition by pf.region order by u.email) - 1 as n, count(*) over (partition by pf.region) as total
    from auth.users u join public.perfiles pf on pf.id = u.id where u.email like 'cliente-%@triplice.example';
create temp table hist_ofertas on commit drop as
  select o.id as oferta, o.tienda_id, o.precio_usd_cent, o.preparacion_h, v.opciones, pr.id as producto_id, pr.titulo, c.id as cat, c.padre_id as padre,
         row_number() over (partition by o.tienda_id order by pr.ventas_30d desc, o.id) - 1 as n, count(*) over (partition by o.tienda_id) as total
    from public.ofertas o join public.variantes v on v.id = o.variante_id join public.productos pr on pr.id = v.producto_id
    join public.categorias c on c.id = pr.categoria_id where o.activa;
create temp table hist on commit drop as
with dias as (
  select t.id as tienda_id, t.pais, h.tarde, h.devuelve, d,
         h.ritmo * case extract(isodow from now() - make_interval(days => d)) when 5 then 1.3 when 6 then 1.5 when 7 then 0.6 else 1 end as ritmo
    from public.tiendas t join hist_tiendas h on h.slug = t.slug cross join generate_series(0, 364) d
), pedidos as (
  select x.*, now() - make_interval(days => x.d, mins => (random() * 660)::int) as creado,
         random() as r_oferta, random() as r_cant, random() as r_region, random() as r_modo, random() as r_tarde, random() as r_prep,
         random() as r_desp, random() as r_entrega, random() as r_cancela, random() as r_devuelve, random() as r_comprador
    from dias x cross join lateral generate_series(1, floor(x.ritmo * (0.5 + random()) + random())::int) s
), con_oferta as (
  select pe.*, ho.oferta, ho.precio_usd_cent, ho.preparacion_h, ho.opciones, ho.producto_id, ho.titulo, ho.cat, ho.padre,
         case when pe.r_region < 0.78 then pe.pais when pe.r_region < 0.9 then (case pe.pais when 'PY' then 'BR' else 'PY' end)
              else (case pe.pais when 'AR' then 'BR' else 'AR' end) end as region
    from pedidos pe join hist_ofertas ho on ho.tienda_id = pe.tienda_id and ho.n = floor(power(pe.r_oferta, 1.7) * ho.total)
), con_precio as (
  select c.*, m.moneda, m.cot, m.paso, public.tasa_impuesto(c.region, c.cat, c.padre) as tasa,
         case when c.r_cant < 0.85 then 1 else 2 end as cantidad,
         case when c.region = c.pais and c.r_modo < 0.45 then 'retiro' else 'domicilio' end as modo,
         case when c.region = c.pais then 2 else 5 end as dias_max,
         c.r_tarde < c.tarde as es_tarde
    from con_oferta c
    join lateral (select x.moneda, x.paso, (select por_usd from public.cotizaciones k where k.moneda = x.moneda order by vigente_desde desc limit 1) as cot
                    from (values ('PY', 'PYG', 1000), ('BR', 'BRL', 10), ('AR', 'ARS', 100)) x(region, moneda, paso) where x.region = c.region) m on true
)
select row_number() over (order by p.creado, p.tienda_id, p.oferta) as rn, gen_random_uuid() as id, p.*,
       round(p.precio_usd_cent / 100.0 * (1 + p.tasa) * p.cot * 10 ^ public.decimales(p.moneda) / p.paso) * p.paso as precio,
       p.creado + interval '2 minutes' as t_confirmado,
       p.creado + make_interval(secs => p.preparacion_h * 3600 * (0.1 + 0.25 * p.r_prep)) as t_preparando,
       p.creado + interval '20 minutes' + make_interval(secs => p.preparacion_h * 3600 * case when p.es_tarde then 1.15 + 1.2 * p.r_desp else 0.3 + 0.6 * p.r_desp end) as t_despacho,
       p.r_cancela < 0.012 as cancelado
  from con_precio p;
alter table hist add column t_entregado timestamptz;
update hist set t_entregado = case when modo = 'retiro' then t_despacho + make_interval(secs => 3600 * (1 + 46 * r_entrega))
  else t_despacho + make_interval(secs => 3600 * (6 + (dias_max * 24 - 10) * r_entrega * case when es_tarde then 1.5 else 0.85 end)) end;
insert into public.pedidos (id, numero, clave, comprador_id, email, region, idioma, moneda, cotizacion, productos, envio, descuento, total,
                            impuestos, entrega, estado, proveedor_pago, referencia_pago, creado)
select h.id, 'TR-H' || lpad(upper(to_hex(h.rn)), 5, '0'), md5(h.id::text), b.id, b.email, h.region, case when h.region = 'BR' then 'pt' else 'es' end,
       h.moneda, h.cot, h.precio * h.cantidad, e.envio, 0, h.precio * h.cantidad + e.envio,
       jsonb_build_array(jsonb_build_object('nombre', case when h.region = 'BR' then 'Impostos estimados ' else 'IVA ' end
                                                      || replace(rtrim(rtrim(to_char(h.tasa * 100, 'FM990.0'), '0'), '.'), '.', ',') || ' %',
                                            'monto', round(h.precio * h.cantidad * h.tasa / (1 + h.tasa)))),
       case when h.modo = 'retiro'
            then jsonb_build_object('modo', 'retiro', 'nombre', b.nombre, 'puntos', (select jsonb_agg(jsonb_build_object('tienda', t.nombre,
                   'nombre', pu.nombre, 'direccion', pu.direccion, 'ciudad', pu.ciudad, 'lat', pu.lat, 'lng', pu.lng,
                   'horario', public.txt(pu.horario, 'es'), 'listoEnH', h.preparacion_h)) from public.puntos_retiro pu join public.tiendas t on t.id = pu.tienda_id where pu.tienda_id = h.tienda_id))
            else jsonb_build_object('modo', 'domicilio', 'nombre', b.nombre, 'zona', case when h.region = h.pais then 'Triple frontera' else 'Resto del país' end,
                   'diasMin', h.dias_max - 1, 'diasMax', h.dias_max,
                   'direccion', (array['Avda. San Blas 1820, Ciudad del Este', 'Rua Tarobá 455, Foz do Iguaçu', 'Av. Tres Fronteras 220, Puerto Iguazú',
                                       'Calle Itá Ybaté 310, Hernandarias', 'Av. Brasil 1290, Cascavel', 'Calle Bertoni 88, Encarnación'])[1 + (h.rn % 6)]) end,
       case when h.cancelado then 'cancelado' when h.t_entregado <= now() then 'entregado'
            when h.t_despacho <= now() then (case when h.modo = 'retiro' then 'listo_retiro' else 'enviado' end)
            when h.t_preparando <= now() then 'preparando' else 'confirmado' end,
       'simulado', 'hist-' || h.rn, h.creado
  from hist h
  join hist_compradores b on b.region = h.region and b.n = floor(h.r_comprador * b.total)
  cross join lateral (select case when h.modo = 'retiro' then 0 else (case h.moneda when 'PYG' then 25000 when 'BRL' then 1990 else 6000 end) end as envio) e;
insert into public.pedido_items (pedido_id, oferta_id, tienda_id, producto_id, titulo, opciones, cantidad, precio_unitario, tasa_impuesto, impuesto_nombre, preparacion_h)
select h.id, h.oferta, h.tienda_id, h.producto_id, public.txt(h.titulo, case when h.region = 'BR' then 'pt' else 'es' end), h.opciones, h.cantidad, h.precio, h.tasa,
       (select impuestos->0->>'nombre' from public.pedidos where id = h.id), h.preparacion_h
  from hist h;
insert into public.pedido_eventos (pedido_id, estado, tienda_id, creado)
select id, estado, tienda, creado from (
  select h.id, 'pendiente_pago' as estado, null::uuid as tienda, h.creado from hist h
  union all select h.id, 'confirmado', null, h.t_confirmado from hist h
  union all select h.id, 'cancelado', null, h.creado + interval '1 hour' from hist h where h.cancelado
  union all select h.id, 'preparando', h.tienda_id, h.t_preparando from hist h where not h.cancelado
  union all select h.id, case when h.modo = 'retiro' then 'listo_retiro' else 'enviado' end, h.tienda_id, h.t_despacho from hist h where not h.cancelado
  union all select h.id, 'entregado', null, h.t_entregado from hist h where not h.cancelado
) e where e.creado <= now();
insert into public.devoluciones (pedido_id, item_id, usuario_id, motivo, detalle, resolucion, estado, creado)
select h.id, i.id, pe.comprador_id, (array['fallado', 'distinto', 'incompleto', 'arrepentido'])[1 + (h.rn % 4)], '',
       case when h.rn % 3 = 0 then 'cambio' else 'reembolso' end, (array['aprobada', 'reembolsada', 'rechazada'])[1 + (h.rn % 3)],
       h.t_entregado + interval '2 days'
  from hist h join public.pedidos pe on pe.id = h.id join public.pedido_items i on i.pedido_id = h.id
 where not h.cancelado and h.r_devuelve < h.devuelve and h.t_entregado + interval '2 days' <= now();
insert into public.pedido_eventos (pedido_id, estado, creado)
select d.pedido_id, 'devolucion_solicitada', d.creado from public.devoluciones d join hist h on h.id = d.pedido_id;`)

// ------------------------------------------------------------------ fase 5: canastas (pedidos con dos productos)
// El historial de arriba tiene un producto por pedido (es lo que mide a cada tienda). Para "comprados juntos" hacen
// falta pedidos con más de uno: 640 canastas entregadas de los mismos compradores, armadas con pares de
// subcategorías que se compran juntas en la frontera (el celular y su cargador, el termo y la vajilla, la parrilla del
// patio y las macetas…). Dentro de cada subcategoría, los más vendidos salen más seguido, así aparecen pares fuertes.
// Cada producto sale de su oferta más barata con stock; las fechas, entre 10 y 330 días atrás, y todo llegó a tiempo.
const CANASTAS: [string, string, number][] = [
  ['smartphones', 'accesorios-celular', 9], ['smartphones', 'auriculares', 6], ['smartwatches', 'smartphones', 3],
  ['notebooks', 'perifericos', 5], ['notebooks', 'almacenamiento-y-redes', 4], ['camaras', 'almacenamiento-y-redes', 3],
  ['videojuegos', 'auriculares', 4], ['parlantes', 'energia', 2], ['termos-y-jarras', 'vajilla', 6],
  ['ollas-y-sartenes', 'utensilios', 5], ['pequenos-de-cocina', 'vajilla', 3], ['comedor', 'vajilla', 3],
  ['living', 'textiles-y-cestos', 3], ['muebles-de-exterior', 'macetas-y-plantas', 4], ['macetas-y-plantas', 'riego', 4],
  ['herramientas-de-jardin', 'riego', 3], ['electricas', 'cajas-y-escaleras', 3], ['manuales', 'cajas-y-escaleras', 4],
  ['limpiadores', 'escobas-y-baldes', 5], ['colgantes', 'focos', 3], ['aire-libre', 'faroles-y-linternas', 3],
  ['perfumes', 'cuidado-personal', 4], ['panaderia', 'almacen', 3], ['relojes-de-mano', 'anteojos-y-sombreros', 2],
]
L.push(`select setseed(0.0530);
create temp table canasta_pares (a text, b text, desde numeric, hasta numeric) on commit drop;
insert into canasta_pares select a, b, (sum(peso) over (order by n) - peso) / sum(peso) over (), sum(peso) over (order by n) / sum(peso) over ()
  from (values ${CANASTAS.map(([a, b, peso], n) => `(${q(a)}, ${q(b)}, ${peso}.0, ${n})`).join(', ')}) x(a, b, peso, n);
create temp table canasta_prod on commit drop as
  select c.slug as cat, o.*, row_number() over (partition by c.id order by o.ventas_30d desc, o.producto_id) - 1 as n, count(*) over (partition by c.id) as total
    from public.categorias c cross join lateral (
      select distinct on (pr.id) pr.id as producto_id, pr.ventas_30d, pr.titulo, of.id as oferta, of.tienda_id, of.precio_usd_cent, of.preparacion_h,
             v.opciones, c.id as cat_id, c.padre_id as padre
        from public.productos pr join public.variantes v on v.producto_id = pr.id join public.ofertas of on of.variante_id = v.id
        join public.tiendas t on t.id = of.tienda_id
       where pr.categoria_id = c.id and of.activa and of.stock > 0 and t.estado = 'aprobada'
       order by pr.id, of.precio_usd_cent, v.orden) o;
create temp table canastas on commit drop as
  select g, gen_random_uuid() as id, now() - make_interval(days => 10 + (random() * 320)::int, mins => (random() * 600)::int) as creado,
         random() as r_par, random() as r_a, random() as r_b, random() as r_comprador, random() as r_modo
    from generate_series(1, 640) g;
create temp table canasta_items on commit drop as
  select k.g, k.id as pedido_id, k.creado, b.region, b.id as comprador, b.email, b.nombre, k.r_modo, cp.*
    from canastas k
    join canasta_pares par on k.r_par >= par.desde and k.r_par < par.hasta
    join hist_compradores b on b.region = 'PY' and b.n = floor(k.r_comprador * b.total)
    join lateral (select * from canasta_prod x where x.cat = par.a and x.n = floor(power(k.r_a, 2.2) * x.total)
                  union all
                  select * from canasta_prod x where x.cat = par.b and x.n = floor(power(k.r_b, 2.2) * x.total)) cp on true;
-- solo las canastas que quedaron con dos productos (una subcategoría vacía deja una sola)
delete from canasta_items where pedido_id in (select pedido_id from canasta_items group by 1 having count(*) < 2);
alter table canasta_items add column precio bigint, add column tasa numeric;
update canasta_items set tasa = public.tasa_impuesto('PY', cat_id, padre);
update canasta_items set precio = round(precio_usd_cent / 100.0 * (1 + tasa) * (select por_usd from public.cotizaciones where moneda = 'PYG' order by vigente_desde desc limit 1) / 1000) * 1000;
insert into public.pedidos (id, numero, clave, comprador_id, email, region, idioma, moneda, cotizacion, productos, envio, descuento, total,
                            impuestos, entrega, estado, proveedor_pago, referencia_pago, creado)
select c.pedido_id, 'TR-C' || lpad(upper(to_hex(min(c.g))), 5, '0'), md5(c.pedido_id::text), min(c.comprador::text)::uuid, min(c.email), 'PY', 'es', 'PYG',
       (select por_usd from public.cotizaciones where moneda = 'PYG' order by vigente_desde desc limit 1),
       sum(c.precio), 25000, 0, sum(c.precio) + 25000,
       (select jsonb_agg(jsonb_build_object('nombre', 'IVA ' || round(x.tasa * 100) || ' %', 'monto', x.monto) order by x.tasa)
          from (select i.tasa, sum(round(i.precio * i.tasa / (1 + i.tasa))) as monto from canasta_items i where i.pedido_id = c.pedido_id group by i.tasa) x),
       jsonb_build_object('modo', 'domicilio', 'nombre', min(c.nombre), 'zona', 'Triple frontera', 'diasMin', 1, 'diasMax', 2,
                          'direccion', (array['Avda. San Blas 1820, Ciudad del Este', 'Calle Itá Ybaté 310, Hernandarias', 'Calle Bertoni 88, Encarnación'])[1 + (min(c.g) % 3)]),
       'entregado', 'simulado', 'canasta-' || min(c.g), min(c.creado)
  from canasta_items c group by c.pedido_id;
insert into public.pedido_items (pedido_id, oferta_id, tienda_id, producto_id, titulo, opciones, cantidad, precio_unitario, tasa_impuesto, impuesto_nombre, preparacion_h)
select c.pedido_id, c.oferta, c.tienda_id, c.producto_id, public.txt(c.titulo, 'es'), c.opciones, 1, c.precio, c.tasa, 'IVA ' || round(c.tasa * 100) || ' %', c.preparacion_h
  from canasta_items c;
insert into public.pedido_eventos (pedido_id, estado, tienda_id, creado)
select pedido_id, estado, tienda, creado from (
  select distinct c.pedido_id, 'pendiente_pago' as estado, null::uuid as tienda, c.creado from canasta_items c
  union all select distinct c.pedido_id, 'confirmado', null::uuid, c.creado + interval '2 minutes' from canasta_items c
  union all select distinct c.pedido_id, 'preparando', c.tienda_id, c.creado + make_interval(secs => least(c.preparacion_h, 48) * 900) from canasta_items c
  union all select distinct c.pedido_id, 'enviado', c.tienda_id, c.creado + make_interval(secs => least(c.preparacion_h, 48) * 2160) from canasta_items c
  union all select distinct c.pedido_id, 'entregado', null::uuid,
         max(c.creado + make_interval(secs => least(c.preparacion_h, 48) * 2160)) over (partition by c.pedido_id) + interval '30 hours' from canasta_items c
) e;`)

// estadísticas al día: sin esto el planificador cree que las tablas están vacías y arma las tarjetas en segundos
// en vez de milisegundos (lo mismo hace solo el autovacuum de Supabase un rato después)
L.push('analyze;')
L.push('select public.refrescar_catalogo();')
L.push('commit;')

writeFileSync(path.join(raiz, 'supabase', 'seed.sql'), L.join('\n') + '\n', 'utf8')
writeFileSync(path.join(aqui, 'imagenes.json'), JSON.stringify([...imagenes].sort(), null, 0) + '\n', 'utf8')
console.log(`productos ${PRODUCTOS.length} · variantes ${PRODUCTOS.reduce((s, p) => s + p.variantes.length, 0)} · ofertas ${OFERTAS.length} · reseñas ${RESENAS_GEN.length} · preguntas ${PREGUNTAS_GEN.length} · fotos ${imagenes.size}`)
