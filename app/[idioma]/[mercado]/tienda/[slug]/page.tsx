import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { EstrellasCompletas } from '@/components/Estrellas'
import { Icono } from '@/components/Icono'
import { Migas } from '@/components/Migas'
import { EsqueletoResultados } from '@/components/resultados/Esqueleto'
import { Resultados } from '@/components/resultados/Resultados'
import { conParametro, leerFiltros, valorDe } from '@/lib/busqueda'
import { contexto, ruta } from '@/lib/contexto'
import { buscar, slugsTiendas, tienda } from '@/lib/datos/consultas'
import { LOCALE } from '@/lib/i18n/idiomas'
import s from './tienda.module.css'

type Props = PageProps<'/[idioma]/[mercado]/tienda/[slug]'>

export async function generateStaticParams({ params }: { params: { idioma: string; mercado: string } }) {
  const slugs = await slugsTiendas()
  const habitual = ['es/py-pyg', 'pt/br-brl', 'en/xx-usd'].includes(`${params.idioma}/${params.mercado}`)
  return slugs.slice(0, habitual ? slugs.length : 1).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, ctx] = await Promise.all([params, contexto()])
  const x = await tienda(slug, ctx.idioma)
  return x ? { title: x.nombre, description: x.descripcion } : {}
}

export default function Tienda(props: Props) {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<EsqueletoResultados />}>
        <Contenido {...props} />
      </Suspense>
    </main>
  )
}

async function Contenido({ params, searchParams }: Props) {
  const [{ slug }, sp, ctx] = await Promise.all([params, searchParams, contexto()])
  const x = await tienda(slug, ctx.idioma)
  if (!x) notFound()
  const [t, tc, tf, datos] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'tienda' }),
    getTranslations({ locale: ctx.idioma, namespace: 'comun' }),
    getTranslations({ locale: ctx.idioma, namespace: 'ficha' }),
    buscar(leerFiltros(sp, ctx.moneda, ctx.tasas, { tienda: slug }), ctx.idioma),
  ])
  const numero = new Intl.NumberFormat(LOCALE[ctx.idioma])
  const base = ruta(ctx.idioma, `/tienda/${slug}`)
  const rep = x.reputacion
  const respuesta = rep ? (rep.respuesta_min < 60 ? `${rep.respuesta_min} min` : `${Math.round(rep.respuesta_min / 60)} h`) : null
  const mapa = x.lat && x.lng ? `https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lng}#map=17/${x.lat}/${x.lng}` : null
  const iniciales = x.nombre.split(' ').map((w) => w[0]).slice(0, 2).join('')

  return (
    <>
      <Migas etiqueta={tf('migas')} items={[{ texto: tc('inicio'), href: ruta(ctx.idioma) }, { texto: x.nombre }]} />
      <div className={s.portada} style={{ '--color': x.color } as React.CSSProperties} aria-hidden="true">
        <svg viewBox="0 0 1200 200" preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="rgb(255 255 255 / .16)" strokeLinecap="round">
            <path d="M760 -20 C800 40 720 90 770 140 S740 200 790 240" strokeWidth="26" />
            <path d="M1220 70 C1080 60 960 130 772 138" strokeWidth="20" />
          </g>
          <circle cx="728" cy="122" r="7" fill="#F2C230" />
        </svg>
      </div>
      <div className={s.cabeza}>
        <span className={s.logo} style={{ color: x.color }} aria-hidden="true">{iniciales}</span>
        <div>
          <h1>{x.nombre}</h1>
          <p className={s.lema}>{x.lema}</p>
          <p className={s.donde}><Icono nombre="mapa" tam={16} />{x.ciudad}, {tc(`paises.${x.pais}`)} · {t('desde', { anio: x.desde })}</p>
        </div>
      </div>

      {rep && (
        <section className={s.metricas} aria-label={t('metricas')}>
          <div><b className={s.verde}>{numero.format(Number(rep.recomendacion))} %</b><span>{t('recomienda', { n: numero.format(rep.opiniones) })}</span></div>
          <div><b>{numero.format(rep.ventas_12m)}</b><span>{t('ventas')}</span></div>
          <div><b>{respuesta}</b><span>{t('responde')}</span></div>
          <div><b>{numero.format(Number(rep.a_tiempo))} %</b><span>{t('aTiempo')}</span></div>
        </section>
      )}

      <div className={s.dos}>
        <section className="panel" aria-labelledby="t-sobre">
          <h2 id="t-sobre">{t('sobre')}</h2>
          <p>{x.descripcion}</p>
          <dl className={s.datos}>
            <dt>{t('direccion')}</dt>
            <dd>{x.direccion}, {x.ciudad}{mapa && <> · <a href={mapa} rel="noopener">{t('verMapa')}</a></>}</dd>
            <dt>{t('horario')}</dt>
            <dd>{x.horario[ctx.idioma] ?? x.horario.es}</dd>
          </dl>
        </section>
        {x.resenas.length > 0 && (
          <section className="panel" aria-labelledby="t-dijeron">
            <h2 id="t-dijeron">{t('opiniones')}</h2>
            <ul className={s.opiniones}>
              {x.resenas.map((r, i) => (
                <li key={i} lang={r.idioma}>
                  <EstrellasCompletas valor={r.estrellas} tam={14} etiqueta={tf('promedio', { valor: r.estrellas })} />
                  <p>{r.texto}</p>
                  <small lang={ctx.idioma}>{r.autor} · <a href={ruta(ctx.idioma, `/p/${r.slug}`)}>{r.producto}</a></small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <Resultados ctx={ctx} datos={datos} base={base} params={sp} titulo={t('productos', { n: x.productos })} nivelTitulo={2}
        enlaceCategoria={(c) => conParametro(base, sp, 'categoria', valorDe(sp.categoria) === c ? null : c)} />
    </>
  )
}
