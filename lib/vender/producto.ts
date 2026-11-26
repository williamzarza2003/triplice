// Lee y valida el formulario de producto del panel (módulo puro: lo usa la Server Action y se prueba con Vitest).
// La base vuelve a validar lo mismo (guardar_producto), pero acá cada error queda atado a su campo con un código que
// la página traduce a un mensaje que explica cómo resolverlo (messages/*.json → vender.errores).

export type TipoAtributo = 'texto' | 'numero' | 'booleano' | 'opcion'
export type AtributoForm = { clave: string; tipo: TipoAtributo }

export type CodigoError =
  | 'categoria' | 'titulo' | 'titulo_largo' | 'marca' | 'descripcion' | 'vinetas' | 'garantia' | 'peso' | 'preparacion' | 'condicion'
  | 'ejes' | 'variantes' | 'precio' | 'lista' | 'stock' | 'opcion' | 'repetida' | 'numero' | 'texto'
  | 'fotos_faltan' | 'foto_tipo' | 'foto_grande' | 'foto_muchas' | 'foto_ilegible' | 'foto_ajena' | 'servidor' | 'no_existe'

export type VarianteBorrador = {
  /** clave de la fila en el formulario ("v3"): los errores vuelven con esa clave */
  fila: string
  id: string | null
  opciones: Record<string, string>
  imagenes: string[]
  precio: number
  lista: number | null
  stock: number
  activa: boolean
}

export type Borrador = {
  id: string | null
  categoria: string
  marca: string
  titulo: { es: string; pt: string | null; en: string | null }
  descripcion: { es: string; pt: string | null; en: string | null }
  vinetas: { es: string[] }
  atributos: Record<string, string | number | boolean>
  garantia_meses: number
  condicion: 'nuevo' | 'reacondicionado' | 'usado'
  peso_g: number | null
  envio_gratis: boolean
  preparacion_h: number
  ejes: string[]
  variantes: VarianteBorrador[]
}

export const MAX_VARIANTES = 20
export const EJES_LIBRES = ['talle', 'medida', 'contenido', 'almacenamiento'] as const

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').replace(/\s+/g, ' ').trim()
const entero = (s: string, min: number, max: number) => (/^\d+$/.test(s) && Number(s) >= min && Number(s) <= max ? Number(s) : null)

/**
 * "199,90", "199.90", "1.249,50" o "1,249.50" → centavos de dólar. El último separador seguido de 1 o 2 cifras es
 * el decimal; los demás son de miles. Devuelve null si no es un precio positivo.
 */
