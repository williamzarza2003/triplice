// Fotos de los productos que sube una tienda. Igual que las de las opiniones (lib/cuenta/fotos.ts): el servidor las
// achica a 1200 px como máximo, les saca el EXIF (ni la ubicación ni el modelo del celular quedan publicados) y las pasa
// a WebP. Además las guarda en los tres anchos que usa el catálogo (240, 480 y 800 px), así la tarjeta y la ficha las
// piden igual que las demás (lib/imagenes.ts).
// - Con Supabase: Storage, bucket `productos`, carpeta de la tienda (lo exige la política de la migración de la fase 4).
// - Sin Supabase: la memoria del servidor, igual que la base embebida (se borran al reiniciar; la página lo avisa).
import 'server-only'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { fotosEnMemoria } from '../cuenta/fotos'
import { modoCuentas } from '../cuenta/sesion'
import { ANCHOS } from '../imagenes'
import { supabaseServidor } from '../supabase/servidor'

export const MAX_FOTOS_VARIANTE = 4

async function anchos(a: File): Promise<[string, Buffer][]> {
  const original = sharp(Buffer.from(await a.arrayBuffer())).rotate() // respeta la orientación antes de descartar el EXIF
  const grande = await original.clone().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
  const salida: [string, Buffer][] = [['', grande]]
  for (const w of ANCHOS) {
    // fondo blanco y cuadrado, como las fotos del catálogo: la grilla no salta aunque la foto sea apaisada
    salida.push([`-${w}`, await sharp(grande).resize({ width: w, height: w, fit: 'contain', background: '#ffffff' }).webp({ quality: 78 }).toBuffer()])
  }
  return salida
}

/** Guarda las fotos de una variante y devuelve sus ids para la base ("subida:<tienda>/<archivo>"). */
export async function guardarFotosProducto(tienda: string, archivos: File[]): Promise<string[]> {
  const ids: string[] = []
  for (const a of archivos) {
    const nombre = `${tienda}/${randomUUID()}`
    const partes = await anchos(a)
    if (modoCuentas === 'supabase') {
      const sb = await supabaseServidor()
      for (const [sufijo, datos] of partes) {
        const { error } = await sb.storage.from('productos').upload(`${nombre}${sufijo}.webp`, datos, { contentType: 'image/webp' })
        if (error) throw new Error(`No se pudo subir la foto (${error.message})`)
      }
    } else {
      for (const [sufijo, datos] of partes) fotosEnMemoria.set(`productos/${nombre}${sufijo}${sufijo ? '.webp' : ''}`, datos)
    }
    ids.push(`subida:${nombre}`)
  }
  return ids
}
