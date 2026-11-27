// Resumen del panel: ventas de los últimos 30 días con su gráfico (la pieza fuerte de la página), lo que hay que
// hacer hoy, lo más vendido y la reputación explicada. Todos los números salen de vendedor_resumen (SQL).
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { Icono } from '@/components/Icono'
import { NoVendedor } from '@/components/vender/Comunes'
import { GraficoVentas } from '@/components/vender/GraficoVentas'
import { ReputacionExplicada } from '@/components/vender/ReputacionExplicada'
import s from '@/components/vender/Vender.module.css'
import { conSesion, montoMinimo, opcionesTexto } from '@/lib/cuenta/pagina'
import { modoCuentas, rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { foto } from '@/lib/imagenes'
import { hace, momentoDelDia, montoCorto, variacion } from '@/lib/vender/formato'
import { sinTienda, type Resumen } from '@/lib/vender/tipos'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'vender' })
  return { title: t('titulo'), robots: { index: false } }
}

// El aviso de la vista previa no depende de la sesión: va en la parte prearmada y se pinta enseguida, mientras el
// resto llega en streaming. El hueco de espera ocupa la pantalla entera para que el pie no salte (CLS).
export default async function PaginaResumen() {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'vender' })
  return (
    <>
      {modoCuentas === 'demo' && <AvisoDemo texto={t('demo')} />}
      <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido /></Suspense>
    </>
  )
}

