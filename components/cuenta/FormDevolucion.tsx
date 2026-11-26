'use client'
// Pedir la devolución de un producto: motivo, qué preferís (reembolso o cambio) y un detalle opcional.
// Va dentro de un <details>, así que sin JavaScript también se abre y se manda.
import { useActionState } from 'react'
import { useTextos } from '@/lib/i18n/textos'
import type { EstadoDevolucion } from '@/app/[idioma]/[mercado]/cuenta/acciones'
import { Icono } from '../Icono'
import p from '../compra/Pago.module.css'
import s from './Cuenta.module.css'

const MOTIVOS = ['fallado', 'distinto', 'incompleto', 'arrepentido', 'otro'] as const

export function FormDevolucion({ accion, item, numero, idioma, hasta }: {
  accion: (e: EstadoDevolucion, f: FormData) => Promise<EstadoDevolucion>; item: number; numero: string; idioma: string; hasta: string
}) {
  const t = useTextos('cuenta')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const id = `dev-${item}`
  return (
    <details className={s.devolucion}>
      <summary className="boton boton--sec"><Icono nombre="devolver" tam={18} />{t('detalle.devolver')}</summary>
      <form action={enviar} className={s.formDevolucion} aria-describedby={`${id}-plazo`}>
        <input type="hidden" name="item" value={item} />
        <input type="hidden" name="numero" value={numero} />
        <input type="hidden" name="idioma" value={idioma} />
        <p id={`${id}-plazo`} className={s.letraChica}>{t('devolucion.plazo', { fecha: hasta })}</p>
        <fieldset>
          <legend>{t('devolucion.motivo')}</legend>
          {MOTIVOS.map((m, i) => (
            <label key={m} className={s.radio}>
              <input type="radio" name="motivo" value={m} required defaultChecked={i === 0} />{t(`devolucion.motivos.${m}`)}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t('devolucion.preferis')}</legend>
          <label className={s.radio}><input type="radio" name="resolucion" value="reembolso" defaultChecked />{t('devolucion.reembolso')}</label>
          <label className={s.radio}><input type="radio" name="resolucion" value="cambio" />{t('devolucion.cambio')}</label>
        </fieldset>
        <label className={p.campo}>
          <span>{t('devolucion.detalle')} <small>{t('opcional')}</small></span>
          <textarea name="detalle" maxLength={600} rows={3} />
        </label>
        {estado?.error && <p className={p.error} role="alert"><Icono nombre="info" tam={16} />{t(`devolucion.errores.${estado.error}`)}</p>}
        <button type="submit" className="boton boton--marca" disabled={enviando}>{enviando ? t('enviando') : t('devolucion.enviar')}</button>
      </form>
    </details>
  )
}
