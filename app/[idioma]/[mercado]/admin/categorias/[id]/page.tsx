// Una categoría: sus datos y sus datos técnicos (atributos: lo que hace distinta una heladera de una remera), con
// cuántos productos usan cada uno. Lo que está en uso no cambia de clave ni de tipo ni se borra.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getMessages, getTranslations } from 'next-intl/server'
import { NoAdmin } from '@/components/admin/Comunes'
import a from '@/components/admin/Admin.module.css'
import { FormAtributo, FormCategoria } from '@/components/admin/FormCategoria'
import { Icono } from '@/components/Icono'
import { Alerta, Aviso } from '@/components/vender/Comunes'
import s from '@/components/vender/Vender.module.css'
import { ICONOS_CATEGORIA, noEsAdmin, type CategoriaAdmin, type CategoriaDetalle } from '@/lib/admin/tipos'
import { conSesion } from '@/lib/cuenta/pagina'
import { rpcCuenta } from '@/lib/cuenta/sesion'
import { contexto, ruta } from '@/lib/contexto'
import { LOCALE } from '@/lib/i18n/idiomas'
import { Textos } from '@/lib/i18n/textos'
import { borrarAtributoAccion, guardarAtributoAccion, guardarCategoriaAccion, ordenarAccion } from '../../acciones'

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await contexto()
  const t = await getTranslations({ locale: ctx.idioma, namespace: 'admin.categorias' })
  return { title: t('tituloUna'), robots: { index: false, follow: false } }
}

// una muestra para prearmar el marco (como la edición de un producto del vendedor); el contenido sale con la sesión
export function generateStaticParams() {
  return [{ id: '1' }]
}

export default function PaginaCategoria(props: PageProps<'/[idioma]/[mercado]/admin/categorias/[id]'>) {
  return <Suspense fallback={<div className="panel" style={{ minHeight: '100vh' }} aria-hidden="true" />}><Contenido {...props} /></Suspense>
}

