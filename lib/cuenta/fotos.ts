// Fotos de las opiniones. El servidor las recibe, las achica a 1200 px y las pasa a WebP (sin datos EXIF: ni la
// ubicación ni el modelo del celular quedan publicados), y las guarda:
// - con Supabase, en Storage (bucket `resenas`, carpeta del usuario: lo exige la política de la migración);
// - sin Supabase, en la memoria del servidor, igual que la base embebida (se borran al reiniciar).
import 'server-only'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { supabaseServidor } from '../supabase/servidor'
import { modoCuentas } from './sesion'

export const MAX_FOTOS = 4
export const MAX_BYTES = 8 * 1024 * 1024

type Almacen = Map<string, Buffer>
const g = globalThis as { __fotosTriplice?: Almacen }
export const fotosEnMemoria: Almacen = (g.__fotosTriplice ??= new Map())

export type ErrorFoto = 'tipo' | 'grande' | 'muchas' | 'ilegible'

export function revisarFotos(archivos: File[]): ErrorFoto | null {
  if (archivos.length > MAX_FOTOS) return 'muchas'
  for (const a of archivos) {
    if (!a.type.startsWith('image/')) return 'tipo'
    if (a.size > MAX_BYTES) return 'grande'
  }
  return null
}

export async function aWebp(a: File): Promise<Buffer> {
  return sharp(Buffer.from(await a.arrayBuffer()))
    .rotate() // respeta la orientación del celular antes de descartar el EXIF
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer()
}

/** Guarda las fotos y devuelve sus rutas (`<uid>/<archivo>.webp`). */
export async function guardarFotos(uid: string, archivos: File[]): Promise<string[]> {
  const rutas: string[] = []
  for (const a of archivos) {
    const datos = await aWebp(a)
    const ruta = `${uid}/${randomUUID()}.webp`
    if (modoCuentas === 'supabase') {
      const sb = await supabaseServidor()
      const { error } = await sb.storage.from('resenas').upload(ruta, datos, { contentType: 'image/webp' })
      if (error) throw new Error(`No se pudo subir la foto (${error.message})`)
    } else {
      fotosEnMemoria.set(ruta, datos)
    }
    rutas.push(ruta)
  }
  return rutas
}
