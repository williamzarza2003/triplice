// Cargador de imágenes de next/image. Las fotos de producto ya salen del script en WebP y en tres anchos
// (240, 480 y 800 px), así que no hace falta el optimizador de Vercel: se elige el archivo más chico que alcance.
export const ANCHOS = [240, 480, 800] as const

export default function cargador({ src, width }: { src: string; width: number }) {
  if (!src.startsWith('/productos/')) return src
  const ancho = ANCHOS.find((a) => a >= width) ?? ANCHOS[ANCHOS.length - 1]
  return `${src}-${ancho}.webp`
}

/** Ruta base de una foto del catálogo (el cargador le agrega el ancho y la extensión). */
export const foto = (id: string) => `/productos/${id}`
