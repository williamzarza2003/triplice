// Dirección pública de una foto de opinión (sirve en el servidor y en el navegador).
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL

export function urlFotoResena(ruta: string) {
  return URL_SUPABASE ? `${URL_SUPABASE}/storage/v1/object/public/resenas/${ruta}` : `/api/fotos/${ruta}`
}
