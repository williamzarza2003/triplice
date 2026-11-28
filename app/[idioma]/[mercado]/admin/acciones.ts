'use server'
// Acciones del panel de administración. Todas verifican la sesión y escriben por funciones SQL que corren como la
// persona que entró: cada función empieza con es_admin() y el RLS de admin decide, así que un formulario armado a mano
// por alguien que no es admin no cambia nada. Después de cada cambio que ve el público se invalida la caché
// (updateTag): fichas, tiendas, el catálogo, las cotizaciones y los impuestos.
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { traerDeCambioCde } from '@/lib/admin/cambio-cde'
import { leerCotizacion, MONEDAS_COTIZADAS, variacionPorcentual, type MonedaCotizada, type TasasParciales } from '@/lib/admin/conversion'
import { leerPorcentaje, PAISES, vistaPreviaImpuesto, type FilaVistaPrevia, type Pais } from '@/lib/admin/impuestos'
import type { Ejemplo } from '@/lib/admin/tipos'
import { alEntrar, entrarDemo, ErrorCuenta, modoCuentas, perfil, rpcCuenta, usuarioActual } from '@/lib/cuenta/sesion'
import { cuentaDemo, rpc } from '@/lib/datos/fuente'
import type { Regla } from '@/lib/compra/impuestos'
import { esIdioma, IDIOMA_PREDETERMINADO, type Idioma } from '@/lib/i18n/idiomas'
import { normalizarSlug } from '@/lib/admin/tipos'

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const idiomaDe = (f: FormData): Idioma => { const i = texto(f, 'idioma'); return esIdioma(i) ? i : IDIOMA_PREDETERMINADO }
const tresIdiomas = (f: FormData, k: string) => ({ es: texto(f, `${k}.es`), pt: texto(f, `${k}.pt`), en: texto(f, `${k}.en`) })

/** Vuelta segura dentro del panel ("/es/admin/tiendas?estado=aprobada"), nunca a otro sitio. */
function volverA(f: FormData, porDefecto: string) {
  const v = texto(f, 'volver')
  return /^\/(es|pt|en)\/admin(\/[a-z0-9/-]*)?(\?[\w=&%.-]*)?$/.test(v) ? v : porDefecto
}
/** La misma página con un aviso (?guardado=…) o un error (?error=…), y el ancla del elemento que cambió. */
function con(url: string, extra: Record<string, string>, ancla?: string) {
  const u = new URL(url, 'http://x')
  for (const k of ['error', 'guardado', 'n', 'nombre', 'p', 's', 'r', 'id', 'abierta']) u.searchParams.delete(k)
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v)
  return `${u.pathname}${u.search}${ancla ? `#${ancla}` : ''}`
}

/**
 * Cambió algo que entra en TODOS los precios (cotización o impuesto): se invalidan las etiquetas que leen
 * contexto() y la búsqueda. Ojo (lo encontró e2e/admin.spec.ts): las fichas que se arman a pedido parten del armado
 * del build, que trae guardada la cotización de ese momento sin su etiqueta, así que esas toman la nueva cuando vence
 * su caché (cacheLife 'minutes' de cotizaciones(): alrededor de un minuto). revalidatePath del layout las rearmaba,
 * pero el rearmado de la ficha falla (el encabezado usa usePathname fuera de Suspense) y devolvía 500: no se usa.
 */
function precioCambio() {
  updateTag('cotizaciones')
  updateTag('impuestos')
  updateTag('catalogo') // la búsqueda filtra y ordena con el precio final
}

async function exigirSesion(f: FormData, volver: string) {
  const u = await usuarioActual()
  if (!u) redirect(`/${idiomaDe(f)}/entrar?volver=${encodeURIComponent(volver)}`)
  return u
}

/** Llama una función de admin; los errores de la base (disparadores) vuelven como { error: codigo }. */
type ConError = { error?: string; pista?: string; campo?: string }
async function admin<T extends object>(funcion: Parameters<typeof rpcCuenta>[0], p: object): Promise<T & ConError> {
  try {
    const r = await rpcCuenta<T & ConError>(funcion, p)
    return r ?? ({ error: 'sin_sesion' } as T & ConError)
  } catch (e) {
    console.error(`No se pudo ${funcion}`, e instanceof ErrorCuenta ? `${e.message} · ${e.pista}` : e)
    return { error: e instanceof ErrorCuenta ? e.message.replace(/^.*?\b([a-z_]+)$/, '$1') : 'servidor' } as T & ConError
  }
}

