// De dónde salen los datos. Si hay un proyecto de Supabase configurado (variables de entorno), se llama a
// sus funciones con supabase.rpc y la clave anónima: el RLS de Postgres decide qué se ve. Si no, se usa la
// misma base en PGlite, embebida en el servidor y también como rol anónimo. El SQL es el mismo en los dos casos.
import 'server-only'
import type { PGlite } from '@electric-sql/pglite'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Funcion = 'buscar' | 'sugerir' | 'categorias_arbol' | 'inicio' | 'ficha' | 'tienda' | 'tiendas_lista'
  | 'productos_slugs' | 'cotizaciones_vigentes'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let supabase: SupabaseClient | null = null
let local: Promise<PGlite> | null = null

export const origenDatos = url && clave ? 'supabase' : 'pglite'

async function baseLocal() {
  local ??= (async () => {
    const { abrirBase } = await import('./pglite')
    const db = await abrirBase()
    // mismo permiso que un visitante sin cuenta en Supabase
    await db.exec('set role anon')
    return db
  })()
  return local
}

export async function rpc<T>(funcion: Funcion, p: object = {}): Promise<T> {
  if (url && clave) {
    supabase ??= createClient(url, clave, { auth: { persistSession: false } })
    const { data, error } = await supabase.rpc(funcion, { p })
    if (error) throw new Error(`Supabase: ${funcion} falló (${error.message})`)
    return data as T
  }
  const db = await baseLocal()
  // `funcion` es una de las de la lista: no viene del usuario, por eso se puede interpolar
  const { rows } = await db.query<{ r: T }>(`select public.${funcion}($1::jsonb) as r`, [JSON.stringify(p)])
  return rows[0].r
}
