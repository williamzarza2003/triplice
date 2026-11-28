'use client'
// Estado de descubrimiento en el navegador. Las páginas están cacheadas igual para todos; lo personal llega después:
// - comparador y vistos: cookies que el navegador lee y escribe (marcar no recarga la página);
// - favoritos y avisos: una sola consulta por página (estadoAccion), y solo si hay una sesión iniciada.
import { useSyncExternalStore } from 'react'
import { estadoAccion } from '@/app/[idioma]/[mercado]/descubrir/acciones'
import { COOKIE_HOLA } from '../cuenta/hola'
import {
  COOKIE_COMPARAR, COOKIE_PENDIENTE, COOKIE_VISTOS, agregarVisto, escribirComparar, escribirVistos, leerComparar, leerVistos,
  type ItemComparar,
} from './cookies'

const UN_MES = 60 * 60 * 24 * 30

export function leerCookie(nombre: string) {
  return document.cookie.split('; ').find((x) => x.startsWith(`${nombre}=`))?.slice(nombre.length + 1)
}
function escribirCookie(nombre: string, valor: string, maxAge = UN_MES) {
  const seguro = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = valor ? `${nombre}=${encodeURIComponent(valor)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${seguro}`
    : `${nombre}=; Path=/; Max-Age=0; SameSite=Lax${seguro}`
}

export const conSesion = () => Boolean(leerCookie(COOKIE_HOLA))

// ---------------------------------------------------------------------------------------------- comparador
const EVENTO_COMPARAR = 'triplice:comparar'
let cacheComparar: { crudo: string | undefined; items: ItemComparar[] } = { crudo: undefined, items: [] }

function compararActual() {
  const crudo = leerCookie(COOKIE_COMPARAR)
  if (crudo !== cacheComparar.crudo) cacheComparar = { crudo, items: leerComparar(crudo) }
  return cacheComparar.items
}
const sinComparar: ItemComparar[] = []
function suscribirComparar(aviso: () => void) {
  window.addEventListener(EVENTO_COMPARAR, aviso)
  window.addEventListener('focus', aviso)
  return () => { window.removeEventListener(EVENTO_COMPARAR, aviso); window.removeEventListener('focus', aviso) }
}
export function useComparar() {
  return useSyncExternalStore(suscribirComparar, compararActual, () => sinComparar)
}
export function guardarComparar(items: ItemComparar[]) {
  escribirCookie(COOKIE_COMPARAR, escribirComparar(items))
  window.dispatchEvent(new Event(EVENTO_COMPARAR))
}

// ---------------------------------------------------------------------------------------------- vistos (sin cuenta)
export function registrarVistoEnCookie(slug: string) {
  if (conSesion()) return // con cuenta se guarda en la base (vistosAccion)
  escribirCookie(COOKIE_VISTOS, escribirVistos(agregarVisto(leerVistos(leerCookie(COOKIE_VISTOS)), slug)))
}
export const hayVistos = () => conSesion() || Boolean(leerCookie(COOKIE_VISTOS))

// ---------------------------------------------------------------------------------------------- favoritos y avisos
type Estado = { cargado: boolean; favoritos: Set<string>; avisos: number }
let estado: Estado = { cargado: false, favoritos: new Set(), avisos: 0 }
// con qué sesión se pidió (al entrar o salir sin recargar la página, se vuelve a pedir)
let pedidoCon: boolean | null = null
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())
const CLAVE_AVISOS = 'triplice_avisos'

function cargar() {
  const sesion = conSesion()
  if (pedidoCon === sesion) return
  pedidoCon = sesion
  if (!sesion) { estado = { cargado: true, favoritos: new Set(), avisos: 0 }; avisar(); return }
  estadoAccion().then((r) => {
    estado = { cargado: true, favoritos: new Set(r?.favoritos ?? []), avisos: r?.avisos ?? 0 }
    try { sessionStorage.setItem(CLAVE_AVISOS, String(estado.avisos)) } catch {}
    avisar()
  }).catch(() => { estado = { ...estado, cargado: true }; avisar() })
}

function suscribir(aviso: () => void) {
  oyentes.add(aviso)
  // se pide cuando el navegador está libre: no compite con la foto principal ni con la hidratación
  const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (ric) ric(cargar, { timeout: 2500 })
  else setTimeout(cargar, 300)
  return () => { oyentes.delete(aviso) }
}
const vacio: Estado = { cargado: false, favoritos: new Set(), avisos: 0 }
const leer = () => estado

export function useDescubrir() {
  return useSyncExternalStore(suscribir, leer, () => vacio)
}

export function marcarFavorito(slug: string, favorito: boolean) {
  const favoritos = new Set(estado.favoritos)
  if (favorito) favoritos.add(slug); else favoritos.delete(slug)
  estado = { ...estado, favoritos }
  avisar()
}

export function fijarAvisos(n: number) {
  estado = { ...estado, avisos: n }
  try { sessionStorage.setItem(CLAVE_AVISOS, String(n)) } catch {}
  avisar()
}

/** Sin cuenta: guarda qué quiso marcar (se completa al entrar) y devuelve a dónde ir a entrar, con la vuelta a esta página. */
export function entrarParaFavorito(idioma: string, slug: string) {
  escribirCookie(COOKIE_PENDIENTE, `fav:${slug}`, 60 * 30)
  const camino = location.pathname.replace(/^\/(es|pt|en)\/[a-z]{2}-[a-z]{3}(?=\/|$)/, '/$1') + location.search
  return `/${idioma}/entrar?volver=${encodeURIComponent(camino)}`
}