export function precioACentavos(s: string): number | null {
  const limpio = s.replace(/\s|US\$|\$/g, '')
  if (!/^\d[\d.,]*$/.test(limpio)) return null
  const m = limpio.match(/^(.*?)(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const enteros = m[1].replace(/[.,]/g, '')
  if (!/^\d+$/.test(enteros)) return null
  const centavos = Number(enteros) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0)
  return centavos > 0 && centavos <= 10_000_000 ? centavos : null
}

/** "1,7" o "1.7" → 1.7 (los atributos numéricos de la ficha técnica) */
function numero(s: string): number | null {
  const n = Number(s.replace(',', '.'))
  return s !== '' && Number.isFinite(n) && n >= 0 && n < 1e7 ? n : null
}

export function leerProducto(f: FormData, atributos: AtributoForm[]): { datos: Borrador; errores: Record<string, CodigoError> } {
  const errores: Record<string, CodigoError> = {}
  const tituloEs = texto(f, 'titulo_es')
  if (tituloEs.length < 8 || tituloEs.length > 120 || !/\p{L}{2}/u.test(tituloEs)) errores.titulo_es = 'titulo'
  for (const i of ['pt', 'en'] as const) if (texto(f, `titulo_${i}`).length > 120) errores[`titulo_${i}`] = 'titulo_largo'
  const marca = texto(f, 'marca')
  if (marca.length < 2 || marca.length > 40) errores.marca = 'marca'
  const categoria = texto(f, 'categoria')
  if (!/^[a-z0-9-]{2,60}$/.test(categoria)) errores.categoria = 'categoria'
  const descripcion = { es: String(f.get('descripcion_es') ?? '').trim(), pt: String(f.get('descripcion_pt') ?? '').trim(), en: String(f.get('descripcion_en') ?? '').trim() }
  for (const [i, d] of Object.entries(descripcion)) if (d.length > 2000) errores[`descripcion_${i}`] = 'descripcion'
  const vinetas = String(f.get('vinetas_es') ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  if (vinetas.length > 6 || vinetas.some((x) => x.length > 120)) errores.vinetas_es = 'vinetas'
  const garantia = entero(texto(f, 'garantia_meses') || '0', 0, 60)
  if (garantia === null) errores.garantia_meses = 'garantia'
  const pesoTexto = texto(f, 'peso_g')
  const peso = pesoTexto ? entero(pesoTexto.replace(/\./g, ''), 1, 200_000) : null
  if (pesoTexto && peso === null) errores.peso_g = 'peso'
  const preparacion = entero(texto(f, 'preparacion_h'), 1, 240)
  if (preparacion === null) errores.preparacion_h = 'preparacion'
  const condicion = texto(f, 'condicion') || 'nuevo'
  if (!['nuevo', 'reacondicionado', 'usado'].includes(condicion)) errores.condicion = 'condicion'

  const ejes = [...new Set(f.getAll('ejes').map(String).filter((x) => /^[a-z_]{2,30}$/.test(x)))]
  if (ejes.length > 2) errores.ejes = 'ejes'

  // ficha técnica: solo los atributos de la categoría; los que son ejes de las variantes van en cada variante
  const valores: Borrador['atributos'] = {}
  for (const a of atributos) {
    if (ejes.includes(a.clave)) continue
    const v = texto(f, `a.${a.clave}`)
    if (!v) continue
    if (a.tipo === 'numero') {
      const n = numero(v)
      if (n === null) errores[`a.${a.clave}`] = 'numero'
      else valores[a.clave] = n
    } else if (a.tipo === 'booleano') {
      if (v === 'si' || v === 'no') valores[a.clave] = v === 'si'
    } else if (v.length > 60) errores[`a.${a.clave}`] = 'texto'
    else valores[a.clave] = v
  }

  const filas = texto(f, 'variantes').split(',').map((x) => x.trim()).filter((x) => /^\d{1,3}$/.test(x))
  if (filas.length < 1 || filas.length > MAX_VARIANTES) errores.variantes = 'variantes'
  const vistas = new Set<string>()
  const variantes: VarianteBorrador[] = filas.map((n) => {
    const k = `v${n}`
    const opciones: Record<string, string> = {}
    for (const e of ejes) {
      const v = texto(f, `${k}.op.${e}`).slice(0, 40)
      if (!v) errores[`${k}.op.${e}`] = 'opcion'
      else opciones[e] = v
    }
    const combo = ejes.map((e) => (opciones[e] ?? '').toLowerCase()).join('|')
    if (vistas.has(combo) && ejes.every((e) => opciones[e])) errores[`${k}.opciones`] = 'repetida'
    vistas.add(combo)
    const precio = precioACentavos(texto(f, `${k}.precio`))
    if (precio === null) errores[`${k}.precio`] = 'precio'
    const listaTexto = texto(f, `${k}.lista`)
    const lista = listaTexto ? precioACentavos(listaTexto) : null
    if (listaTexto && (lista === null || (precio !== null && lista <= precio))) errores[`${k}.lista`] = 'lista'
    const stock = entero(texto(f, `${k}.stock`).replace(/\./g, ''), 0, 99_999)
    if (stock === null) errores[`${k}.stock`] = 'stock'
    const id = texto(f, `${k}.id`)
    return {
      fila: k, id: /^[0-9a-f-]{36}$/.test(id) ? id : null, opciones,
      imagenes: f.getAll(`${k}.imagen`).map(String).filter((x) => x.length > 0 && x.length < 200).slice(0, 8),
      precio: precio ?? 0, lista, stock: stock ?? 0, activa: texto(f, `${k}.pausada`) !== '1',
    }
  })

  const idProducto = texto(f, 'id')
  return {
    errores,
    datos: {
      id: /^[0-9a-f-]{36}$/.test(idProducto) ? idProducto : null, categoria, marca,
      titulo: { es: tituloEs, pt: texto(f, 'titulo_pt') || null, en: texto(f, 'titulo_en') || null },
      descripcion: { es: descripcion.es, pt: descripcion.pt || null, en: descripcion.en || null },
      vinetas: { es: vinetas }, atributos: valores, garantia_meses: garantia ?? 0,
      condicion: condicion as Borrador['condicion'], peso_g: peso, envio_gratis: texto(f, 'envio_gratis') === '1',
      preparacion_h: preparacion ?? 24, ejes, variantes,
    },
  }
}

/** Lo que guardar_producto espera: las variantes sin la clave de fila. */
export const paraLaBase = (d: Borrador) => ({
  ...d,
  variantes: d.variantes.map((v) => ({ id: v.id, opciones: v.opciones, imagenes: v.imagenes, precio: v.precio, lista: v.lista, stock: v.stock, activa: v.activa })),
})
