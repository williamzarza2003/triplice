// Cliente de Supabase con la sesión del usuario (cookies), para páginas, Server Actions y rutas.
// Solo se usa con Supabase configurado; sin él, las cuentas funcionan con la cuenta de prueba (lib/cuenta/sesion.ts).
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const CLAVE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export async function supabaseServidor() {
  const almacen = await cookies()
  return createServerClient(URL_SUPABASE, CLAVE_SUPABASE, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        // en un componente de servidor no se pueden escribir cookies: ahí la sesión la renueva proxy.ts
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options)
        } catch {}
      },
    },
  })
}
