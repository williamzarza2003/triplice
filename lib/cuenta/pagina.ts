// Lo que comparten las páginas de la cuenta: la sesión obligatoria y los montos guardados en la unidad mínima.
import 'server-only'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import type { Idioma } from '../i18n/idiomas'
import { formatear, REGLAS } from '../precios'
import type { Moneda } from '../region'
import { modoCuentas, olvidarSaludo, usuarioActual } from './sesion'

/** Se arma en cada visita y, sin sesión, manda a /entrar con la vuelta a esta página. */
export async function conSesion(idioma: Idioma, camino: string) {
  await connection()
  const u = await usuarioActual()
  if (!u) {
    await olvidarSaludo()
    redirect(`/${idioma}/entrar?volver=${encodeURIComponent(`/${idioma}${camino}`)}`)
  }
  return { usuario: u, demo: modoCuentas === 'demo' }
}

/** La base guarda ₲ y $ enteros, y R$ y US$ en centavos. */
export const montoMinimo = (n: number, m: string) => formatear(Number(n) / 10 ** REGLAS[m as Moneda].decimales, m as Moneda)

import COLORES from '../catalogo/colores.json'
const NOMBRE_COLOR = COLORES as Record<string, Record<string, string>>

/** {"color":"grafito","almacenamiento":"128 GB"} → "Grafito · 128 GB" */
export const opcionesTexto = (o: Record<string, string> | null | undefined, idioma: Idioma) =>
  Object.entries(o ?? {}).map(([k, v]) => (k === 'color' ? NOMBRE_COLOR[v]?.[idioma] ?? v : v)).join(' · ')
