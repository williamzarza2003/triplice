// El pedido tal como se cobra (todo congelado) y su comprobante en una cookie firmada.
// Con Supabase el pedido además queda en la base (registrar_pedido, con el rol de servicio). Sin Supabase,
// la vista previa en Vercel abre una copia de la base por instancia: la cookie firmada es lo que permite
// mostrar el comprobante aunque el pago se confirme en otra instancia.
import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { Desglose } from './desglose'

export type Estado = 'pendiente_pago' | 'confirmado'

export type Pedido = {
  numero: string
  clave: string
  estado: Estado
  proveedor: 'stripe' | 'simulado'
  region: string
  moneda: string
  idioma: string
  creado: string
  nombre: string
  email: string
  telefono: string
  entrega:
    | { modo: 'retiro'; puntos: { tienda: string; nombre: string; direccion: string; ciudad: string; horario: string; lat: number; lng: number; listoEnH: number }[] }
    | { modo: 'domicilio'; zona: string; direccion: string; diasMin: number; diasMax: number }
  items: { titulo: string; opciones: string; cantidad: number; precio: number; tienda: string; imagen: string | null }[]
  desglose: Pick<Desglose, 'productos' | 'envio' | 'descuento' | 'total' | 'impuestos'>
  cupon: string | null
}

export const COOKIE_PEDIDO = 'triplice_pedido'
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O ni 1/I, para dictarlo por teléfono

export function nuevoNumero() {
  const b = randomBytes(6)
  return 'TR-' + [...b].map((x) => ALFABETO[x % ALFABETO.length]).join('')
}
export const nuevaClave = () => randomBytes(18).toString('base64url')

function secreto() {
  const s = process.env.TRIPLICE_SECRETO
  if (s && s.length >= 32) return s
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    throw new Error('Falta TRIPLICE_SECRETO (32 caracteres o más) para firmar los comprobantes. Ver PENDIENTES.')
  }
  // vista previa y desarrollo: una clave fija alcanza (no hay plata real en juego: Stripe en modo de prueba)
  return 'triplice-vista-previa-sin-secreto-configurado-2026'
}

const firmar = (datos: string) => createHmac('sha256', secreto()).update(datos).digest('base64url')

export function sellar(p: Pedido): string {
  const datos = Buffer.from(JSON.stringify(p)).toString('base64url')
  return `${datos}.${firmar(datos)}`
}

export function abrir(valor: string | undefined): Pedido | null {
  if (!valor) return null
  const [datos, firma] = valor.split('.')
  if (!datos || !firma) return null
  const esperada = Buffer.from(firmar(datos))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null
  try {
    return JSON.parse(Buffer.from(datos, 'base64url').toString('utf8')) as Pedido
  } catch {
    return null
  }
}

export async function leerPedido(): Promise<Pedido | null> {
  return abrir((await cookies()).get(COOKIE_PEDIDO)?.value)
}

export async function guardarPedido(p: Pedido) {
  ;(await cookies()).set(COOKIE_PEDIDO, sellar(p), {
    path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 7,
  })
}
