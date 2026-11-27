// Lo que devuelven las funciones del panel del vendedor (supabase/migrations/20261128000100_vendedor.sql).

export type SinTienda = { error: 'sin_tienda' }
export const sinTienda = (x: unknown): x is SinTienda => !!x && typeof x === 'object' && (x as { error?: string }).error === 'sin_tienda'

export type TiendaPanel = { id?: string; slug: string; nombre: string; color: string; ciudad: string; pais: string; estado: string }

export type Reputacion = {
  reputacion: number | null; calculado: string; pedidos_12m: number
  opiniones_total: number; opiniones_buenas: number; p_opiniones: number | null
  entregas_cerradas: number; entregas_a_tiempo: number; p_a_tiempo: number | null
  items_entregados: number; items_devueltos: number; p_devoluciones: number | null
  preguntas_total: number; preguntas_respondidas: number; p_respondidas: number | null
  respuesta_mediana_min: number | null; p_respuesta: number | null
}

export type Resumen = {
  tienda: TiendaPanel; moneda: string; dias: number; desde: string; hasta: string
  ventas: { monto: number; pedidos: number; unidades: number; ticket: number }
  anterior: { monto: number; pedidos: number }
  serie: { dia: string; monto: number; pedidos: number }[]
  top: { slug: string; titulo: string; unidades: number; monto: number; imagen: string | null }[]
  pedidos: { por_preparar: number; preparando: number; proximo_limite: string | null }
  preguntas: { sin_responder: number; mas_vieja: string | null }
  poco_stock: { id: string; titulo: string; opciones: Record<string, string>; stock: number }[]
  reputacion: Reputacion | null
}

export type FiltroProductos = 'todos' | 'activos' | 'pausados' | 'sin_stock'
export type ProductoLista = {
  id: string; slug: string; titulo: string; marca: string; editable: boolean; activa: boolean; stock: number; precio: number
  imagen: string | null; estado: Exclude<FiltroProductos, 'todos'>
  variantes: { oferta: string; sku: string; opciones: Record<string, string>; stock: number; activa: boolean; precio: number }[]
}
export type ListaProductos = { total: number; pagina: number; cuentas: Record<FiltroProductos, number>; items: ProductoLista[] }

export type ProductoEdicion = {
  id: string; slug: string; editable: boolean; marca: string; titulo: Record<string, string>; descripcion: Record<string, string>
  vinetas: Record<string, string[]>; atributos: Record<string, string | number | boolean>; garantia_meses: number; condicion: string
  peso_g: number | null; categoria: string
  variantes: {
    id: string; sku: string; opciones: Record<string, string>; imagenes: string[]
    oferta: { id: string; precio: number; lista: number | null; stock: number; activa: boolean; envio_gratis: boolean; preparacion_h: number } | null
  }[]
}

export type CategoriaForm = {
  slug: string; nombre: string; padre: string; padre_slug: string
  atributos: { clave: string; nombre: string; tipo: 'texto' | 'numero' | 'booleano' | 'opcion'; unidad: string | null }[]
}

export type FiltroPedidos = 'por_preparar' | 'preparando' | 'en_camino' | 'entregados' | 'todos'
export type PedidoVendedor = {
  numero: string; creado: string; moneda: string; grupo: FiltroPedidos | 'cancelados'; estado: string; modo: 'retiro' | 'domicilio'
  comprador: string | null; destino: string | null; limite: string; atrasado: boolean; total: number; otras_tiendas: boolean
  items: { titulo: string; opciones: Record<string, string>; cantidad: number; precio: number; imagen: string | null }[]
  eventos: { estado: string; creado: string }[]
}
export type ListaPedidos = { cuentas: Record<FiltroPedidos, number>; items: PedidoVendedor[] }

export type PreguntaVendedor = {
  id: string; texto: string; autor: string; idioma: string; creado: string; respondida: boolean; slug: string; producto: string
  imagen: string | null; respuestas: { autor: string; texto: string; creado: string; mia: boolean }[]
}
export type ListaPreguntas = { cuentas: { sin_responder: number; todas: number }; items: PreguntaVendedor[] }
