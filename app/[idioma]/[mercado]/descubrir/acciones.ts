'use server'
// Acciones de descubrimiento (fase 5). Las que cambian algo son formularios comunes (funcionan sin JavaScript); con
// JavaScript las llaman los botones sin recargar. Toda escritura de la cuenta pasa por una función SQL que corre como
// el usuario (el RLS decide) y todo lo que llega del navegador (slugs, cookies, montos) se valida acá y en la base.
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { agregar, unidades, type Carrito } from '@/lib/compra/carrito'
import { datosOfertas, guardarCookieCarrito, leerCookieCarrito } from '@/lib/compra/servidor'
import { contextoDe } from '@/lib/contexto'
import { rpcCuenta, usuarioActual } from '@/lib/cuenta/sesion'
import { rpc } from '@/lib/datos/fuente'
import type { TarjetaDatos } from '@/lib/datos/tipos'
import { leerMonto } from '@/lib/descubrir/alertas'
import { alternarComparar, COOKIE_PENDIENTE, esSlug, slugsDeTexto } from '@/lib/descubrir/cookies'
import { guardarCookieComparar, leerCookieComparar, leerCookieVistos, mini, tarjetasDeSlugs, type Mini } from '@/lib/descubrir/servidor'
import { esIdioma, IDIOMA_PREDETERMINADO, type Idioma } from '@/lib/i18n/idiomas'
import { leerMercado } from '@/lib/region'

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const idiomaDe = (f: FormData): Idioma => { const i = texto(f, 'idioma'); return esIdioma(i) ? i : IDIOMA_PREDETERMINADO }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A dónde volver: un camino interno de la página desde la que se mandó el formulario (sin JavaScript). */
async function volverDe(f: FormData, otro: string) {
  const pedido = texto(f, 'volver')
  if (/^\/(es|pt|en)(\/[^/\\]|$)/.test(pedido) && !pedido.includes('//')) return pedido
  const ref = (await headers()).get('referer')
  try {
    const u = ref ? new URL(ref) : null
    const camino = u ? u.pathname.replace(/^\/(es|pt|en)\/[a-z]{2}-[a-z]{3}(?=\/|$)/, '/$1') + u.search : ''
    if (/^\/(es|pt|en)(\/[^/\\]|$)/.test(camino) && !camino.includes('//')) return camino
  } catch {}
  return otro
}

async function aEntrar(idioma: Idioma, volver: string): Promise<never> {
  redirect(`/${idioma}/entrar?volver=${encodeURIComponent(volver)}`)
}

// ---------------------------------------------------------------------------------------------
// Estado chico para el navegador (tarjetas y encabezado)
// ---------------------------------------------------------------------------------------------

export type EstadoDescubrir = { favoritos: string[]; avisos: number } | null

/** Favoritos y avisos sin leer de quien mira. Solo lectura (no cambia cookies: no recarga la página). */
export async function estadoAccion(): Promise<EstadoDescubrir> {
  if (!(await usuarioActual())) return null
  const r = await rpcCuenta<{ favoritos: string[]; avisos: number }>('estado_descubrir')
  return r ? { favoritos: r.favoritos ?? [], avisos: Number(r.avisos ?? 0) } : null
}

// ---------------------------------------------------------------------------------------------
// Favoritos y listas
// ---------------------------------------------------------------------------------------------

export type ResultadoFavorito = { favorito: boolean } | { error: string } | null

/**
 * El corazón. Sin cuenta: guarda la intención (al entrar se completa) y manda a entrar con la vuelta a donde estaba.
 * Con JavaScript, el botón ya manda a entrar sin llamar a esta acción; esto cubre el formulario sin JavaScript.
 */
