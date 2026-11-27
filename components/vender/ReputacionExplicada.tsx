// La reputación explicada: el número que ve el comprador y de dónde sale, factor por factor (puntaje × peso = aporte).
// Los datos salen de la vista materializada reputacion_calculo; la cuenta del aporte, de lib/vender/formato.ts.
import { getTranslations } from 'next-intl/server'
import { LOCALE, type Idioma } from '@/lib/i18n/idiomas'
import { factores, type Factor } from '@/lib/vender/formato'
import type { Reputacion } from '@/lib/vender/tipos'
import s from './Vender.module.css'

export async function ReputacionExplicada({ rep, idioma }: { rep: Reputacion; idioma: Idioma }) {
  const t = await getTranslations({ locale: idioma, namespace: 'vender.reputacion' })
  const n = new Intl.NumberFormat(LOCALE[idioma], { maximumFractionDigits: 1 })
  const pct = new Intl.NumberFormat(LOCALE[idioma], { style: 'percent', maximumFractionDigits: 0 })
  const lista = factores(rep)
  const minutos = rep.respuesta_mediana_min ?? 0
  const tiempo = minutos < 60 ? `${minutos} min` : `${n.format(Math.round(minutos / 6) / 10)} h`
  const detalle: Record<Factor['clave'], string> = {
    opiniones: t('detalle.opiniones', { buenas: n.format(rep.opiniones_buenas), total: n.format(rep.opiniones_total) }),
    a_tiempo: t('detalle.a_tiempo', { ok: n.format(rep.entregas_a_tiempo), total: n.format(rep.entregas_cerradas) }),
    devoluciones: t('detalle.devoluciones', { n: rep.items_devueltos, total: n.format(rep.items_entregados) }),
    respondidas: t('detalle.respondidas', { ok: n.format(rep.preguntas_respondidas), total: n.format(rep.preguntas_total) }),
    respuesta: t('detalle.respuesta', { tiempo }),
  }
  // el consejo: el factor que más puntos deja sobre la mesa (lo que le falta para 100, por su peso)
  const flojo = lista.filter((f) => f.puntaje !== null).sort((a, b) => (100 - b.puntaje!) * b.peso - (100 - a.puntaje!) * a.peso)[0]
  const calculado = new Date(rep.calculado)
  const zona = { timeZone: 'America/Asuncion' } as const

  return (
    <section className="panel" aria-labelledby="t-reputacion">
      <div className={s.repCabeza}>
        <h2 id="t-reputacion" className={s.panelTitulo}>{t('titulo')}</h2>
        <span className={s.repNumero}>{rep.reputacion === null ? '—' : `${n.format(rep.reputacion)} %`}</span>
      </div>
      <p className={s.sub}>{t('explica')}</p>
      <table className={s.factores}>
        <thead>
          <tr><th scope="col">{t('factor')}</th><th scope="col">{t('puntaje')}</th><th scope="col" className={s.num}>{t('peso')}</th><th scope="col" className={s.num}>{t('aporta')}</th></tr>
        </thead>
        <tbody>
          {lista.map((f) => (
            <tr key={f.clave}>
              <td>
                <span className={s.factorNombre}>{t(`factores.${f.clave}`)}</span>
                <span className={s.factorDetalle}>{f.puntaje === null ? t('sinDatos') : detalle[f.clave]}</span>
              </td>
              <td data-etiqueta={t('puntaje')}>
                {f.puntaje === null ? <span className={s.sinDatos}>—</span> : (
                  <span className={s.medidor}>
                    <span aria-hidden="true"><span style={{ width: `${f.puntaje}%` }} /></span>
                    <b className="numero">{n.format(f.puntaje)}</b>
                  </span>
                )}
              </td>
              <td className={s.num} data-etiqueta={t('peso')}>{pct.format(f.peso)}</td>
              <td className={s.num} data-etiqueta={t('aporta')}>{f.aporte === null ? '—' : n.format(f.aporte)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}>{t('total')}</td><td className={s.num}>{rep.reputacion === null ? '—' : `${n.format(rep.reputacion)} %`}</td></tr>
        </tfoot>
      </table>
      {flojo && flojo.puntaje! < 99 && (
        <p className={s.consejo}><b>{t('consejoTitulo')}</b>{t(`consejos.${flojo.clave}`)}</p>
      )}
      <p className={s.letraChica}>
        {t('calculada', {
          fecha: new Intl.DateTimeFormat(LOCALE[idioma], { day: 'numeric', month: 'long', ...zona }).format(calculado),
          hora: new Intl.DateTimeFormat(LOCALE[idioma], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zona }).format(calculado),
        })}
      </p>
    </section>
  )
}
