// Opiniones: lo que compraste y todavía no opinaste, y lo que ya publicaste.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { EstrellasCompletas } from '@/components/Estrellas'
import { Icono } from '@/components/Icono'
import { conSesion, opcionesTexto } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { urlFotoResena } from '@/lib/cuenta/url-foto'
import { contexto, ruta } from '@/lib/contexto'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  return { title: t('opiniones.titulo'), robots: { index: false } }
}

type PorOpinar = { item: number; titulo: string; opciones: Record<string, string>; slug: string; imagen: string | null; numero: string }
type Mia = { id: string; slug: string; titulo_producto: string; estrellas: number; titulo: string; texto: string; fotos: string[]; util: number; fecha: string }

export default function PaginaOpiniones(props: PageProps<'/[idioma]/[mercado]/cuenta/opiniones'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 320 }} aria-hidden="true" />}><Opiniones {...props} /></Suspense>
}

async function Opiniones({ searchParams }: PageProps<'/[idioma]/[mercado]/cuenta/opiniones'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const { demo } = await conSesion(ctx.idioma, '/cuenta/opiniones')
  const [t, pendientes, mias] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }),
    rpcCuenta<PorOpinar[]>('por_opinar'),
    rpcCuenta<Mia[]>('mis_resenas', { idioma: ctx.idioma }),
  ])
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', year: 'numeric' })
  const publicada = typeof sp.publicada === 'string' ? sp.publicada : null
  return (
    <>
      <div className={s.cabeza}><h1>{t('opiniones.titulo')}</h1></div>
      {demo && <AvisoDemo texto={t('demo')} />}
      {publicada && (
        <p className={s.aviso} role="status"><Icono nombre="check" tam={18} />
          <span>{t('opiniones.publicada')} <Link href={ruta(ctx.idioma, `/p/${publicada}#opiniones`)}>{t('opiniones.verEnFicha')}</Link></span>
        </p>
      )}

      <section className="seccion" style={{ marginTop: 0 }} aria-labelledby="t-pendientes">
        <div className="seccion__cabeza"><h2 id="t-pendientes">{t('opiniones.pendientes')}</h2></div>
        {(pendientes ?? []).length === 0 ? <p className={s.letraChica}>{t('opiniones.sinPendientes')}</p> : (
          <ul className={s.porOpinar}>
            {pendientes!.map((x) => (
              <li key={x.item} className="panel">
                {x.imagen && <Image src={foto(x.imagen)} alt="" width={240} height={240} sizes="240px" />}
                <div>
                  <h3>{x.titulo}</h3>
                  {Object.keys(x.opciones).length > 0 && <p className={s.letraChica}>{opcionesTexto(x.opciones, ctx.idioma)}</p>}
                </div>
                <Link className="boton boton--marca" href={ruta(ctx.idioma, `/cuenta/opinar/${x.item}`)}><Icono nombre="estrella" tam={18} />{t('detalle.opinar')}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-mias">
        <div className="seccion__cabeza"><h2 id="t-mias">{t('opiniones.mias')}</h2></div>
        {(mias ?? []).length === 0 ? <p className={s.letraChica}>{t('opiniones.sinMias')}</p> : (
          <ul className={s.misResenas}>
            {mias!.map((r) => (
              <li key={r.id} className="panel">
                <p className={s.letraChica}><Link href={ruta(ctx.idioma, `/p/${r.slug}#opiniones`)}>{r.titulo_producto}</Link> · <time dateTime={r.fecha}>{fecha.format(new Date(r.fecha))}</time></p>
                <EstrellasCompletas valor={r.estrellas} etiqueta={t('opiniones.estrellas', { n: r.estrellas })} />
                <p><b>{r.titulo}</b></p>
                <p>{r.texto}</p>
                {r.fotos.length > 0 && (
                  <ul className={s.fotosElegidas}>
                    {r.fotos.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- fotos de compradores (Storage o memoria), sin optimizador
                      <li key={f}><img src={urlFotoResena(f)} alt={t('opinar.fotoN', { n: i + 1 })} width={88} height={88} loading="lazy" /></li>
                    ))}
                  </ul>
                )}
                {r.util > 0 && <p className={s.letraChica}>{t('opiniones.util', { n: r.util })}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
