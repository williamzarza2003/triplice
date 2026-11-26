'use server'
// Acciones de la cuenta. Son formularios comunes (funcionan sin JavaScript); toda escritura pasa por una función
// SQL que corre como el usuario, así que el RLS decide aunque alguien arme el formulario a mano.
import { updateTag } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { validarDatos, type Campo, type Error as ErrorCampo } from '@/lib/compra/direccion'
import { guardarFotos, revisarFotos, type ErrorFoto } from '@/lib/cuenta/fotos'
import {
  alEntrar, entrarDemo, ErrorCuenta, modoCuentas, perfil, rpcCuenta, saludar, salir, usuarioActual, type Perfil,
} from '@/lib/cuenta/sesion'
import { cuentaDemo } from '@/lib/datos/fuente'
import { esIdioma, IDIOMA_PREDETERMINADO, type Idioma } from '@/lib/i18n/idiomas'
import { esMoneda, esRegion, type Region } from '@/lib/region'
import { SITIO } from '@/lib/sitio'
import { supabaseServidor } from '@/lib/supabase/servidor'

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const idiomaDe = (f: FormData): Idioma => { const i = texto(f, 'idioma'); return esIdioma(i) ? i : IDIOMA_PREDETERMINADO }

/** A dónde volver después de entrar: solo caminos internos ("/es/p/..."), nunca otro sitio. */
export async function volverSeguro(v: string | null | undefined, idioma: Idioma) {
  return v && /^\/(es|pt|en)(\/[^/\\]|$)/.test(v) && !v.includes('//') ? v : `/${idioma}/cuenta`
}

async function exigirSesion(f: FormData, volver?: string) {
  const u = await usuarioActual()
  if (!u) redirect(`/${idiomaDe(f)}/entrar?volver=${encodeURIComponent(volver ?? `/${idiomaDe(f)}/cuenta`)}`)
  return u
}

// ---------------------------------------------------------------------------------------------
// Entrar y salir
// ---------------------------------------------------------------------------------------------

export async function entrarDemoAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const cuenta = modoCuentas === 'demo' ? await cuentaDemo() : null
  if (!cuenta) redirect(`/${idioma}/entrar?error=demo`)
  await entrarDemo(cuenta)
  await alEntrar(await perfil())
  redirect(await volverSeguro(texto(f, 'volver'), idioma))
}

export type EstadoEmail = { enviado: string | null; error: 'email' | 'servidor' | null }

async function origen() {
  return (await headers()).get('origin') ?? SITIO
}

export async function entrarEmailAccion(_: EstadoEmail, f: FormData): Promise<EstadoEmail> {
  const email = texto(f, 'email').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { enviado: null, error: 'email' }
  if (modoCuentas !== 'supabase') return { enviado: null, error: 'servidor' }
  const volver = await volverSeguro(texto(f, 'volver'), idiomaDe(f))
  const sb = await supabaseServidor()
  const { error } = await sb.auth.signInWithOtp({
    email, options: { emailRedirectTo: `${await origen()}/api/auth/callback?volver=${encodeURIComponent(volver)}` },
  })
  if (error) {
    console.error('Supabase no mandó el enlace', error.message)
    return { enviado: null, error: 'servidor' }
  }
  return { enviado: email, error: null }
}

export async function entrarGoogleAccion(f: FormData) {
  const idioma = idiomaDe(f)
  if (modoCuentas !== 'supabase') redirect(`/${idioma}/entrar?error=google`)
  const volver = await volverSeguro(texto(f, 'volver'), idioma)
  const sb = await supabaseServidor()
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: `${await origen()}/api/auth/callback?volver=${encodeURIComponent(volver)}` },
  })
  if (error || !data.url) redirect(`/${idioma}/entrar?error=google`)
  redirect(data.url)
}

export async function salirAccion(f: FormData) {
  await salir()
  redirect(`/${idiomaDe(f)}`)
}

// ---------------------------------------------------------------------------------------------
// Datos y preferencias
// ---------------------------------------------------------------------------------------------

export type EstadoPerfil = { ok: boolean; errores: Partial<Record<'nombre' | 'telefono', 'requerido' | 'telefono'>> } | null

