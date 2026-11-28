'use client'
// Cargar la cotización: a mano o trayéndola de Cambio CDE. Siempre hay una vista previa (valor actual, valor nuevo y
// variación, con aviso si pasa del 5 %) y recién al confirmar se guarda. Sin JavaScript funciona igual.
import { useActionState } from 'react'
import type { EstadoCotizacion } from '@/app/[idioma]/[mercado]/admin/acciones'
import { esCambioGrande, MONEDAS_COTIZADAS } from '@/lib/admin/conversion'
import { useTextos } from '@/lib/i18n/textos'
import { Icono } from '../Icono'
import v from '../vender/Vender.module.css'
import s from './Admin.module.css'

type Props = {
  accion: (e: EstadoCotizacion, f: FormData) => Promise<EstadoCotizacion>
  idioma: string
  locale: string
  vigentes: Partial<Record<string, { por_usd: number | string; fuente: string; desde: string }>>
  cambioCdeListo: boolean
}

const LOCALE_MONEDA = { PYG: 'es-PY', BRL: 'pt-BR', ARS: 'es-AR' } as const

export function FormCotizacion({ accion, idioma, locale, vigentes, cambioCdeListo }: Props) {
  const t = useTextos('admin')
  const [estado, enviar, enviando] = useActionState(accion, null)
  const numero = (m: (typeof MONEDAS_COTIZADAS)[number], n: number | string) =>
    new Intl.NumberFormat(LOCALE_MONEDA[m], { minimumFractionDigits: m === 'BRL' ? 2 : 0, maximumFractionDigits: 4 }).format(Number(n))
  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
  const hora = (x: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Asuncion' }).format(new Date(x))
  const prop = estado?.propuesta
  const grande = prop ? Object.values(prop.variaciones).some((x) => esCambioGrande(x ?? null)) : false
  const errorMsj = estado?.error
    ? t(`errores.${estado.error}`, { moneda: estado.moneda ?? '', faltan: (estado.faltan ?? []).join(' y ') })
    : ''

  return (
    <div className={s.cotizar}>
      <form action={enviar} className={s.cotizar}>
        <input type="hidden" name="idioma" value={idioma} />
        <div className={s.monedas}>
          {MONEDAS_COTIZADAS.map((m) => {
            const vig = vigentes[m]
            return (
              <div key={m} className={s.moneda}>
                <label htmlFor={`cot-${m}`}>{t(`cotizaciones.moneda.${m}`)}</label>
                <input id={`cot-${m}`} name={m} inputMode="decimal" autoComplete="off" aria-describedby={`cot-${m}-ayuda`}
                  defaultValue={estado?.valores?.[m] ?? (vig ? numero(m, vig.por_usd) : '')}
                  aria-invalid={estado?.error === 'numero' && estado.moneda === m ? true : undefined} />
                <small id={`cot-${m}-ayuda`}>{vig ? t('cotizaciones.vigente', { valor: numero(m, vig.por_usd), desde: hora(vig.desde) }) : t('cotizaciones.sinVigente')}</small>
              </div>
            )
          })}
        </div>
        <div className={s.botones}>
          <button type="submit" name="paso" value="ver" className="boton boton--marca" disabled={enviando}>{t('cotizaciones.ver')}</button>
        </div>
        <div className={s.cambioCde}>
          <p>{cambioCdeListo ? t('cotizaciones.cambioCdeTexto') : t('cotizaciones.cambioCdeSinConfig')}</p>
          <button type="submit" name="paso" value="traer" className="boton boton--sec" disabled={enviando}>{t('cotizaciones.traer')}</button>
        </div>
      </form>

      {estado?.error && <p className={v.alerta} role="alert"><Icono nombre="info" tam={18} /><span>{errorMsj}</span></p>}

      {prop && (
        <form action={enviar} className={s.propuesta} aria-labelledby="t-propuesta">
          <input type="hidden" name="idioma" value={idioma} />
          <input type="hidden" name="paso" value="confirmar" />
          <input type="hidden" name="fuente" value={prop.fuente} />
          {Object.entries(prop.tasas).map(([m, n]) => <input key={m} type="hidden" name={`confirmar.${m}`} value={String(n)} />)}
          <h2 id="t-propuesta">{prop.fuente === 'cambio-cde' ? t('cotizaciones.propuestaCde', { hora: prop.desde ? hora(prop.desde) : '—' }) : t('cotizaciones.propuesta')}</h2>
          <table>
            <thead><tr><th scope="col">{t('cotizaciones.monedaCol')}</th><th scope="col">{t('cotizaciones.actual')}</th><th scope="col">{t('cotizaciones.nuevo')}</th><th scope="col">{t('cotizaciones.variacion')}</th></tr></thead>
            <tbody>
              {MONEDAS_COTIZADAS.filter((m) => prop.tasas[m] !== undefined).map((m) => {
                const vari = prop.variaciones[m] ?? null
                return (
                  <tr key={m}>
                    <td>{m}</td>
                    <td>{vigentes[m] ? numero(m, vigentes[m]!.por_usd) : '—'}</td>
                    <td>{numero(m, prop.tasas[m]!)}</td>
                    <td className={esCambioGrande(vari) ? s.grande : undefined}>{vari === null ? '—' : `${pct.format(vari)} %`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(prop.faltan?.length ?? 0) > 0 && <p className={v.sub}>{t('cotizaciones.faltan', { lista: prop.faltan!.join(', ') })}</p>}
          {grande && (
            <p className={s.avisoGrande} role="alert"><Icono nombre="info" tam={18} /><span>{t('cotizaciones.avisoGrande')}</span></p>
          )}
          <div className={s.botones}>
            <button type="submit" className="boton boton--marca" disabled={enviando}>
              {grande ? t('cotizaciones.guardarIgual') : prop.fuente === 'cambio-cde' ? t('cotizaciones.guardarCde') : t('cotizaciones.guardar')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
