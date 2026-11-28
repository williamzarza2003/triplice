// Una lista: sus productos con el precio de hoy, mover a otra lista o sacar, renombrar, compartir por enlace de solo
// lectura (y dejar de compartir) y borrar. Todo con formularios comunes (sin JavaScript también).
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import c from '@/components/cuenta/Cuenta.module.css'
import { CopiarEnlace } from '@/components/descubrir/CopiarEnlace'
import { FormLista } from '@/components/descubrir/FormLista'
import s from '@/components/descubrir/Listas.module.css'
import { Icono } from '@/components/Icono'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { categoriaDe, contexto, precio, ruta } from '@/lib/contexto'
import type { TarjetaDatos } from '@/lib/datos/tipos'
import { foto } from '@/lib/imagenes'
import { LOCALE } from '@/lib/i18n/idiomas'
import { SITIO } from '@/lib/sitio'
import { borrarListaAccion, compartirListaAccion, itemListaAccion, renombrarListaAccion } from '../../../descubrir/acciones'

type Lista = {
  id: string; nombre: string; favoritos: boolean; token: string | null; compartida_desde: string | null
  items: TarjetaDatos[]; otras: { id: string; nombre: string }[]
}

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'listas' })
  return { title: t('titulo'), robots: { index: false } }
}

// Con Cache Components cada segmento dinámico necesita un valor de muestra para el build
export function generateStaticParams() {
  return [{ id: '00000000-0000-4000-8000-000000000000' }]
}

export default function PaginaLista(props: PageProps<'/[idioma]/[mercado]/cuenta/listas/[id]'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: 320 }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