export async function guardarPerfilAccion(_: EstadoPerfil, f: FormData): Promise<EstadoPerfil> {
  await exigirSesion(f)
  const nombre = texto(f, 'nombre').replace(/\s+/g, ' ').slice(0, 80)
  const telefono = texto(f, 'telefono').slice(0, 30)
  const errores: NonNullable<EstadoPerfil>['errores'] = {}
  if (nombre.length < 2) errores.nombre = 'requerido'
  if (telefono && telefono.replace(/\D/g, '').length < 7) errores.telefono = 'telefono'
  const region = texto(f, 'region'), moneda = texto(f, 'moneda'), idioma = texto(f, 'idioma_preferido')
  if (Object.keys(errores).length || !esRegion(region) || !esMoneda(moneda) || !esIdioma(idioma)) return { ok: false, errores }
  const p = await rpcCuenta<Perfil>('guardar_perfil', { nombre, telefono, region, moneda, idioma })
  await alEntrar(p)
  if (p) await saludar(p.nombre)
  if (idioma !== idiomaDe(f)) redirect(`/${idioma}/cuenta/datos?guardado=1`)
  return { ok: true, errores: {} }
}

// ---------------------------------------------------------------------------------------------
// Direcciones
// ---------------------------------------------------------------------------------------------

export type EstadoDireccion = { ok: boolean; errores: Partial<Record<Campo | 'alias', ErrorCampo>>; valores: Record<string, string> } | null

export async function guardarDireccionAccion(_: EstadoDireccion, f: FormData): Promise<EstadoDireccion> {
  const u = await exigirSesion(f)
  const valores = Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]))
  const region: Region = esRegion(valores.region) ? valores.region : 'PY'
  const alias = texto(f, 'alias').slice(0, 40)
  const v = validarDatos(region, 'domicilio', { ...valores, email: u.email || 'sin-correo@triplice.example' })
  const errores: NonNullable<EstadoDireccion>['errores'] = v.ok ? {} : { ...v.errores }
  delete errores.email
  if (!alias) errores.alias = 'requerido'
  if (Object.keys(errores).length) return { ok: false, errores, valores }
  const d = v.datos
  const r = await rpcCuenta<{ id?: string; error?: string }>('guardar_direccion', {
    id: texto(f, 'id'), alias, region, nombre: d.nombre, telefono: d.telefono, predeterminada: texto(f, 'predeterminada') === '1',
    datos: { ciudad: d.ciudad ?? '', zona: d.zona ?? '', direccion: d.direccion ?? '', codigo: d.codigo ?? '', referencia: d.referencia ?? '' },
  })
  if (r?.error) return { ok: false, errores: { alias: 'requerido' }, valores }
  redirect(`/${idiomaDe(f)}/cuenta/direcciones?guardada=1`)
}

export async function borrarDireccionAccion(f: FormData) {
  await exigirSesion(f)
  await rpcCuenta('borrar_direccion', { id: texto(f, 'id') })
  redirect(`/${idiomaDe(f)}/cuenta/direcciones?borrada=1`)
}

export async function predeterminadaAccion(f: FormData) {
  await exigirSesion(f)
  const lista = await rpcCuenta<{ id: string; alias: string; region: string; nombre: string; telefono: string; datos: object }[]>('mis_direcciones')
  const d = lista?.find((x) => x.id === texto(f, 'id'))
  if (d) await rpcCuenta('guardar_direccion', { ...d, predeterminada: true })
  redirect(`/${idiomaDe(f)}/cuenta/direcciones`)
}

// ---------------------------------------------------------------------------------------------
// Devoluciones
// ---------------------------------------------------------------------------------------------

export type EstadoDevolucion = { ok: boolean; error: 'motivo' | 'vencido' | 'ya_pedida' | 'no_entregado' | 'no_existe' | 'sin_sesion' | null } | null

export async function devolucionAccion(_: EstadoDevolucion, f: FormData): Promise<EstadoDevolucion> {
  const numero = texto(f, 'numero')
  await exigirSesion(f, `/${idiomaDe(f)}/cuenta/pedidos/${numero}`)
  const r = await rpcCuenta<{ ok?: boolean; error?: NonNullable<EstadoDevolucion>['error'] }>('solicitar_devolucion', {
    item: Number(texto(f, 'item')), motivo: texto(f, 'motivo'), detalle: texto(f, 'detalle').slice(0, 600), resolucion: texto(f, 'resolucion'),
  })
  if (r?.error) return { ok: false, error: r.error }
  redirect(`/${idiomaDe(f)}/cuenta/pedidos/${numero}?devolucion=1`)
}

// ---------------------------------------------------------------------------------------------
// Opiniones, votos y preguntas
// ---------------------------------------------------------------------------------------------

export type EstadoResena = {
  error: 'estrellas' | 'titulo' | 'texto' | ErrorFoto | 'no_verificada' | 'ya_opinaste' | 'servidor' | null
  valores: { estrellas: string; titulo: string; texto: string }
} | null

