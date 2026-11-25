// Formas de lo que devuelven las funciones de la base (supabase/migrations/*_funciones.sql).
// Los importes vienen en centavos de dólar, sin impuestos.

export type TarjetaDatos = {
  id: string
  slug: string
  titulo: string
  marca: string
  imagen: string | null
  precio: number
  precio_lista: number | null
  envio_gratis: boolean
  tienda: { slug: string; nombre: string; pais: 'PY' | 'BR' | 'AR'; ciudad: string }
  ofertas: number
  stock: number
  promedio: number
  resenas: number
  variantes: number
  condicion: 'nuevo' | 'reacondicionado' | 'usado'
  ventas_30d: number
}

export type Faceta = { valor: string; n: number }
export type FacetaAtributo = { clave: string; nombre: string; unidad: string | null; tipo: string; valores: Faceta[] }

export type Busqueda = {
  total: number
  pagina: number
  por_pagina: number
  modo: 'todo' | 'exacto' | 'corregido' | 'aprox'
  corregido: string | null
  items: TarjetaDatos[]
  facetas: {
    marcas: Faceta[]
    precio: { min: number | null; max: number | null }
    estrellas: Faceta[]
    envio_gratis: number
    condicion: Faceta[]
    categorias: { slug: string; nombre: string; n: number }[]
    atributos: FacetaAtributo[]
  }
}

export type FiltrosBusqueda = {
  q?: string
  categoria?: string
  tienda?: string
  ofertas?: boolean
  marcas?: string[]
  precio_min?: number
  precio_max?: number
  estrellas?: number
  envio_gratis?: boolean
  condicion?: string[]
  atributos?: Record<string, string[]>
  orden?: 'relevancia' | 'precio_asc' | 'precio_desc' | 'novedades' | 'vendidos' | 'calificacion'
  pagina?: number
  por_pagina?: number
}

export type Sugerencias = {
  corregido: string | null
  productos: { slug: string; titulo: string; imagen: string | null; precio: number; categoria: string }[]
  categorias: { slug: string; nombre: string; n: number }[]
}

export type CategoriaArbol = {
  slug: string
  nombre: string
  icono: string
  n: number
  hijas: { slug: string; nombre: string; n: number }[]
}

export type TiendaResumen = {
  slug: string; nombre: string; color: string; pais: 'PY' | 'BR' | 'AR'; ciudad: string
  recomendacion?: number; opiniones?: number; a_tiempo?: number; respuesta_min?: number; ventas_12m?: number; lema?: string
}

export type Oferta = {
  id: string
  precio: number
  precio_lista: number | null
  stock: number
  envio_gratis: boolean
  preparacion_h: number
  tienda: TiendaResumen
}

export type Variante = { id: string; sku: string; opciones: Record<string, string>; imagenes: string[]; ofertas: Oferta[] }

export type Resena = {
  id: string; autor: string; pais: string; verificada: boolean; variante: string | null; estrellas: number
  titulo: string; texto: string; idioma: 'es' | 'pt' | 'en'; util: number; fecha: string
}

export type Ficha = {
  id: string
  slug: string
  marca: string
  titulo: string
  vinetas: string[]
  descripcion: string
  en_caja: string[]
  peso_g: number | null
  medidas_mm: [number, number, number] | null
  garantia_meses: number
  condicion: 'nuevo' | 'reacondicionado' | 'usado'
  pais_origen: string | null
  ventas_30d: number
  categoria: { slug: string; nombre: string }
  categoria_padre: { slug: string; nombre: string } | null
  atributos: { clave: string; nombre: string; unidad: string | null; tipo: string; valor: string | number | boolean }[]
  variantes: Variante[]
  resumen: { promedio: number; cantidad: number; verificadas: number; distribucion: [number, number, number, number, number] }
  resenas: Resena[]
  preguntas: { id: string; autor: string; texto: string; idioma: string; fecha: string; respuestas: { autor: string; es_vendedor: boolean; texto: string; fecha: string }[] }[]
  preguntas_total: number
  relacionados: TarjetaDatos[]
}

export type Inicio = {
  ofertas: TarjetaDatos[]
  vendidos: TarjetaDatos[]
  novedades: TarjetaDatos[]
  cerca: TarjetaDatos[]
  tiendas: (TiendaResumen & { lema: string; ventas_12m: number; recomendacion: number })[]
}

export type TiendaDatos = {
  slug: string; nombre: string; color: string; pais: 'PY' | 'BR' | 'AR'; ciudad: string; direccion: string | null
  lat: number | null; lng: number | null; horario: Record<string, string>; desde: number; lema: string; descripcion: string
  reputacion: { recomendacion: number; opiniones: number; ventas_12m: number; respuesta_min: number; a_tiempo: number } | null
  productos: number
  resenas: { autor: string; pais: string; estrellas: number; texto: string; idioma: string; producto: string; slug: string }[]
}

export type Cotizaciones = { tasas: { PYG: number; BRL: number; ARS: number }; desde: string }
