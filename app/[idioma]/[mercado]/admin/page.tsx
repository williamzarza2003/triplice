// Resumen del admin: lo que espera una decisión (tiendas por aprobar, denuncias, contenido nuevo) y la pizarra de
// cambio con la cotización vigente, que es la idea fuerte de la página: si tiene más de 24 horas, lo dice ahí mismo.
// Todo sale de admin_resumen (SQL), que empieza comprobando es_admin().
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { NoAdmin, RenglonRegistro } from '@/components/admin/Comunes'
import a from '@/components/admin/Admin.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import s from '@/components/vender/Vender.module.css'
import { noEsAdmin, type ResumenAdmin } from '@/lib/admin/tipos'
import { conSesion } from '@/lib/cuenta/pagina'
import { modoCuentas, rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { REGLAS } from '@/lib/precios'
import { hace } from '@/lib/vender/formato'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin' })
  return { title: t('titulo'), robots: { index: false, follow: false } }
}

export default async function PaginaAdmin() {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin' })
  return (
    <>
      {modoCuentas === 'demo' && <AvisoDemo texto={t('demo')} />}
      <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido /></Suspense>
    </>
  )
}

const SIMBOLO = { PYG: '₲', BRL: 'R$', ARS: '$' } as const

async function Contenido() {
  const ctx = await contexto()
  await conSesion(ctx.idioma, '/admin')
  const [t, r] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'admin.resumen' }),
    rpcCuenta<ResumenAdmin>('admin_resumen'),
  ])
  if (noEsAdmin(r)) return <NoAdmin idioma={ctx.idioma} />

  const loc = LOCALE[ctx.idioma]
  const hoy = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Asuncion' }).format(new Date())
  const numero = new Intl.NumberFormat(loc)
  const valor = (m: keyof typeof SIMBOLO, n: number) => new Intl.NumberFormat(REGLAS[m].locale, { minimumFractionDigits: m === 'BRL' ? 2 : 0, maximumFractionDigits: m === 'BRL' ? 4 : 2 }).format(Number(n))
  const porcentaje = new Intl.NumberFormat(loc, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
  const pendientes = r.tiendas.pendientes + r.denuncias.contenidos + (r.cotizacion_vieja ? 1 : 0)
  const masVieja = r.cotizaciones.reduce<string | null>((m, c) => (!m || c.desde < m ? c.desde : m), null)

  return (
    <>
      <div className={s.cabeza}>
        <div>
          <h1>{t('titulo')}</h1>
          <p>{t(pendientes ? 'bajada' : 'bajadaNada', { fecha: hoy.charAt(0).toUpperCase() + hoy.slice(1), n: pendientes })}</p>
        </div>
      </div>

      <div className={a.resumen}>
        <section className={`panel ${a.areaPendiente}`} aria-labelledby="t-pendiente">
            <h2 id="t-pendiente" className={s.panelTitulo}>{t('pendiente')}</h2>
            <ul className={a.pendientes}>
              <li data-cero={r.tiendas.pendientes === 0}>
                <span className={a.n}>{numero.format(r.tiendas.pendientes)}</span>
                <span>{t('tiendas', { n: r.tiendas.pendientes })}
                  {r.tiendas.nombres.length > 0 && <small>{r.tiendas.nombres.join(', ')}{r.tiendas.mas_vieja && ` · ${t('esperaDesde', { hace: hace(r.tiendas.mas_vieja, ctx.idioma) })}`}</small>}
                </span>
                <Link href={ruta(ctx.idioma, '/admin/tiendas')}>{t('tiendasLink')}</Link>
              </li>
              <li data-cero={r.denuncias.contenidos === 0}>
                <span className={a.n}>{numero.format(r.denuncias.contenidos)}</span>
                <span>{t('denuncias', { n: r.denuncias.contenidos })}
                  {r.denuncias.total > 0 && <small>{t('denunciasDetalle', { n: r.denuncias.total, hace: r.denuncias.mas_vieja ? hace(r.denuncias.mas_vieja, ctx.idioma) : '' })}</small>}
                </span>
                <Link href={ruta(ctx.idioma, '/admin/moderacion')}>{t('denunciasLink')}</Link>
              </li>
              <li data-cero={r.recientes === 0}>
                <span className={a.n}>{numero.format(r.recientes)}</span>
                <span>{t('recientes', { n: r.recientes })}<small>{t('recientesDetalle')}</small></span>
                <Link href={ruta(ctx.idioma, '/admin/moderacion?filtro=recientes')}>{t('recientesLink')}</Link>
              </li>
            </ul>
          </section>

        {/* La pizarra de cambio: como las de las casas de cambio de la avenida, con el valor de 1 dólar en cada moneda */}
        <section className={a.pizarra} aria-labelledby="t-pizarra">
          <div className={a.pizarraCabeza}>
            <h2 id="t-pizarra">{t('pizarra')}</h2>
            <p>{t('pizarraBajada')}</p>
          </div>
          <dl className={a.tablero}>
            {r.cotizaciones.map((c) => {
              const v = c.anterior ? ((Number(c.por_usd) - Number(c.anterior)) / Number(c.anterior)) * 100 : null
              return (
                <div key={c.moneda}>
                  <dt><b>{SIMBOLO[c.moneda]}</b>{t(`moneda.${c.moneda}`)}</dt>
                  <dd className={a.valor}>{valor(c.moneda, c.por_usd)}</dd>
                  <dd className={a.detalle}>{t(c.fuente === 'cambio-cde' ? 'deCambioCde' : 'aMano', { hace: hace(c.desde, ctx.idioma) })}</dd>
                  <dd className={a.variacion} data-signo={v === null || Math.abs(v) < 0.05 ? undefined : v > 0 ? 'sube' : 'baja'}>
                    {v === null ? t('sinAnterior') : Math.abs(v) < 0.05 ? t('igual') : t('variacion', { v: porcentaje.format(v) })}
                  </dd>
                </div>
              )
            })}
          </dl>
          {r.cotizacion_vieja && masVieja && (
            <p className={a.vieja} role="status">
              <span>{t('vieja', { hace: hace(masVieja, ctx.idioma) })}</span>
              <Link href={ruta(ctx.idioma, '/admin/cotizaciones')}>{t('actualizar')}</Link>
            </p>
          )}
          {!r.cotizacion_vieja && <Link href={ruta(ctx.idioma, '/admin/cotizaciones')}>{t('verHistorial')}</Link>}
        </section>

          <section className={`panel ${a.areaRegistro}`} aria-labelledby="t-registro">
            <h2 id="t-registro" className={s.panelTitulo}>{t('registro')}</h2>
            {r.registro.length === 0 ? <p className={s.sub}>{t('registroVacio')}</p> : (
              <ul className={a.registro}>
                {r.registro.map((x) => <li key={x.id}><RenglonRegistro a={x} idioma={ctx.idioma} /></li>)}
              </ul>
            )}
            <Link className={a.verTodo} href={ruta(ctx.idioma, '/admin/registro')}>{t('registroLink')}</Link>
          </section>

      </div>
    </>
  )
}