// ---------------------------------------------------------------------------------------------
// Entrar como la admin de prueba (solo sin Supabase)
// ---------------------------------------------------------------------------------------------

export async function entrarAdminDemoAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const cuenta = modoCuentas === 'demo' ? await cuentaDemo('admin') : null
  if (!cuenta) redirect(`/${idioma}/entrar?error=demo`)
  await entrarDemo(cuenta)
  await alEntrar(await perfil())
  redirect(`/${idioma}/admin`)
}

// ---------------------------------------------------------------------------------------------
// Tiendas
// ---------------------------------------------------------------------------------------------

export async function estadoTiendaAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = volverA(f, `/${idioma}/admin/tiendas`)
  await exigirSesion(f, volver)
  const tienda = texto(f, 'tienda')
  const estado = texto(f, 'estado')
  const r = await admin<{ slug: string; nombre: string; productos: string[] }>('admin_estado_tienda', { tienda, estado, motivo: texto(f, 'motivo') })
  if (r.error) redirect(con(volver, { error: r.error, id: tienda }, `tienda-${tienda}`))
  updateTag(`tienda:${r.slug}`)
  for (const slug of r.productos ?? []) updateTag(`producto:${slug}`)
  updateTag('catalogo') // tarjetas, búsqueda, inicio y la lista de tiendas
  redirect(con(volver, { guardado: estado === 'suspendida' ? 'suspendida' : 'aprobada', n: r.slug, nombre: r.nombre }))
}

export type EstadoAlta = {
  ok?: { tienda: string; cuenta: string; slug: string }
  error?: string; campo?: string; detalle?: string
  valores?: Record<string, string>
} | null

export async function altaVendedorAccion(_: EstadoAlta, f: FormData): Promise<EstadoAlta> {
  const idioma = idiomaDe(f)
  await exigirSesion(f, `/${idioma}/admin/tiendas`)
  const valores = Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]))
  const email = texto(f, 'email').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'email', campo: 'email', valores }
  let p: object
  if (texto(f, 'modo') === 'nueva') {
    const nombre = texto(f, 'nueva.nombre')
    const slug = normalizarSlug(texto(f, 'nueva.slug') || nombre)
    const pais = texto(f, 'nueva.pais')
    const ciudad = texto(f, 'nueva.ciudad')
    if (nombre.length < 2 || nombre.length > 60) return { error: 'nombre', campo: 'nueva.nombre', valores }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 60) return { error: 'slug', campo: 'nueva.slug', valores }
    if (!['PY', 'BR', 'AR'].includes(pais)) return { error: 'pais', campo: 'nueva.pais', valores }
    if (ciudad.length < 2 || ciudad.length > 60) return { error: 'ciudad', campo: 'nueva.ciudad', valores }
    p = { email, nueva: { nombre, slug, pais, ciudad } }
  } else {
    const tienda = texto(f, 'tienda')
    if (!tienda) return { error: 'tienda', campo: 'tienda', valores }
    p = { email, tienda }
  }
  const r = await admin<{ slug: string; nombre: string; cuenta: string; campo?: string; tienda?: string; duenio?: string }>('admin_alta_vendedor', p)
  if (r.error) {
    const x = r as { error: string; campo?: string; tienda?: string; duenio?: string }
    return { error: x.error, campo: x.campo ?? 'email', detalle: x.tienda ?? x.duenio, valores }
  }
  updateTag(`tienda:${r.slug}`)
  updateTag('catalogo')
  return { ok: { tienda: r.nombre, cuenta: r.cuenta, slug: r.slug } }
}

// ---------------------------------------------------------------------------------------------
// Moderación
// ---------------------------------------------------------------------------------------------

export async function moderarAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = volverA(f, `/${idioma}/admin/moderacion`)
  await exigirSesion(f, volver)
  const id = texto(f, 'id')
  // el motivo queda en el registro: lo elegido en la lista y, si hay, el detalle que escribió el admin
  const motivo = [texto(f, 'motivo'), texto(f, 'detalle')].filter(Boolean).join(': ').slice(0, 400)
  const accion = texto(f, 'accion')
  const r = await admin<{ slug: string }>('admin_moderar', { tipo: texto(f, 'tipo'), id, accion, motivo })
  if (r.error) redirect(con(volver, { error: r.error, id }, `item-${id}`))
  if (r.slug) updateTag(`producto:${r.slug}`)
  updateTag('catalogo') // el promedio de las tarjetas
  redirect(con(volver, { guardado: accion }))
}

