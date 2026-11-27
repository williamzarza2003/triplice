// Preguntas de lo que vendo: primero las que nadie respondió (las más viejas arriba), con el formulario para
// responder ahí mismo. La base pone el sello de vendedor y el nombre de la tienda (disparador de la fase 3).
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Alerta, Aviso, Filtros, NoVendedor } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { foto } from '@/lib/imagenes'
import { hace } from '@/lib/vender/formato'
import { sinTienda, type ListaPreguntas } from '@/lib/vender/tipos'
import { responderAccion } from '../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'vender.preguntas' })
  return { title: t('titulo'), robots: { index: false } }
}

export default function PaginaPreguntas(props: PageProps<'/[idioma]/[mercado]/vender/preguntas'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/vender/preguntas'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const filtro = uno('filtro') === 'todas' ? 'todas' : 'sin_responder'
  await conSesion(ctx.idioma, '/vender/preguntas')
  const [t, lista] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'vender.preguntas' }),
    rpcCuenta<ListaPreguntas>('vendedor_preguntas', { filtro, idioma: ctx.idioma }),
  ])
  if (!lista || sinTienda(lista)) return <NoVendedor idioma={ctx.idioma} />

  const aqui = ruta(ctx.idioma, `/vender/preguntas${filtro === 'todas' ? '?filtro=todas' : ''}`)
  const [codigoError, preguntaError] = uno('error').split('.')

  return (
    <>
      <div className={s.cabeza}><div><h1>{t('titulo')}</h1><p>{t('explica')}</p></div></div>
      {uno('guardado') === 'respuesta' && <Aviso texto={t('respondida')} />}
      {codigoError && !preguntaError && <Alerta texto={t.has(`errores.${codigoError}`) ? t(`errores.${codigoError}`) : t('errores.servidor')} />}
      <div className={s.barra}>
        <Filtros etiqueta={t('filtrosEtiqueta')} locale={LOCALE[ctx.idioma]} opciones={[
          { href: ruta(ctx.idioma, '/vender/preguntas'), texto: t('filtros.sin_responder'), n: lista.cuentas.sin_responder, actual: filtro === 'sin_responder' },
          { href: ruta(ctx.idioma, '/vender/preguntas?filtro=todas'), texto: t('filtros.todas'), n: lista.cuentas.todas, actual: filtro === 'todas' },
        ]} />
      </div>

      {lista.items.length === 0 ? (
        <section className={`panel ${s.vacio}`}><p>{filtro === 'todas' ? t('vacioTodas') : t('vacio')}</p></section>
      ) : (
        <ul className={s.preguntas}>
          {lista.items.map((q, n) => {
            const conError = preguntaError === q.id ? codigoError : null
            const idioma = t.has(`idiomas.${q.idioma}`) ? t(`idiomas.${q.idioma}`) : ''
            return (
              <li key={q.id} id={`pregunta-${q.id}`} className={`panel ${s.pregunta}`}>
                {q.imagen ? <Image src={foto(q.imagen)} alt="" width={64} height={64} sizes="64px" /> : <span className={s.sinFoto} />}
                <div>
                  <h2><Link href={ruta(ctx.idioma, `/p/${q.slug}#preguntas`)}>{q.producto}</Link></h2>
                  <blockquote lang={q.idioma}>{q.texto}</blockquote>
                  <p className={s.meta}>{t('de', { autor: q.autor, hace: hace(q.creado, ctx.idioma) })}{idioma && ` · ${idioma}`}</p>
                  {q.respuestas.length > 0 && (
                    <ul className={s.respuestas}>
                      {q.respuestas.map((a, i) => (
                        <li key={i}><small>{t('respondio', { autor: a.autor, hace: hace(a.creado, ctx.idioma) })}</small>{a.texto}</li>
                      ))}
                    </ul>
                  )}
                  {!q.respuestas.some((a) => a.mia) && (
                    // el formulario se abre de a uno (16 cajas de texto abiertas pesan); la primera ya viene abierta
                    <details className={s.abrirRespuesta} open={n === 0 || !!conError}>
                    <summary className="boton boton--sec">{t('abrir')}</summary>
                    <form action={responderAccion} className={s.responder}>
                      <input type="hidden" name="idioma" value={ctx.idioma} />
                      <input type="hidden" name="volver" value={aqui} />
                      <input type="hidden" name="pregunta" value={q.id} />
                      <label htmlFor={`r-${q.id}`}>{t('tuRespuesta')}</label>
                      <textarea id={`r-${q.id}`} name="texto" rows={3} minLength={2} maxLength={800} required
                        aria-invalid={conError ? true : undefined} aria-describedby={`a-${q.id}${conError ? ` e-${q.id}` : ''}`} />
                      <small id={`a-${q.id}`}>{t('ayuda')}</small>
                      {conError && <p id={`e-${q.id}`} className={s.error} role="alert">{t.has(`errores.${conError}`) ? t(`errores.${conError}`) : t('errores.servidor')}</p>}
                      <button type="submit" className="boton boton--marca">{t('responder')}</button>
                    </form>
                    </details>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
