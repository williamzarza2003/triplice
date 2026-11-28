// Sesión del comprador. Dos modos, el mismo SQL:
// - Con Supabase: Supabase Auth (enlace por email o Google). La sesión vive en las cookies de @supabase/ssr y
//   las funciones de la cuenta se llaman con el cliente del usuario: el JWT llega a Postgres y el RLS decide.
// - Sin Supabase (vista previa con la base embebida): una cuenta de prueba. La sesión es una cookie firmada y las
//   funciones corren en PGlite con el rol `authenticated` y el id del usuario (lib/datos/fuente.ts).
import 'server-only'
import { cookies } from 'next/headers'
import { origenDatos, rpcEmbebidaComo, type FuncionCuenta } from '../datos/fuente'
import { COOKIE_IDIOMA, COOKIE_MONEDA, COOKIE_REGION } from '../region'
import { abrirSello, sellar } from '../sello'
import { supabaseServidor } from '../supabase/servidor'
import { COOKIE_ADMIN, COOKIE_HOLA } from './hola'

export type Usuario = { id: string; email: string }
export type Perfil = {
  id: string; nombre: string; firma: string; telefono: string | null; region: string; idioma: string; moneda: string
  rol: string; pedidos: number; direcciones: number
}

export const modoCuentas: 'supabase' | 'demo' = origenDatos === 'supabase' ? 'supabase' : 'demo'

const COOKIE_SESION = 'triplice_sesion'
const DURACION = 60 * 60 * 24 * 30 // 30 días
const seguro = process.env.NODE_ENV === 'production'

type SesionDemo = { id: string; email: string; vence: number }

export async function usuarioActual(): Promise<Usuario | null> {
  if (modoCuentas === 'supabase') {
    const sb = await supabaseServidor()
    // getClaims verifica la firma del JWT (no alcanza con leer la cookie)
    const { data } = await sb.auth.getClaims()
    const c = data?.claims
    return c?.sub ? { id: c.sub, email: String(c.email ?? '') } : null
  }
  const s = abrirSello<SesionDemo>((await cookies()).get(COOKIE_SESION)?.value)
  return s && s.vence > Date.now() ? { id: s.id, email: s.email } : null
}

/** Llama una función de la cuenta como el usuario. Sin sesión devuelve null. */
export async function rpcCuenta<T>(funcion: FuncionCuenta, p: object = {}): Promise<T | null> {
  const u = await usuarioActual()
  if (!u) return null
  if (modoCuentas === 'supabase') {
    const sb = await supabaseServidor()
    const { data, error } = await sb.rpc(funcion, { p })
    if (error) throw new ErrorCuenta(error.message, error.hint ?? null)
    return data as T
  }
  try {
    return await rpcEmbebidaComo<T>(u.id, funcion, p)
  } catch (e) {
    const x = e as { message?: string; hint?: string }
    throw new ErrorCuenta(x.message ?? 'error', x.hint ?? null)
  }
}

/** Error de la base con la pista para mostrar (las que escribe la base están en español: ver la migración de la fase 3). */
export class ErrorCuenta extends Error {
  constructor(mensaje: string, readonly pista: string | null) {
    super(mensaje)
  }
}

export async function perfil(): Promise<Perfil | null> {
  return rpcCuenta<Perfil>('mi_cuenta')
}

const nombreCorto = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? ''

/**
 * Lo que se hace al entrar con cualquiera de los dos modos: el saludo del encabezado (una cookie que el navegador
 * puede leer, sin nada privado) y las preferencias guardadas en el perfil (región, moneda e idioma).
 */
export async function alEntrar(p: Perfil | null) {
  const c = await cookies()
  const opciones = { path: '/', sameSite: 'lax' as const, secure: seguro, maxAge: DURACION }
  if (!p) return
  c.set(COOKIE_HOLA, encodeURIComponent(nombreCorto(p.nombre)), opciones)
  // el enlace a la administración en el menú de la cuenta (la base decide igual en cada página del admin)
  if (p.rol === 'admin') c.set(COOKIE_ADMIN, '1', opciones)
  else c.delete(COOKIE_ADMIN)
  const anio = { ...opciones, maxAge: 60 * 60 * 24 * 365 }
  c.set(COOKIE_REGION, p.region, anio)
  c.set(COOKIE_MONEDA, p.moneda, anio)
  c.set(COOKIE_IDIOMA, p.idioma, anio)
}

/** Inicia la sesión de la cuenta de prueba (solo sin Supabase). */
export async function entrarDemo(u: { id: string; email: string }) {
  if (modoCuentas !== 'demo') throw new Error('La cuenta de prueba solo existe sin Supabase')
  const sesion: SesionDemo = { id: u.id, email: u.email, vence: Date.now() + DURACION * 1000 }
  ;(await cookies()).set(COOKIE_SESION, sellar(sesion), { path: '/', httpOnly: true, sameSite: 'lax', secure: seguro, maxAge: DURACION })
}

export async function salir() {
  if (modoCuentas === 'supabase') {
    const sb = await supabaseServidor()
    await sb.auth.signOut()
  }
  const c = await cookies()
  c.delete(COOKIE_SESION)
  c.delete(COOKIE_HOLA)
  c.delete(COOKIE_ADMIN)
}

/** Actualiza el saludo del encabezado (por ejemplo, si cambió el nombre). */
export async function saludar(nombre: string) {
  ;(await cookies()).set(COOKIE_HOLA, encodeURIComponent(nombreCorto(nombre)), { path: '/', sameSite: 'lax', secure: seguro, maxAge: DURACION })
}

/** Cierra el saludo cuando la sesión ya no existe (por ejemplo, venció en Supabase). */
export async function olvidarSaludo() {
  try {
    ;(await cookies()).delete(COOKIE_HOLA)
  } catch {} // en un componente de servidor no se puede: lo hace la próxima acción
}
