// Idiomas de la tienda. Las URL llevan el prefijo (/es, /pt, /en).
export const IDIOMAS = ['es', 'pt', 'en'] as const
export type Idioma = (typeof IDIOMAS)[number]
export const IDIOMA_PREDETERMINADO: Idioma = 'es'

export const LOCALE: Record<Idioma, string> = { es: 'es-PY', pt: 'pt-BR', en: 'en-US' }
export const NOMBRE_IDIOMA: Record<Idioma, string> = { es: 'Español', pt: 'Português', en: 'English' }

export function esIdioma(x: unknown): x is Idioma {
  return typeof x === 'string' && (IDIOMAS as readonly string[]).includes(x)
}