// ---------------------------------------------------------------------------------------------
// Categorías y atributos
// ---------------------------------------------------------------------------------------------

export type EstadoForm = { error?: string; campo?: string; pista?: string; valores?: Record<string, string> } | null

export async function guardarCategoriaAccion(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const idioma = idiomaDe(f)
  const id = texto(f, 'id')
  await exigirSesion(f, `/${idioma}/admin/categorias`)
  const valores = Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]))
  const nombre = tresIdiomas(f, 'nombre')
  for (const i of ['es', 'pt', 'en'] as const) {
    if (nombre[i].length < 2 || nombre[i].length > 60) return { error: 'nombre', campo: `nombre.${i}`, valores }
  }
  const slug = normalizarSlug(texto(f, 'slug') || nombre.es)
  const r = await admin<{ id: number; campo?: string; pista?: string }>('admin_guardar_categoria', {
    id: id || null, slug, nombre, padre: texto(f, 'padre') || null, icono: texto(f, 'icono') || null,
  })
  if (r.error) {
    const x = r as { error: string; campo?: string; pista?: string }
    return { error: x.error, campo: x.campo, pista: x.pista, valores }
  }
  updateTag('catalogo')
  redirect(`/${idioma}/admin/categorias${id ? `/${id}` : ''}?guardado=${id ? 'categoria' : 'nueva'}${id ? '' : `#categoria-${r.id}`}`)
}

export async function ordenarAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = volverA(f, `/${idioma}/admin/categorias`)
  await exigirSesion(f, volver)
  const id = texto(f, 'id')
  const que = texto(f, 'que') === 'atributo' ? 'atributo' : 'categoria'
  await admin('admin_ordenar', { id, mover: texto(f, 'mover'), que })
  updateTag('catalogo')
  redirect(con(volver, que === 'categoria' ? { abierta: id } : {}, `${que}-${id}`))
}

export async function borrarCategoriaAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = volverA(f, `/${idioma}/admin/categorias`)
  await exigirSesion(f, volver)
  const id = texto(f, 'id')
  const r = await admin<{ productos?: number; subcategorias?: number; reglas?: number }>('admin_borrar_categoria', { id })
  if (r.error) {
    const x = r as { error: string; productos?: number; subcategorias?: number; reglas?: number }
    redirect(con(`/${idioma}/admin/categorias`, { error: x.error, id, p: String(x.productos ?? 0), s: String(x.subcategorias ?? 0), r: String(x.reglas ?? 0) }, `categoria-${id}`))
  }
  updateTag('catalogo')
  redirect(con(`/${idioma}/admin/categorias`, { guardado: 'borrada' }))
}

export async function guardarAtributoAccion(_: EstadoForm, f: FormData): Promise<EstadoForm> {
  const idioma = idiomaDe(f)
  const categoria = texto(f, 'categoria')
  await exigirSesion(f, `/${idioma}/admin/categorias/${categoria}`)
  const valores = Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]))
  const nombre = tresIdiomas(f, 'nombre')
  for (const i of ['es', 'pt', 'en'] as const) {
    if (nombre[i].length < 2 || nombre[i].length > 40) return { error: 'nombre', campo: `nombre.${i}`, valores }
  }
  const tipo = texto(f, 'tipo')
  // una opción por renglón (o separadas por coma), sin repetidas
  const opciones = [...new Set(texto(f, 'opciones').split(/[\n,]/).map((x) => x.trim()).filter(Boolean))]
  if (tipo === 'opcion' && (opciones.length < 2 || opciones.length > 40 || opciones.some((o) => o.length > 40))) {
    return { error: 'opciones', campo: 'opciones', valores }
  }
  const r = await admin<{ id: number }>('admin_guardar_atributo', {
    id: texto(f, 'id') || null, categoria, clave: texto(f, 'clave').toLowerCase(), nombre, tipo, unidad: texto(f, 'unidad'),
    opciones: tipo === 'opcion' ? opciones : null, filtrable: f.get('filtrable') === 'on',
  })
  if (r.error) {
    const x = r as { error: string; campo?: string }
    return { error: x.error, campo: x.campo, valores }
  }
  updateTag('catalogo')
  redirect(`/${idioma}/admin/categorias/${categoria}?guardado=atributo#atributo-${r.id}`)
}

