// Cuentas y formatos del panel del vendedor (módulo puro: se prueba con Vitest).
import { LOCALE, type Idioma } from '../i18n/idiomas'
import { REGLAS } from '../precios'
import type { Moneda } from '../region'
import type { Reputacion } from './tipos'

/** Montos de la base (unidad mínima) en corto, para los ejes y los números grandes: "₲ 85,0 M", "R$ 12,4 mil". */
export function montoCorto(minimo: number, moneda: string, idioma: Idioma) {
  const r = REGLAS[moneda as Moneda] ?? REGLAS.USD
  const valor = minimo / 10 ** r.decimales
  const n = new Intl.NumberFormat(LOCALE[idioma], { notation: 'compact', maximumFractionDigits: valor >= 1e6 ? 1 : 0 }).format(valor)
  return `${r.simbolo} ${n}`
}

/** Variación contra el período anterior, en %; null si antes no hubo ventas. */
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null
  return Math.round(((actual - anterior) / anterior) * 1000) / 10
}

/** Valores "lindos" para el eje: 0, 2 M, 4 M, 6 M… con el máximo arriba de todo. */
export function marcasEje(maximo: number, cuantas = 4): number[] {
  if (maximo <= 0) return [0]
  const crudo = maximo / cuantas
  const potencia = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo) ?? crudo
  return Array.from({ length: Math.ceil(maximo / paso) + 1 }, (_, i) => i * paso)
}

export type Factor = {
  clave: 'opiniones' | 'a_tiempo' | 'devoluciones' | 'respondidas' | 'respuesta'
  peso: number; puntaje: number | null; aporte: number | null
}

/** Los mismos pesos que la vista materializada reputacion_calculo (migración de la fase 4). */
export const PESOS: Record<Factor['clave'], number> = { opiniones: 0.35, a_tiempo: 0.3, devoluciones: 0.15, respondidas: 0.1, respuesta: 0.1 }

/**
 * Cuánto aporta cada factor al número final. Los factores sin datos no cuentan y su peso se reparte entre los demás,
 * igual que en la base: la suma de los aportes da la reputación.
 */
export function factores(r: Reputacion): Factor[] {
  const puntajes: Record<Factor['clave'], number | null> = {
    opiniones: r.p_opiniones, a_tiempo: r.p_a_tiempo, devoluciones: r.p_devoluciones, respondidas: r.p_respondidas, respuesta: r.p_respuesta,
  }
  const total = Object.entries(PESOS).reduce((s, [k, w]) => s + (puntajes[k as Factor['clave']] === null ? 0 : w), 0)
  return (Object.keys(PESOS) as Factor['clave'][]).map((clave) => {
    const puntaje = puntajes[clave] === null ? null : Number(puntajes[clave])
    const peso = total ? PESOS[clave] / total : 0
    return { clave, peso, puntaje, aporte: puntaje === null ? null : Math.round(puntaje * peso * 10) / 10 }
  })
}

/** "Buen día" / "Buenas tardes" / "Buenas noches" según la hora de Asunción. */
export function momentoDelDia(ahora = new Date()): 'manana' | 'tarde' | 'noche' {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Asuncion' }).format(ahora)) % 24
  return h >= 5 && h < 12 ? 'manana' : h >= 12 && h < 19 ? 'tarde' : 'noche'
}

/** "hace 40 minutos", "hace 3 horas", "hace 2 días" (en el idioma de la página). */
export function hace(fecha: string, idioma: Idioma, ahora = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat(LOCALE[idioma], { numeric: 'auto' })
  const min = Math.round((new Date(fecha).getTime() - ahora) / 60_000)
  if (Math.abs(min) < 60) return rtf.format(min, 'minute')
  const h = Math.round(min / 60)
  if (Math.abs(h) < 24) return rtf.format(h, 'hour')
  const d = Math.round(h / 24)
  if (Math.abs(d) < 45) return rtf.format(d, 'day')
  return rtf.format(Math.round(d / 30), 'month')
}
