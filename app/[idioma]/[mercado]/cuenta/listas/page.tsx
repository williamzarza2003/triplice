// Mis listas: favoritos primero y después las listas con nombre ("Para el viaje a Foz"), con la tapa armada con las
// fotos de lo que tienen. Se crea una nueva desde acá o desde la ficha.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import c from '@/components/cuenta/Cuenta.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { FormLista } from '@/components/descubrir/FormLista'
import s from '@/components/descubrir/Listas.module.css'
import { Icono } from '@/components/Icono'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { crearListaAccion } from '../../descubrir/acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'listas' })
  return { title: t('titulo'), robots: { index: false } }
}

export type MiLista = { id: string; nombre: string; favoritos: boolean; token: string | null; n: number; fotos: string[]; actualizado: string }

export default function PaginaListas(props: PageProps<'/[idioma]/[mercado]/cuenta/listas'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 320 }} aria-hidden="true" />}><Listas {...props} /></Suspense>
}

async function Listas({ searchParams }: PageProps<'/[idioma]/[mercado]/cuenta/listas'>) {
  const ctx = await contexto()
  const { demo } = await conSesion(ctx.idioma, '/cuenta/listas')
  const [t, tc, listas, mensajes, sp] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'listas' }),
    getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }),
    rpcCuenta<MiLista[]>('mis_listas'),
    getMessages({ locale: ctx.idioma }),
    searchParams,
  ])
  const todas = listas ?? []
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', timeZone: 'America/Asuncion' })
  const conFavoritos = todas.some((l) => l.favoritos) ? todas
    : [{ id: 'favoritos', nombre: t('favoritos'), favoritos: true, token: null, n: 0, fotos: [], actualizado: '' }, ...todas]
  return (
    <>
      <div className={c.cabeza}>
        <h1>{t('titulo')}</h1>
        <p>{t('cantidad', { n: todas.filter((l) => !l.favoritos).length })}</p>
      </div>
      {demo && <AvisoDemo texto={tc('demo')} />}
      {sp.borrada === '1' && <p className={c.aviso} role="status"><Icono nombre="check" tam={18} />{t('borrada')}</p>}
      <ul className={s.listas}>
        {conFavoritos.map((l) => (
          <li key={l.id} className={`${s.lista} ${l.favoritos ? s.favoritos : ''}`}>
            <div className={`${s.tapa} ${l.fotos.length === 0 ? s.tapaVacia : ''}`} data-n={Math.min(4, l.fotos.length)} aria-hidden="true">
              {l.fotos.length === 0 ? <span>{l.favoritos ? t('favoritosVacia') : t('vacia')}</span>
                : l.fotos.slice(0, 4).map((x, i) => <Image key={i} src={foto(x)} alt="" width={160} height={160} sizes="160px" />)}
            </div>
            <h2>
              {l.favoritos && <Icono nombre="corazon" tam={20} />}
              {l.id === 'favoritos' ? <span>{t('favoritos')}</span>
                : <Link href={ruta(ctx.idioma, `/cuenta/listas/${l.id}`)}>{l.favoritos ? t('favoritos') : l.nombre}</Link>}
            </h2>
            <p>
              <span>{t('productos', { n: Number(l.n) })}</span>
              {l.actualizado && <span>{t('actualizada', { fecha: fecha.format(new Date(l.actualizado)) })}</span>}
              {l.token && <span className="sello sello--info"><Icono nombre="enlace" tam={14} />{t('compartida')}</span>}
            </p>
          </li>
        ))}
      </ul>
      <Textos locale={LOCALE[ctx.idioma]} mensajes={{ descubrir: mensajes.descubrir }}>
        <FormLista accion={crearListaAccion} idioma={ctx.idioma} etiqueta={t('nuevaEtiqueta')} boton={t('nuevaBoton')} ejemplo={t('nuevaEjemplo')} />
      </Textos>
      <p className={s.nota} style={{ marginTop: 8 }}>{t('limites')}</p>
    </>
  )
}