export async function escribirResenaAccion(_: EstadoResena, f: FormData): Promise<EstadoResena> {
  const item = texto(f, 'item')
  const u = await exigirSesion(f, `/${idiomaDe(f)}/cuenta/opinar/${item}`)
  const valores = { estrellas: texto(f, 'estrellas'), titulo: texto(f, 'titulo').replace(/\s+/g, ' '), texto: texto(f, 'texto') }
  const estrellas = Number(valores.estrellas)
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return { error: 'estrellas', valores }
  if (valores.titulo.length < 3 || valores.titulo.length > 80) return { error: 'titulo', valores }
  if (valores.texto.length < 20 || valores.texto.length > 2000) return { error: 'texto', valores }
  const archivos = f.getAll('fotos').filter((x): x is File => x instanceof File && x.size > 0)
  const malFoto = revisarFotos(archivos)
  if (malFoto) return { error: malFoto, valores }

  let fotos: string[]
  try {
    fotos = await guardarFotos(u.id, archivos)
  } catch (e) {
    console.error(e)
    return { error: 'ilegible', valores }
  }
  let r: { id?: string; slug?: string; error?: 'no_verificada' | 'ya_opinaste' } | null
  try {
    r = await rpcCuenta('escribir_resena', { item: Number(item), estrellas, titulo: valores.titulo, texto: valores.texto, idioma: idiomaDe(f), fotos })
  } catch (e) {
    console.error('No se guardó la opinión', e)
    return { error: 'servidor', valores }
  }
  if (!r || r.error) return { error: r?.error ?? 'servidor', valores }
  updateTag(`producto:${r.slug}`)
  redirect(`/${idiomaDe(f)}/cuenta/opiniones?publicada=${encodeURIComponent(r.slug ?? '')}`)
}

export type Voto = { util_si: number; mio: boolean | null } | null

/** "Me fue útil". Devuelve los números nuevos para el botón; sin sesión, manda a entrar y vuelve a la ficha. */
export async function votarAccion(f: FormData): Promise<Voto> {
  const slug = texto(f, 'slug')
  await exigirSesion(f, `/${idiomaDe(f)}/p/${slug}#opiniones`)
  const r = await rpcCuenta<Voto & { error?: string }>('votar_resena', { resena: texto(f, 'resena'), util: texto(f, 'util') !== '0' })
  if (!r || r.error) return null
  updateTag(`producto:${slug}`)
  return { util_si: Number(r.util_si), mio: r.mio }
}

export type EstadoPregunta = { error: 'largo' | 'limite' | 'servidor' | null; texto: string; ok: boolean } | null

function errorDeBase(e: unknown): 'largo' | 'limite' | 'servidor' {
  const m = e instanceof ErrorCuenta ? e.message : ''
  return m.includes('largo') ? 'largo' : m.includes('limite') ? 'limite' : 'servidor'
}

export async function preguntarAccion(_: EstadoPregunta, f: FormData): Promise<EstadoPregunta> {
  const slug = texto(f, 'slug')
  await exigirSesion(f, `/${idiomaDe(f)}/p/${slug}#preguntas`)
  const t = texto(f, 'texto').replace(/\s+/g, ' ')
  if (t.length < 10 || t.length > 500) return { error: 'largo', texto: t, ok: false }
  try {
    await rpcCuenta('preguntar', { slug, texto: t, idioma: idiomaDe(f) })
  } catch (e) {
    return { error: errorDeBase(e), texto: t, ok: false }
  }
  updateTag(`producto:${slug}`)
  return { error: null, texto: '', ok: true }
}

export async function responderAccion(_: EstadoPregunta, f: FormData): Promise<EstadoPregunta> {
  const slug = texto(f, 'slug')
  await exigirSesion(f, `/${idiomaDe(f)}/p/${slug}#preguntas`)
  const t = texto(f, 'texto').replace(/\s+/g, ' ')
  if (t.length < 2 || t.length > 800) return { error: 'largo', texto: t, ok: false }
  try {
    await rpcCuenta('responder', { pregunta: texto(f, 'pregunta'), texto: t })
  } catch (e) {
    return { error: errorDeBase(e), texto: t, ok: false }
  }
  updateTag(`producto:${slug}`)
  return { error: null, texto: '', ok: true }
}

export type FichaUsuario = { votos: Record<string, boolean>; item_para_opinar: number | null; opino: boolean } | null

/**
 * Lo personal de la ficha (mis votos y si puedo opinar). Lo pide el navegador después de cargar: así la ficha
 * sigue prearmada y cacheada igual para todos.
 */
export async function fichaUsuarioAccion(slug: string): Promise<FichaUsuario> {
  if (!/^[a-z0-9-]{1,160}$/.test(slug) || !(await usuarioActual())) return null
  return rpcCuenta<NonNullable<FichaUsuario>>('ficha_usuario', { slug })
}
