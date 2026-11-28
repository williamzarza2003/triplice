// Moderación: reseñas, preguntas y respuestas denunciadas (las más denunciadas primero), las nuevas de la semana y
// las ocultas. Cada una se oculta, se deja publicada (descarta las denuncias) o se vuelve a publicar, siempre con un
// motivo que queda en el registro. Ocultar una reseña la saca de la ficha y del promedio.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import { NoAdmin } from '@/components/admin/Comunes'
import a from '@/components/admin/Admin.module.css'
import { EstrellasCompletas } from '@/components/Estrellas'
import { Alerta, Aviso, Filtros } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { noEsAdmin, type ColaModeracion, type Contenido, type FiltroModeracion } from '@/lib/admin/tipos'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { hace } from '@/lib/vender/formato'
import { moderarAccion } from '../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin.moderacion' })
  return { title: t('titulo'), robots: { index: false, follow: false } }
}

export default function PaginaModeracion(props: PageProps<'/[idioma]/[mercado]/admin/moderacion'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

const FILTROS: FiltroModeracion[] = ['denunciadas', 'recientes', 'ocultas']
const MOTIVOS = ['spam', 'datos_personales', 'ofensiva', 'no_es_del_producto', 'otro'] as const

async function Contenido({ searchParams }: PageProps<'/[idioma]/[mercado]/admin/moderacion'>) {
  const [ctx, sp] = await Promise.all([contexto(), searchParams])
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const filtro = (FILTROS as string[]).includes(uno('filtro')) ? (uno('filtro') as FiltroModeracion) : 'denunciadas'
  await conSesion(ctx.idioma, '/admin/moderacion')
  const [t, ta, cola, mensajes] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'admin.moderacion' }),
    getTranslations({ locale: ctx.idioma, namespace: 'admin' }),
    rpcCuenta<ColaModeracion>('admin_moderacion', { filtro, idioma: ctx.idioma }),
    getMessages({ locale: ctx.idioma }),
  ])
  if (noEsAdmin(cola)) return <NoAdmin idioma={ctx.idioma} />
  const paises = mensajes.comun.paises as Record<string, string>
  const aqui = ruta(ctx.idioma, `/admin/moderacion${filtro === 'denunciadas' ? '' : `?filtro=${filtro}`}`)
  const guardado = uno('guardado')

  return (
    <>
      <div className={s.cabeza}><div><h1>{t('titulo')}</h1><p>{t('explica')}</p></div></div>
      {guardado && t.has(`guardado.${guardado}`) && <Aviso texto={t(`guardado.${guardado}`)} />}
      <div className={s.barra}>
        <Filtros etiqueta={t('filtros')} locale={LOCALE[ctx.idioma]} opciones={FILTROS.map((f) => ({
          href: ruta(ctx.idioma, `/admin/moderacion${f === 'denunciadas' ? '' : `?filtro=${f}`}`), texto: t(`filtro.${f}`), n: cola.cuentas[f], actual: f === filtro,
        }))} />
      </div>
      {cola.items.length === 0 ? (
        <section className={`panel ${s.vacio}`}><p>{t(`vacio.${filtro}`)}</p></section>
      ) : (
        <ul className={a.cola}>
          {cola.items.map((x) => (
            <Item key={`${x.tipo}-${x.id}`} x={x} aqui={aqui} idioma={ctx.idioma} paises={paises}
              error={uno('id') === x.id ? uno('error') : ''} t={t} ta={ta} />
          ))}
        </ul>
      )}
    </>
  )
}

type T = Awaited<ReturnType<typeof getTranslations>>

function Item({ x, aqui, idioma, paises, error, t, ta }: {
  x: Contenido; aqui: string; idioma: 'es' | 'pt' | 'en'; paises: Record<string, string>; error: string; t: T; ta: T
}) {
  const oculta = x.estado === 'oculta'
  const denunciada = x.denuncias.length > 0
  const ocultos = (
    <><input type="hidden" name="idioma" value={idioma} /><input type="hidden" name="volver" value={aqui} />
      <input type="hidden" name="tipo" value={x.tipo} /><input type="hidden" name="id" value={x.id} /></>
  )
  // el motivo sugerido: el de la denuncia más repetida
  const sugerido = x.denuncias.map((d) => d.motivo).sort((m1, m2) => x.denuncias.filter((d) => d.motivo === m2).length - x.denuncias.filter((d) => d.motivo === m1).length)[0]
  return (
    <li id={`item-${x.id}`} className={`panel ${a.contenido}`}>
      <div className={a.contenidoCabeza}>
        <span className={a.tipo}>{t(`tipo.${x.tipo}`)}</span>
        {x.estrellas !== null && <EstrellasCompletas valor={x.estrellas} etiqueta={t('estrellas', { n: x.estrellas })} />}
        <span>{t('de', { autor: x.autor, hace: hace(x.creado, idioma) })}{x.pais && ` · ${paises[x.pais] ?? x.pais}`}{x.verificada && ` · ${t('verificada')}`}</span>
      </div>
      <p className={a.contexto}>
        {t('en')} <Link href={ruta(idioma, `/p/${x.producto.slug}${x.tipo === 'resena' ? '#opiniones' : '#preguntas'}`)}>{x.producto.titulo}</Link>
        {x.pregunta && <> · {t('respondeA', { pregunta: x.pregunta.slice(0, 90) })}</>}
      </p>
      <blockquote lang={x.idioma}>{x.titulo && <b>{x.titulo}</b>}{x.texto}</blockquote>
      {denunciada && (
        <ul className={a.denuncias} aria-label={t('denunciasEtiqueta', { n: x.denuncias.length })}>
          {x.denuncias.map((d, i) => (
            <li key={i}><b>{t(`motivos.${d.motivo}`)}</b>{d.detalle && <> · «{d.detalle}»</>} <small>· {hace(d.creado, idioma)}</small></li>
          ))}
        </ul>
      )}
      {oculta && x.motivo && <p className={a.oculta}><b>{t('ocultaPor')}</b> {x.motivo}</p>}
      {error && <Alerta texto={ta.has(`errores.${error}`) ? ta(`errores.${error}`) : ta('errores.servidor')} />}
      <form action={moderarAccion} className={a.moderar}>
        {ocultos}
        <label>{t('motivo')}
          <select name="motivo" required defaultValue={oculta ? '' : sugerido ? t(`motivos.${sugerido}`) : ''}>
            <option value="" disabled>{t('elegirMotivo')}</option>
            {oculta
              ? <><option>{t('motivosPublicar.error')}</option><option>{t('motivosPublicar.corregida')}</option><option>{t('motivosPublicar.otro')}</option></>
              : MOTIVOS.map((m) => <option key={m}>{t(`motivos.${m}`)}</option>)}
            {denunciada && !oculta && <option>{t('motivoValida')}</option>}
          </select>
        </label>
        <label>{t('detalle')}<input type="text" name="detalle" maxLength={200} placeholder={t('detalleEjemplo')} /></label>
        <div className={a.moderarBotones}>
          {oculta ? (
            <button type="submit" name="accion" value="publicar" className="boton boton--marca">{t('publicar')}</button>
          ) : (
            <>
              <button type="submit" name="accion" value="ocultar" className={`boton ${a.botonQuitar}`}>{t(`ocultar.${x.tipo}`)}</button>
              {denunciada && <button type="submit" name="accion" value="descartar" className="boton boton--sec">{t('descartar')}</button>}
            </>
          )}
        </div>
      </form>
    </li>
  )
}
