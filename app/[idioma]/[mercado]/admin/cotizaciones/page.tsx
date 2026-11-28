// Cotizaciones: cuántos guaraníes, reales y pesos vale 1 dólar. Se cargan a mano o se traen de Cambio CDE, siempre con
// vista previa antes de guardar, y abajo el historial con la variación de cada carga. Al guardar se invalidan las
// cotizaciones cacheadas: todo lo que muestra precios se arma de nuevo con la nueva.
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import { NoAdmin } from '@/components/admin/Comunes'
import a from '@/components/admin/Admin.module.css'
import { FormCotizacion } from '@/components/admin/FormCotizacion'
import { Aviso } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { VARIABLES_CAMBIO_CDE } from '@/lib/admin/cambio-cde'
import { noEsAdmin, type CotizacionesAdmin } from '@/lib/admin/tipos'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { cotizacionAccion } from '../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin.cotizaciones' })
  return { title: t('titulo'), robots: { index: false, follow: false } }
}

export default function PaginaCotizaciones(props: PageProps<'/[idioma]/[mercado]/admin/cotizaciones'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

const LOCALE_MONEDA: Record<string, string> = { PYG: 'es-PY', BRL: 'pt-BR', ARS: 'es-AR' }

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/admin/cotizaciones'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  await conSesion(ctx.idioma, '/admin/cotizaciones')
  const [t, datos, mensajes] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'admin.cotizaciones' }),
    rpcCuenta<CotizacionesAdmin>('admin_cotizaciones'),
    getMessages({ locale: ctx.idioma }),
  ])
  if (noEsAdmin(datos)) return <NoAdmin idioma={ctx.idioma} />
  const loc = LOCALE[ctx.idioma]
  const fecha = new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Asuncion' })
  const pct = new Intl.NumberFormat(loc, { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
  const valor = (m: string, n: number | string) => new Intl.NumberFormat(LOCALE_MONEDA[m] ?? loc, { minimumFractionDigits: m === 'BRL' ? 2 : 0, maximumFractionDigits: 4 }).format(Number(n))
  const listo = VARIABLES_CAMBIO_CDE.every((v) => !!process.env[v]?.trim())
  const m = mensajes.admin as Record<string, never>
  const guardado = typeof sp.guardado === 'string' ? sp.guardado : ''

  return (
    <>
      <div className={s.cabeza}><div><h1>{t('titulo')}</h1><p>{t('explica')}</p></div></div>
      {guardado && <Aviso texto={t(guardado === 'cambio-cde' ? 'guardadaCde' : 'guardada')} />}
      <section className="panel" aria-labelledby="t-cargar">
        <h2 id="t-cargar" className={s.panelTitulo} style={{ marginBottom: 'var(--e-4)' }}>{t('cargar')}</h2>
        <Textos locale={loc} mensajes={{ admin: { cotizaciones: m.cotizaciones, errores: m.errores } }}>
          <FormCotizacion accion={cotizacionAccion} idioma={ctx.idioma} locale={loc} vigentes={datos.vigentes} cambioCdeListo={listo} />
        </Textos>
      </section>

      <section className="panel" style={{ marginTop: 'var(--e-5)' }} aria-labelledby="t-historial">
        <h2 id="t-historial" className={s.panelTitulo} style={{ marginBottom: 'var(--e-3)' }}>{t('historial')}</h2>
        {datos.historial.length === 0 ? <p className={s.sub}>{t('historialVacio')}</p> : (
          <table className={`${s.tabla} ${a.historial}`}>
            <thead><tr>
              <th scope="col">{t('fecha')}</th><th scope="col">{t('monedaCol')}</th><th scope="col" className={s.num}>{t('valor')}</th>
              <th scope="col" className={s.num}>{t('variacion')}</th><th scope="col">{t('fuente')}</th>
            </tr></thead>
            <tbody>
              {datos.historial.map((h, i) => {
                const v = h.anterior ? ((Number(h.por_usd) - Number(h.anterior)) / Number(h.anterior)) * 100 : null
                return (
                  <tr key={`${h.moneda}-${h.desde}-${i}`}>
                    <td data-etiqueta={t('fecha')}>{fecha.format(new Date(h.desde))}</td>
                    <td data-etiqueta={t('monedaCol')}>{h.moneda}</td>
                    <td data-etiqueta={t('valor')} className={s.num}>{valor(h.moneda, h.por_usd)}</td>
                    <td data-etiqueta={t('variacion')} className={s.num} data-signo={v === null || Math.abs(v) < 0.005 ? undefined : v > 0 ? 'sube' : 'baja'}>
                      {v === null ? '—' : `${pct.format(Math.round(v * 100) / 100)} %`}
                    </td>
                    <td data-etiqueta={t('fuente')}>{t(h.fuente === 'cambio-cde' ? 'fuenteCde' : 'fuenteManual')}{h.quien && ` · ${h.quien}`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
