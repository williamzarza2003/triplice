// Lo que devuelven las funciones del panel de administración (supabase/migrations/20261130000100_admin.sql).

export type NoAdmin = { error: 'no_admin' }
/** Sin sesión (null) o sin permiso: la página muestra qué es esto en vez del panel. */
export function noEsAdmin<T>(x: T | NoAdmin | null): x is NoAdmin | null {
  return !x || (typeof x === 'object' && (x as { error?: string }).error === 'no_admin')
}

export type Tres = { es: string; pt: string; en: string }

export type Accion = {
  id: number; admin_nombre: string; accion: string; objeto_tipo: string; objeto_id: string; objeto_nombre: string | null
  motivo: string | null; creado: string; antes?: Record<string, unknown> | null; despues?: Record<string, unknown> | null
}

export type CotizacionVigente = { moneda: 'PYG' | 'BRL' | 'ARS'; por_usd: number; fuente: string; desde: string; anterior: number | null }

export type ResumenAdmin = {
  tiendas: { pendientes: number; suspendidas: number; aprobadas: number; mas_vieja: string | null; nombres: string[] }
  denuncias: { contenidos: number; total: number; mas_vieja: string | null }
  recientes: number
  cotizaciones: CotizacionVigente[]
  cotizacion_vieja: boolean
  registro: Accion[]
}

export type EstadoTienda = 'pendiente' | 'aprobada' | 'suspendida'
export type TiendaAdmin = {
  id: string; slug: string; nombre: string; color: string; pais: string; ciudad: string; desde: number; estado: EstadoTienda
  estado_motivo: string | null; estado_desde: string; creado: string; duenio: { nombre: string; rol: string } | null
  reputacion: number | null; ventas_12m: number; opiniones: number; productos: number; ofertas: number
}
export type ListaTiendas = {
  estado: EstadoTienda; cuentas: Record<EstadoTienda, number>; items: TiendaAdmin[]
  sin_duenio: { slug: string; nombre: string; estado: EstadoTienda }[]
}

export type TipoContenido = 'resena' | 'pregunta' | 'respuesta'
export type FiltroModeracion = 'denunciadas' | 'recientes' | 'ocultas'
export type Contenido = {
  tipo: TipoContenido; id: string; titulo: string | null; texto: string; estrellas: number | null; autor: string; pais: string | null
  idioma: string; creado: string; estado: string; motivo: string | null; verificada: boolean | null; pregunta: string | null
  denuncias: { motivo: string; detalle: string | null; creado: string }[]
  producto: { slug: string; titulo: string }
}
export type ColaModeracion = { filtro: FiltroModeracion; cuentas: Record<FiltroModeracion, number>; items: Contenido[] }

export type CategoriaAdmin = {
  id: number; slug: string; nombre: Tres; texto: string; icono?: string | null; orden: number
  atributos: number; reglas: number; productos: number; padre?: number
  hijas?: CategoriaAdmin[]
}
export type AtributoAdmin = {
  id: number; clave: string; nombre: Tres; texto: string; tipo: 'texto' | 'numero' | 'booleano' | 'opcion'; unidad: string | null
  opciones: string[] | null; filtrable: boolean; orden: number; usos: number
}
export type CategoriaDetalle = {
  id: number; slug: string; nombre: Tres; texto: string; icono: string | null; padre: number | null; padre_texto: string | null
  productos: number; atributos: AtributoAdmin[]; heredados: { clave: string; texto: string; tipo: string; unidad: string | null }[]
}

export type ReglaAdmin = {
  id: number; pais: 'PY' | 'BR' | 'AR'; nombre: Tres; tasa: number | string; categoria_id: number | null; categoria: string | null
  categoria_texto: string | null; categoria_padre: string | null; productos: number | null
}
export type ImpuestosAdmin = {
  reglas: ReglaAdmin[]
  categorias: { id: number; slug: string; texto: string; padre: string | null; padre_texto: string | null }[]
}
export type Ejemplo = { slug: string; titulo: string; precio: number; categoria: string; categoria_padre: string | null; imagen: string | null }

export type CotizacionesAdmin = {
  vigentes: Partial<Record<'PYG' | 'BRL' | 'ARS', { por_usd: number | string; fuente: string; desde: string }>>
  historial: { moneda: string; por_usd: number | string; fuente: string; desde: string; anterior: number | string | null; quien: string | null }[]
}

/** "Mate y Guampa" → "mate-y-guampa" (sin tildes ni signos), como los slugs de la base. */
export function normalizarSlug(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
}

/** Los íconos que puede llevar una categoría principal (los del menú del encabezado: components/Icono.tsx). */
export const ICONOS_CATEGORIA = ['celular', 'notebook', 'auricular', 'perfume', 'reloj', 'pantalla', 'enchufe', 'olla', 'sillon', 'florero', 'lampara',
  'llave', 'hoja', 'canasta', 'gota', 'pelota', 'dado', 'lapiz', 'auto', 'tienda', 'caja', 'estrella']
