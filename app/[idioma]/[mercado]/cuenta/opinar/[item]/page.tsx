// Escribir la opinión de un producto comprado y recibido (compra verificada).
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { FormResena } from '@/components/cuenta/FormResena'
import { conSesion, opcionesTexto } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { escribirResenaAccion } from '../../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  return { title: t('opinar.tituloPagina'), robots: { index: false } }
}

export function generateStaticParams() {
  return [{ item: '0' }]
}

type PorOpinar = { item: number; titulo: string; opciones: Record<string, string>; slug: string; imagen: string | null; numero: string }

export default function PaginaOpinar(props: PageProps<'/[idioma]/[mercado]/cuenta/opinar/[item]'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 480 }} aria-hidden="true" />}><Opinar {...props} /></Suspense>
}

async function Opinar({ params }: PageProps<'/[idioma]/[mercado]/cuenta/opinar/[item]'>) {
  const [{ item }, ctx] = await Promise.all([params, contexto()])
  const { demo } = await conSesion(ctx.idioma, `/cuenta/opinar/${item}`)
  const [t, mensajes, lista] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }),
    getMessages({ locale: ctx.idioma }),
    rpcCuenta<PorOpinar[]>('por_opinar'),
  ])
  const x = lista?.find((y) => String(y.item) === item)
  if (!x) notFound()
  return (
    <>
      <div className={s.cabeza}>
        <div>
          <p><Link href={ruta(ctx.idioma, `/cuenta/pedidos/${x.numero}`)}>{t('opinar.volver', { numero: x.numero })}</Link></p>
          <h1>{t('opinar.tituloPagina')}</h1>
        </div>
      </div>
      {demo && <AvisoDemo texto={t('demo')} />}
      <div className={s.opinar}>
        <section className="panel">
          <Textos locale={LOCALE[ctx.idioma]} mensajes={{ cuenta: mensajes.cuenta }}>
            <FormResena accion={escribirResenaAccion} item={x.item} idioma={ctx.idioma} />
          </Textos>
        </section>
        <aside className={s.producto}>
          {x.imagen && <Image src={foto(x.imagen)} alt="" width={300} height={300} sizes="(max-width: 860px) 88px, 300px" />}
          <div>
            <p><b>{x.titulo}</b></p>
            {Object.keys(x.opciones).length > 0 && <p className={s.letraChica}>{opcionesTexto(x.opciones, ctx.idioma)}</p>}
            <p><span className="sello sello--exito">{t('opinar.verificada')}</span></p>
          </div>
        </aside>
      </div>
    </>
  )
}
