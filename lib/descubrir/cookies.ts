// Cookies de la fase 5 (descubrimiento). Las escribe el navegador (así marcar un producto no recarga la página) y
// también las Server Actions de los formularios sin JavaScript. Todo lo que traen es del usuario: el servidor y la
// base vuelven a validar cada slug y cada cantidad (ver supabase/migrations/20261130000200_descubrimiento.sql).
// Módulo puro: lo usan el navegador, el servidor y las pruebas.

/** Comparador: "slug~familia.slug~familia", hasta 4. La familia es la categoría principal (para no mezclar heladeras y remeras). */
export const COOKIE_COMPARAR = 'triplice_comparar'
/** Vistos recientemente sin cuenta: "slug.slug…", el más reciente primero, hasta 12. */
export const COOKIE_VISTOS = 'triplice_vistos'
/** Lo que quiso hacer antes de entrar (marcar un favorito): se completa al entrar. */
export const COOKIE_PENDIENTE = 'triplice_pendiente'

export const MAX_COMPARAR = 4
export const MAX_VISTOS = 12

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const esSlug = (s: unknown): s is string => typeof s === 'string' && s.length <= 160 && SLUG.test(s)

export type ItemComparar = { slug: string; familia: string }

export function leerComparar(valor: string | null | undefined): ItemComparar[] {
  const vistos = new Set<string>()
  const r: ItemComparar[] = []
  for (const parte of decodificar(valor).split('.')) {
    const [slug, familia] = parte.split('~')
    if (!esSlug(slug) || !esSlug(familia) || vistos.has(slug)) continue
    vistos.add(slug)
    r.push({ slug, familia })
    if (r.length >= MAX_COMPARAR) break
  }
  return r
}

export const escribirComparar = (items: ItemComparar[]) => items.slice(0, MAX_COMPARAR).map((x) => `${x.slug}~${x.familia}`).join('.')

export type ResultadoComparar = { items: ItemComparar[]; error: 'lleno' | 'otra_familia' | null }

/**
 * Agrega o saca un producto del comparador. No mezcla familias (devuelve 'otra_familia' y no cambia nada) ni pasa
 * de cuatro ('lleno'). Con `reemplazar`, empieza una comparación nueva con este producto.
 */
export function alternarComparar(items: ItemComparar[], nuevo: ItemComparar, reemplazar = false): ResultadoComparar {
  if (!esSlug(nuevo.slug) || !esSlug(nuevo.familia)) return { items, error: null }
  if (items.some((x) => x.slug === nuevo.slug)) return { items: items.filter((x) => x.slug !== nuevo.slug), error: null }
  if (reemplazar) return { items: [nuevo], error: null }
  if (items.length > 0 && items[0].familia !== nuevo.familia) return { items, error: 'otra_familia' }
  if (items.length >= MAX_COMPARAR) return { items, error: 'lleno' }
  return { items: [...items, nuevo], error: null }
}

export function leerVistos(valor: string | null | undefined): string[] {
  const r: string[] = []
  for (const s of decodificar(valor).split('.')) {
    if (esSlug(s) && !r.includes(s)) r.push(s)
    if (r.length >= MAX_VISTOS) break
  }
  return r
}

/** El que se acaba de ver pasa adelante; se guardan los últimos 12. */
export const agregarVisto = (vistos: string[], slug: string) => (esSlug(slug) ? [slug, ...vistos.filter((x) => x !== slug)].slice(0, MAX_VISTOS) : vistos)
export const escribirVistos = (vistos: string[]) => vistos.slice(0, MAX_VISTOS).join('.')

/** Slugs de un parámetro de URL (?p=a,b,c) o de un formulario, válidos y sin repetir. */
export function slugsDeTexto(texto: string | null | undefined, tope = MAX_COMPARAR): string[] {
  const r: string[] = []
  for (const s of (texto ?? '').split(/[,\s]+/)) {
    if (esSlug(s) && !r.includes(s)) r.push(s)
    if (r.length >= tope) break
  }
  return r
}

function decodificar(valor: string | null | undefined) {
  if (!valor) return ''
  try {
    return decodeURIComponent(valor).slice(0, 4000)
  } catch {
    return ''
  }
}