async function Contenido({ params, searchParams }: PageProps<'/[idioma]/[mercado]/cuenta/listas/[id]'>) {
  const [ctx, { id }, sp] = await Promise.all([contexto(), params, searchParams])
  await conSesion(ctx.idioma, `/cuenta/listas/${id}`)
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [t, l] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'listas' }),
    rpcCuenta<Lista | null>('mi_lista', { id, idioma: ctx.idioma }),
  ])
  if (!l) notFound()
  const r = (x: string) => ruta(ctx.idioma, x)
  const nombre = l.favoritos ? t('favoritos') : l.nombre
  const fecha = new Intl.DateTimeFormat(LOCALE[ctx.idioma], { day: 'numeric', month: 'long', timeZone: 'America/Asuncion' })
  const oculto = <input type="hidden" name="idioma" value={ctx.idioma} />
  const mensaje = sp.compartida ? t('avisos.compartida') : sp.revocada ? t('avisos.revocada') : sp.quitado ? t('avisos.quitado')
    : sp.movido ? t('avisos.movido') : sp.error ? t(`errores.${sp.error === 'limite_items' ? 'limite_items' : 'servidor'}`) : null

  return (
    <>
      <Link href={r('/cuenta/listas')} className={s.volver}><Icono nombre="izquierda" tam={16} />{t('volver')}</Link>
      <div className={c.cabeza}>
        <h1>{nombre}</h1>
        <p>{t('productos', { n: l.items.length })}</p>
      </div>
      {mensaje && <p className={sp.error ? s.error : c.aviso} role="status"><Icono nombre={sp.error ? 'info' : 'check'} tam={18} />{mensaje}</p>}

      <div className={s.herramientas}>
        <section className={`panel ${s.compartir}`} aria-labelledby="t-compartir">
          <h2 id="t-compartir"><Icono nombre="enlace" tam={20} />{l.token ? t('compartidaTitulo') : t('compartirTitulo')}</h2>
          {l.token ? (
            <>
              <CopiarEnlace id="enlace-lista" className={s.enlace} base={SITIO} camino={`/${ctx.idioma}/lista/${l.token}`}
                etiqueta={t('enlaceEtiqueta', { fecha: l.compartida_desde ? fecha.format(new Date(l.compartida_desde)) : '' })}
                copiar={t('copiar')} copiado={t('copiado')} />
              <div className={s.fila}>
                <form action={compartirListaAccion}>{oculto}<input type="hidden" name="id" value={l.id} /><input type="hidden" name="compartir" value="0" />
                  <button type="submit" className={s.enlaceBoton}>{t('dejarDeCompartir')}</button>
                </form>
                <form action={compartirListaAccion}>{oculto}<input type="hidden" name="id" value={l.id} /><input type="hidden" name="otro" value="1" />
                  <button type="submit" className={s.enlaceBoton}>{t('otroEnlace')}</button>
                </form>
              </div>
              <p className={s.nota}>{t('compartidaNota')}</p>
            </>
          ) : (
            <>
              <p className={s.nota}>{t('compartirNota')}</p>
              <form action={compartirListaAccion}>{oculto}<input type="hidden" name="id" value={l.id} />
                <button type="submit" className="boton boton--sec"><Icono nombre="enlace" tam={18} />{t('compartirBoton')}</button>
              </form>
            </>
          )}
        </section>
        {!l.favoritos && (
          <details className={s.desplegable}>
            <summary>{t('renombrar')}</summary>
            <FormLista accion={renombrarListaAccion} idioma={ctx.idioma} id={l.id} nombre={l.nombre} etiqueta={t('nombreEtiqueta')} boton={t('guardarNombre')} />
          </details>
        )}
      </div>

      {l.items.length === 0 ? (
        <section className={`panel ${c.vacio}`}>
          <h2>{t('vaciaTitulo')}</h2>
          <p>{l.favoritos ? t('favoritosVaciaTexto') : t('vaciaTexto')}</p>
          <Link className="boton boton--marca" href={r('/buscar?orden=vendidos')}>{t('irAVer')}</Link>
        </section>
      ) : (
        <ul className={s.items}>
          {l.items.map((p) => (
            <li key={p.slug} className={`panel ${s.item}`}>
              {p.imagen ? <Image src={foto(p.imagen)} alt="" width={88} height={88} sizes="88px" /> : <span />}
              <div>
                <h3><Link href={r(`/p/${p.slug}`)}>{p.titulo}</Link></h3>
                <p className="precio">{precio(ctx, p.precio, categoriaDe(p))}</p>
                <p>{p.tienda.nombre} · {p.tienda.ciudad}</p>
              </div>
              <div className={s.itemAcciones}>
                {l.otras.length > 0 && (
                  <form action={itemListaAccion}>
                    {oculto}<input type="hidden" name="id" value={l.id} /><input type="hidden" name="slug" value={p.slug} />
                    <label htmlFor={`a-${p.slug}`} className="sr-only">{t('moverA', { titulo: p.titulo })}</label>
                    <select id={`a-${p.slug}`} name="a" defaultValue="">
                      <option value="" disabled>{t('pasarA')}</option>
                      {l.otras.map((o) => <option key={o.id} value={o.id}>{o.nombre === 'Favoritos' ? t('favoritos') : o.nombre}</option>)}
                    </select>
                    <button type="submit" className="boton boton--sec">{t('mover')}</button>
                  </form>
                )}
                <form action={itemListaAccion}>
                  {oculto}<input type="hidden" name="id" value={l.id} /><input type="hidden" name="slug" value={p.slug} />
                  <button type="submit" className={s.enlaceBoton}>{t('quitar')}<span className="sr-only">: {p.titulo}</span></button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!l.favoritos && (
        <details className={s.desplegable} style={{ marginTop: 32 }}>
          <summary className={s.peligro}>{t('borrar')}</summary>
          <form action={borrarListaAccion}>
            {oculto}<input type="hidden" name="id" value={l.id} />
            <p className={s.nota}>{t('borrarNota')}</p>
            <button type="submit" className="boton boton--sec">{t('borrarSi', { nombre: l.nombre })}</button>
          </form>
        </details>
      )}
    </>
  )
}
