'use client'
// "Denunciar" una reseña o una pregunta. Solo aparece con la sesión iniciada (el saludo del encabezado está en una
// cookie que lee el navegador: la ficha sigue cacheada igual para todos). Es un <details> con un formulario que manda
// una Server Action: no abre ventanas ni pide nada más.
import { useActionState, useSyncExternalStore } from 'react'
import type { EstadoDenuncia } from '@/app/[idioma]/[mercado]/cuenta/denunciar'
import { COOKIE_HOLA, leerHola } from '@/lib/cuenta/hola'
import { useTextos } from '@/lib/i18n/textos'
import s from './Denunciar.module.css'

type Accion = (e: EstadoDenuncia, f: FormData) => Promise<EstadoDenuncia>
const MOTIVOS = ['spam', 'ofensiva', 'datos_personales', 'no_es_del_producto', 'otro'] as const

const leer = () => !!leerHola(document.cookie.split('; ').find((x) => x.startsWith(`${COOKIE_HOLA}=`))?.slice(COOKIE_HOLA.length + 1))
const nada = () => () => {}

export function Denunciar({ accion, tipo, id, slug, idioma }: { accion: Accion; tipo: 'resena' | 'pregunta'; id: string; slug: string; idioma: string }) {
  const t = useTextos('admin')
  const conSesion = useSyncExternalStore(nada, leer, () => false)
  const [estado, enviar, enviando] = useActionState(accion, null)
  if (!conSesion) return null
  if (estado?.ok) return <p className={s.gracias} role="status">{t('denunciar.gracias')}</p>
  return (
    <details className={s.denunciar}>
      <summary>{t(`denunciar.abrir.${tipo}`)}</summary>
      <form action={enviar}>
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="idioma" value={idioma} />
        <fieldset>
          <legend>{t('denunciar.porque')}</legend>
          {MOTIVOS.map((m, i) => (
            <label key={m}><input type="radio" name="motivo" value={m} required defaultChecked={i === 0} />{t(`moderacion.motivos.${m}`)}</label>
          ))}
        </fieldset>
        <label className="sr-only" htmlFor={`d-${id}`}>{t('denunciar.detalle')}</label>
        <input id={`d-${id}`} name="detalle" maxLength={300} placeholder={t('denunciar.detalle')} />
        {estado?.error && <p className={s.error} role="alert">{t(`denunciar.errores.${estado.error}`)}</p>}
        <button type="submit" className="boton boton--sec" disabled={enviando}>{enviando ? t('denunciar.enviando') : t('denunciar.enviar')}</button>
      </form>
    </details>
  )
}