export async function favoritoAccion(f: FormData): Promise<ResultadoFavorito> {
  const slug = texto(f, 'slug')
  if (!esSlug(slug)) return { error: 'producto' }
  const idioma = idiomaDe(f)
  if (!(await usuarioActual())) {
    ;(await cookies()).set(COOKIE_PENDIENTE, `fav:${slug}`, { path: '/', maxAge: 60 * 30, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
    return aEntrar(idioma, await volverDe(f, `/${idioma}/p/${slug}`))
  }
  const quiere = texto(f, 'favorito')
  const r = await rpcCuenta<{ favorito?: boolean; error?: string }>('alternar_favorito', { slug, ...(quiere ? { favorito: quiere === '1' } : {}) })
  if (!r || r.error) return { error: r?.error ?? 'servidor' }
  return { favorito: Boolean(r.favorito) }
}

/** El mismo corazón como formulario sin JavaScript: guarda y vuelve a la página desde la que se mandó. */
export async function favoritoFormAccion(f: FormData): Promise<void> {
  await favoritoAccion(f)
  redirect(await volverDe(f, `/${idiomaDe(f)}/p/${texto(f, 'slug')}`))
}

export type ListaFicha = { id: string; nombre: string; favoritos: boolean; tiene: boolean }
export type AlertaFicha = { id: string; objetivo: number; moneda: string; region: string; activa: boolean; cumplida: string | null; precio_cumplida: number | null }
export type FichaPersonal = { listas: ListaFicha[]; alerta: AlertaFicha | null } | null

/** Lo personal de la ficha (en qué listas está y su alerta): lo pide la isla de la ficha después de cargar. */
export async function fichaPersonalAccion(slug: string): Promise<FichaPersonal> {
  if (!esSlug(slug) || !(await usuarioActual())) return null
  return rpcCuenta<NonNullable<FichaPersonal>>('ficha_descubrir', { slug })
}

export type ResultadoLista = { ok: boolean; error: string | null; listas?: ListaFicha[] }

/** Guardar en una lista (o sacar de ella) desde la ficha. */
export async function enListaAccion(f: FormData): Promise<ResultadoLista> {
  const slug = texto(f, 'slug'), lista = texto(f, 'lista')
  if (!esSlug(slug) || !(lista === 'favoritos' || UUID.test(lista))) return { ok: false, error: 'producto' }
  if (!(await usuarioActual())) return aEntrar(idiomaDe(f), await volverDe(f, `/${idiomaDe(f)}/p/${slug}`))
  const r = await rpcCuenta<{ ok?: boolean; error?: string }>(texto(f, 'quitar') === '1' ? 'lista_quitar' : 'lista_agregar', { slug, lista })
  if (!r || r.error) return { ok: false, error: r?.error ?? 'servidor' }
  return { ok: true, error: null, listas: (await fichaPersonalAccion(slug))?.listas }
}

/** Crear una lista (desde "Mis listas" o desde la ficha, y ahí con el producto adentro). */
export async function crearListaAccion(_: ResultadoLista | null, f: FormData): Promise<ResultadoLista> {
  const nombre = texto(f, 'nombre').replace(/\s+/g, ' ')
  const slug = texto(f, 'slug')
  if (!(await usuarioActual())) return aEntrar(idiomaDe(f), await volverDe(f, `/${idiomaDe(f)}/cuenta/listas`))
  if (nombre.length < 1 || nombre.length > 60) return { ok: false, error: 'nombre' }
  const r = await rpcCuenta<{ id?: string; error?: string }>('guardar_lista', { nombre })
  if (!r?.id) return { ok: false, error: r?.error ?? 'servidor' }
  if (esSlug(slug)) {
    const a = await rpcCuenta<{ error?: string }>('lista_agregar', { slug, lista: r.id })
    if (a?.error) return { ok: false, error: a.error }
    return { ok: true, error: null, listas: (await fichaPersonalAccion(slug))?.listas }
  }
  if (texto(f, 'ir') === '1') redirect(`/${idiomaDe(f)}/cuenta/listas/${r.id}`)
  return { ok: true, error: null }
}

export async function renombrarListaAccion(_: ResultadoLista | null, f: FormData): Promise<ResultadoLista> {
  const id = texto(f, 'id'), nombre = texto(f, 'nombre').replace(/\s+/g, ' ')
  if (!(await usuarioActual())) return aEntrar(idiomaDe(f), `/${idiomaDe(f)}/cuenta/listas`)
  if (!UUID.test(id)) return { ok: false, error: 'no_existe' }
  if (nombre.length < 1 || nombre.length > 60) return { ok: false, error: 'nombre' }
  const r = await rpcCuenta<{ id?: string; error?: string }>('guardar_lista', { id, nombre })
  if (!r?.id) return { ok: false, error: r?.error ?? 'servidor' }
  return { ok: true, error: null }
}

export async function borrarListaAccion(f: FormData) {
  const idioma = idiomaDe(f)
  if (!(await usuarioActual())) return aEntrar(idioma, `/${idioma}/cuenta/listas`)
  await rpcCuenta('borrar_lista', { id: texto(f, 'id') })
  redirect(`/${idioma}/cuenta/listas?borrada=1`)
}

/** Sacar un producto de una lista o pasarlo a otra (desde la página de la lista). */
export async function itemListaAccion(f: FormData) {
  const idioma = idiomaDe(f), id = texto(f, 'id'), slug = texto(f, 'slug'), a = texto(f, 'a')
  if (!(await usuarioActual())) return aEntrar(idioma, `/${idioma}/cuenta/listas`)
  if (!UUID.test(id) || !esSlug(slug)) redirect(`/${idioma}/cuenta/listas`)
  if (a && (a === 'favoritos' || UUID.test(a))) {
    const r = await rpcCuenta<{ error?: string }>('lista_mover', { de: id, a, slug })
    redirect(`/${idioma}/cuenta/listas/${id}?${r?.error ? `error=${encodeURIComponent(r.error)}` : `movido=${encodeURIComponent(slug)}`}`)
  }
  await rpcCuenta('lista_quitar', { lista: id, slug })
  redirect(`/${idioma}/cuenta/listas/${id}?quitado=${encodeURIComponent(slug)}`)
}

export async function compartirListaAccion(f: FormData) {
  const idioma = idiomaDe(f), id = texto(f, 'id')
  if (!(await usuarioActual())) return aEntrar(idioma, `/${idioma}/cuenta/listas`)
  const compartir = texto(f, 'compartir') !== '0'
  if (UUID.test(id)) {
    // "Generar otro enlace": se revoca el anterior y se crea uno nuevo
    if (texto(f, 'otro') === '1') await rpcCuenta('compartir_lista', { id, compartir: false })
    await rpcCuenta('compartir_lista', { id, compartir })
  }
  redirect(`/${idioma}/cuenta/listas/${id}?${compartir ? 'compartida=1' : 'revocada=1'}`)
}

// ---------------------------------------------------------------------------------------------
// Alertas de precio
// ---------------------------------------------------------------------------------------------

export type EstadoAlerta = { ok: boolean; error: string | null; id?: string; objetivo?: number; precio?: number | null } | null

export async function alertaAccion(_: EstadoAlerta, f: FormData): Promise<EstadoAlerta> {
  const slug = texto(f, 'slug')
  const idioma = idiomaDe(f)
  const mercado = leerMercado(texto(f, 'mercado'))
  if (!esSlug(slug) || !mercado) return { ok: false, error: 'producto' }
  if (!(await usuarioActual())) return aEntrar(idioma, await volverDe(f, `/${idioma}/p/${slug}`))
  const objetivo = leerMonto(texto(f, 'objetivo'), mercado.moneda)
  if (!objetivo) return { ok: false, error: 'objetivo' }
  const r = await rpcCuenta<{ id?: string; objetivo?: number; error?: string; precio?: number | null }>('crear_alerta', {
    slug, region: mercado.region, moneda: mercado.moneda, objetivo,
  })
  if (!r || r.error) return { ok: false, error: r?.error ?? 'servidor', precio: r?.precio != null ? Number(r.precio) : null }
  return { ok: true, error: null, id: r.id, objetivo: Number(r.objetivo) }
}

export async function borrarAlertaAccion(f: FormData) {
  const idioma = idiomaDe(f)
  if (!(await usuarioActual())) return aEntrar(idioma, `/${idioma}/cuenta/alertas`)
  await rpcCuenta('borrar_alerta', { id: texto(f, 'id') })
  const volver = texto(f, 'volver')
  redirect(/^\/(es|pt|en)\/p\/[a-z0-9-]+$/.test(volver) ? volver : `/${idioma}/cuenta/alertas?borrada=1`)
}

/** Avisos sin leer (para el número del encabezado). Solo lectura. */
export async function avisosAccion(): Promise<number> {
  if (!(await usuarioActual())) return 0
  const r = await rpcCuenta<{ avisos: number }>('estado_descubrir')
  return Number(r?.avisos ?? 0)
}

// ---------------------------------------------------------------------------------------------
// Vistos recientemente
// ---------------------------------------------------------------------------------------------

/**
 * Lo que mostrar en "Vistos recientemente". `actual`: la ficha que se está viendo (se registra y no se muestra).
 * Sin cuenta, la cookie ya la actualizó el navegador; acá solo se lee (leer cookies no recarga la página).
 * Con cuenta, se guarda en la base.
 */
export async function vistosAccion(p: { actual?: string; idioma: string; mercado: string }): Promise<Mini[]> {
  const ctx = await contextoDe(p.idioma, p.mercado)
  const actual = p.actual && esSlug(p.actual) ? p.actual : undefined
  let items: TarjetaDatos[] | null = null
  if (await usuarioActual()) {
    items = await rpcCuenta<TarjetaDatos[]>(actual ? 'registrar_vistos' : 'mis_vistos', { slugs: actual ? [actual] : [], idioma: ctx.idioma, excepto: actual })
  } else {
    const slugs = await leerCookieVistos()
    items = slugs.length ? await tarjetasDeSlugs(slugs, ctx.idioma, actual) : []
  }
  return mini(items ?? [], ctx)
}

// ---------------------------------------------------------------------------------------------
// "Comprados juntos": agregar el combo al carrito
// ---------------------------------------------------------------------------------------------

export type EstadoCombo = { ok: boolean; unidades: number; error: 'sin_stock' | null } | null

/**
 * Agrega la oferta más barata con stock de cada producto del combo. Recibe slugs, nunca precios ni ofertas: las
 * ofertas las elige la base y el precio lo calcula el carrito, como siempre.
 */
export async function comboAccion(_: EstadoCombo, f: FormData): Promise<EstadoCombo> {
  const slugs = slugsDeTexto(f.getAll('slug').map(String).join(','), 4)
  const ofertas = slugs.length >= 2 ? await rpc<{ slug: string; oferta: string }[]>('ofertas_baratas', { slugs }) : []
  let c: Carrito = await leerCookieCarrito()
  if (ofertas.length < slugs.length || ofertas.length < 2) return { ok: false, unidades: unidades(c), error: 'sin_stock' }
  const datos = await datosOfertas(ofertas.map((o) => o.oferta), 'es')
  for (const o of ofertas) {
    const d = datos.get(o.oferta)
    const ya = c.i.find((x) => x.o === o.oferta && !x.d)?.c ?? 0
    if (d && d.stock > ya) c = agregar(c, o.oferta, 1)
  }
  await guardarCookieCarrito(c)
  if (texto(f, 'js') !== '1') redirect(`/${idiomaDe(f)}/carrito`)
  return { ok: true, unidades: unidades(c), error: null }
}

// ---------------------------------------------------------------------------------------------
// Comparador (sin JavaScript; con JavaScript el botón escribe la cookie en el navegador)
// ---------------------------------------------------------------------------------------------

export async function compararAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const slug = texto(f, 'slug'), familia = texto(f, 'familia')
  const r = alternarComparar(await leerCookieComparar(), { slug, familia }, texto(f, 'reemplazar') === '1')
  await guardarCookieComparar(r.items)
  if (r.error) redirect(`/${idioma}/comparar?${new URLSearchParams({ p: r.items.map((x) => x.slug).join(','), aviso: r.error, quiso: slug })}`)
  redirect(await volverDe(f, `/${idioma}/comparar`))
}

/** Desde la página de comparación: lo que se ve pasa a ser tu comparación, sin el que sacaste. */
export async function quitarComparadoAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const quitar = texto(f, 'slug')
  const items = (await leerCookieComparar())
  const vistos = slugsDeTexto(texto(f, 'p')).filter((s) => s !== quitar)
  const familia = texto(f, 'familia')
  await guardarCookieComparar(vistos.map((s) => items.find((x) => x.slug === s) ?? { slug: s, familia }))
  const solo = texto(f, 'solo') === '1' ? '&solo=1' : ''
  redirect(vistos.length ? `/${idioma}/comparar?p=${vistos.join(',')}${solo}` : `/${idioma}/comparar`)
}

export async function vaciarComparacionAccion(f: FormData) {
  await guardarCookieComparar([])
  redirect(`/${idiomaDe(f)}/comparar`)
}
