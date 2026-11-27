// Cargador de imágenes de next/image. Las fotos de producto ya salen del script en WebP y en tres anchos
// (240, 480 y 800 px), así que no hace falta el optimizador de Vercel: se elige el archivo más chico que alcance.
// Las que sube una tienda desde el panel (fase 4) se guardan igual, en los mismos tres anchos (lib/vender/fotos.ts).
export const ANCHOS = [240, 480, 800] as const

export default function cargador({ src, width }: { src: string; width: number }) {
  // las del catálogo (/productos/…) y las subidas (/api/fotos/productos/… o el bucket `productos` de Supabase)
  if (!src.includes('/productos/')) return src
  const ancho = ANCHOS.find((a) => a >= width) ?? ANCHOS[ANCHOS.length - 1]
  return `${src}-${ancho}.webp`
}

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL

/**
 * Ruta base de una foto de producto (el cargador le agrega el ancho y la extensión). Las del catálogo son un nombre
 * ("tp_celular__frente"); las que sube una tienda, "subida:<tienda>/<archivo>".
 */
export const foto = (id: string) => {
  if (!id.startsWith('subida:')) return `/productos/${id}`
  const ruta = id.slice('subida:'.length)
  return URL_SUPABASE ? `${URL_SUPABASE}/storage/v1/object/public/productos/${ruta}` : `/api/fotos/productos/${ruta}`
}