export async function borrarAtributoAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const categoria = texto(f, 'categoria')
  const volver = `/${idioma}/admin/categorias/${categoria}`
  await exigirSesion(f, volver)
  const id = texto(f, 'id')
  const r = await admin<{ productos?: number }>('admin_borrar_atributo', { id })
  if (r.error) {
    const x = r as { error: string; productos?: number }
    redirect(con(volver, { error: x.error, id, p: String(x.productos ?? 0) }, `atributo-${id}`))
  }
  updateTag('catalogo')
  redirect(con(volver, { guardado: 'atributo_borrado' }))
}

// ---------------------------------------------------------------------------------------------
// Impuestos: vista previa con el cálculo de la tienda y después guardar
// ---------------------------------------------------------------------------------------------

export type EstadoImpuesto = {
  error?: string; campo?: string
  vista?: { filas: FilaVistaPrevia[]; ejemplo: Ejemplo; tasa: number }
  valores?: Record<string, string>
} | null

export async function impuestoAccion(_: EstadoImpuesto, f: FormData): Promise<EstadoImpuesto> {
  const idioma = idiomaDe(f)
  await exigirSesion(f, `/${idioma}/admin/impuestos`)
  const valores = Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, String(v)]))
  const id = texto(f, 'id')
  const pais = texto(f, 'pais') as Pais
  const categoria = texto(f, 'categoria') // id de la categoría (vacío = la general)
  const tasa = leerPorcentaje(texto(f, 'tasa'))
  const nombre = tresIdiomas(f, 'nombre')
  if (!(PAISES as readonly string[]).includes(pais)) return { error: 'pais', campo: 'pais', valores }
  if (!id && !categoria) return { error: 'categoria', campo: 'categoria', valores }
  if (tasa === null) return { error: 'tasa', campo: 'tasa', valores }
  for (const i of ['es', 'pt', 'en'] as const) {
    if (nombre[i].length < 2 || nombre[i].length > 40) return { error: 'nombre', campo: `nombre.${i}`, valores }
  }

  // se guarda solo lo que se vio en la vista previa: si la tasa cambió después, primero se vuelve a mostrar
  if (texto(f, 'paso') === 'guardar' && Number(texto(f, 'vista')) === tasa) {
    const r = await admin<{ id: number }>('admin_guardar_impuesto', { id: id || null, pais, categoria: categoria || null, tasa, nombre })
    if (r.error) {
      const x = r as { error: string; campo?: string }
      return { error: x.error, campo: x.campo, valores }
    }
    precioCambio()
    redirect(`/${idioma}/admin/impuestos?guardado=${pais}#pais-${pais}`)
  }

  // Vista previa: las reglas vigentes de hoy (sin caché), el cambio aplicado y el producto más vendido de la categoría
  const [reglas, deLaCategoria, cot] = await Promise.all([
    rpc<Record<string, { categoria: string | null; nombre: string; tasa: number | string }[]>>('impuestos_vigentes', { idioma }),
    admin<Ejemplo>('admin_ejemplo', { categoria: categoria || null, idioma }),
    rpc<{ tasas: Record<string, number | string> }>('cotizaciones_vigentes'),
  ])
  // si la categoría todavía no tiene nada a la venta, el ejemplo es el más vendido del sitio
  const ejemplo = deLaCategoria && 'slug' in deLaCategoria ? deLaCategoria : await admin<Ejemplo>('admin_ejemplo', { idioma })
  if (!ejemplo || ejemplo.error || !('slug' in ejemplo)) return { error: 'sin_ejemplo', valores }
  const comunes: Partial<Record<Pais, Regla[]>> = Object.fromEntries(Object.entries(reglas).map(([p, rs]) => [p, rs.map((x) => ({ ...x, tasa: Number(x.tasa) }))]))
  const slugCategoria = categoria ? (await admin<{ slug: string }>('admin_categoria', { id: categoria, idioma }) as { slug?: string }).slug ?? null : null
  const filas = vistaPreviaImpuesto({
    reglas: comunes, precioUsdCent: Number(ejemplo.precio), categoria: { sub: ejemplo.categoria, padre: ejemplo.categoria_padre },
    tasas: { PYG: Number(cot.tasas.PYG), BRL: Number(cot.tasas.BRL), ARS: Number(cot.tasas.ARS) },
    cambio: { pais, categoria: slugCategoria, tasa, nombre: nombre[idioma] },
  })
  return { vista: { filas, ejemplo, tasa }, valores }
}

