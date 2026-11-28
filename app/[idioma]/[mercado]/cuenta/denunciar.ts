'use server'
// Denunciar una reseña o una pregunta desde la ficha. Corre como la persona que entró; la base pone quién y cuándo,
// deja una denuncia por cuenta y por contenido y hasta 10 por hora (denuncia_validar, migración de la fase 5).
// La ficha sigue cacheada igual: la denuncia no cambia nada de lo que se ve hasta que un admin decide.
import { redirect } from 'next/navigation'
import { rpcCuenta, usuarioActual } from '@/lib/cuenta/sesion'
import { esIdioma, IDIOMA_PREDETERMINADO } from '@/lib/i18n/idiomas'

export type EstadoDenuncia = { ok?: boolean; error?: 'motivo' | 'ya' | 'limite' | 'propia' | 'no_existe' | 'servidor' } | null

const MOTIVOS = ['ofensiva', 'spam', 'datos_personales', 'no_es_del_producto', 'otro']

export async function denunciarAccion(_: EstadoDenuncia, f: FormData): Promise<EstadoDenuncia> {
  const idioma = esIdioma(String(f.get('idioma'))) ? String(f.get('idioma')) : IDIOMA_PREDETERMINADO
  const slug = String(f.get('slug') ?? '')
  if (!(await usuarioActual())) redirect(`/${idioma}/entrar?volver=${encodeURIComponent(`/${idioma}/p/${/^[a-z0-9-]{1,160}$/.test(slug) ? slug : ''}`)}`)
  const motivo = String(f.get('motivo') ?? '')
  if (!MOTIVOS.includes(motivo)) return { error: 'motivo' }
  try {
    const r = await rpcCuenta<{ ok?: boolean; error?: string }>('denunciar', {
      tipo: String(f.get('tipo') ?? ''), id: String(f.get('id') ?? ''), motivo, detalle: String(f.get('detalle') ?? '').slice(0, 300),
    })
    if (r?.ok) return { ok: true }
    const e = r?.error
    return { error: e === 'ya' || e === 'limite' || e === 'propia' || e === 'no_existe' || e === 'motivo' ? e : 'servidor' }
  } catch (e) {
    console.error('No se guardó la denuncia', e)
    return { error: 'servidor' }
  }
}
