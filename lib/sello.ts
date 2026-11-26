// Datos firmados con HMAC para guardar en una cookie: el comprobante del invitado (fase 2) y la sesión de la
// cuenta de prueba (fase 3). El navegador puede leerlos pero no cambiarlos.
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

function secreto() {
  const s = process.env.TRIPLICE_SECRETO
  if (s && s.length >= 32) return s
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    throw new Error('Falta TRIPLICE_SECRETO (32 caracteres o más) para firmar las cookies. Ver PENDIENTES.')
  }
  // vista previa y desarrollo: una clave fija alcanza (no hay plata real en juego: Stripe en modo de prueba)
  return 'triplice-vista-previa-sin-secreto-configurado-2026'
}

const firmar = (datos: string) => createHmac('sha256', secreto()).update(datos).digest('base64url')

export function sellar(x: unknown): string {
  const datos = Buffer.from(JSON.stringify(x)).toString('base64url')
  return `${datos}.${firmar(datos)}`
}

export function abrirSello<T>(valor: string | undefined): T | null {
  if (!valor) return null
  const [datos, firma] = valor.split('.')
  if (!datos || !firma) return null
  const esperada = Buffer.from(firmar(datos))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  try {
    return JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
