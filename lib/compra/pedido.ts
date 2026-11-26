// El pedido tal como se cobra (todo congelado) y su comprobante en una cookie firmada.
// Con Supabase el pedido además queda en la base (registrar_pedido, con el rol de servicio). Sin Supabase,
// la vista previa en Vercel abre una copia de la base por instancia: la cookie firmada es lo que permite
// mostrar el comprobante aunque el pago se confirme en otra instancia.
import 'server-only'
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { abrirSello, sellar as sellarDatos } from '../sello'
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

export const sellar = (p: Pedido) => sellarDatos(p)
export const abrir = (valor: string | undefined) => abrirSello<Pedido>(valor)

export async function leerPedido(): Promise<Pedido | null> {
  return abrir((await cookies()).get(COOKIE_PEDIDO)?.value)
}

export async function guardarPedido(p: Pedido) {
  ;(await cookies()).set(COOKIE_PEDIDO, sellar(p), {
    path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 7,
  })
}