async function Contenido({ params, searchParams }: PageProps<'/[idioma]/[mercado]/admin/categorias/[id]'>) {
  const [ctx, { id }, sp] = await Promise.all([contexto(), params, searchParams])
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  if (!/^\d{1,5}$/.test(id)) notFound()
  await conSesion(ctx.idioma, `/admin/categorias/${id}`)
  const [t, ta, c, arbol, mensajes] = await Promise.all([
    getTranslations({ locale: ctx.idioma, namespace: 'admin.categorias' }),
    getTranslations({ locale: ctx.idioma, namespace: 'admin.atributos' }),
    rpcCuenta<CategoriaDetalle | null>('admin_categoria', { id, idioma: ctx.idioma }),
    rpcCuenta<CategoriaAdmin[]>('admin_categorias', { idioma: ctx.idioma }),
    getMessages({ locale: ctx.idioma }),
  ])
  if (noEsAdmin(arbol)) return <NoAdmin idioma={ctx.idioma} />
  if (!c || noEsAdmin(c)) notFound()
  const numero = new Intl.NumberFormat(LOCALE[ctx.idioma])
  const aqui = ruta(ctx.idioma, `/admin/categorias/${c.id}`)
  const editar = uno('editar')
  const hijas = arbol.find((x) => x.id === c.id)?.hijas?.length ?? 0
  const m = mensajes.admin as Record<string, never>
  const textos = { admin: { categorias: m.categorias, atributos: m.atributos, errores: m.errores } }

  return (
    <Textos locale={LOCALE[ctx.idioma]} mensajes={textos}>
      <p className={s.sub} style={{ marginBottom: 'var(--e-2)' }}><Link href={ruta(ctx.idioma, `/admin/categorias#categoria-${c.id}`)}>{t('volver')}</Link></p>
      <div className={s.cabeza}>
        <div>
          <h1>{c.texto}</h1>
          <p>{c.padre_texto ? t('subcategoriaDe', { padre: c.padre_texto }) : t('principal')} · {t('productos', { n: c.productos })} · <code>/c/{c.slug}</code></p>
        </div>
      </div>
      {uno('guardado') && <Aviso texto={t(`guardado.${['categoria', 'atributo', 'atributo_borrado'].includes(uno('guardado')) ? uno('guardado') : 'categoria'}`)} />}

      <section className="panel" aria-labelledby="t-datos">
        <h2 id="t-datos" className={s.panelTitulo} style={{ marginBottom: 'var(--e-4)' }}>{t('datos')}</h2>
        <FormCategoria accion={guardarCategoriaAccion} idioma={ctx.idioma} iconos={ICONOS_CATEGORIA}
          categoria={{ id: c.id, slug: c.slug, nombre: c.nombre, padre: c.padre, icono: c.icono, productos: c.productos, hijas }}
          principales={arbol.map((x) => ({ id: x.id, texto: x.texto }))} />
      </section>

      <section className="panel" style={{ marginTop: 'var(--e-5)' }} aria-labelledby="t-atributos">
        <h2 id="t-atributos" className={s.panelTitulo}>{ta('titulo')}</h2>
        <p className={s.sub} style={{ marginBottom: 'var(--e-4)' }}>{ta('explica')}</p>
        {c.heredados.length > 0 && (
          <p className={s.sub} style={{ marginBottom: 'var(--e-4)' }}>{ta('heredados', { padre: c.padre_texto ?? '', lista: c.heredados.map((h) => h.texto).join(', ') })}</p>
        )}
        {c.atributos.length === 0 ? <p className={s.sub}>{ta('vacio')}</p> : (
          <table className={`${s.tabla} ${a.atributos}`}>
            <thead><tr><th scope="col">{ta('nombreCol')}</th><th scope="col">{ta('tipo')}</th><th scope="col">{ta('opcionesCol')}</th><th scope="col" className={s.num}>{ta('usos')}</th><th scope="col"><span className="sr-only">{ta('acciones')}</span></th></tr></thead>
            <tbody>
              {c.atributos.map((x, i) => (
                <tr key={x.id} id={`atributo-${x.id}`}>
                  <td data-etiqueta={ta('nombreCol')}><b>{x.texto}</b>{x.unidad && ` (${x.unidad})`}<br /><span className={a.clave}>{x.clave}</span>{x.filtrable && <small> · {ta('esFiltro')}</small>}</td>
                  <td data-etiqueta={ta('tipo')}>{ta(`tipos.${x.tipo}`)}</td>
                  <td data-etiqueta={ta('opcionesCol')}>{x.opciones?.length ? x.opciones.join(', ') : '—'}</td>
                  <td data-etiqueta={ta('usos')} className={s.num}>{numero.format(x.usos)}</td>
                  <td>
                    <div className={a.herramientas}>
                      {(['arriba', 'abajo'] as const).map((mover) => (
                        <form key={mover} action={ordenarAccion}>
                          <input type="hidden" name="idioma" value={ctx.idioma} /><input type="hidden" name="volver" value={aqui} />
                          <input type="hidden" name="que" value="atributo" /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="mover" value={mover} />
                          <button type="submit" className={a.chico} disabled={mover === 'arriba' ? i === 0 : i === c.atributos.length - 1}
                            aria-label={t(mover === 'arriba' ? 'subir' : 'bajar', { nombre: x.texto })}><Icono nombre={mover} tam={16} /></button>
                        </form>
                      ))}
                      <Link className={a.chico} href={`${aqui}?editar=${x.id}#editar-atributo`} aria-label={t('editarDe', { nombre: x.texto })}>{t('editar')}</Link>
                      <form action={borrarAtributoAccion}>
                        <input type="hidden" name="idioma" value={ctx.idioma} /><input type="hidden" name="categoria" value={c.id} /><input type="hidden" name="id" value={x.id} />
                        <button type="submit" className={`${a.chico} ${a.chicoPeligro}`} aria-label={t('borrarDe', { nombre: x.texto })}>{t('borrar')}</button>
                      </form>
                    </div>
                    {uno('error') === 'en_uso' && uno('id') === String(x.id) && <div style={{ marginTop: 'var(--e-2)' }}><Alerta texto={ta('enUso', { n: Number(uno('p')) })} /></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" style={{ marginTop: 'var(--e-5)' }} id="editar-atributo" aria-labelledby="t-atributo-form">
        {(() => {
          const elegido = c.atributos.find((x) => String(x.id) === editar)
          return (
            <>
              <h2 id="t-atributo-form" className={s.panelTitulo} style={{ marginBottom: 'var(--e-4)' }}>
                {elegido ? ta('editarTitulo', { nombre: elegido.texto }) : ta('nuevo')}
              </h2>
              {elegido && <p className={s.sub} style={{ marginBottom: 'var(--e-3)' }}><Link href={`${aqui}#editar-atributo`}>{ta('cancelar')}</Link></p>}
              <FormAtributo key={elegido?.id ?? 'nuevo'} accion={guardarAtributoAccion} idioma={ctx.idioma} categoria={c.id} atributo={elegido} />
            </>
          )
        })()}
      </section>
    </Textos>
  )
}
