// Fotos de opiniones guardadas en la memoria del servidor (solo sin Supabase: ver lib/cuenta/fotos.ts).
import { fotosEnMemoria } from '@/lib/cuenta/fotos'

export async function GET(_: Request, { params }: RouteContext<'/api/fotos/[...ruta]'>) {
  const { ruta } = await params
  const datos = fotosEnMemoria.get(ruta.join('/'))
  if (!datos) return new Response('Esta foto ya no está: la vista previa sin Supabase guarda las fotos en la memoria del servidor.', { status: 404 })
  return new Response(new Uint8Array(datos), {
    headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' },
  })
}
