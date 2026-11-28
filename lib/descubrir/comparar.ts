// Comparador: alinea los atributos de hasta cuatro productos y marca lo que cambia. Módulo puro (lo prueba
// tests/descubrimiento.test.ts con los datos que devuelve la función SQL comparar()).
import { valor } from '../catalogo/valores'
import type { Idioma } from '../i18n/idiomas'

export type ProductoComparar = {
  id: string; slug: string; titulo: string; marca: string; imagen: string | null
  precio: number; precio_lista: number | null; envio_gratis: boolean; stock: number; ofertas: number
  promedio: number | string; resenas: number; condicion: 'nuevo' | 'reacondicionado' | 'usado'
  categoria: string; categoria_padre: string | null; categoria_nombre: string
  garantia_meses: number; peso_g: number | null; atributos: Record<string, unknown>
  tienda: { slug: string; nombre: string; pais: string; ciudad: string; recomendacion: number | string | null }
}
export type AtributoComparar = { clave: string; nombre: string; unidad: string | null; tipo: 'texto' | 'numero' | 'booleano' | 'opcion' }
export type Comparacion = {
  familia: { slug: string; nombre: string } | null
  productos: ProductoComparar[]
  atributos: AtributoComparar[]
  fuera: { slug: string; titulo: string }[]
  no_disponibles: string[]
}

export type Celda = { texto: string | null; numero: number | null }
export type Fila = {
  clave: string
  nombre: string
  celdas: Celda[]
  /** el mismo valor en todos (se muestra una sola vez, en una celda que ocupa todas las columnas) */
  iguales: boolean
  /** el más grande de la fila, para dibujar cada número como una barra proporcional (solo filas numéricas que cambian) */
  escala: number | null
  /** el índice que conviene (el precio más bajo, la mejor reputación), si hay uno solo */
  mejor: number | null
}

/**
 * Arma una fila a partir de los valores de cada producto. `mejor`: si conviene el menor (precio) o el mayor
 * (reputación); sin eso, la fila no marca a nadie (más batería no siempre es mejor: depende de lo que busques).
 */
export function filaDe(clave: string, nombre: string, textos: (string | null)[], numeros?: (number | null)[], mejor?: 'menor' | 'mayor'): Fila {
  const celdas = textos.map((texto, i) => ({ texto, numero: numeros?.[i] ?? null }))
  const conValor = celdas.filter((c) => c.texto !== null)
  const iguales = celdas.length > 1 && conValor.length === celdas.length && conValor.every((c) => c.texto === conValor[0].texto)
  const nums = celdas.map((c) => c.numero).filter((n): n is number => n !== null)
  const escala = !iguales && nums.length >= 2 ? Math.max(...nums) : null
  let indiceMejor: number | null = null
  if (mejor && !iguales && nums.length >= 2) {
    const objetivo = mejor === 'menor' ? Math.min(...nums) : Math.max(...nums)
    const empatados = celdas.flatMap((c, i) => (c.numero === objetivo ? [i] : []))
    indiceMejor = empatados.length === 1 ? empatados[0] : null
  }
  return { clave, nombre, celdas, iguales, escala, mejor: indiceMejor }
}

/**
 * Una fila por atributo de la categoría, en el orden de la categoría, con el valor de cada producto en su columna.
 * Si ningún producto tiene un atributo, la fila no aparece; si alguno no lo tiene, su celda queda vacía ("—").
 */
export function alinear(productos: ProductoComparar[], atributos: AtributoComparar[], idioma: Idioma): Fila[] {
  const filas: Fila[] = []
  for (const a of atributos) {
    const crudos = productos.map((p) => (p.atributos ?? {})[a.clave])
    if (crudos.every((v) => v === undefined || v === null || v === '')) continue
    const textos = crudos.map((v) => (v === undefined || v === null || v === '' ? null
      : a.tipo === 'booleano' ? valor(Boolean(v), idioma)
      : `${valor(v, idioma)}${a.unidad ? (a.unidad === '"' ? '"' : ` ${a.unidad}`) : ''}`))
    const numeros = a.tipo === 'numero' ? crudos.map((v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : null)) : undefined
    filas.push(filaDe(a.clave, a.nombre, textos, numeros))
  }
  return filas
}

/** "Mostrar solo lo que cambia": saca las filas iguales en todos. */
export const soloLoQueCambia = (filas: Fila[]) => filas.filter((f) => !f.iguales)

/** Cuántas filas cambian (para el texto del interruptor: "Solo lo que cambia (7)"). */
export const cuantasCambian = (filas: Fila[]) => filas.filter((f) => !f.iguales).length
