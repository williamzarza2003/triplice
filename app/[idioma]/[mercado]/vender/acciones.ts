'use server'
// Acciones del panel del vendedor. Todas verifican la sesión y escriben por funciones SQL que corren como el usuario:
// el RLS y mi_tienda() deciden, así que un formulario armado a mano no toca nada de otra tienda. Después de cada
// cambio que ve el comprador se invalida la caché de la ficha (updateTag('producto:…')) y del catálogo.
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { revisarFotos } from '@/lib/cuenta/fotos'
import { alEntrar, entrarDemo, ErrorCuenta, modoCuentas, perfil, rpcCuenta, usuarioActual } from '@/lib/cuenta/sesion'
import { cuentaDemo } from '@/lib/datos/fuente'
import { esIdioma, IDIOMA_PREDETERMINADO, type Idioma } from '@/lib/i18n/idiomas'
import { guardarFotosProducto, MAX_FOTOS_VARIANTE } from '@/lib/vender/fotos'
import { leerProducto, paraLaBase, type CodigoError } from '@/lib/vender/producto'
import type { CategoriaForm, TiendaPanel } from '@/lib/vender/tipos'

const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const idiomaDe = (f: FormData): Idioma => { const i = texto(f, 'idioma'); return esIdioma(i) ? i : IDIOMA_PREDETERMINADO }

/** Vuelta segura dentro del panel ("/es/vender/productos?filtro=pausados"), nunca a otro sitio. */
function volverA(f: FormData, porDefecto: string) {
  const v = texto(f, 'volver')
  return /^\/(es|pt|en)\/vender(\/[a-z0-9/-]*)?(\?[\w=&%.-]*)?$/.test(v) ? v : porDefecto
}
const conParametro = (url: string, k: string, v: string) => {
  const u = new URL(url, 'http://x')
  u.searchParams.delete('error')
  u.searchParams.delete('guardado')
  u.searchParams.delete('avanzado')
  u.searchParams.set(k, v)
  return `${u.pathname}${u.search}`
}

async function exigirSesion(f: FormData, volver: string) {
  const u = await usuarioActual()
  if (!u) redirect(`/${idiomaDe(f)}/entrar?volver=${encodeURIComponent(volver)}`)
  return u
}

/** Las etiquetas que hay que invalidar cuando cambia lo que ve el comprador de un producto. */
function invalidar(slug: string | undefined, tienda?: string) {
  if (slug) updateTag(`producto:${slug}`)
  if (tienda) updateTag(`tienda:${tienda}`)
  updateTag('catalogo') // tarjetas de búsqueda, categorías e inicio (precio, stock y fotos)
}

// ---------------------------------------------------------------------------------------------
// Entrar como el vendedor de prueba (solo sin Supabase)
// ---------------------------------------------------------------------------------------------

export async function entrarVendedorDemoAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const cuenta = modoCuentas === 'demo' ? await cuentaDemo('vendedor') : null
  if (!cuenta) redirect(`/${idioma}/entrar?error=demo`)
  await entrarDemo(cuenta)
  await alEntrar(await perfil())
  redirect(`/${idioma}/vender`)
}

// ---------------------------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------------------------

export type EstadoProducto = { errores: Record<string, CodigoError> } | null

export async function guardarProductoAccion(_: EstadoProducto, f: FormData): Promise<EstadoProducto> {
  const idioma = idiomaDe(f)
  const id = texto(f, 'id')
  await exigirSesion(f, `/${idioma}/vender/productos/${id || 'nuevo'}`)
  const [categorias, tienda] = await Promise.all([
    rpcCuenta<CategoriaForm[]>('vendedor_categorias', { idioma }),
    rpcCuenta<TiendaPanel | null>('mi_tienda_datos'),
  ])
  if (!tienda?.id) redirect(`/${idioma}/vender`)
  const categoria = categorias?.find((c) => c.slug === texto(f, 'categoria'))
  const { datos, errores } = leerProducto(f, categoria?.atributos ?? [])
  if (!categoria) errores.categoria = 'categoria'
  if (Object.keys(errores).length) return { errores }

  // las fotos se procesan recién cuando el resto está bien (si algo falla, el navegador las sigue teniendo elegidas)
  for (const v of datos.variantes) {
    const archivos = f.getAll(`${v.fila}.fotos`).filter((x): x is File => x instanceof File && x.size > 0)
    const mal = archivos.length + v.imagenes.length > MAX_FOTOS_VARIANTE ? 'muchas' : revisarFotos(archivos)
    if (mal) return { errores: { [`${v.fila}.fotos`]: `foto_${mal}` as CodigoError } }
  }
  try {
    for (const v of datos.variantes) {
      const archivos = f.getAll(`${v.fila}.fotos`).filter((x): x is File => x instanceof File && x.size > 0)
      if (archivos.length) v.imagenes.push(...(await guardarFotosProducto(tienda.id, archivos)))
    }
  } catch (e) {
    console.error('No se guardaron las fotos', e)
    return { errores: { [`${datos.variantes[0].fila}.fotos`]: 'foto_ilegible' } }
  }

  let r: { id?: string; slug?: string; error?: string; campo?: string } | null
  try {
    r = await rpcCuenta('guardar_producto', paraLaBase(datos))
  } catch (e) {
    // los disparadores de la base explican el problema en la pista (por ejemplo, un atributo que no es de la categoría)
    console.error('No se guardó el producto', e instanceof ErrorCuenta ? `${e.message} · ${e.pista}` : e)
    return { errores: { general: 'servidor' } }
  }
  if (!r || r.error) {
    // la base dice el campo con la posición de la variante ("v1.precio"): se pasa a la clave de la fila del formulario
    const campo = (r?.campo ?? 'general').replace(/^v(\d+)/, (_, n) => datos.variantes[Number(n)]?.fila ?? `v${n}`)
    const codigo = (['sin_tienda', 'variante'].includes(r?.error ?? '') ? 'no_existe' : r?.error ?? 'servidor') as CodigoError
    return { errores: { [campo]: codigo } }
  }
  invalidar(r.slug, tienda.slug)
  redirect(`/${idioma}/vender/productos?guardado=${encodeURIComponent(r.slug ?? '')}`)
}