async function Contenido() {
  const ctx = await contexto()
  await conSesion(ctx.idioma, '/vender')
  const [t, r] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'vender' }),
    rpcCuenta<Resumen>('vendedor_resumen', { moneda: ctx.moneda, idioma: ctx.idioma, dias: 30 }),
  ])
  if (!r || sinTienda(r)) return <NoVendedor idioma={ctx.idioma} />

  const loc = LOCALE[ctx.idioma]
  const zona = { timeZone: 'America/Asuncion' } as const
  const hoy = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', ...zona }).format(new Date())
  const hora = (x: string) => new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zona }).format(new Date(x))
  const numero = new Intl.NumberFormat(loc)
  const cambio = variacion(r.ventas.monto, r.anterior.monto)
  const promedioAnterior = r.anterior.monto / r.dias
  const mejor = r.serie.reduce((m, p) => (p.monto > m.monto ? p : m), r.serie[0])
  const dia = (d: string) => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
  const maxTop = Math.max(1, ...r.top.map((x) => x.unidades))
  const porPreparar = r.pedidos.por_preparar + r.pedidos.preparando

  return (
    <>
      <div className={s.cabeza}>
        <div>
          <h1>{t(`saludo.${momentoDelDia()}`, { tienda: r.tienda.nombre })}</h1>
          <p>{t('bajada', {
            n: porPreparar, hora: r.pedidos.proximo_limite ? hora(r.pedidos.proximo_limite) : '',
            fecha: hoy.charAt(0).toUpperCase() + hoy.slice(1),
          })}</p>
        </div>
        <Link className="boton boton--accion" href={ruta(ctx.idioma, '/vender/productos/nuevo')}><Icono nombre="mas" tam={18} />{t('publicar')}</Link>
      </div>

      <section className={`panel ${s.ventas}`} aria-labelledby="t-ventas">
        <div className={s.ventasCabeza}>
          <h2 id="t-ventas" className={s.panelTitulo}>{t('ventas.titulo')}</h2>
          <Link href={ruta(ctx.idioma, `/tienda/${r.tienda.slug}`)}>{t('menu.tienda')}</Link>
        </div>
        <dl className={s.cifras}>
          <div className={s.principal}>
            <dt>{t('ventas.monto')}</dt>
            <dd>{montoMinimo(r.ventas.monto, r.moneda)}</dd>
            <dd className={`${s.cambio} ${cambio === null ? '' : cambio >= 0 ? s.sube : s.baja}`}>
              {cambio === null ? t('ventas.sinComparar') : cambio === 0 ? t('ventas.igual')
                : t(cambio > 0 ? 'ventas.sube' : 'ventas.baja', { n: numero.format(Math.abs(cambio)) })}
            </dd>
          </div>
          <div><dt>{t('ventas.pedidos')}</dt><dd>{numero.format(r.ventas.pedidos)} <small>{t('ventas.unidades', { n: r.ventas.unidades })}</small></dd></div>
          <div><dt>{t('ventas.ticket')}</dt><dd>{montoMinimo(r.ventas.ticket, r.moneda)}</dd></div>
        </dl>
        <figure style={{ margin: 0 }}>
          <GraficoVentas serie={r.serie} promedio={promedioAnterior} moneda={r.moneda} idioma={ctx.idioma} textos={{
            barra: (p, fecha, monto) => t('ventas.barra', { dia: fecha, monto, n: p.pedidos }), mejor: t('ventas.mejor', { dia: '' }), hoy: t('ventas.hoy'),
          }} />
          <figcaption>
            <span className="sr-only">{mejor && mejor.monto > 0
              ? t('ventas.grafico', { desde: dia(r.desde), hasta: dia(r.hasta), dia: dia(mejor.dia), monto: montoMinimo(mejor.monto, r.moneda) })
              : t('ventas.graficoVacio')}</span>
          </figcaption>
        </figure>
        <div className={s.leyenda}>
          <span><i className={s.muestra} aria-hidden="true" />{t('ventas.vendido')}</span>
          {mejor && mejor.monto > 0 && <span><i className={`${s.muestra} ${s.muestraMejor}`} aria-hidden="true" />{t('ventas.mejor', { dia: dia(mejor.dia) })}</span>}
          {promedioAnterior > 0 && <span><i className={s.muestraLinea} aria-hidden="true" />{t('ventas.promedio')} ({montoCorto(promedioAnterior, r.moneda, ctx.idioma)})</span>}
        </div>
        <p className={s.letraChica} style={{ marginTop: 0 }}>{t('ventas.nota', { moneda: r.moneda })}</p>
        <details className={s.numeros}>
          <summary>{t('ventas.verNumeros')}</summary>
          <table className={s.tabla}>
            <thead><tr><th scope="col">{t('ventas.dia')}</th><th scope="col" className={s.num}>{t('ventas.pedidos')}</th><th scope="col" className={s.num}>{t('ventas.vendido')}</th></tr></thead>
            <tbody>
              {[...r.serie].reverse().map((p) => (
                <tr key={p.dia}><td>{dia(p.dia)}</td><td className={s.num}>{p.pedidos}</td><td className={s.num}>{montoMinimo(p.monto, r.moneda)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className={s.dos}>
        <div className={s.columna}>
          <section className="panel" aria-labelledby="t-tareas">
            <h2 id="t-tareas" className={s.panelTitulo} style={{ marginBottom: 'var(--e-3)' }}>{t('tareas.titulo')}</h2>
            {porPreparar + r.preguntas.sin_responder + r.poco_stock.length === 0 ? <p className={s.sub}>{t('tareas.nada')}</p> : (
              <ul className={s.tareas}>
                {porPreparar > 0 && (
                  <li className={s.tareaUrgente}>
                    <Icono nombre="caja" />
                    <span>{t('tareas.pedidos', { n: r.pedidos.por_preparar })} <small>{t('tareas.preparando', { n: r.pedidos.preparando })}</small></span>
                    <Link href={ruta(ctx.idioma, '/vender/pedidos')}>{t('tareas.pedidosLink')}</Link>
                  </li>
                )}
                {r.preguntas.sin_responder > 0 && (
                  <li>
                    <Icono nombre="conversa" />
                    <span>{t('tareas.preguntas', { n: r.preguntas.sin_responder })}
                      {r.preguntas.mas_vieja && <small>{t('tareas.masVieja', { hace: hace(r.preguntas.mas_vieja, ctx.idioma) })}</small>}</span>
                    <Link href={ruta(ctx.idioma, '/vender/preguntas')}>{t('tareas.preguntasLink')}</Link>
                  </li>
                )}
                {r.poco_stock.length > 0 && (
                  <li>
                    <Icono nombre="info" />
                    <span>{t('tareas.stock', { n: r.poco_stock.length })}
                      <small>{r.poco_stock.slice(0, 3).map((x) => `${x.titulo}${Object.keys(x.opciones).length ? ` (${opcionesTexto(x.opciones, ctx.idioma)})` : ''}: ${t('tareas.quedan', { n: x.stock })}`).join(' · ')}</small>
                    </span>
                    <Link href={ruta(ctx.idioma, '/vender/productos?filtro=sin_stock')}>{t('tareas.stockLink')}</Link>
                  </li>
                )}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="t-top">
            <h2 id="t-top" className={s.panelTitulo}>{t('top.titulo')}</h2>
            {r.top.length === 0 ? <p className={s.sub}>{t('top.vacio')}</p> : (
              <ol className={s.top}>
                {r.top.map((x) => (
                  <li key={x.slug}>
                    {x.imagen ? <Image src={foto(x.imagen)} alt="" width={48} height={48} sizes="48px" /> : <span className={s.sinFoto} />}
                    <div>
                      <Link href={ruta(ctx.idioma, `/p/${x.slug}`)}>{x.titulo}</Link>
                      <div className={s.topDatos}><span>{t('top.unidades', { n: x.unidades })}</span><span>{montoMinimo(x.monto, r.moneda)}</span></div>
                      <div className={s.topBarra} aria-hidden="true"><span style={{ width: `${(x.unidades / maxTop) * 100}%` }} /></div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        {r.reputacion && <ReputacionExplicada rep={r.reputacion} idioma={ctx.idioma} />}
      </div>
    </>
  )
}
