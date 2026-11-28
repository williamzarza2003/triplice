// Trae la cotización del día de Cambio CDE (otro proyecto de la casa: una casa de cambios de Ciudad del Este).
// Su Supabase deja leer la vista `cotizaciones_actuales` con la clave anónima (es pública: la muestra su web).
// Solo lo usa el servidor (la Server Action del admin): las dos variables no llevan NEXT_PUBLIC_ y nunca llegan al
// navegador. Sin caché (la cotización cambia durante el día) y con un tiempo de espera corto: si Cambio CDE no
// responde, el admin carga a mano.
import { convertirCambioCde, type Conversion, type FilaCambioCde } from './conversion'

export type ResultadoCambioCde =
  | ({ ok: true } & Conversion)
  | { ok: false; error: 'sin_config'; faltan: string[] }
  | { ok: false; error: 'red' | 'respuesta' | 'vacia' }

export const VARIABLES_CAMBIO_CDE = ['CAMBIO_CDE_SUPABASE_URL', 'CAMBIO_CDE_ANON_KEY'] as const
const ESPERA_MS = 5000

export async function traerDeCambioCde(entorno: Record<string, string | undefined> = process.env): Promise<ResultadoCambioCde> {
  const url = entorno.CAMBIO_CDE_SUPABASE_URL?.trim()
  const clave = entorno.CAMBIO_CDE_ANON_KEY?.trim()
  const faltan = VARIABLES_CAMBIO_CDE.filter((v) => !entorno[v]?.trim())
  if (!url || !clave) return { ok: false, error: 'sin_config', faltan }
  let base: URL
  try {
    base = new URL(url)
    if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('protocolo')
  } catch {
    return { ok: false, error: 'sin_config', faltan: ['CAMBIO_CDE_SUPABASE_URL'] }
  }
  const destino = new URL('/rest/v1/cotizaciones_actuales', base)
  destino.searchParams.set('select', 'moneda,compra,venta,created_at')
  let filas: unknown
  try {
    const r = await fetch(destino, {
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(ESPERA_MS),
    })
    if (!r.ok) return { ok: false, error: 'respuesta' }
    filas = await r.json()
  } catch {
    return { ok: false, error: 'red' }
  }
  if (!Array.isArray(filas)) return { ok: false, error: 'respuesta' }
  const conversion = convertirCambioCde(filas.filter((f): f is FilaCambioCde => !!f && typeof f === 'object' && typeof f.moneda === 'string'))
  if (!Object.keys(conversion.tasas).length) return { ok: false, error: 'vacia' }
  return { ok: true, ...conversion }
}