export async function pausarAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = volverA(f, `/${idioma}/vender/productos`)
  await exigirSesion(f, volver)
  const activa = texto(f, 'activa') === '1'
  const r = await rpcCuenta<{ slug?: string; error?: string }>('pausar_producto', { id: texto(f, 'id'), activa })
  if (!r || r.error) redirect(conParametro(volver, 'error', 'no_existe'))
  const tienda = await rpcCuenta<TiendaPanel | null>('mi_tienda_datos')
  invalidar(r.slug, tienda?.slug)
  redirect(conParametro(volver, 'guardado', activa ? 'activado' : 'pausado'))
}

export async function stockAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = volverA(f, `/${idioma}/vender/productos`)
  await exigirSesion(f, volver)
  const stocks = [...f.entries()].filter(([k]) => k.startsWith('s.')).map(([k, v]) => {
    const n = String(v).trim().replace(/\./g, '')
    return { oferta: k.slice(2), stock: /^\d{1,5}$/.test(n) ? Number(n) : -1 }
  })
  if (!stocks.length || stocks.some((x) => x.stock < 0 || !/^[0-9a-f-]{36}$/.test(x.oferta))) redirect(conParametro(volver, 'error', 'stock'))
  const r = await rpcCuenta<{ slug?: string; error?: string }>('guardar_stock', { stocks })
  if (!r || r.error) redirect(conParametro(volver, 'error', r?.error === 'stock' ? 'stock' : 'no_existe'))
  const tienda = await rpcCuenta<TiendaPanel | null>('mi_tienda_datos')
  invalidar(r.slug, tienda?.slug)
  redirect(conParametro(volver, 'guardado', 'stock'))
}

// ---------------------------------------------------------------------------------------------
// Pedidos y preguntas
// ---------------------------------------------------------------------------------------------

function codigoDeBase(e: unknown, conocidos: string[]) {
  const m = e instanceof ErrorCuenta ? e.message : ''
  return conocidos.find((c) => m.includes(c)) ?? 'servidor'
}

export async function avanzarAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = volverA(f, `/${idioma}/vender/pedidos`)
  await exigirSesion(f, volver)
  const numero = texto(f, 'numero')
  const estado = texto(f, 'estado') === 'enviado' ? 'enviado' : 'preparando'
  let r: { estado?: string; error?: string; mia?: number } | null
  try {
    r = await rpcCuenta('avanzar_pedido', { numero, estado })
  } catch (e) {
    redirect(conParametro(volver, 'error', codigoDeBase(e, ['orden', 'cerrado', 'no_existe'])))
  }
  if (!r || r.error) redirect(conParametro(volver, 'error', r?.error === 'no_existe' ? 'no_existe' : 'servidor'))
  // lo que ve el comprador es "preparando" o la etapa de mi parte (enviado o listo para retirar)
  const mio = estado === 'preparando' ? 'preparando' : texto(f, 'modo') === 'retiro' ? 'listo_retiro' : 'enviado'
  // al empezar a prepararlo, se pasa a la lista de "Preparando", con el pedido a la vista: lo próximo es despacharlo
  const destino = estado === 'preparando' ? `/${idioma}/vender/pedidos?filtro=preparando` : volver
  redirect(`${conParametro(destino, 'avanzado', `${numero}.${mio}`)}#pedido-${numero}`)
}

export async function responderAccion(f: FormData) {
  const idioma = idiomaDe(f)
  const volver = volverA(f, `/${idioma}/vender/preguntas`)
  await exigirSesion(f, volver)
  const t = texto(f, 'texto').replace(/\s+/g, ' ')
  const pregunta = texto(f, 'pregunta')
  if (t.length < 2 || t.length > 800) redirect(conParametro(volver, 'error', `largo.${pregunta}`))
  let r: { slug?: string; error?: string } | null
  try {
    r = await rpcCuenta('vendedor_responder', { pregunta, texto: t })
  } catch (e) {
    redirect(conParametro(volver, 'error', `${codigoDeBase(e, ['largo', 'limite'])}.${pregunta}`))
  }
  if (!r || r.error) redirect(conParametro(volver, 'error', `no_existe.${pregunta}`))
  updateTag(`producto:${r.slug}`)
  redirect(conParametro(volver, 'guardado', 'respuesta'))
}
