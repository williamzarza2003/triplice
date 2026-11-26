// Entrar. Con Supabase: Google o un enlace por email (sin contraseñas que recordar). Sin Supabase (vista previa
// con la base embebida): la cuenta de prueba, con pedidos en distintos estados para recorrer toda la fase 3.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import s from '@/components/cuenta/Cuenta.module.css'
import p from '@/components/compra/Pago.module.css'
import { FormEmail } from '@/components/cuenta/FormEmail'
import { Icono } from '@/components/Icono'
import { modoCuentas, usuarioActual } from '@/lib/cuenta/sesion'
import { contexto } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { entrarDemoAccion, entrarEmailAccion, entrarGoogleAccion, volverSeguro } from '../cuenta/acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  return { title: t('entrar.titulo'), robots: { index: false } }
}

export default async function PaginaEntrar(props: PageProps<'/[idioma]/[mercado]/entrar'>) {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'cuenta' })
  return (
    <main id="contenido" className={`contenedor ${s.entrar}`}>
      <div>
        <h1>{t('entrar.titulo')}</h1>
        <ul className={s.porque}>
          <li><Icono nombre="caja" /><span><b>{t('entrar.porque1')}</b>{t('entrar.porque1Texto')}</span></li>
          <li><Icono nombre="devolver" /><span><b>{t('entrar.porque2')}</b>{t('entrar.porque2Texto')}</span></li>
          <li><Icono nombre="estrella" /><span><b>{t('entrar.porque3')}</b>{t('entrar.porque3Texto')}</span></li>
        </ul>
      </div>
      <Suspense fallback={<div className="panel" style={{ minHeight: 320 }} aria-hidden="true" />}><Formulario {...props} /></Suspense>
    </main>
  )
}

async function Formulario({ searchParams }: PageProps<'/[idioma]/[mercado]/entrar'>) {
  await connection()
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const volver = await volverSeguro(typeof sp.volver === 'string' ? sp.volver : null, ctx.idioma)
  if (await usuarioActual()) redirect(volver) // ya entró
  const [t, mensajes] = await Promise.all([getTranslations({ locale: ctx.idioma, namespace: 'cuenta' }), getMessages({ locale: ctx.idioma })])
  const error = typeof sp.error === 'string' ? sp.error : null
  const ocultos = <><input type="hidden" name="idioma" value={ctx.idioma} /><input type="hidden" name="volver" value={volver} /></>

  if (modoCuentas === 'demo') {
    return (
      <section className={`panel ${s.formEntrar}`} aria-labelledby="t-demo">
        <h2 id="t-demo">{t('entrar.demoTitulo')}</h2>
        <div className={s.persona}>
          <span className={s.inicial} aria-hidden="true">L</span>
          <p><b>Lorena Benítez</b><small>{t('entrar.demoPersona')}</small></p>
        </div>
        <p>{t('entrar.demoTexto')}</p>
        {error && <p className={p.error} role="alert"><Icono nombre="info" tam={16} />{t('entrar.errores.demo')}</p>}
        <form action={entrarDemoAccion}>
          {ocultos}
          <button type="submit" className="boton boton--marca boton--ancho">{t('entrar.demoBoton')}</button>
        </form>
        <p className={s.letraChica}>{t('entrar.demoNota')}</p>
      </section>
    )
  }

  return (
    <section className={`panel ${s.formEntrar}`} aria-labelledby="t-form">
      <h2 id="t-form">{t('entrar.formTitulo')}</h2>
      {error && <p className={p.error} role="alert"><Icono nombre="info" tam={16} />{t(`entrar.errores.${error === 'google' ? 'google' : 'enlace'}`)}</p>}
      <form action={entrarGoogleAccion}>
        {ocultos}
        <button type="submit" className={`boton boton--ancho ${s.google}`}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
            <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          {t('entrar.google')}
        </button>
      </form>
      <p className={s.separador}>{t('entrar.o')}</p>
      <Textos locale={LOCALE[ctx.idioma]} mensajes={{ cuenta: mensajes.cuenta }}>
        <FormEmail accion={entrarEmailAccion} idioma={ctx.idioma} volver={volver} />
      </Textos>
      <p className={s.letraChica}>{t('entrar.privacidad')}</p>
    </section>
  )
}
