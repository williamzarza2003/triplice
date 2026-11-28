// De dónde salen los datos. Si hay un proyecto de Supabase configurado (variables de entorno), se llama a
// sus funciones con supabase.rpc y la clave anónima: el RLS de Postgres decide qué se ve. Si no, se usa la
// misma base en PGlite, embebida en el servidor y también como rol anónimo. El SQL es el mismo en los dos casos.
import 'server-only'
import type { PGlite } from '@electric-sql/pglite'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Funcion = 'buscar' | 'sugerir' | 'categorias_arbol' | 'inicio' | 'ficha' | 'tienda' | 'tiendas_lista'
  | 'productos_slugs' | 'cotizaciones_vigentes' | 'impuestos_vigentes' | 'compra_datos' | 'zonas_envio_lista' | 'validar_cupon'
  | 'pedido_publico'
  // fase 5 (descubrimiento): comparador, vistos de la cookie, "comprados juntos" y la lista compartida por enlace
  | 'comparar' | 'tarjetas_slugs' | 'comprados_juntos' | 'ofertas_baratas' | 'lista_compartida'
/** Las que solo puede correr el servidor con el rol de servicio (crean y confirman pedidos). */
export type FuncionServicio = 'registrar_pedido' | 'confirmar_pago'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// clave de servicio: solo en el servidor, nunca con NEXT_PUBLIC_ (ver docs/supabase.md)
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabase: SupabaseClient | null = null
let servicio: SupabaseClient | null = null
let local: Promise<PGlite> | null = null

export const origenDatos = url && clave ? 'supabase' : 'pglite'

async function baseLocal() {
  local ??= (async () => {
    const { abrirBase } = await import('./pglite')
    const db = await abrirBase()
    // la cuenta de prueba con las fechas de hoy (ver supabase/pglite/90_cuenta_demo.sql)
    await db.exec('select public.demo_al_dia()')
    // mismo permiso que un visitante sin cuenta en Supabase
    await db.exec('set role anon')
    return db
  })()
  return local
}

/** Empieza a abrir la base embebida apenas arranca el servidor (ver instrumentation.ts). */
export function precalentar() {
  if (origenDatos === 'pglite') void baseLocal()
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

/**
 * Funciones del rol de servicio (registrar y confirmar pedidos). Con Supabase hace falta SUPABASE_SERVICE_ROLE_KEY;
 * sin ella devuelve null y el pedido queda solo en la cookie del comprador. En la base embebida se cambia de rol
 * dentro de una transacción.
 */
export async function rpcServicio<T>(funcion: FuncionServicio, p: object): Promise<T | null> {
  if (url && clave) {
    if (!claveServicio) return null
    servicio ??= createClient(url, claveServicio, { auth: { persistSession: false } })
    const { data, error } = await servicio.rpc(funcion, { p })
    if (error) throw new Error(`Supabase: ${funcion} falló (${error.message})`)
    return data as T
  }
  const db = await baseLocal()
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    const { rows } = await tx.query<{ r: T }>(`select public.${funcion}($1::jsonb) as r`, [JSON.stringify(p)])
    return rows[0].r
  })
}

/** Las de la cuenta (fase 3): corren como el usuario que inició sesión y el RLS decide. */
export type FuncionCuenta = 'mi_cuenta' | 'guardar_perfil' | 'mis_pedidos' | 'mi_pedido' | 'por_opinar' | 'mis_resenas'
  | 'escribir_resena' | 'votar_resena' | 'mis_votos' | 'ficha_usuario' | 'preguntar' | 'responder' | 'mis_direcciones'
  | 'guardar_direccion' | 'borrar_direccion' | 'solicitar_devolucion'
  // panel del vendedor (fase 4): el RLS y mi_tienda() deciden qué tienda ve cada uno
  | 'mi_tienda_datos' | 'mi_reputacion' | 'vendedor_resumen' | 'vendedor_productos' | 'vendedor_producto' | 'vendedor_categorias'
  | 'guardar_producto' | 'pausar_producto' | 'guardar_stock' | 'vendedor_pedidos' | 'avanzar_pedido' | 'vendedor_preguntas'
  | 'vendedor_responder'
  // descubrimiento (fase 5): vistos, listas, favoritos y alertas de precio
  | 'registrar_vistos' | 'mis_vistos' | 'mis_listas' | 'mi_lista' | 'guardar_lista' | 'borrar_lista' | 'lista_agregar'
  | 'lista_quitar' | 'lista_mover' | 'alternar_favorito' | 'compartir_lista' | 'crear_alerta' | 'borrar_alerta'
  | 'revisar_alertas' | 'mis_alertas' | 'leer_avisos' | 'ficha_descubrir' | 'estado_descubrir'

/**
 * En la base embebida: la función corre con el rol `authenticated` y el id del usuario en la variable que lee
 * auth.uid(), igual que hace Supabase con el JWT. Con Supabase se usa el cliente de la sesión (lib/cuenta/sesion.ts).
 */
export async function rpcEmbebidaComo<T>(uid: string, funcion: FuncionCuenta, p: object): Promise<T> {
  const db = await baseLocal()
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
    const { rows } = await tx.query<{ r: T }>(`select public.${funcion}($1::jsonb) as r`, [JSON.stringify(p)])
    return rows[0].r
  })
}

/** Las dos cuentas de prueba de la base embebida: la compradora (fase 3) y el vendedor de Casa Nubla (fase 4). */
export const CUENTAS_DEMO = { compradora: 'lorena@triplice.example', vendedor: 'casa-nubla@triplice.example' } as const

/** Cuenta de prueba (solo en la base embebida): sus datos públicos para iniciar la sesión. */
export async function cuentaDemo(cual: keyof typeof CUENTAS_DEMO = 'compradora') {
  const db = await baseLocal()
  return db.transaction(async (tx) => {
    await tx.exec('set local role postgres') // solo dentro de esta transacción
    const { rows } = await tx.query<{ id: string; email: string; nombre: string }>(
      `select u.id::text, u.email, p.nombre from auth.users u join public.perfiles p on p.id = u.id where u.email = $1`, [CUENTAS_DEMO[cual]])
    return rows[0] ?? null
  })
}
