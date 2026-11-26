// Datos y preferencias de la cuenta.
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import { AvisoDemo } from '@/components/cuenta/AvisoDemo'
import { FormPerfil } from '@/components/cuenta/FormPerfil'
import { conSesion } from '@/lib/cuenta/pagina'
import { perfil as leerPerfil } from '@/lib/cuenta/sesion'
import { contexto } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { guardarPerfilAccion, salirAccion } from '../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  return { title: t('datos.titulo'), robots: { index: false } }
}

export default function PaginaDatos(props: PageProps<'/[idioma]/[mercado]/cuenta/datos'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 320 }} aria-hidden="true" />}><Datos {...props} /></Suspense>
}

async function Datos({ searchParams }: PageProps<'/[idioma]/[mercado]/cuenta/datos'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const { usuario, demo } = await conSesion(ctx.idioma, '/cuenta/datos')
  const [t, mensajes, p] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }),
    getMessages({ locale: ctx.idioma }),
    leerPerfil(),
  ])
  if (!p) return null
  return (
    <>
      <div className={s.cabeza}><h1>{t('datos.titulo')}</h1></div>
      {demo && <AvisoDemo texto={t('demo')} />}
      <section className="panel">
        <Textos locale={LOCALE[ctx.idioma]} mensajes={{ cuenta: mensajes.cuenta, pagar: mensajes.pagar, comun: mensajes.comun }}>
          <FormPerfil accion={guardarPerfilAccion} idioma={ctx.idioma} perfil={p} email={usuario.email} guardado={sp.guardado === '1'} />
        </Textos>
      </section>
      <form action={salirAccion} className={s.soloCelular} style={{ marginTop: 24 }}>
        <input type="hidden" name="idioma" value={ctx.idioma} />
        <button type="submit" className="boton boton--sec">{t('salir')}</button>
      </form>
    </>
  )
}
