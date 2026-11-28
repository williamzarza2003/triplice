// Lista compartida por enlace: de solo lectura, sin cuenta. La base la devuelve solo con el token exacto y sin datos
// del dueño más allá de su firma ("Lorena B."). Si el dueño la dejó de compartir, el enlace deja de funcionar.
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import s from '@/components/descubrir/Listas.module.css'
import { Grilla } from '@/components/grilla/Grilla'
import { Icono } from '@/components/Icono'
import { contexto, ruta } from '@/lib/contexto'
import { rpc } from '@/lib/datos/fuente'
import type { TarjetaDatos } from '@/lib/datos/tipos'
import { LOCALE } from '@/lib/i18n/idiomas'

type Compartida = { nombre: string; favoritos: boolean; de: string; desde: string | null; items: TarjetaDatos[] }

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'listas' })
  // una lista privada que alguien compartió: no se indexa ni se manda la dirección a otros sitios
  return { title: t('compartidaTituloPagina'), robots: { index: false, follow: false }, referrer: 'no-referrer' }
}

// Con Cache Components cada segmento dinámico necesita un valor de muestra para el build
export function generateStaticParams() {
  return [{ token: 'muestra' }]
}

export default function PaginaCompartida(props: PageProps<'/[idioma]/[mercado]/lista/[token]'>) {
  return (
    <main id="contenido" className="contenedor">
      <Suspense fallback={<div className="panel" style={{ minHeight: '100vh', marginTop: 24 }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
    </main>
  )
}

async function Contenido({ params }: PageProps<'/[idioma]/[mercado]/lista/[token]'>) {
  await connection()
  const [ctx, { token }] = await Promise.all([contexto(), params])
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'listas' })
  const l = /^[0-9a-f]{64}$/.test(token) ? await rpc<Compartida | null>('lista_compartida', { token, idioma: ctx.idioma }) : null
  if (!l) {
    return (
      <section className={`panel ${s.compartida}`} style={{ display: 'grid', gap: 12, justifyItems: 'start', maxWidth: 620 }}>
        <h1 style={{ fontSize: 'var(--t-28)' }}>{t('noFunciona')}</h1>
        <p>{t('noFuncionaTexto')}</p>
        <Link className="boton boton--marca" href={ruta(ctx.idioma)}>{t('irAlInicio')}</Link>
      </section>
    )
  }
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Asuncion' })
  return (
    <div className={s.compartida}>
      <h1 style={{ fontSize: 'var(--t-33)' }}>{l.favoritos ? t('favoritosDe', { de: l.de }) : l.nombre}</h1>
      <p className={s.firma}>
        <span>{t('listaDe', { de: l.de })}</span>
        <span>{t('productos', { n: l.items.length })}</span>
        {l.desde && <span>{t('compartidaEl', { fecha: fecha.format(new Date(l.desde)) })}</span>}
        <span className="sello sello--neutro"><Icono nombre="info" tam={14} />{t('soloLectura')}</span>
      </p>
      <p className={s.nota} style={{ margin: '8px 0 24px' }}>{t('preciosHoy')}</p>
      {l.items.length === 0 ? <p>{t('compartidaVacia')}</p> : <Grilla items={l.items} ctx={ctx} prioridad={4} />}
    </div>
  )
}
