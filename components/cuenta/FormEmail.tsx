'use client'
// Entrar con un enlace por email (Supabase Auth). Sin contraseña: el enlace inicia la sesión y, si la cuenta no
// existía, la crea.
import { useActionState } from 'react'
import { useTextos } from '@/lib/i18n/textos'
import type { EstadoEmail } from '@/app/[idioma]/[mercado]/cuenta/acciones'
import { Icono } from '../Icono'
import p from '../compra/Pago.module.css'
import s from './Cuenta.module.css'

export function FormEmail({ accion, idioma, volver }: {
  accion: (e: EstadoEmail, f: FormData) => Promise<EstadoEmail>; idioma: string; volver: string
}) {
  const t = useTextos('cuenta')
  const [estado, enviar, enviando] = useActionState(accion, { enviado: null, error: null })
  if (estado.enviado) {
    return (
      <div className={s.enviado} role="status">
        <p className={s.aviso}><Icono nombre="check" tam={18} />{t('entrar.enviadoTitulo')}</p>
        <p>{t('entrar.enviadoTexto')} <b>{estado.enviado}</b></p>
        <p className={s.letraChica}>{t('entrar.enviadoAyuda')}</p>
      </div>
    )
  }
  return (
    <form action={enviar} className={s.formEntrar} noValidate>
      <input type="hidden" name="idioma" value={idioma} />
      <input type="hidden" name="volver" value={volver} />
      <label className={p.campo}>
        <span>{t('entrar.email')}</span>
        <input type="email" name="email" autoComplete="email" inputMode="email" required
          aria-invalid={estado.error === 'email' || undefined} aria-describedby={estado.error ? 'error-email' : undefined} />
      </label>
      {estado.error && <p id="error-email" className={p.error} role="alert"><Icono nombre="info" tam={16} />{t(`entrar.errores.${estado.error}`)}</p>}
      <button type="submit" className="boton boton--marca boton--ancho" disabled={enviando}>{enviando ? t('enviando') : t('entrar.mandarEnlace')}</button>
    </form>
  )
}
