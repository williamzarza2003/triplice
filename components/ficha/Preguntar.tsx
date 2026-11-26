'use client'
// Preguntar y responder en la ficha. Sin sesión, la acción manda a /entrar y vuelve a la ficha.
// Las respuestas de la tienda llevan su nombre; las de otros compradores, "Lo compró" si lo recibieron.
import { useActionState, useEffect, useRef } from 'react'
import { useTextos } from '@/lib/i18n/textos'
import type { EstadoPregunta } from '@/app/[idioma]/[mercado]/cuenta/acciones'
import { Icono } from '../Icono'
import s from './Opiniones.module.css'

type Accion = (e: EstadoPregunta, f: FormData) => Promise<EstadoPregunta>

export function FormPregunta({ accion, slug, idioma }: { accion: Accion; slug: string; idioma: string }) {
  const t = useTextos('ficha')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (estado?.ok) form.current?.reset() }, [estado])
  return (
    <form ref={form} action={enviar} className={s.preguntar}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="idioma" value={idioma} />
      <label htmlFor="nueva-pregunta"><b>{t('preguntarTitulo')}</b></label>
      <div className={s.preguntarFila}>
        <textarea id="nueva-pregunta" name="texto" rows={2} maxLength={500} required minLength={10} defaultValue={estado?.texto}
          placeholder={t('preguntarEjemplo')} aria-describedby="ayuda-pregunta" aria-invalid={estado?.error ? true : undefined} />
        <button type="submit" className="boton boton--marca" disabled={enviando}>{enviando ? t('enviando') : t('preguntar')}</button>
      </div>
      <p id="ayuda-pregunta" className={estado?.error ? s.errorChico : s.ayudaChica} role={estado?.error || estado?.ok ? 'status' : undefined}>
        {estado?.error ? t(`errorPregunta.${estado.error}`) : estado?.ok ? t('preguntaPublicada') : t('preguntarAyuda')}
      </p>
    </form>
  )
}

export function FormRespuesta({ accion, slug, idioma, pregunta }: { accion: Accion; slug: string; idioma: string; pregunta: string }) {
  const t = useTextos('ficha')
  const [estado, enviar, enviando] = useActionState(accion, null)
  if (estado?.ok) return <p className={s.ayudaChica} role="status"><Icono nombre="check" tam={14} /> {t('respuestaPublicada')}</p>
  return (
    <details className={s.responder}>
      <summary>{t('responder')}</summary>
      <form action={enviar}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="idioma" value={idioma} />
        <input type="hidden" name="pregunta" value={pregunta} />
        <label className="sr-only" htmlFor={`r-${pregunta}`}>{t('tuRespuesta')}</label>
        <textarea id={`r-${pregunta}`} name="texto" rows={2} maxLength={800} required defaultValue={estado?.texto} placeholder={t('tuRespuesta')} />
        {estado?.error && <p className={s.errorChico} role="alert">{t(`errorPregunta.${estado.error}`)}</p>}
        <button type="submit" className="boton boton--sec" disabled={enviando}>{enviando ? t('enviando') : t('publicarRespuesta')}</button>
      </form>
    </details>
  )
}
