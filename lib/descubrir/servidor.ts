// Descubrimiento del lado del servidor: cookies (validadas), consultas cacheadas y lo que se hace al entrar.
import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { cookies } from 'next/headers'
import { categoriaDe, precio, type Contexto } from '../contexto'
import { rpc } from '../datos/fuente'
import type { TarjetaDatos } from '../datos/tipos'
import type { Idioma } from '../i18n/idiomas'
import { descuento } from '../precios'
import { modoCuentas, rpcCuenta, usuarioActual } from '../cuenta/sesion'
import type { Comparacion } from './comparar'
import {
  COOKIE_COMPARAR, COOKIE_PENDIENTE, COOKIE_VISTOS, escribirComparar, esSlug, leerComparar, leerVistos, type ItemComparar,
} from './cookies'

const UN_MES = 60 * 60 * 24 * 30
const seguro = process.env.NODE_ENV === 'production'
// no son httpOnly: el navegador las lee y las escribe (los botones no recargan la página). No guardan nada privado.
const opciones = { path: '/', maxAge: UN_MES, sameSite: 'lax' as const, secure: seguro }

export async function leerCookieComparar(): Promise<ItemComparar[]> {
  return leerComparar((await cookies()).get(COOKIE_COMPARAR)?.value)
}
export async function guardarCookieComparar(items: ItemComparar[]) {
  const c = await cookies()
  if (items.length === 0) c.delete(COOKIE_COMPARAR)
  else c.set(COOKIE_COMPARAR, escribirComparar(items), opciones)
}
export async function leerCookieVistos(): Promise<string[]> {
  return leerVistos((await cookies()).get(COOKIE_VISTOS)?.value)
}

// ---------------------------------------------------------------------------------------------
// Consultas públicas cacheadas (como las del catálogo: lib/datos/consultas.ts)
// ---------------------------------------------------------------------------------------------

export async function comparacion(slugs: string[], idioma: Idioma) {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo', ...slugs.map((s) => `producto:${s}`))
  return rpc<Comparacion>('comparar', { slugs, idioma })
}

export type CompradosJuntos = {
  fuente: 'pedidos' | 'categoria'
  producto: TarjetaDatos
  items: TarjetaDatos[]
  veces: Record<string, number>
  categoria: string
}

export async function compradosJuntos(slug: string, idioma: Idioma) {
  'use cache'
  cacheLife('hours')
  cacheTag('catalogo', `producto:${slug}`)
  return rpc<CompradosJuntos | null>('comprados_juntos', { slug, idioma })
}

/** Sin caché: los vistos son de cada uno (la cookie del invitado). */
export function tarjetasDeSlugs(slugs: string[], idioma: Idioma, excepto?: string) {
  return rpc<TarjetaDatos[]>('tarjetas_slugs', { slugs, idioma, excepto })
}

// ---------------------------------------------------------------------------------------------
// Tarjetas chicas para las islas del navegador (vistos recientemente): el precio ya convertido y con impuesto
// ---------------------------------------------------------------------------------------------

export type Mini = { slug: string; titulo: string; imagen: string | null; precio: string; antes: string | null; descuento: number }

export const mini = (items: TarjetaDatos[], ctx: Contexto): Mini[] => items.map((p) => {
  const d = descuento(p.precio, p.precio_lista)
  return {
    slug: p.slug, titulo: p.titulo, imagen: p.imagen, precio: precio(ctx, p.precio, categoriaDe(p)),
    antes: d > 0 && p.precio_lista ? precio(ctx, p.precio_lista, categoriaDe(p)) : null, descuento: d,
  }
})

// ---------------------------------------------------------------------------------------------
// Al entrar (cuenta de prueba o Supabase): lo que había en las cookies pasa a la cuenta, como el carrito
// ---------------------------------------------------------------------------------------------

/**
 * - Los vistos de la cookie se suman a los de la cuenta (los de la cookie son los más recientes) y la cookie se borra.
 * - Si tocó el corazón sin cuenta, el favorito se guarda ahora.
 * - Se revisan sus alertas de precio (en Supabase también lo hace pg_cron cada 30 minutos).
 * Nada de esto puede impedir la entrada: un error se anota y se sigue.
 */
export async function despuesDeEntrar() {
  if (!(await usuarioActual())) return
  const c = await cookies()
  try {
    const vistos = leerVistos(c.get(COOKIE_VISTOS)?.value)
    if (vistos.length) await rpcCuenta('registrar_vistos', { slugs: vistos })
    c.delete(COOKIE_VISTOS)
    let pendiente = c.get(COOKIE_PENDIENTE)?.value ?? ''
    try { pendiente = decodeURIComponent(pendiente) } catch { pendiente = '' }
    if (pendiente.startsWith('fav:') && esSlug(pendiente.slice(4))) await rpcCuenta('alternar_favorito', { slug: pendiente.slice(4), favorito: true })
    c.delete(COOKIE_PENDIENTE)
    await rpcCuenta('revisar_alertas')
  } catch (e) {
    console.error('No se pudo pasar lo de las cookies a la cuenta', e)
  }
}

/** Revisa mis alertas (en la vista previa sin pg_cron, al abrir la cuenta). Devuelve los avisos sin leer. */
export async function revisarMisAlertas(): Promise<number> {
  try {
    const r = await rpcCuenta<{ nuevas: number; avisos: number }>('revisar_alertas')
    return Number(r?.avisos ?? 0)
  } catch (e) {
    console.error('No se pudieron revisar las alertas', e)
    return 0
  }
}

export const conPgCron = modoCuentas === 'supabase'