export async function borrarImpuestoAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = `/${idioma}/admin/impuestos`
  await exigirSesion(f, volver)
  const r = await admin('admin_borrar_impuesto', { id: texto(f, 'id') })
  if (r.error) redirect(con(volver, { error: r.error }))
  precioCambio()
  redirect(con(volver, { guardado: 'borrada' }, `pais-${texto(f, 'pais')}`))
}

// ---------------------------------------------------------------------------------------------
// Cotizaciones: a mano o traídas de Cambio CDE, siempre con vista previa antes de guardar
// ---------------------------------------------------------------------------------------------

export type EstadoCotizacion = {
  error?: string; moneda?: string; faltan?: string[]
  /** lo que se va a guardar, con la variación contra la vigente (para mostrar y confirmar) */
  propuesta?: { tasas: TasasParciales; variaciones: Partial<Record<MonedaCotizada, number | null>>; fuente: 'manual' | 'cambio-cde'; desde?: string | null; faltan?: string[] }
  valores?: Record<string, string>
} | null

export async function cotizacionAccion(_: EstadoCotizacion, f: FormData): Promise<EstadoCotizacion> {
  const idioma = idiomaDe(f)
  await exigirSesion(f, `/${idioma}/admin/cotizaciones`)
  const paso = texto(f, 'paso')
  const valores = Object.fromEntries(MONEDAS_COTIZADAS.map((m) => [m, texto(f, m)]))
  const vigentes = await rpc<{ tasas: Record<string, number | string> }>('cotizaciones_vigentes')
  const variaciones = (t: TasasParciales) => Object.fromEntries(Object.entries(t).map(([m, v]) => [m, variacionPorcentual(Number(vigentes.tasas[m]), v as number)]))

  if (paso === 'traer') {
    const r = await traerDeCambioCde()
    if (!r.ok) return { error: `cambio_${r.error}`, faltan: 'faltan' in r ? r.faltan : undefined, valores }
    return { propuesta: { tasas: r.tasas, variaciones: variaciones(r.tasas), fuente: 'cambio-cde', desde: r.desde, faltan: r.faltan }, valores }
  }

  // lo que escribió el admin (solo las monedas que cambian)
  const tasas: TasasParciales = {}
  for (const m of MONEDAS_COTIZADAS) {
    if (!valores[m]) continue
    const n = leerCotizacion(valores[m])
    if (n === null) return { error: 'numero', moneda: m, valores }
    if (n !== Number(vigentes.tasas[m])) tasas[m] = n
  }
  if (paso === 'confirmar') {
    // vuelve con lo que se vio en la vista previa (también lo de Cambio CDE): se guarda eso, no otra cosa
    const fuente = texto(f, 'fuente') === 'cambio-cde' ? 'cambio-cde' : 'manual'
    const confirmadas: TasasParciales = {}
    for (const m of MONEDAS_COTIZADAS) {
      const n = leerCotizacion(texto(f, `confirmar.${m}`))
      if (n !== null) confirmadas[m] = n
    }
    if (!Object.keys(confirmadas).length) return { error: 'vacio', valores }
    const r = await admin<{ ok: boolean }>('admin_guardar_cotizacion', { tasas: confirmadas, fuente, confirmar: true })
    if (r.error) return { error: r.error, moneda: (r as { moneda?: string }).moneda, valores }
    precioCambio()
    redirect(`/${idioma}/admin/cotizaciones?guardado=${fuente}`)
  }
  if (!Object.keys(tasas).length) return { error: 'sin_cambios', valores }
  // primero la vista previa, siempre: valor actual, nuevo y variación (con aviso si pasa del 5 %)
  return { propuesta: { tasas, variaciones: variaciones(tasas), fuente: 'manual' }, valores }
}
