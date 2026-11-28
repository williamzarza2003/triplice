'use client'
// Crear una lista o cambiarle el nombre. Formulario común con Server Action (funciona sin JavaScript); los errores
// vuelven al lado del campo y dicen cómo resolverlo.
import { useActionState } from 'react'
import type { ResultadoLista } from '@/app/[idioma]/[mercado]/descubrir/acciones'
import { useTextos } from '@/lib/i18n/textos'
import s from './Listas.module.css'

type Props = {
  accion: (e: ResultadoLista | null, f: FormData) => Promise<ResultadoLista>
  idioma: string; id?: string; nombre?: string; etiqueta: string; boton: string; ejemplo?: string
}

export function FormLista({ accion, idioma, id, nombre, etiqueta, boton, ejemplo }: Props) {
  const t = useTextos('descubrir')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const campo = `nombre-${id ?? 'nueva'}`
  return (
    <form action={enviar} className={s.nueva}>
      <input type="hidden" name="idioma" value={idioma} />
      {id ? <input type="hidden" name="id" value={id} /> : <input type="hidden" name="ir" value="1" />}
      <label htmlFor={campo}>{etiqueta}</label>
      <div>
        <input id={campo} name="nombre" className={s.campo} maxLength={60} required defaultValue={nombre} placeholder={ejemplo}
          autoComplete="off" aria-invalid={Boolean(estado?.error) || undefined} aria-describedby={`${campo}-error`} />
        <button type="submit" className="boton boton--marca" disabled={enviando}>{boton}</button>
      </div>
      <p id={`${campo}-error`} className={s.error} role="alert">{estado?.error ? t(`errores.${estado.error}`) : ''}</p>
      {estado?.ok && id && <p className={s.nota} role="status">{t('nombreGuardado')}</p>}
    </form>
  )
}
